import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import recipesDocument from "../../catalog/installers/recipes.json";
import { appDirectory } from "@/lib/seed-data";
import {
  controlLocalApp,
  createLocalApp,
  deleteLocalApp,
  getLocalApp,
  listLocalApps,
  updateLocalApp
} from "@/lib/daemon-client";
import type { CatalogAgentInstallInstruction, CatalogWorkspaceInstallStatus, LocalAppView } from "@/lib/contracts";

const manifestName = ".vibedesktop-workspace.json";
const activeStates = new Set(["queued", "cloning", "installing", "registering", "starting"]);

interface OfficialRecipe {
  id: string;
  title: string;
  repositoryUrl: string;
  sourceRef: string;
  kind: "container" | "compose" | "python";
  port: number;
  image?: string;
}

interface TrustedRecipe extends OfficialRecipe {
  iconUrl: string;
}

interface WorkspaceManifest extends CatalogWorkspaceInstallStatus {
  schemaVersion: number;
  repositoryUrl: string;
  sourceRef?: string;
  sourcePath: string;
  dataPath?: string;
  installer?: "official" | "agent";
  healthPath?: string;
}

interface LaunchContract {
  schemaVersion: 1;
  installer: "official-script";
  recipeId: string;
  sourceRef: string;
  command: string;
  args: string[];
  cwd: string;
  port: number;
  healthPath: string;
}

interface CleanupContract {
  schemaVersion: 1;
  command: "docker";
  args: string[];
  cwd: string;
}

interface InstallRuntime {
  jobs: Map<string, CatalogWorkspaceInstallStatus>;
}

interface WorkspacePromotion {
  archive: string;
  dataTransferred: boolean;
}

const officialRecipes = recipesDocument.recipes as OfficialRecipe[];
const execFileAsync = promisify(execFile);
const runtime = (() => {
  const key = "__vibedesktopCatalogInstallRuntime";
  const root = globalThis as typeof globalThis & Record<string, InstallRuntime | undefined>;
  return root[key] ?? (root[key] = { jobs: new Map() });
})();

export function catalogWorkspaceRoot(): string {
  const override = process.env.VIBE_WORKSPACES_DIR?.trim();
  if (override) return path.resolve(override);
  const configured = process.env.XDG_DATA_HOME?.trim();
  const dataHome = configured && path.isAbsolute(configured) ? configured : path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "vibedesktop", "workspaces");
}

export function catalogDataRoot(): string {
  const override = process.env.VIBE_CATALOG_STATE_DIR?.trim();
  if (override) return path.resolve(override);
  const configured = process.env.XDG_STATE_HOME?.trim();
  const stateHome = configured && path.isAbsolute(configured) ? configured : path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "vibedesktop", "apps");
}

export function trustedWorkspaceRecipe(id: string): TrustedRecipe | null {
  const item = appDirectory.find((candidate) => candidate.id === id && candidate.selfHosted === true);
  const official = officialRecipes.find((candidate) => candidate.id === id);
  if (!item?.repositoryUrl || !item.defaultPort || !official) return null;
  if (normalizeRepository(item.repositoryUrl) !== normalizeRepository(official.repositoryUrl)) return null;
  if (item.defaultPort !== official.port || item.title !== official.title) return null;
  return { ...official, iconUrl: item.iconUrl };
}

export async function listCatalogWorkspaceInstalls(): Promise<CatalogWorkspaceInstallStatus[]> {
  const recipes = officialRecipes.map((item) => trustedWorkspaceRecipe(item.id)).filter(Boolean) as TrustedRecipe[];
  let apps: LocalAppView[] | null = null;
  try { apps = await listLocalApps(); } catch { /* daemon status is temporarily unknown */ }
  return Promise.all(recipes.map(async (recipe) => {
    const job = runtime.jobs.get(recipe.id);
    return job && activeStates.has(job.state) ? job : readWorkspaceStatus(recipe, apps);
  }));
}

const installStarts = new Map<string, Promise<CatalogWorkspaceInstallStatus>>();

export function startCatalogWorkspaceInstall(id: string): Promise<CatalogWorkspaceInstallStatus> {
  const pending = installStarts.get(id);
  if (pending) return pending;
  const result = beginCatalogWorkspaceInstall(id);
  installStarts.set(id, result);
  void result.finally(() => { if (installStarts.get(id) === result) installStarts.delete(id); }).catch(() => undefined);
  return result;
}

async function beginCatalogWorkspaceInstall(id: string): Promise<CatalogWorkspaceInstallStatus> {
  const recipe = trustedWorkspaceRecipe(id);
  if (!recipe) throw codedError("install_not_available", "This catalog entry has no reviewed official installation recipe.");
  const current = runtime.jobs.get(id);
  if (current && activeStates.has(current.state)) return current;
  const persisted = await readWorkspaceStatus(recipe, await listLocalApps());
  if (persisted.state === "installed") return persisted;

  const initial = statusFor(recipe, "queued", "Official installer queued.", { installer: "official" });
  runtime.jobs.set(id, initial);
  void performOfficialInstall(recipe).catch(async (error) => {
    const message = error instanceof Error ? error.message : "Official installation failed.";
    const attempted = runtime.jobs.get(recipe.id);
    const fallback = updateStatus(recipe, "needs_agent", `Official installer failed. A local Agent can take over: ${message}`, {
      installer: "official",
      fallbackAvailable: true,
      officialError: message,
      port: attempted?.port
    });
    await persistCurrentStatus(recipe, fallback).catch(() => undefined);
  });
  return initial;
}

export async function buildCatalogAgentInstallInstruction(id: string, requestOrigin: string): Promise<CatalogAgentInstallInstruction> {
  const recipe = trustedWorkspaceRecipe(id);
  if (!recipe) throw codedError("install_not_available", "This catalog entry has no reviewed official installation recipe.");
  const status = runtime.jobs.get(id) ?? await readWorkspaceStatus(recipe);
  const workspace = workspacePath(recipe);
  const source = path.join(workspace, "source");
  const data = await resolvedDataPath(recipe);
  const origin = localInstructionOrigin(requestOrigin);
  const completionUrl = `${origin}/api/catalog-installs/${encodeURIComponent(recipe.id)}/agent-complete`;
  const handoffReason = status.officialError
    ? `官方安装已失败，请接管并修复。失败原因：${status.officialError}`
    : "用户已在 Vibe Desktop 的安装方式面板中明确选择由本地 Agent 安装。";
  const instruction = `请在本机安装 ${recipe.title}。Vibe Desktop 默认推荐官方安装；${handoffReason}请实际运行、注册和验证，不要只给操作说明。\n\n固定边界\n- 审核仓库：${recipe.repositoryUrl}\n- 固定提交：${recipe.sourceRef}\n- 工作区：${workspace}\n- 完整源码：${source}\n- 持久数据：${data}\n- 首选 WebUI 端口：${status.port ?? recipe.port}\n\n执行要求\n1. 只使用上述仓库和固定提交。若源码缺失，在 source 中检出该提交；保留完整前端和后端。\n2. 保持 source 内受版本控制的文件与固定提交一致；部署覆盖配置和生成的启动脚本放在工作区的 agent 目录。把你最终实际运行的、可重复执行的安装逻辑保存为 '${path.join(workspace, "agent", "install.sh")}'。可替换运行产物留在工作区，持久数据只写入上述 XDG state 数据目录，不得散落到其他位置。\n3. 所有宿主机端口只绑定 127.0.0.1；若首选端口被占用，可选择空闲端口，但必须让受管应用登记真实端口。不要挂载 Docker socket，不要读取或复制 daemon token。\n4. 用 add-app Skill 验收和注册：先运行 python3 \"$SKILL_DIR/add.py\" '${source}' --plan，确认完整服务，再运行同一命令并加 --start。多服务项目作为一个 bundle 启停。\n5. 确认受管应用 cwd 精确等于 '${source}'，running=true、healthy=true，而且真实 WebUI 返回 2xx。\n6. 成功后调用安全的完成接口（它只核对现有受管应用，不执行你提供的 shell）：\n\n   curl --fail-with-body --silent --show-error \\\n     --request POST \\\n     --header 'Origin: ${origin}' \\\n     '${completionUrl}'\n\n7. 最终报告安装脚本、源码、数据、应用 ID、实际端口与健康结果。`;
  return { itemId: recipe.id, title: recipe.title, repositoryUrl: recipe.repositoryUrl, workspacePath: workspace, instruction };
}

export async function completeCatalogAgentInstall(id: string): Promise<CatalogWorkspaceInstallStatus> {
  const recipe = trustedWorkspaceRecipe(id);
  if (!recipe) throw codedError("install_not_available", "This catalog entry has no reviewed official installation recipe.");
  const source = path.join(workspacePath(recipe), "source");
  const verifiedRef = await verifyAgentSource(source, recipe);
  const app = (await listLocalApps()).find((candidate) => path.resolve(candidate.cwd ?? "") === path.resolve(source));
  if (!app) throw codedError("agent_registration_missing", "No managed application is registered for the reviewed workspace source.");
  if (!app.status.running || !app.status.healthy) throw codedError("agent_app_unhealthy", "The Agent-managed application is not running and healthy yet.");
  if (!(await probeHealthy(app.port, "/"))) throw codedError("agent_http_unhealthy", "The Agent-managed WebUI did not return a successful HTTP response.");
  const installed = updateStatus(recipe, "installed", `Agent fallback installed in ${workspacePath(recipe)}.`, {
    installer: "agent", appId: app.id, port: app.port, fallbackAvailable: false,
    dataPath: await resolvedDataPath(recipe), installedSourceRef: verifiedRef, running: true, healthy: true
  });
  await persistCurrentStatus(recipe, installed, "agent", "/");
  return installed;
}

export async function verifyAgentSource(source: string, recipe: Pick<TrustedRecipe, "repositoryUrl" | "sourceRef">): Promise<string> {
  const git = async (args: string[]) => (await execFileAsync("git", ["-C", source, ...args], {
    timeout: 10_000, maxBuffer: 1024 * 1024
  })).stdout.trim();
  try {
    const [root, ref, remote, changes] = await Promise.all([
      git(["rev-parse", "--show-toplevel"]), git(["rev-parse", "HEAD"]),
      git(["remote", "get-url", "origin"]), git(["status", "--porcelain", "--untracked-files=no"])
    ]);
    if (path.resolve(root) !== path.resolve(source) || ref !== recipe.sourceRef ||
        normalizeRepository(remote).replace(/\.git$/, "") !== normalizeRepository(recipe.repositoryUrl).replace(/\.git$/, "") || changes) {
      throw new Error("Source repository, commit, or tracked files do not match the reviewed recipe.");
    }
    if (!(await stat(path.join(source, "..", "agent", "install.sh"))).isFile()) throw new Error("Saved installer is not a file.");
    return ref;
  } catch (error) {
    throw codedError("agent_source_unverified", `Cannot verify the Agent installation source and saved installer: ${error instanceof Error ? error.message : "verification failed"}`);
  }
}

async function performOfficialInstall(recipe: TrustedRecipe): Promise<void> {
  const root = catalogWorkspaceRoot();
  const target = workspacePath(recipe);
  const staging = `${target}.staging-${crypto.randomUUID()}`;
  const data = await resolvedDataPath(recipe);
  let promotion: WorkspacePromotion | null = null;
  await mkdir(root, { recursive: true, mode: 0o700 });
  const port = await firstAvailablePort(recipe.port);

  try {
    updateStatus(recipe, "cloning", `Official script is checking out reviewed commit ${recipe.sourceRef}.`, { installer: "official", port });
    await runOfficialInstaller(recipe, staging, target, data, port);
    updateStatus(recipe, "registering", "Validating the official launch contract.", { installer: "official", port });
    const launch = await readLaunchContract(staging, target, recipe);
    await writeWorkspaceManifest(staging, manifestFor(recipe, statusFor(recipe, "registering", "Registering the official managed bundle.", {
      installer: "official", port: launch.port
    }), "official", launch.healthPath));
    promotion = await promoteWorkspace(staging, target);

    const appId = await registerAndStart(recipe, launch);
    const installed = updateStatus(recipe, "installed", `Official script installed in ${target}.`, {
      installer: "official", fallbackAvailable: false, appId, port: launch.port,
      dataPath: data, installedSourceRef: recipe.sourceRef, running: true, healthy: true
    });
    await persistCurrentStatus(recipe, installed, "official", launch.healthPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Official installation failed.";
    if (promotion) {
      await restorePreviousWorkspace(target, promotion).catch(() => undefined);
      const previousApp = (await listLocalApps().catch(() => [])).find((app) => path.resolve(app.cwd ?? "") === path.resolve(path.join(target, "source")));
      if (previousApp?.status.running) await controlLocalApp(previousApp.id, "restart").catch(() => undefined);
    }
    const fallback = statusFor(recipe, "needs_agent", `Official installer failed. A local Agent can take over: ${message}`, {
      installer: "official", fallbackAvailable: true, officialError: message, port
    });
    if (await exists(staging)) {
      await writeWorkspaceManifest(staging, manifestFor(recipe, fallback, "official")).catch(() => undefined);
      if (!(await exists(target))) await rename(staging, target).catch(() => undefined);
    }
    if (await exists(target)) await writeWorkspaceManifest(target, manifestFor(recipe, fallback, "official")).catch(() => undefined);
    throw error;
  }
}

export async function promoteWorkspace(staging: string, target: string): Promise<WorkspacePromotion | null> {
  if (!(await exists(target))) {
    await rename(staging, target);
    return null;
  }
  const archive = `${target}.previous-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const stagedFreshData = path.join(staging, ".vibedesktop-fresh-data");
  let dataTransferred = false;
  await rename(target, archive);
  try {
    if (await exists(path.join(archive, "data"))) {
      if (await exists(path.join(staging, "data"))) await rename(path.join(staging, "data"), stagedFreshData);
      await rename(path.join(archive, "data"), path.join(staging, "data"));
      dataTransferred = true;
    }
    await rename(staging, target);
    await rm(path.join(target, ".vibedesktop-fresh-data"), { recursive: true, force: true });
    return { archive, dataTransferred };
  } catch (error) {
    if (dataTransferred && await exists(path.join(staging, "data"))) {
      await rename(path.join(staging, "data"), path.join(archive, "data")).catch(() => undefined);
    }
    if (!(await exists(target))) await rename(archive, target).catch(() => undefined);
    throw error;
  }
}

export async function restorePreviousWorkspace(target: string, promotion: WorkspacePromotion): Promise<void> {
  const failed = `${target}.failed-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (promotion.dataTransferred && await exists(path.join(target, "data"))) {
    await rename(path.join(target, "data"), path.join(promotion.archive, "data"));
  }
  if (await exists(target)) await rename(target, failed);
  await rename(promotion.archive, target);
}

async function runOfficialInstaller(recipe: TrustedRecipe, staging: string, target: string, data: string, port: number): Promise<void> {
  const installer = path.join(process.cwd(), "catalog", "installers", "official-installer.mjs");
  if (!(await exists(installer))) throw codedError("official_installer_missing", `Official installer is missing: ${installer}`);
  updateStatus(recipe, "installing", `Running reviewed ${recipe.kind} recipe on loopback port ${port}.`, { installer: "official", port });
  await run(process.execPath, [installer, "prepare", "--id", recipe.id, "--staging", staging, "--target", target, "--data", data, "--port", String(port)], process.cwd(), recipe);
}

async function readLaunchContract(staging: string, target: string, recipe: TrustedRecipe): Promise<LaunchContract> {
  const parsed = JSON.parse(await readFile(path.join(staging, "launch.json"), "utf8")) as Partial<LaunchContract>;
  if (parsed.schemaVersion !== 1 || parsed.installer !== "official-script" || parsed.recipeId !== recipe.id || parsed.sourceRef !== recipe.sourceRef) {
    throw codedError("invalid_launch_contract", "Official installer returned an invalid recipe identity.");
  }
  if (parsed.command !== path.join(target, "run.sh") || parsed.cwd !== path.join(target, "source") || !Array.isArray(parsed.args) || parsed.args.some((arg) => typeof arg !== "string")) {
    throw codedError("invalid_launch_contract", "Official installer returned a launch command outside the reviewed workspace.");
  }
  if (!Number.isInteger(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65535 || typeof parsed.healthPath !== "string" || !parsed.healthPath.startsWith("/")) {
    throw codedError("invalid_launch_contract", "Official installer returned an invalid port or health path.");
  }
  return parsed as LaunchContract;
}

async function registerAndStart(recipe: TrustedRecipe, launch: LaunchContract): Promise<string> {
  const previous = (await listLocalApps()).find((app) => path.resolve(app.cwd ?? "") === path.resolve(launch.cwd));
  const input: Parameters<typeof createLocalApp>[0] = {
    name: recipe.title,
    command: launch.command,
    args: launch.args,
    cwd: launch.cwd,
    port: launch.port,
    autoStart: false,
    restart: "on-crash",
    iconKind: "favicon",
    iconUrl: recipe.iconUrl
  };
  let registered: LocalAppView | null = null;
  try {
    if (previous?.status.running) await controlLocalApp(previous.id, "stop");
    registered = previous ? await updateLocalApp(previous.id, input) : await createLocalApp(input);
    updateStatus(recipe, "starting", "Starting the official managed bundle and waiting for a successful HTTP response.", {
      installer: "official", appId: registered.id, port: launch.port
    });
    await controlLocalApp(registered.id, "start");
    await waitForHealthyApp(registered.id, recipe, launch.healthPath);
    return registered.id;
  } catch (error) {
    if (registered) await rollbackRegistration(registered, previous).catch(() => undefined);
    throw error;
  }
}

async function rollbackRegistration(registered: LocalAppView, previous?: LocalAppView): Promise<void> {
  await controlLocalApp(registered.id, "stop").catch(() => undefined);
  if (!previous) {
    await deleteLocalApp(registered.id);
    return;
  }
  await updateLocalApp(previous.id, {
    name: previous.name, command: previous.command, args: previous.args, cwd: previous.cwd, port: previous.port,
    env: previous.env, autoStart: previous.autoStart, restart: previous.restart,
    iconKind: previous.iconKind, iconUrl: previous.iconUrl
  });
  if (previous.status.running) await controlLocalApp(previous.id, "start");
}

async function waitForHealthyApp(appId: string, recipe: TrustedRecipe, healthPath: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const app = await getLocalApp(appId);
    if (app.status.running && app.status.healthy && await probeHealthy(app.port, healthPath)) return;
    if (!app.status.running && app.status.lastError) throw codedError("start_failed", app.status.lastError);
    updateStatus(recipe, "starting", `Waiting for a 2xx response from 127.0.0.1:${app.port}${healthPath}.`, { installer: "official", appId, port: app.port });
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  throw codedError("health_timeout", "The services started but did not return a successful HTTP response within 120 seconds.");
}

async function probeHealthy(port: number, healthPath: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${healthPath}`, { signal: controller.signal, redirect: "manual" });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readWorkspaceStatus(recipe: TrustedRecipe, knownApps?: LocalAppView[] | null): Promise<CatalogWorkspaceInstallStatus> {
  try {
    const parsed = JSON.parse(await readFile(path.join(workspacePath(recipe), manifestName), "utf8")) as WorkspaceManifest;
    if ([1, 2, 3].includes(parsed.schemaVersion) && parsed.itemId === recipe.id && normalizeRepository(parsed.repositoryUrl) === normalizeRepository(recipe.repositoryUrl)) {
      if (activeStates.has(parsed.state)) return { ...parsed, state: "needs_agent", fallbackAvailable: true, message: "The previous official installation was interrupted. Retry it or let a local Agent take over.", updatedAt: new Date().toISOString() };
      const updateAvailable = parsed.sourceRef !== recipe.sourceRef;
      const state = updateAvailable && parsed.state === "installed" ? "update_available" : parsed.state;
      const dataPath = parsed.dataPath ?? (await exists(path.join(workspacePath(recipe), "data")) ? path.join(workspacePath(recipe), "data") : catalogDataPath(recipe));
      if ((state === "installed" || state === "update_available") && knownApps) {
        const app = knownApps.find((candidate) => candidate.id === parsed.appId && path.resolve(candidate.cwd ?? "") === path.resolve(parsed.sourcePath));
        if (!app) {
          return { ...parsed, state: "needs_agent", running: false, healthy: false, dataPath, fallbackAvailable: true, message: "Installed files remain, but the managed service registration is missing. Retry or let a local Agent repair it.", updatedAt: new Date().toISOString() };
        }
        const message = updateAvailable
          ? `A reviewed update is available (${String(parsed.sourceRef ?? "legacy install").slice(0, 12)} → ${recipe.sourceRef.slice(0, 12)}).`
          : app.status.running && app.status.healthy
            ? parsed.message
            : "Installed and registered. The managed service is currently stopped or unhealthy; open Local WebApps to start or inspect it.";
        return { ...parsed, state, message, dataPath, installedSourceRef: parsed.sourceRef, running: app.status.running, healthy: app.status.healthy, updatedAt: new Date().toISOString() };
      }
      return { ...parsed, state, dataPath, installedSourceRef: parsed.sourceRef,
        running: undefined, healthy: undefined,
        message: (state === "installed" || state === "update_available") && knownApps === null
          ? "Installed files remain. The application manager is unreachable; current service health is unknown." : parsed.message };
    }
  } catch { /* no current manifest */ }
  return statusFor(recipe, "not_installed", `Ready for the official installer at ${workspacePath(recipe)}.`, { installer: "official" });
}

async function persistCurrentStatus(recipe: TrustedRecipe, status: CatalogWorkspaceInstallStatus, installer = status.installer, healthPath?: string): Promise<void> {
  await writeWorkspaceManifest(workspacePath(recipe), manifestFor(recipe, status, installer, healthPath));
}

function manifestFor(recipe: TrustedRecipe, status: CatalogWorkspaceInstallStatus, installer?: "official" | "agent", healthPath?: string): WorkspaceManifest {
  return {
    ...status, schemaVersion: 3, repositoryUrl: recipe.repositoryUrl, sourceRef: recipe.sourceRef,
    sourcePath: path.join(workspacePath(recipe), "source"), dataPath: status.dataPath ?? catalogDataPath(recipe), installer, healthPath
  };
}

export async function uninstallCatalogWorkspaceInstall(id: string, purgeData = false): Promise<CatalogWorkspaceInstallStatus> {
  const recipe = trustedWorkspaceRecipe(id);
  if (!recipe) throw codedError("install_not_available", "This catalog entry has no reviewed official installation recipe.");
  const target = workspacePath(recipe);
  const status = runtime.jobs.get(id) ?? await readWorkspaceStatus(recipe);
  if (activeStates.has(status.state)) throw codedError("install_busy", "Wait for the current installation to finish before uninstalling.");
  let dataPath = status.dataPath ?? await resolvedDataPath(recipe);
  const legacyData = path.join(target, "data");
  const canonicalRoot = catalogDataRoot();
  const canonicalData = catalogDataPath(recipe);
  if (purgeData && path.resolve(dataPath) !== path.resolve(legacyData) && !isInside(dataPath, canonicalRoot)) {
    throw codedError("unsafe_data_path", "Refusing to purge application data outside the catalog state root.");
  }
  if (!purgeData && path.resolve(dataPath) === path.resolve(legacyData) && await exists(legacyData) && await exists(canonicalData)) {
    throw codedError("data_migration_conflict", `Cannot preserve legacy data because ${canonicalData} already exists.`);
  }
  const apps = await listLocalApps();
  const app = apps.find((candidate) => candidate.id === status.appId)
    ?? apps.find((candidate) => path.resolve(candidate.cwd ?? "") === path.resolve(path.join(target, "source")))
    ?? null;
  if (app?.status.running) await controlLocalApp(app.id, "stop");
  let dataPurgeImages = recipe.kind === "container" && recipe.image ? [recipe.image] : [];
  if (await exists(path.join(target, "cleanup.json"))) {
    const cleanup = await readCleanupContract(target, recipe);
    if (purgeData && recipe.kind === "compose") dataPurgeImages = await composeDataPurgeImages(cleanup);
    await executeCleanup(cleanup, recipe);
  }
  if (app) await deleteLocalApp(app.id);
  if (purgeData) {
    if (path.resolve(dataPath) !== path.resolve(legacyData)) await purgeCatalogData(dataPath, dataPurgeImages, target, recipe);
  } else if (path.resolve(dataPath) === path.resolve(legacyData) && await exists(legacyData)) {
    await mkdir(path.dirname(canonicalData), { recursive: true, mode: 0o700 });
    await rename(legacyData, canonicalData);
    dataPath = canonicalData;
  }
  await rm(target, { recursive: true, force: true });
  runtime.jobs.delete(id);
  return statusFor(recipe, "not_installed", purgeData ? "Uninstalled and deleted local application data." : `Uninstalled. Local application data was kept at ${dataPath}.`, {
    installer: "official", dataPath
  });
}

async function purgeCatalogData(dataPath: string, images: string[], cwd: string, recipe: TrustedRecipe): Promise<void> {
  try {
    await rm(dataPath, { recursive: true, force: true });
    return;
  } catch (error) {
    if (!isPermissionError(error)) throw error;
  }

  for (const image of [...new Set(images)]) {
    if (!image.includes("@sha256:")) continue;
    try {
      await run("docker", buildDockerDataPurgeArgs(dataPath, image), cwd, recipe, 2 * 60_000);
      await rm(dataPath, { recursive: true, force: true });
      return;
    } catch { /* try the next immutable image */ }
  }
  throw codedError("data_purge_failed", "The application stopped, but its container-owned data could not be deleted safely.");
}

export function buildDockerDataPurgeArgs(dataPath: string, image: string): string[] {
  if (!path.isAbsolute(dataPath)) throw new Error("Docker data purge requires an absolute data path.");
  if (!image.includes("@sha256:")) throw new Error("Docker data purge requires an immutable image digest.");
  return [
    "run", "--rm", "--network", "none", "--user", "0:0", "--entrypoint", "/bin/sh",
    "--volume", `${dataPath}:/vibedesktop-purge:rw`, image,
    "-c", "find /vibedesktop-purge -mindepth 1 -depth -delete"
  ];
}

async function composeDataPurgeImages(cleanup: CleanupContract): Promise<string[]> {
  try {
    const args = [...cleanup.args.slice(0, -2), "config", "--images"];
    const { stdout } = await execFileAsync("docker", args, {
      cwd: cleanup.cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    });
    return stdout.split("\n").map((value) => value.trim()).filter((value) => value.includes("@sha256:"));
  } catch {
    return [];
  }
}

function isPermissionError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error.code === "EACCES" || error.code === "EPERM"));
}

async function readCleanupContract(target: string, recipe: TrustedRecipe): Promise<CleanupContract> {
  const parsed = JSON.parse(await readFile(path.join(target, "cleanup.json"), "utf8")) as Partial<CleanupContract>;
  if (parsed.schemaVersion !== 1 || parsed.command !== "docker" || !Array.isArray(parsed.args) || parsed.args.some((arg) => typeof arg !== "string")) {
    throw codedError("invalid_cleanup_contract", "The reviewed workspace cleanup contract is invalid.");
  }
  if (parsed.cwd !== target && parsed.cwd !== path.join(target, "source")) {
    throw codedError("invalid_cleanup_contract", "The reviewed workspace cleanup command has an invalid working directory.");
  }
  const exactContainerCleanup = parsed.cwd === target
    && JSON.stringify(parsed.args) === JSON.stringify(["rm", "-f", `vibedesktop-${recipe.id.replace(/^github-/, "").replace(/[^a-z0-9-]/g, "-")}`]);
  const composeFiles = parsed.args.slice(1, -2);
  const composeCleanup = parsed.cwd === path.join(target, "source")
    && parsed.args[0] === "compose" && parsed.args.at(-2) === "down" && parsed.args.at(-1) === "--remove-orphans"
    && composeFiles.length >= 2 && composeFiles.length % 2 === 0
    && composeFiles.every((arg, index) => index % 2 === 0 ? arg === "-f" : isInside(arg, target));
  if (!exactContainerCleanup && !composeCleanup) {
    throw codedError("invalid_cleanup_contract", "The reviewed workspace cleanup command is outside the allowed recipe cleanup operations.");
  }
  return parsed as CleanupContract;
}

async function executeCleanup(cleanup: CleanupContract, recipe: TrustedRecipe): Promise<void> {
  try {
    await run(cleanup.command, cleanup.args, cleanup.cwd, recipe, 2 * 60_000);
  } catch (error) {
    if (cleanup.args[0] !== "rm" || cleanup.args.length !== 3) throw error;
    try {
      await run("docker", ["inspect", cleanup.args[2]], cleanup.cwd, recipe, 30_000);
    } catch {
      return; // `docker rm` failed only because the --rm container was already absent.
    }
    throw error;
  }
}

async function writeWorkspaceManifest(directory: string, manifest: WorkspaceManifest): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, manifestName);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function firstAvailablePort(preferred: number): Promise<number> {
  for (let port = preferred; port <= Math.min(65_535, preferred + 500); port += 1) if (await portAvailable(port)) return port;
  throw codedError("no_available_port", `No free loopback port was found near ${preferred}.`);
}

async function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function run(command: string, args: string[], cwd: string, recipe: TrustedRecipe, timeoutMs = 35 * 60_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    let tail = "";
    let settled = false;
    const finish = (callback: () => void) => { if (!settled) { settled = true; clearTimeout(timer); callback(); } };
    const capture = (chunk: Buffer) => {
      tail = `${tail}${chunk.toString("utf8")}`.slice(-16_000);
      const line = tail.trim().split("\n").at(-1);
      if (line) updateStatus(recipe, runtime.jobs.get(recipe.id)?.state ?? "installing", line.slice(0, 260), {
        installer: "official", port: runtime.jobs.get(recipe.id)?.port
      });
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timer = setTimeout(() => {
      terminate(child.pid);
      finish(() => reject(codedError("install_timeout", "Official installer timed out after 35 minutes.")));
    }, timeoutMs);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code, signal) => finish(() => code === 0
      ? resolve()
      : reject(codedError("install_command_failed", `Official installer failed (${signal ?? code ?? "unknown"}). ${tail.trim().slice(-1600)}`))));
  });
}

function terminate(pid?: number): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") process.kill(pid, "SIGTERM");
    else process.kill(-pid, "SIGTERM");
  } catch { /* already exited */ }
}

function workspacePath(recipe: TrustedRecipe): string {
  return path.join(catalogWorkspaceRoot(), recipe.id.replace(/^github-/, ""));
}

function catalogDataPath(recipe: TrustedRecipe): string {
  return path.join(catalogDataRoot(), recipe.id.replace(/^github-/, ""));
}

async function resolvedDataPath(recipe: TrustedRecipe): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(path.join(workspacePath(recipe), manifestName), "utf8")) as Partial<WorkspaceManifest>;
    if (typeof parsed.dataPath === "string" && path.isAbsolute(parsed.dataPath)) return parsed.dataPath;
  } catch { /* no manifest override */ }
  const legacy = path.join(workspacePath(recipe), "data");
  return await exists(legacy) ? legacy : catalogDataPath(recipe);
}

function statusFor(recipe: TrustedRecipe, state: CatalogWorkspaceInstallStatus["state"], message: string, extra: Partial<CatalogWorkspaceInstallStatus> = {}): CatalogWorkspaceInstallStatus {
  return { itemId: recipe.id, title: recipe.title, state, message, workspacePath: workspacePath(recipe), updatedAt: new Date().toISOString(), ...extra };
}

function updateStatus(recipe: TrustedRecipe, state: CatalogWorkspaceInstallStatus["state"], message: string, extra: Partial<CatalogWorkspaceInstallStatus> = {}): CatalogWorkspaceInstallStatus {
  const next = statusFor(recipe, state, message, extra);
  runtime.jobs.set(recipe.id, next);
  return next;
}

async function exists(target: string): Promise<boolean> {
  try { await stat(target); return true; } catch { return false; }
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function normalizeRepository(value: string): string {
  return value.replace(/\/$/, "").toLocaleLowerCase();
}

function localInstructionOrigin(requestOrigin: string): string {
  try {
    const parsed = new URL(requestOrigin);
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
    if (loopback && (parsed.protocol === "http:" || parsed.protocol === "https:")) return parsed.origin;
  } catch { /* use installed default */ }
  return "http://127.0.0.1:3002";
}
