/* Interactive simulations for the showcase. They act out what the installed
   desktop does, with the same steps, commands, ports and paths; they never
   pretend to touch the visitor's computer. */
import { INSTALL_COMMAND, copyText, emit, glyph, h, reducedMotion, sleep, tile } from "./util.js";
import { lang, t } from "./i18n.js";

const L = (zh, en) => (lang === "zh" ? zh : en);

/** Runs scripted steps; a newer run or an unmount cancels the older one. */
function runner() {
  let token = 0;
  return {
    start() {
      const mine = ++token;
      return { alive: () => mine === token, wait: async (ms) => { await sleep(reducedMotion.matches ? Math.min(ms, 60) : ms); return mine === token; } };
    },
    stop() {
      token++;
    }
  };
}

function frame(title, ...children) {
  return h("div", { class: "sim-window" },
    h("div", { class: "sim-titlebar" }, h("span", { class: "sim-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", { text: title }), h("span", { class: "sim-tag", text: t("show.sim") })),
    h("div", { class: "sim-body" }, children));
}

/* ----- 1. Terminal storm ----- */

function storm() {
  const terminals = [
    { title: "web — npm run dev", lines: ["$ npm run dev", "VITE ready in 412 ms", "➜ Local: http://localhost:5173"], bad: false },
    { title: "api — uvicorn", lines: ["$ uvicorn app:app --port 8000", "ERROR: [Errno 98]", "address already in use"], bad: true },
    { title: "admin — npm start", lines: ["$ npm start", "Error: listen EADDRINUSE", ":::3000"], bad: true },
    { title: "worker — python", lines: ["$ python worker.py", "Traceback (most recent call…", "ConnectionRefusedError"], bad: true },
    { title: "ui — streamlit", lines: ["$ streamlit run ui.py", "URL: http://localhost:8501"], bad: false },
    { title: "??? — node", lines: ["$ node server.js", "[nodemon] app crashed", "waiting for file changes…"], bad: true }
  ];
  const notes = L(["前端是 5173 还是 5174？", "后端在哪个终端来着…", "页面怎么又打不开了？"], ["Was it 5173 or 5174?", "Which terminal was the API?", "Why won't it load again?"]);
  const spots = [[4, 6, -4], [38, 2, 3], [66, 12, -2], [8, 50, 2], [44, 44, -3], [70, 56, 4]];
  const stage = h("div", { class: "storm-stage" });
  const cards = terminals.map((term, index) => {
    const card = h("div", { class: `storm-term${term.bad ? " is-bad" : ""}` },
      h("div", { class: "storm-term-bar", text: term.title }),
      h("pre", { text: term.lines.join("\n") }));
    const [x, y, r] = spots[index];
    card.style.left = `${x}%`;
    card.style.top = `${y}%`;
    card.style.setProperty("--tilt", `${r}deg`);
    card.style.animationDelay = `${index * -0.37}s`;
    return card;
  });
  const stickies = notes.map((text, index) => {
    const note = h("p", { class: "storm-note", text });
    note.style.left = `${[56, 22, 80][index]}%`;
    note.style.top = `${[34, 82, 84][index]}%`;
    return note;
  });
  const result = h("div", { class: "storm-result", hidden: true },
    tile("sparkle", "acid", "vd-tile storm-icon"),
    h("strong", { text: "Notes AI" }),
    h("p", { class: "storm-pills" }, h("span", { text: "● web :5173" }), h("span", { text: "● api :8000" })),
    h("p", { class: "storm-caption", text: L("一个图标 · 一起启停 · 健康检查 · 分服务日志", "One icon · start and stop together · health checks · logs per service") }));
  stage.append(...cards, ...stickies, result);
  const button = h("button", { type: "button", class: "button primary sim-action" }, glyph("sparkle"), L("交给 Vibe Desktop", "Hand it to Vibe Desktop"));
  let tamed = false;
  button.addEventListener("click", async () => {
    if (tamed) {
      tamed = false;
      result.hidden = true;
      for (const node of [...cards, ...stickies]) {
        node.hidden = false;
        node.getAnimations().forEach((animation) => animation.cancel());
      }
      button.replaceChildren(glyph("sparkle"), L("交给 Vibe Desktop", "Hand it to Vibe Desktop"));
      return;
    }
    tamed = true;
    button.disabled = true;
    const box = stage.getBoundingClientRect();
    const animations = [...cards, ...stickies].map((node, index) => {
      const rect = node.getBoundingClientRect();
      const dx = box.left + box.width / 2 - (rect.left + rect.width / 2);
      const dy = box.top + box.height / 2 - (rect.top + rect.height / 2);
      return node.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.05) rotate(${index % 2 ? 40 : -40}deg)`, opacity: 0 }],
        { duration: reducedMotion.matches ? 1 : 620, delay: reducedMotion.matches ? 0 : index * 60, easing: "cubic-bezier(.6,0,.4,1)", fill: "forwards" }).finished;
    });
    await Promise.all(animations);
    result.hidden = false;
    if (!reducedMotion.matches) result.animate([{ transform: "scale(.4)", opacity: 0 }, { transform: "scale(1.06)", opacity: 1 }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.2,.9,.3,1.3)" });
    button.disabled = false;
    button.replaceChildren(glyph("refresh"), L("再乱一次", "Make a mess again"));
    emit("storm:tamed", {});
  });
  return { node: h("div", { class: "sim sim-storm" }, stage, h("div", { class: "sim-controls" }, button)) };
}

/* ----- 4. Import a project ----- */

function importSim() {
  const run = runner();
  const out = h("div", { class: "import-flow" });
  const status = h("span", { class: "import-status" });
  const log = h("div", { class: "sim-log", role: "log", "aria-live": "off" });
  let filter = "all";
  const lines = [];
  const addLog = (tag, text, tone = "") => {
    const line = h("div", { class: `log-line tag-${tag}${tone ? ` is-${tone}` : ""}`, dataset: { tag } }, h("span", { class: "log-tag", text: `[${tag}]` }), h("span", { text }));
    lines.push(line);
    line.hidden = filter !== "all" && filter !== tag && tag !== "vibed";
    log.append(line);
    log.scrollTop = log.scrollHeight;
  };
  const tabs = ["all", "web", "api"].map((name) => h("button", {
    type: "button",
    class: "log-tab",
    "aria-pressed": String(name === "all"),
    text: name === "all" ? L("全部", "All") : name,
    onClick: (event) => {
      filter = name;
      for (const tab of tabs) tab.setAttribute("aria-pressed", String(tab === event.currentTarget));
      for (const line of lines) line.hidden = filter !== "all" && line.dataset.tag !== filter && line.dataset.tag !== "vibed";
    }
  }));
  const metrics = h("span", { class: "import-metrics" });
  let metricTimer = 0;
  const setStatus = (text, tone) => {
    status.textContent = text;
    status.className = `import-status is-${tone}`;
  };

  function stepOne() {
    run.stop();
    clearInterval(metricTimer);
    lines.length = 0;
    log.replaceChildren();
    const detect = h("button", { type: "button", class: "button primary sim-action" }, glyph("search"), L("识别", "Detect"));
    out.replaceChildren(
      h("label", { class: "sim-field" }, h("span", { text: L("项目文件夹", "Project folder") }), h("input", { value: "~/Projects/notes-ai", readonly: true, spellcheck: "false" })),
      h("pre", { class: "sim-tree", text: "notes-ai/\n├─ web/      package.json · vite.config.ts\n├─ server/   pyproject.toml · app.py\n└─ README.md" }),
      h("div", { class: "sim-controls" }, detect));
    detect.addEventListener("click", () => void stepTwo());
  }

  async function stepTwo() {
    const flow = run.start();
    const found = h("ul", { class: "sim-checks" });
    out.replaceChildren(h("p", { class: "sim-caption", text: L("正在识别 ~/Projects/notes-ai …", "Scanning ~/Projects/notes-ai …") }), found);
    const detections = [
      L("web/ → Vite（端口来自 vite.config.ts：5173）", "web/ → Vite (port from vite.config.ts: 5173)"),
      L("server/ → FastAPI（uvicorn，端口 8000，健康检查 /health）", "server/ → FastAPI (uvicorn on 8000, health /health)"),
      L("两个服务 → 一个应用：Notes AI", "Two services → one app: Notes AI")
    ];
    for (const text of detections) {
      if (!(await flow.wait(520))) return;
      found.append(h("li", { class: "is-ok" }, glyph("check"), h("span", { text })));
    }
    if (!(await flow.wait(400))) return;
    const register = h("button", { type: "button", class: "button primary sim-action" }, glyph("play"), L("注册并启动", "Register and start"));
    out.append(
      h("table", { class: "sim-plan" },
        h("thead", {}, h("tr", {}, h("th", { text: L("服务", "Service") }), h("th", { text: L("命令", "Command") }), h("th", { text: L("端口", "Port") }))),
        h("tbody", {},
          h("tr", {}, h("td", { text: "web" }), h("td", {}, h("code", { text: "npm run dev -- --port 5173 --strictPort" })), h("td", { text: "5173" })),
          h("tr", {}, h("td", { text: "api" }), h("td", {}, h("code", { text: "uv run uvicorn app:app --port 8000" })), h("td", { text: "8000" })))),
      h("p", { class: "sim-caption", rich: L("将生成 `run.sh` 和 `manifest.json`；你的源码不会被修改。", "Generates `run.sh` and `manifest.json`; your source is not modified.") }),
      h("div", { class: "sim-controls" }, register));
    register.addEventListener("click", () => void stepThree());
  }

  async function stepThree() {
    const flow = run.start();
    const crash = h("button", { type: "button", class: "button secondary sim-action", disabled: true }, glyph("close"), L("让后端崩溃一次", "Crash the backend"));
    const again = h("button", { type: "button", class: "button secondary sim-action" }, glyph("refresh"), L("从头再来", "Start over"));
    setStatus(L("启动中", "Starting"), "busy");
    metrics.textContent = "";
    out.replaceChildren(
      h("div", { class: "import-card" },
        tile("sparkle", "acid"),
        h("div", {}, h("strong", { text: "Notes AI" }), h("p", { class: "storm-pills" }, h("span", { text: "web :5173" }), h("span", { text: "api :8000" })), metrics),
        status),
      h("div", { class: "log-tabs", role: "group", "aria-label": L("按服务筛选日志", "Filter logs by service") }, tabs),
      log,
      h("div", { class: "sim-controls" }, crash, again));
    again.addEventListener("click", stepOne);
    crash.addEventListener("click", () => void crashIt(crash));
    const script = [
      ["api", "INFO:     Started server process [41822]"],
      ["api", "INFO:     Uvicorn running on http://127.0.0.1:8000"],
      ["web", "VITE v6.3.5  ready in 412 ms"],
      ["web", "➜  Local:   http://127.0.0.1:5173/"],
      ["vibed", L("健康检查 web → 200 ✓", "health web → 200 ✓"), "ok"],
      ["vibed", L("健康检查 api /health → 200 ✓", "health api /health → 200 ✓"), "ok"],
      ["vibed", L("Notes AI 运行中 · 2/2 健康 · 桌面上出现了它的图标", "Notes AI running · 2/2 healthy · its icon is on the desktop"), "ok"]
    ];
    for (const [tag, text, tone] of script) {
      if (!(await flow.wait(380))) return;
      addLog(tag, text, tone);
    }
    setStatus(L("运行中", "Running"), "ok");
    startMetrics();
    crash.disabled = false;
    emit("import:done", {});
  }

  function startMetrics() {
    clearInterval(metricTimer);
    const tick = () => {
      metrics.textContent = `CPU ${(0.2 + Math.random() * 1.4).toFixed(1)}% · ${178 + Math.round(Math.random() * 14)} MB · ${L("5 个进程", "5 processes")}`;
    };
    tick();
    metricTimer = setInterval(tick, 1200);
  }

  async function crashIt(button) {
    const flow = run.start();
    button.disabled = true;
    clearInterval(metricTimer);
    const script = [
      ["api", "Traceback (most recent call last):", "bad"],
      ["api", "RuntimeError: database is locked", "bad"],
      ["vibed", L("api 退出（code 1）→ 整组在 1 秒后重启", "api exited (code 1) → restarting the whole group in 1 s"), "warn"],
      ["web", L("已停止", "stopped")],
      ["vibed", L("重启第 1 次（退避 1 秒）", "restart #1 (back-off 1 s)"), "warn"],
      ["api", "INFO:     Uvicorn running on http://127.0.0.1:8000"],
      ["web", "VITE v6.3.5  ready in 388 ms"],
      ["vibed", L("健康检查 web → 200 ✓ · api → 200 ✓", "health web → 200 ✓ · api → 200 ✓"), "ok"]
    ];
    for (const [index, [tag, text, tone]] of script.entries()) {
      if (!(await flow.wait(index === 4 ? 1000 : 420))) return;
      addLog(tag, text, tone);
      if (index === 2) setStatus(L("重启中", "Restarting"), "warn");
    }
    setStatus(L("运行中", "Running"), "ok");
    startMetrics();
    button.disabled = false;
    emit("import:recovered", {});
  }

  stepOne();
  return {
    node: frame(L("本地 WebApp → 导入项目", "Local WebApps → Import project"), out),
    unmount() {
      run.stop();
      clearInterval(metricTimer);
    }
  };
}

/* ----- 5. Market install ----- */

const EXAMPLE = {
  repository: "vimalinx/vibedesktop-example",
  url: "https://github.com/vimalinx/vibedesktop-example",
  ref: "bc14e9280d68c85ea92aa8f0e0fb0d955f7d07f0",
  trust: "community",
  name: "Fullstack Example",
  description: "A Node frontend and a Python API, installed and supervised as one app.",
  icon: "icons/vimalinx--vibedesktop-example.svg",
  installLink: "vibedesktop://install?repo=vimalinx%2Fvibedesktop-example&ref=bc14e9280d68c85ea92aa8f0e0fb0d955f7d07f0",
  requires: ["node", "python3"],
  setup: ["node --check web/server.mjs", "python3 -m py_compile api/app.py"],
  services: [
    { name: "web", cwd: "web", run: "node server.mjs --port $PORT", port: 4310 },
    { name: "api", cwd: "api", run: "python3 app.py", port: 4311, health: "/api/health" }
  ]
};

async function loadExample() {
  try {
    const market = await fetch("/market.json", { cache: "no-cache" }).then((response) => (response.ok ? response.json() : null));
    const app = market?.apps?.find((entry) => /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(String(entry.repository)) && /^[0-9a-f]{40}$/.test(String(entry.ref)));
    if (!app) return EXAMPLE;
    const raw = await fetch(`https://raw.githubusercontent.com/${app.repository}/${app.ref}/.vibedesktop/app.json`);
    const manifest = raw.ok ? await raw.json() : null;
    if (!manifest || !Array.isArray(manifest.services)) return EXAMPLE;
    return {
      ...app,
      setup: Array.isArray(manifest.setup) ? manifest.setup.map(String) : [],
      requires: Array.isArray(manifest.requires) ? manifest.requires.map(String) : [],
      services: manifest.services.map((service) => ({ name: String(service.name), run: String(service.run), port: Number(service.port), health: service.health ? String(service.health) : undefined }))
    };
  } catch {
    return EXAMPLE;
  }
}

function marketSim(ctx) {
  const run = runner();
  const out = h("div", { class: "market-sim" }, h("p", { class: "sim-caption", text: L("正在读取市场…", "Loading the market…") }));
  let app = EXAMPLE;
  let installed = false;

  const iconFor = () => /^icons\/[a-z0-9._-]+\.(svg|png|webp|jpe?g)$/.test(String(app.icon))
    ? h("img", { src: `/${app.icon}`, alt: "", width: "48", height: "48" })
    : tile("bag", "blue");

  function card() {
    const install = h("button", { type: "button", class: "button primary sim-action" }, glyph("download"), installed ? L("更新", "Update") : L("安装", "Install"));
    install.addEventListener("click", () => (installed ? void update() : dialog()));
    out.replaceChildren(
      h("div", { class: "market-card" },
        iconFor(),
        h("div", {}, h("strong", { text: app.name }), h("p", { class: "app-repo", text: app.repository }), h("p", { class: "market-desc", text: app.description || "" })),
        h("span", { class: `trust trust-${app.trust === "reviewed" ? "reviewed" : "community"}`, text: app.trust === "reviewed" ? "Reviewed" : "Community" })),
      h("div", { class: "sim-controls" }, install,
        h("button", { type: "button", class: "button secondary sim-action", onClick: () => ctx.openApp("market") }, glyph("bag"), L("逛逛真的应用市场", "Browse the real market"))));
  }

  function dialog() {
    const confirm = h("button", { type: "button", class: "button primary sim-action" }, glyph("check"), L("确认安装", "Install"));
    const cancel = h("button", { type: "button", class: "button secondary sim-action", onClick: card }, L("取消", "Cancel"));
    const row = (label, ...value) => h("div", { class: "confirm-row" }, h("dt", { text: label }), h("dd", {}, value));
    out.replaceChildren(h("div", { class: "confirm" },
      h("div", { class: "confirm-head" }, iconFor(), h("div", {}, h("strong", { text: L(`安装 ${app.name}？`, `Install ${app.name}?`) }), h("p", { text: L("你在自己的电脑上看到的就是这样一个窗口。", "This is the dialog your own desktop shows.") }))),
      h("p", { class: "confirm-trust", text: app.trust === "reviewed"
        ? L("Reviewed：维护者审过这个确切的提交。", "Reviewed: the maintainer checked this exact commit.")
        : L("Community：自动收录，没有人审过它的代码。请确认你信任这个仓库。", "Community: listed automatically; nobody has reviewed its code. Only install it if you trust the repository.") }),
      h("dl", {},
        row(L("仓库", "Repository"), h("a", { href: app.url, target: "_blank", rel: "noreferrer", text: app.repository })),
        row(L("提交", "Commit"), h("a", { href: `${app.url}/tree/${app.ref}`, target: "_blank", rel: "noreferrer" }, h("code", { text: String(app.ref).slice(0, 12) }))),
        row(L("需要", "Requires"), h("span", { class: "confirm-requires" }, (app.requires || []).map((name) => h("span", { class: "is-ok", text: `${name} ✓` }))),
          h("small", { text: L("（模拟：假设都已安装。缺少的命令会标红，安装会在运行任何命令前停下。）", "(Simulated as present. A missing one is flagged and the install stops before running anything.)") })),
        row(L("安装命令", "Setup"), (app.setup || []).length ? h("ol", {}, app.setup.map((command) => h("li", {}, h("code", { text: command })))) : h("span", { text: L("无", "None") })),
        row(L("服务", "Services"), h("ul", {}, app.services.map((service, index) => h("li", {},
          h("code", { text: `${service.name} :${service.port}` }), " ", h("code", { text: service.run || "" }),
          index === 0 ? h("small", { text: L("（打开的页面）", " (the page that opens)") }) : null)))),
        row(L("数据目录", "Data"), h("code", { text: `~/.local/state/vibedesktop/apps/market/${app.repository.replace("/", "--")}/` }))),
      h("div", { class: "sim-controls" }, cancel, confirm)));
    confirm.addEventListener("click", () => void install());
  }

  async function steps(list, tone) {
    const flow = run.start();
    const ul = h("ul", { class: "sim-checks" });
    out.replaceChildren(ul);
    for (const [text, state] of list) {
      if (!(await flow.wait(560))) return false;
      ul.append(h("li", { class: `is-${state || tone}` }, glyph(state === "bad" ? "close" : "check"), h("span", { text })));
    }
    return flow.wait(500);
  }

  async function install() {
    const short = String(app.ref).slice(0, 12);
    const ok = await steps([
      [L(`取得锁定的提交 ${short}`, `Fetch the pinned commit ${short}`)],
      [L(`运行 ${app.setup?.length || 0} 条安装命令`, `Run ${app.setup?.length || 0} setup commands`)],
      [L(`启动 ${app.services.map((service) => service.name).join(" 和 ")}`, `Start ${app.services.map((service) => service.name).join(" and ")}`)],
      [L("健康检查：", "Health: ") + app.services.map((service) => `${service.name} ✓`).join("  ")],
      [L(`已安装：桌面上多了一个「${app.name}」图标`, `Installed: “${app.name}” is now on the desktop`)]
    ], "ok");
    if (!ok) return;
    installed = true;
    card();
    out.prepend(h("p", { class: "sim-success", text: L("装好了。再点「更新」，试试一个坏掉的新版本会怎样。", "Installed. Now press Update to see what a broken new version does.") }));
    emit("market:installed", {});
  }

  async function update() {
    const short = String(app.ref).slice(0, 12);
    const ok = await steps([
      [L("取得新提交 7f3a9c1e2b44（模拟的坏版本）", "Fetch new commit 7f3a9c1e2b44 (a simulated bad release)")],
      [L("运行安装命令", "Run setup commands")],
      [L("启动新版本", "Start the new version")],
      [L("健康检查：api 没有响应 ✗", "Health: api does not answer ✗"), "bad"],
      [L(`已换回 ${short}，数据原样保留`, `Back on ${short}; data untouched`)]
    ], "ok");
    if (!ok) return;
    card();
    out.prepend(h("p", { class: "sim-success", text: L("更新失败也没关系：旧版本自动回来了，数据一点没动。", "A failed update costs nothing: the previous version is back and the data was never touched.") }));
    emit("market:rolledback", {});
  }

  void loadExample().then((loaded) => {
    app = loaded;
    card();
  });
  const real = h("p", { class: "sim-caption", rich: L("装好 Vibe Desktop 以后，`vibedesktop://` 链接会直接唤起这个确认窗口。", "Once Vibe Desktop is installed, a `vibedesktop://` link opens this dialog for real.") });
  return { node: frame("vibedesktop.online/apps → Vibe Desktop", out, real), unmount: () => run.stop() };
}

/* ----- 6. app.json bug hunt ----- */

const BROKEN = `{
  "$schema": "https://vibedesktop.online/schema/app-v1.json",
  "schemaVersion": 1,
  "name": "Notes AI",
  "requires": ["node", "npm", "uv"],
  "setup": ["npm ci --prefix web", "uv sync --directory server --frozen"],
  "services": [
    { "name": "web", "cwd": "web", "run": "npm run dev -- --port $PORT", "port": 80 },
    { "name": "api", "cwd": "server", "run": "uv run uvicorn app:app --port 8000", "port": 8000, "health": "health" }
  ],
  "env": { "PORT": "9000", "NOTES_MODEL": "small" }
}`;

const FIXED = BROKEN
  .replace('"port": 80 }', '"port": 5173 }')
  .replace('"health": "health"', '"health": "/health"')
  .replace('"PORT": "9000", ', "");

function manifestSim() {
  const editor = h("textarea", { class: "manifest-editor", spellcheck: "false", "aria-label": "app.json", autocomplete: "off" });
  const panel = h("div", { class: "manifest-result", role: "status", "aria-live": "polite" });
  const hints = L(
    ["端口必须在 1024–65535 之间。", "健康检查路径要以 / 开头。", "PORT 这类变量是 Vibe Desktop 设置的，不能写进 env。"],
    ["Ports must be from 1024 to 65535.", "A health path starts with /.", "Variables like PORT are set by Vibe Desktop and cannot appear in env."]);
  let hintIndex = 0;
  let spec = null;
  let fixed = false;
  let dirty = false;

  const check = () => {
    if (!spec) return;
    let parsed = null;
    try {
      parsed = JSON.parse(editor.value);
    } catch (error) {
      panel.replaceChildren(h("p", { class: "is-bad", text: L(`JSON 格式错了：${error.message}`, `Not valid JSON: ${error.message}`) }));
      panel.className = "manifest-result is-bad";
      return;
    }
    const result = spec.validateAppManifest(parsed);
    if (!result.ok) {
      panel.className = "manifest-result is-bad";
      panel.replaceChildren(
        h("p", { class: "manifest-count", text: L(`还剩 ${result.errors.length} 个问题`, `${result.errors.length} problem${result.errors.length === 1 ? "" : "s"} left`) }),
        h("ul", {}, result.errors.map((message) => h("li", {}, h("code", { text: message })))));
      return;
    }
    panel.className = "manifest-result is-ok";
    panel.replaceChildren(
      h("p", { class: "manifest-count", text: L("全绿！这就是一份能上架的 app.json。", "All green! This app.json is ready for the market.") }),
      h("ul", {}, result.manifest.services.map((service, index) => h("li", {}, h("code", { text: `${service.name} :${service.port}` }), " ", h("span", { text: index === 0 ? L("打开的页面", "opens in the desktop") : service.health ? L(`健康检查 ${service.health}`, `health ${service.health}`) : "" })))));
    if (dirty && !fixed) {
      fixed = true;
      emit("manifest:fixed", {});
    }
  };

  editor.value = BROKEN;
  editor.addEventListener("input", () => {
    dirty = true;
    check();
  });
  const hint = h("p", { class: "sim-caption manifest-hint" });
  const controls = h("div", { class: "sim-controls" },
    h("button", { type: "button", class: "button secondary sim-action", onClick: () => { hint.textContent = `💡 ${hints[hintIndex % hints.length]}`; hintIndex++; } }, glyph("info"), L("提示", "Hint")),
    h("button", { type: "button", class: "button secondary sim-action", onClick: () => { editor.value = BROKEN; fixed = false; dirty = false; hint.textContent = ""; check(); } }, glyph("refresh"), L("重来", "Reset")),
    h("button", { type: "button", class: "button secondary sim-action", onClick: () => { editor.value = FIXED; dirty = true; check(); } }, glyph("check"), L("看答案", "Show answer")));
  void import("/app-manifest.mjs").then((module) => {
    spec = module;
    check();
  }).catch(() => {
    panel.replaceChildren(h("p", { text: L("校验器没加载出来，刷新再试。", "The validator did not load; refresh to retry.") }));
  });
  return { node: h("div", { class: "sim sim-manifest" }, h("div", { class: "manifest-grid" }, editor, panel), hint, controls) };
}

/* ----- 8. Security boundary ----- */

function shieldSim() {
  const attacks = [
    { id: "post", label: L("偷偷让你的桌面安装一个程序（跨站 POST）", "Quietly make your desktop install something (cross-site POST)"), verdict: L("拦下：请求不是从你的桌面页面发出的，跨站写入一律拒绝。", "Blocked: the request did not come from your desktop's own page; cross-site writes are refused.") },
    { id: "rebind", label: L("用 DNS 重绑定，把自己的域名指向 127.0.0.1", "Use DNS rebinding to point its domain at 127.0.0.1"), verdict: L("拦下：Host 不是本机地址，请求直接被拒绝。", "Blocked: the Host is not a loopback name, so the request is rejected.") },
    { id: "token", label: L("直接去调用进程管理器 vibed", "Call the vibed process supervisor directly"), verdict: L("拦下：没有私有令牌，vibed 不予理会。", "Blocked: without the private token, vibed does not answer.") }
  ];
  const blocked = new Set();
  const shield = h("div", { class: "shield-target" }, glyph("shield"), h("strong", { text: L("你的 Vibe Desktop", "Your Vibe Desktop") }), h("code", { text: "127.0.0.1" }));
  const verdict = h("p", { class: "shield-verdict", role: "status", "aria-live": "polite" });
  const lane = h("div", { class: "shield-lane", "aria-hidden": "true" });
  const fire = async (attack, allowed) => {
    const packet = h("span", { class: `shield-packet${allowed ? " is-allowed" : ""}` });
    lane.append(packet);
    const width = lane.getBoundingClientRect().width;
    await packet.animate(allowed
      ? [{ transform: "translateX(0)" }, { transform: `translateX(${width - 14}px)` }]
      : [{ transform: "translateX(0)" }, { transform: `translateX(${width - 30}px)`, offset: 0.7 }, { transform: `translateX(${width * 0.45}px)`, opacity: 0 }],
    { duration: reducedMotion.matches ? 1 : 900, easing: "ease-in-out" }).finished.catch(() => {});
    packet.remove();
    shield.classList.remove("is-hit", "is-asked");
    void shield.offsetWidth;
    shield.classList.add(allowed ? "is-asked" : "is-hit");
    verdict.textContent = attack.verdict;
    verdict.className = `shield-verdict ${allowed ? "is-ok" : "is-bad"}`;
    if (!allowed) {
      blocked.add(attack.id);
      if (blocked.size === attacks.length) emit("shield:blocked", {});
    }
  };
  const buttons = attacks.map((attack) => h("button", { type: "button", class: "shield-attack", onClick: (event) => { event.currentTarget.classList.add("is-done"); void fire(attack, false); } }, glyph("close"), h("span", { text: attack.label })));
  const ask = { label: "", verdict: L("这是允许的：一个 vibedesktop:// 安装链接只会弹出确认窗口，看清命令后由你决定。", "This one is allowed: a vibedesktop:// install link only opens the confirmation dialog, and you decide after reading every command.") };
  buttons.push(h("button", { type: "button", class: "shield-attack is-legit", onClick: () => void fire(ask, true) }, glyph("check"), h("span", { text: L("放一个安装链接", "Offer an install link") })));
  return {
    node: h("div", { class: "sim sim-shield" },
      h("div", { class: "shield-board" },
        h("div", { class: "shield-source" }, h("strong", { text: L("另一个网站", "Another website") }), h("code", { text: "evil.example" }), buttons),
        lane,
        shield),
      verdict)
  };
}

export function installCard() {
  const status = h("p", { class: "copy-status", role: "status", "aria-live": "polite" });
  const copy = h("button", { type: "button", class: "copy-button" }, t("install.copy"));
  copy.addEventListener("click", async () => {
    const ok = await copyText(INSTALL_COMMAND);
    status.textContent = ok ? t("install.copied") : t("install.copyFail");
    if (ok) emit("install:copied", {});
  });
  return h("div", { class: "command-card" },
    h("div", { class: "command-header" }, h("span", { text: "Terminal" }), h("span", { text: "latest release" })),
    h("pre", {}, h("code", { text: INSTALL_COMMAND })),
    copy,
    status);
}

export const SIMS = { storm, import: importSim, market: marketSim, manifest: manifestSim, shield: shieldSim };
