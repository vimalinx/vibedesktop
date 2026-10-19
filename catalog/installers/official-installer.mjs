#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const installerRoot = path.dirname(fileURLToPath(import.meta.url));
const recipeFile = path.join(installerRoot, "recipes.json");
const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
const defaultCommandTimeoutMs = 30 * 60 * 1000;

export async function loadRecipes() {
  const parsed = JSON.parse(await readFile(recipeFile, "utf8"));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.recipes)) {
    throw new Error("Official installer recipe file has an unsupported schema.");
  }
  const ids = new Set();
  for (const recipe of parsed.recipes) {
    validateRecipe(recipe);
    if (ids.has(recipe.id)) throw new Error(`Duplicate official installer recipe: ${recipe.id}`);
    ids.add(recipe.id);
  }
  return parsed.recipes;
}

export async function loadRecipe(id) {
  const recipe = (await loadRecipes()).find((candidate) => candidate.id === id);
  if (!recipe) throw new Error(`No official installer recipe exists for ${id}.`);
  return recipe;
}

export function expandRecipeValue(value, context, secrets = new Map()) {
  if (typeof value !== "string") return value;
  return value.replace(/\$(WORKSPACE|SOURCE|DATA|PORT|UID|GID|RANDOM_HEX_16|RANDOM_HEX_32|SECRET_[A-Z0-9_]+)/g, (_, token) => {
    if (token === "WORKSPACE") return context.target;
    if (token === "SOURCE") return path.join(context.target, "source");
    if (token === "DATA") return context.data ?? path.join(context.target, "data");
    if (token === "PORT") return String(context.port);
    if (token === "UID") return String(process.getuid?.() ?? 1000);
    if (token === "GID") return String(process.getgid?.() ?? 1000);
    if (token === "RANDOM_HEX_16") return randomBytes(16).toString("hex");
    if (token === "RANDOM_HEX_32") return randomBytes(32).toString("hex");
    if (!secrets.has(token)) secrets.set(token, randomBytes(32).toString("hex"));
    return secrets.get(token);
  });
}

export function validateComposeConfig(config, staging, target, data) {
  const activeServices = Object.entries(config?.services ?? {}).filter(([, service]) => !Array.isArray(service.profiles) || service.profiles.length === 0);
  for (const [name, service] of activeServices) {
    for (const published of service.ports ?? []) {
      if (!loopbackHosts.has(String(published.host_ip ?? ""))) {
        throw new Error(`Official Compose service ${name} publishes a non-loopback port.`);
      }
    }
    for (const mount of service.volumes ?? []) {
      if (mount.type === "volume") {
        throw new Error(`Official Compose service ${name} still uses named volume ${mount.source ?? "unknown"}.`);
      }
      if (mount.type !== "bind") continue;
      const source = path.resolve(String(mount.source ?? ""));
      const insideWorkspace = isInside(source, staging) || isInside(source, target) || (data ? isInside(source, data) : false);
      const safeReadOnlyHostFile = source === "/etc/localtime" && mount.read_only === true;
      if (!insideWorkspace && !safeReadOnlyHostFile) {
        throw new Error(`Official Compose service ${name} mounts host path outside its workspace: ${source}`);
      }
      if (source === "/var/run/docker.sock") {
        throw new Error(`Official Compose service ${name} requests the Docker socket.`);
      }
    }
  }
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const recipe = await loadRecipe(options.id);
  if (command === "plan") {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, recipe }, null, 2)}\n`);
    return;
  }
  if (command !== "prepare") throw new Error("Usage: install-official.sh plan|prepare --id <catalog-id> [--staging PATH --target PATH --data PATH]");

  const staging = requireAbsolute(options.staging, "--staging");
  const target = requireAbsolute(options.target, "--target");
  const data = requireAbsolute(options.data, "--data");
  if (staging === target || isInside(staging, target) || isInside(target, staging)) {
    throw new Error("Staging and target workspaces must be separate sibling paths.");
  }
  const requestedPort = options.port === undefined ? recipe.port : Number.parseInt(options.port, 10);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error("--port must be an integer from 1 to 65535.");
  }
  const context = { staging, target, data, port: requestedPort };
  await mkdir(staging, { recursive: true, mode: 0o700 });
  await mkdir(data, { recursive: true, mode: 0o700 });
  await clonePinnedSource(recipe, path.join(staging, "source"));

  if (recipe.kind === "container") await prepareContainer(recipe, context);
  else if (recipe.kind === "compose") await prepareCompose(recipe, context);
  else await preparePython(recipe, context);

  process.stdout.write(`official installer prepared ${recipe.id} at ${staging}\n`);
}

async function clonePinnedSource(recipe, source) {
  if (await exists(source)) throw new Error(`Refusing to overwrite existing source directory: ${source}`);
  process.stdout.write(`cloning reviewed source ${recipe.sourceRef}\n`);
  await run("git", ["init", "--quiet", source], path.dirname(source));
  await run("git", ["-C", source, "remote", "add", "origin", recipe.repositoryUrl], path.dirname(source));
  await run("git", ["-C", source, "fetch", "--depth", "1", "origin", recipe.sourceRef], path.dirname(source));
  await run("git", ["-C", source, "checkout", "--quiet", "--detach", "FETCH_HEAD"], path.dirname(source));
  await run("git", ["-C", source, "submodule", "update", "--init", "--recursive", "--depth", "1"], path.dirname(source));
  const actual = (await capture("git", ["-C", source, "rev-parse", "HEAD"], path.dirname(source))).trim();
  if (actual !== recipe.sourceRef) throw new Error(`Source checkout mismatch: expected ${recipe.sourceRef}, got ${actual}`);
}

async function prepareContainer(recipe, context) {
  const secrets = new Map();
  const dataMounts = recipe.dataMounts ?? [];
  for (const mount of dataMounts) await mkdir(path.join(context.data, mount.relativePath), { recursive: true, mode: 0o700 });

  const runtimeEnv = Object.entries(recipe.environment ?? {}).map(([key, value]) => {
    const expanded = expandRecipeValue(String(value), context, secrets);
    assertSingleLine(expanded, `environment ${key}`);
    return `${key}=${expanded}`;
  });
  const envPath = path.join(context.staging, "runtime.env");
  await writeFile(envPath, runtimeEnv.length ? `${runtimeEnv.join("\n")}\n` : "", { encoding: "utf8", mode: 0o600 });

  if (process.env.VIBE_OFFICIAL_SKIP_PULL !== "1") await run("docker", ["pull", recipe.image], context.staging);

  const args = [
    "run", "--rm", "--name", containerName(recipe.id),
    "--publish", `127.0.0.1:${context.port}:${recipe.containerPort}`,
    "--env-file", path.join(context.target, "runtime.env")
  ];
  for (const mount of dataMounts) args.push("--volume", `${path.join(context.data, mount.relativePath)}:${mount.containerPath}`);
  for (const host of recipe.extraHosts ?? []) args.push("--add-host", host);
  args.push(...(recipe.dockerArgs ?? []), recipe.image, ...(recipe.command ?? []));
  await writeRunScript(context.staging, ["docker", ...args]);
  await writeCleanup(context.staging, "docker", ["rm", "-f", containerName(recipe.id)], context.target);
  await writeLaunch(context.staging, recipe, context, recipe.healthPath ?? "/");
}

async function prepareCompose(recipe, context) {
  const secrets = new Map();
  const source = path.join(context.staging, "source");
  const baseFile = path.join(source, recipe.composeFile);
  if (!(await exists(baseFile))) throw new Error(`Pinned source is missing official Compose file ${recipe.composeFile}.`);

  if (recipe.envTarget) {
    const targetEnv = path.join(source, recipe.envTarget);
    let contents = "";
    if (recipe.envTemplate) contents = await readFile(path.join(source, recipe.envTemplate), "utf8");
    contents = updateEnvFile(contents, recipe.envOverrides ?? {}, context, secrets);
    await mkdir(path.dirname(targetEnv), { recursive: true, mode: 0o700 });
    await writeFile(targetEnv, contents, { encoding: "utf8", mode: 0o600 });
  }

  for (const mount of recipe.dataMounts ?? []) {
    await mkdir(path.join(context.data, mount.relativePath), { recursive: true, mode: 0o700 });
  }

  const safetyFile = path.join(context.staging, ".vibedesktop-compose.override.yaml");
  await writeFile(safetyFile, composeSafetyOverride(recipe, context, secrets), { encoding: "utf8", mode: 0o600 });
  const prepareFiles = [baseFile, safetyFile];
  let compose = await composeConfig(prepareFiles, source);
  validateComposeConfig(compose, context.staging, context.target, context.data);

  let imageLockFile = null;
  if (process.env.VIBE_OFFICIAL_SKIP_PULL !== "1") {
    imageLockFile = path.join(context.staging, ".vibedesktop-images.override.yaml");
    const lock = await buildImageLock(compose, source);
    await writeFile(imageLockFile, lock, { encoding: "utf8", mode: 0o600 });
    prepareFiles.push(imageLockFile);
    compose = await composeConfig(prepareFiles, source);
    validateComposeConfig(compose, context.staging, context.target, context.data);
    await run("docker", composeArguments(prepareFiles, ["pull", "--ignore-buildable"]), source);
  }

  const runFiles = [
    path.join(context.target, "source", recipe.composeFile),
    path.join(context.target, path.basename(safetyFile)),
    ...(imageLockFile ? [path.join(context.target, path.basename(imageLockFile))] : [])
  ];
  await writeRunScript(context.staging, ["docker", ...composeArguments(runFiles, ["up", "--remove-orphans"])]);
  await writeCleanup(context.staging, "docker", composeArguments(runFiles, ["down", "--remove-orphans"]), path.join(context.target, "source"));
  await writeLaunch(context.staging, recipe, context, recipe.healthPath ?? "/");
}

async function preparePython(recipe, context) {
  const source = path.join(context.staging, "source");
  const venv = path.join(context.staging, "venv");
  await run("uv", ["venv", "--python", "3.12", venv], context.staging);

  if (process.env.VIBE_OFFICIAL_SKIP_INSTALL !== "1") {
    if (recipe.pythonMode === "comfyui") {
      await run("uv", ["pip", "install", "--python", path.join(venv, "bin", "python"), "-r", path.join(source, "requirements.txt")], source);
    } else {
      await run("uv", ["pip", "install", "--python", path.join(venv, "bin", "python"), recipe.pythonPackage], source);
    }
  }

  if (recipe.pythonMode === "chainlit") {
    await writeFile(path.join(context.staging, "app.py"), chainlitStarter(), { encoding: "utf8", mode: 0o600 });
    await writeRunScript(context.staging, [
      path.join(context.target, "venv", "bin", "python"), "-m", "chainlit", "run",
      path.join(context.target, "app.py"), "--headless", "--host", "127.0.0.1", "--port", String(context.port)
    ]);
  } else {
    await writeRunScript(context.staging, [
      path.join(context.target, "venv", "bin", "python"), path.join(context.target, "source", "main.py"),
      "--listen", "127.0.0.1", "--port", String(context.port), "--cpu"
    ]);
  }
  await writeLaunch(context.staging, recipe, context, recipe.healthPath ?? "/");
}

async function composeConfig(files, cwd) {
  return JSON.parse(await capture("docker", composeArguments(files, ["config", "--format", "json"]), cwd));
}

async function buildImageLock(config, cwd) {
  const lines = ["services:"];
  for (const [name, service] of Object.entries(config.services ?? {})) {
    if (Array.isArray(service.profiles) && service.profiles.length > 0) continue;
    if (!service.image || String(service.image).includes("@sha256:")) continue;
    const digest = JSON.parse((await capture("docker", ["buildx", "imagetools", "inspect", String(service.image), "--format", "{{json .Manifest.Digest}}"], cwd)).trim());
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error(`Could not lock image for Compose service ${name}.`);
    lines.push(`  ${yamlKey(name)}:`, `    image: ${JSON.stringify(`${service.image}@${digest}`)}`);
  }
  if (lines.length === 1) return "services: {}\n";
  return `${lines.join("\n")}\n`;
}

function composeSafetyOverride(recipe, context, secrets) {
  const services = new Map();
  const ensure = (name) => services.get(name) ?? (services.set(name, { ports: null, volumes: [], environment: {} }), services.get(name));
  for (const rule of recipe.portRules ?? []) {
    const service = ensure(rule.service);
    service.ports = rule.disabled
      ? []
      : [`127.0.0.1:${expandRecipeValue(String(rule.hostPort), context, secrets)}:${rule.containerPort}`];
  }
  for (const mount of recipe.dataMounts ?? []) {
    ensure(mount.service).volumes.push(`${path.join(context.data, mount.relativePath)}:${mount.containerPath}`);
  }
  for (const [name, environment] of Object.entries(recipe.serviceEnvironment ?? {})) {
    const service = ensure(name);
    for (const [key, value] of Object.entries(environment)) service.environment[key] = expandRecipeValue(String(value), context, secrets);
  }
  const lines = ["services:"];
  for (const [name, service] of services) {
    lines.push(`  ${yamlKey(name)}:`);
    if (service.ports !== null) {
      if (service.ports.length === 0) lines.push("    ports: !override []");
      else lines.push("    ports: !override", ...service.ports.map((port) => `      - ${JSON.stringify(port)}`));
    }
    if (service.volumes.length > 0) lines.push("    volumes:", ...service.volumes.map((mount) => `      - ${JSON.stringify(mount)}`));
    if (Object.keys(service.environment).length > 0) {
      lines.push("    environment:");
      for (const [key, value] of Object.entries(service.environment)) lines.push(`      ${yamlKey(key)}: ${JSON.stringify(value)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function updateEnvFile(contents, overrides, context, secrets) {
  const lines = contents.split(/\r?\n/);
  for (const [key, raw] of Object.entries(overrides)) {
    const value = expandRecipeValue(String(raw), context, secrets);
    assertSingleLine(value, `environment ${key}`);
    const next = `${key}=${value}`;
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) lines[index] = next;
    else lines.push(next);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

async function writeRunScript(staging, argv) {
  const body = `#!/bin/sh\nset -eu\nexec ${argv.map(shellQuote).join(" ")}\n`;
  const file = path.join(staging, "run.sh");
  await writeFile(file, body, { encoding: "utf8", mode: 0o700 });
  await chmod(file, 0o700);
}

async function writeLaunch(staging, recipe, context, healthPath) {
  const launch = {
    schemaVersion: 1,
    installer: "official-script",
    recipeId: recipe.id,
    sourceRef: recipe.sourceRef,
    command: path.join(context.target, "run.sh"),
    args: [],
    cwd: path.join(context.target, "source"),
    port: context.port,
    healthPath
  };
  await writeFile(path.join(staging, "launch.json"), `${JSON.stringify(launch, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function writeCleanup(staging, command, args, cwd) {
  await writeFile(path.join(staging, "cleanup.json"), `${JSON.stringify({
    schemaVersion: 1,
    command,
    args,
    cwd
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function validateRecipe(recipe) {
  if (!recipe || typeof recipe !== "object") throw new Error("Official installer recipe must be an object.");
  if (!/^github-[a-z0-9-]+$/.test(recipe.id ?? "")) throw new Error(`Invalid recipe id: ${recipe.id}`);
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(recipe.repositoryUrl ?? "")) throw new Error(`Invalid repository URL for ${recipe.id}`);
  if (!/^[a-f0-9]{40}$/.test(recipe.sourceRef ?? "")) throw new Error(`Recipe ${recipe.id} must pin a full Git commit.`);
  if (!Number.isInteger(recipe.port) || recipe.port < 1 || recipe.port > 65535) throw new Error(`Invalid port for ${recipe.id}`);
  if (!new Set(["container", "compose", "python"]).has(recipe.kind)) throw new Error(`Invalid installer kind for ${recipe.id}`);
  if (recipe.kind === "container" && !/@sha256:[a-f0-9]{64}$/.test(recipe.image ?? "")) throw new Error(`Container recipe ${recipe.id} must pin an image digest.`);
  if (recipe.kind === "compose" && (!recipe.composeFile || !(recipe.portRules ?? []).some((rule) => !rule.disabled))) throw new Error(`Compose recipe ${recipe.id} needs a file and primary loopback port rule.`);
}

function parseArguments(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "end"}.`);
    options[key.slice(2)] = value;
  }
  if (!options.id) throw new Error("--id is required.");
  return { command, options };
}

function requireAbsolute(value, label) {
  if (!value || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute path.`);
  return path.resolve(value);
}

function composeArguments(files, suffix) {
  return ["compose", ...files.flatMap((file) => ["-f", file]), ...suffix];
}

async function run(command, args, cwd, timeoutMs = defaultCommandTimeoutMs) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: "inherit", detached: process.platform !== "win32" });
    const timer = setTimeout(() => {
      terminate(child);
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 60000)} minutes.`));
    }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(missingTool(command, error)); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? code ?? "unknown"}).`));
    });
  });
}

const toolHints = {
  uv: "Install uv (https://docs.astral.sh/uv/) to set up Python apps, then retry.",
  docker: "Install Docker with the compose plugin and make sure your user can run it, then retry.",
  git: "Install git, then retry."
};

/** A missing prerequisite deserves a sentence the user can act on, not `spawn uv ENOENT`. */
function missingTool(command, error) {
  if (error?.code !== "ENOENT") return error;
  return new Error(`${command} is not installed or not on PATH. ${toolHints[command] ?? `Install ${command}, then retry.`}`);
}

async function capture(command, args, cwd, timeoutMs = defaultCommandTimeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-4_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-20_000); });
    const timer = setTimeout(() => {
      terminate(child);
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 60000)} minutes.`));
    }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(missingTool(command, error)); });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} failed (${signal ?? code ?? "unknown"}). ${stderr.trim().slice(-2000)}`));
    });
  });
}

function terminate(child) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch { /* already exited */ }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function yamlKey(value) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value) ? value : JSON.stringify(value);
}

function isInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSingleLine(value, label) {
  if (value.includes("\n") || value.includes("\r") || value.includes("\0")) throw new Error(`${label} must be one line.`);
}

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

function containerName(id) {
  return `vibedesktop-${id.replace(/^github-/, "").replace(/[^a-z0-9_.-]/gi, "-").toLowerCase()}`;
}

function chainlitStarter() {
  return `import chainlit as cl\n\n@cl.on_chat_start\nasync def start():\n    await cl.Message(content=\"Chainlit is installed locally. Ask your Agent to replace app.py with your own assistant.\").send()\n\n@cl.on_message\nasync def main(message: cl.Message):\n    await cl.Message(content=f\"Local echo: {message.content}\").send()\n`;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`official installer failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
