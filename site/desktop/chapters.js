/* Star Guide content. Every claim here matches the README and docs/guide.md;
   anything that only the installed desktop can do is shown as a simulation. */

export const INSTALL_COMMAND = "curl -fsSL https://github.com/vimalinx/vibedesktop/releases/latest/download/install-app.sh | sh";

export const CHAPTERS = [
  {
    id: "problem",
    star: [150, 520],
    title: { zh: "一个项目，两个终端，三个端口", en: "One project, two terminals, three ports" },
    short: { zh: "它解决什么问题", en: "The problem" },
    lead: {
      zh: "很多开源项目是前后端分离的：前端用 Vite 或 Next.js，后端用 FastAPI、Flask 或 Node。想在自己电脑上用，就得开两个终端、记住两个端口；关掉一个，另一半还在后台跑。项目一多，谁在跑、跑在哪个端口、为什么打不开，全靠记忆。",
      en: "Many open-source projects split a frontend (Vite, Next.js) from a backend (FastAPI, Flask, Node). Using one on your own computer means two terminals and two ports to remember; close one and the other half keeps running. With a dozen projects, what is running, on which port, and why it will not open is all down to memory."
    },
    sim: "storm",
    simLead: { zh: "这是你的屏幕。点下面的按钮，把它们交给 Vibe Desktop。", en: "This is your screen. Press the button and hand it all to Vibe Desktop." },
    points: [
      { zh: "**一个项目就是一个图标。** 前端和后端注册成同一个应用：一起启动、一起停止。", en: "**One project is one icon.** The frontend and backend register as one app that starts and stops together." },
      { zh: "**不会半死不活。** 所有服务在同一个受监管的进程组里，任何一个挂了，整组按退避策略一起重启。", en: "**No half-running apps.** Every service runs in one supervised process group; if one dies, the whole group restarts with back-off." },
      { zh: "**启动要验证。** 前端真正能响应才算启动成功；一直起不来就自动撤销注册，不留残留。", en: "**Starts are verified.** It only counts once the frontend answers; if it never does, the registration is rolled back." },
      { zh: "**全在本机。** 只监听 127.0.0.1，没有账号、没有遥测、不上云。它是装在你 Linux 电脑上的网页桌面，不是云服务，也不是手机应用。", en: "**Everything stays local.** It listens on 127.0.0.1 only, with no account, telemetry or cloud. It is a web desktop installed on your Linux computer, not a cloud service or a phone app." }
    ],
    missions: [{ id: "storm", event: "storm:tamed", text: { zh: "把终端风暴交给 Vibe Desktop", en: "Hand the terminal storm to Vibe Desktop" } }]
  },
  {
    id: "desktop",
    star: [92, 432],
    title: { zh: "像用电脑一样用网页", en: "Use web apps like a computer" },
    short: { zh: "桌面基本功", en: "Desktop basics" },
    lead: {
      zh: "Vibe Desktop 打开后是一个完整的桌面：图标、窗口、程序坞。你现在所在的这个网页，就是照着它做的体验版——窗口能拖、能缩放、能最小化。边看边试吧。",
      en: "Vibe Desktop opens as a whole desktop: icons, windows and a dock. The page you are on is a preview built the same way: windows drag, resize and minimize. Try it as you read."
    },
    points: [
      { zh: "**单击开窗口，双击开标签页。** 网站图标单击在桌面窗口里打开，双击用浏览器新标签页打开。", en: "**Click for a window, double-click for a tab.** A website icon opens in a desktop window on click, and in a browser tab on double-click." },
      { zh: "**最小化不丢东西。** 窗口最小化后，里面的应用还挂着，没保存的输入也还在。", en: "**Minimizing loses nothing.** A minimized window keeps its app mounted, unsaved input included." },
      { zh: "**刷新也能回来。** 桌面会记住打开了哪些窗口、位置、大小、层叠顺序和最大化状态。这个体验版也会——刷新一下试试。", en: "**Refresh and it comes back.** The desktop remembers which windows were open, where, how big, their stacking order and maximized state. So does this preview; try a refresh." },
      { zh: "**有的网站不让放进窗口。** 那种网站在窗口里是空白，用标签页打开就行。真实的桌面也一样。", en: "**Some sites refuse to be framed.** They stay blank in a window; open them in a tab instead. The installed desktop behaves the same." }
    ],
    missions: [
      { id: "open", event: "window:open", text: { zh: "从桌面或程序坞打开任意一个应用", en: "Open any app from the desktop or the dock" } },
      { id: "drag", event: "window:move", desktopOnly: true, text: { zh: "拖着标题栏移动一个窗口", en: "Drag a window by its title bar" } },
      { id: "keep", event: "ink:kept", text: { zh: "在「墨染」里画一笔，最小化，再从程序坞点回来——画还在", en: "Paint a stroke in Ink, minimize it, bring it back from the dock: the painting is still there" } }
    ]
  },
  {
    id: "flow",
    star: [70, 330],
    title: { zh: "分屏、搜索、快捷键", en: "Split view, search, shortcuts" },
    short: { zh: "效率", en: "Flow" },
    lead: {
      zh: "窗口一多就需要秩序。把窗口拖到屏幕左右边缘会自动占半屏，拖到顶部或双击标题栏就最大化；顶栏「窗口」菜单能一键平铺；Ctrl/⌘+K 搜索桌面上的一切。",
      en: "More windows need some order. Drag a window to the left or right edge for half the screen, to the top (or double-click its title) to maximize; the Windows menu tiles everything; Ctrl/⌘+K searches the whole desktop."
    },
    keys: [
      ["Ctrl/⌘ + K", { zh: "搜索。Enter 打开第一个结果，Tab 在结果之间移动", en: "Search. Enter opens the first result, Tab moves through results" }],
      ["Alt + W", { zh: "窗口总览", en: "Window overview" }],
      ["Alt + `", { zh: "在窗口之间切换", en: "Cycle windows" }],
      ["Alt + Shift + X", { zh: "关闭当前窗口", en: "Close the active window" }]
    ],
    points: [
      { zh: "**搜索覆盖桌面快捷方式、本地应用和设置。** 已经打开的应用会直接切过去，不会再开一个。", en: "**Search covers shortcuts, local apps and settings.** An app that is already open gets focused instead of opened twice." },
      { zh: "**保存成场景。** 一组窗口和布局可以存下来，下次一键恢复（第七章细讲）。", en: "**Save it as a scene.** A set of windows and their layout can be saved and restored in one go (chapter seven)." },
      { zh: "**网页可能占用快捷键。** 焦点在网页里时，有些按键会被网页先拿走；顶栏按钮始终可用。", en: "**Web pages can hold shortcuts.** While a page has focus it may keep some keys; the top bar always works." }
    ],
    missions: [
      { id: "search", event: "search:launch", text: { zh: "按 Ctrl/⌘+K（或点顶栏的搜索），用搜索打开一个东西", en: "Press Ctrl/⌘+K (or Search in the top bar) and open something from the results" } },
      { id: "snap", event: "window:snap", desktopOnly: true, text: { zh: "把窗口拖到屏幕左右边缘松手分屏，或者用「窗口 → 平铺全部窗口」", en: "Drop a window on the left or right screen edge, or use Windows → Tile all windows" } }
    ]
  },
  {
    id: "import",
    star: [96, 226],
    title: { zh: "指向一个文件夹，得到一个应用", en: "Point at a folder, get an app" },
    short: { zh: "导入前后端项目", en: "Import a project" },
    lead: {
      zh: "这是 Vibe Desktop 最核心的功能。打开「本地 WebApp → 导入项目」，填项目文件夹：它会识别出前端和后端、读出端口，先把计划给你看；你确认后，它注册成一个图标、一起启动、做健康检查。下面是一次忠实的模拟。",
      en: "This is the heart of Vibe Desktop. Open Local WebApps → Import project and enter a folder: it finds the frontend and backend, reads their ports and shows you the plan. Once you confirm, it registers one icon, starts everything together and checks health. Below is a faithful simulation."
    },
    sim: "import",
    points: [
      { zh: "**识别的目录结构：** `web/`、`frontend/`、`client/` 加上 `server/`、`backend/`、`api/`，或者根目录的统一启动脚本（Turbo、`concurrently` 等）。", en: "**Layouts it recognises:** `web/`, `frontend/`, `client/` plus `server/`, `backend/`, `api/`, or a root orchestrator script (Turbo, `concurrently` and so on)." },
      { zh: "**识别的框架：** Next.js、Vite、Vue、Astro、SvelteKit、Nuxt、Angular…；FastAPI、Flask、Django、Streamlit、Gradio、NiceGUI…。都不是？在「添加 WebApp」里填命令和端口。", en: "**Frameworks it recognises:** Next.js, Vite, Vue, Astro, SvelteKit, Nuxt, Angular…; FastAPI, Flask, Django, Streamlit, Gradio, NiceGUI…. Something else? Enter the command and port in Add WebApp." },
      { zh: "**端口规则：** 前端端口被占用时，换一个空闲端口并显式传进去；后端端口绝不会被悄悄改掉，因为你的代理配置依赖它。", en: "**Port rules:** a busy frontend port is swapped for a free one and passed explicitly; a backend port is never silently changed, because your proxy config depends on it." },
      { zh: "**没有黑箱：** 每个项目生成一份可读的 `run.sh` 和 `manifest.json`，你的源码一个字都不改。卡片上能看每个服务的端口、CPU 和内存，日志按服务分开看。", en: "**Nothing hidden:** each project gets a readable `run.sh` and `manifest.json`, and your source is never modified. Cards show each service's port, CPU and memory, and logs can be filtered per service." },
      { zh: "**命令行：** `vibedesktop add ~/Projects/my-app --plan` 只预览，`--start` 注册、启动、验证，失败自动回滚。", en: "**Command line:** `vibedesktop add ~/Projects/my-app --plan` previews, `--start` registers, starts and verifies, rolling back on failure." },
      { zh: "**AI Agent：** 对 Claude Code 或 Codex 说「用 add-app 把 ~/Projects/my-webui 加到 Vibe Desktop 并验证」。", en: "**AI agents:** tell Claude Code or Codex “Use add-app to add ~/Projects/my-webui to Vibe Desktop and verify it.”" }
    ],
    shot: { src: "/ui/local-apps.png", caption: { zh: "真实界面：一个 Vite 前端加 Flask 后端，作为一个应用运行。", en: "The real thing: a Vite frontend and a Flask backend running as one app." } },
    missions: [
      { id: "import", event: "import:done", text: { zh: "在模拟里把 notes-ai 导入成一个应用", en: "Import notes-ai as one app in the simulation" } },
      { id: "crash", event: "import:recovered", text: { zh: "让后端崩溃一次，看整组怎么自己恢复", en: "Crash the backend once and watch the group recover" } }
    ]
  },
  {
    id: "market",
    star: [168, 150],
    title: { zh: "看清每一条命令，再安装", en: "See every command, then install" },
    short: { zh: "应用市场", en: "App market" },
    lead: {
      zh: "vibedesktop.online/apps 收录自带 `.vibedesktop/app.json` 的开源项目。点「安装」会唤起你电脑上的 Vibe Desktop（没运行就先启动它），弹出确认窗口。下面用市场里真实的示例应用走一遍。",
      en: "vibedesktop.online/apps lists open-source projects that ship `.vibedesktop/app.json`. Install wakes Vibe Desktop on your computer (starting it if needed) and opens a confirmation dialog. Here is the walk-through with a real app from the market."
    },
    sim: "market",
    points: [
      { zh: "**网页只能「请求」。** 安装链接只能打开确认窗口，你点确认之前，什么都不会运行。", en: "**A web page can only ask.** An install link only opens the confirmation dialog; nothing runs until you confirm." },
      { zh: "**锁定到一个提交。** 你装的是一个确切的 commit，不是「最新的什么」。", en: "**Pinned to one commit.** You install one exact commit, never “whatever is latest”." },
      { zh: "**两级信任：** **Community** 是自动收录、没有人审过代码；**Reviewed** 是维护者审过某一个确切的提交。", en: "**Two trust tiers:** **Community** apps are listed automatically and nobody has reviewed their code; **Reviewed** apps were checked by the maintainer at one exact commit." },
      { zh: "**能打开才算装好。** 每个服务都要过健康检查，任何一步失败都会完整回滚。", en: "**Installed means it opens.** Every service must pass its health check; any failure rolls everything back." },
      { zh: "**更新保留数据。** 新版本起不来，自动换回旧版本；卸载默认也保留数据。", en: "**Updates keep your data.** If a new version fails, the previous one comes back; uninstalling keeps data unless you ask otherwise." },
      { zh: "**也能这样装：** 终端运行 `vibedesktop install owner/repo`，或者在「导入项目 → 从 GitHub 安装」里粘贴仓库地址。", en: "**Other ways in:** run `vibedesktop install owner/repo`, or paste a repository into Import project → Install from GitHub." }
    ],
    missions: [
      { id: "install", event: "market:installed", text: { zh: "在模拟里确认并装好示例应用", en: "Confirm and install the example app in the simulation" } },
      { id: "rollback", event: "market:rolledback", text: { zh: "试一次坏掉的更新，看它自动回到旧版本", en: "Try a broken update and watch it return to the previous version" } }
    ]
  },
  {
    id: "author",
    star: [258, 112],
    title: { zh: "一个文件加一个 topic，就能一键安装", en: "One file and one topic make it installable" },
    short: { zh: "给开源作者", en: "For authors" },
    lead: {
      zh: "如果你写了一个前后端分离的开源项目：在仓库里放一个 `.vibedesktop/app.json`，写清楚安装命令和要启动的服务，再给仓库加上 GitHub topic `vibedesktop-app`，6 小时内就会出现在市场里。不需要账号，也不需要填表。",
      en: "Wrote a frontend + backend open-source project? Commit `.vibedesktop/app.json` describing the setup commands and the services to start, add the GitHub topic `vibedesktop-app`, and the market lists it within six hours. No account, no form."
    },
    sim: "manifest",
    simLead: { zh: "找茬游戏：下面这份 app.json 藏着 3 个问题。改到右边全绿为止——检查用的就是桌面安装时用的同一个校验器。", en: "Spot the bugs: this app.json hides 3 problems. Edit until the panel turns green; it runs the same validator the desktop uses before installing." },
    points: [
      { zh: "**第一个服务就是打开的页面。** 最多 6 个服务，端口在 1024–65535 之间。", en: "**The first service is the page that opens.** Up to six services, ports from 1024 to 65535." },
      { zh: "**主服务用 `$PORT` 才能换端口。** 端口冲突时只有主服务能被换到空闲端口，其他服务的端口固定不动。", en: "**Use `$PORT` to let the primary port move.** On a conflict only the primary service can move to a free port; the others stay fixed." },
      { zh: "**每个服务都会拿到：** `PORT`、`HOST=127.0.0.1`、`VIBE_PORT_<名字>`、`VIBE_APP_URL`、`VIBE_DATA_DIR`。", en: "**Every service receives** `PORT`, `HOST=127.0.0.1`, `VIBE_PORT_<NAME>`, `VIBE_APP_URL` and `VIBE_DATA_DIR`." },
      { zh: "**先在本机验证：** `check.py --run` 会像桌面一样安装、启动，再检查每个健康路径。", en: "**Prove it locally:** `check.py --run` installs and starts the app exactly like the desktop, then checks every health path." },
      { zh: "**交给 AI：** 装上 `vibedesktop-app` 技能，对 Agent 说「用 vibedesktop-app 让这个仓库可以从市场安装并验证」。", en: "**Or hand it to an agent:** install the `vibedesktop-app` skill and say “Use vibedesktop-app to make this repository installable from the market and verify it.”" }
    ],
    commands: [
      "curl -fsSL https://vibedesktop.online/skill.sh | sh",
      "python3 ~/.claude/skills/vibedesktop-app/scripts/check.py . --run",
      "gh repo edit --add-topic vibedesktop-app"
    ],
    missions: [{ id: "fix", event: "manifest:fixed", text: { zh: "修好 app.json 里的 3 个问题", en: "Fix the 3 problems in app.json" } }]
  },
  {
    id: "scenes",
    star: [352, 150],
    title: { zh: "工作现场、备份、版本，都能退回去", en: "Scenes, backups and versions all roll back" },
    short: { zh: "场景、备份与版本", en: "Scenes and safety nets" },
    lead: {
      zh: "把常用的一组窗口存成「场景」，下次一键回来；桌面配置可以备份，预览后再恢复；软件更新失败会自动回到上一版。这一章的任务，可以直接在这个体验版的顶栏「场景」里完成。",
      en: "Save a set of windows as a scene and bring it back in one click; back up the desktop and preview before restoring; a failed update returns to the previous version by itself. This chapter's missions work right here, in the Scenes menu of this preview."
    },
    sim: "versions",
    points: [
      { zh: "**工作场景：** 保存当前的应用组合和布局。恢复时，已经打开的窗口保持原样，其他窗口最小化；停着的本地服务会被自动启动。", en: "**Work scenes:** save the current set of apps and layout. Restoring keeps mounted windows as they are and minimizes the others; stopped local services that the scene needs are started." },
      { zh: "**备份与恢复：** 设置 → 备份与恢复，导出 JSON（最大 48 MB），恢复前先预览，并先替你备份当前桌面。定时备份默认关闭，可选每小时/每天/每周，分别保留 3/7/14 份。", en: "**Backup and restore:** Settings → Backup & restore exports JSON (up to 48 MB), previews before restoring, and backs up the current desktop first. Scheduled backups are off by default: hourly, daily or weekly, keeping 3/7/14 copies." },
      { zh: "**版本管理：** `vibedesktop update` 拉取、构建、切换、健康检查，失败自动回滚；`vibedesktop rollback` 不需要联网。", en: "**Versions:** `vibedesktop update` fetches, builds, switches and health-checks, rolling back on failure; `vibedesktop rollback` works offline." },
      { zh: "**崩溃隔离：** 某个窗口出错只显示一张可恢复的卡片，不会让整个桌面白屏；打开 `/?safe=1` 可以不恢复上次的窗口启动。", en: "**Crash isolation:** a failing window shows a recoverable card instead of blanking the desktop; `/?safe=1` starts without restoring the previous windows." }
    ],
    missions: [
      { id: "save", event: "scene:save", text: { zh: "打开几个窗口，在顶栏「场景」里保存一个场景", en: "Open a few windows and save a scene from the Scenes menu" } },
      { id: "restore", event: "scene:restore", text: { zh: "把窗口弄乱，再从「场景」里恢复它", en: "Mess the windows up, then restore the scene" } }
    ]
  },
  {
    id: "safety",
    star: [440, 226],
    title: { zh: "网页只能请求，你的电脑说了算", en: "Pages can only ask; your computer decides" },
    short: { zh: "安全边界与安装", en: "Security and install" },
    lead: {
      zh: "Vibe Desktop 管的是会在你电脑上运行的程序，所以边界画得很清楚。在下面试着从「别的网站」攻击它。",
      en: "Vibe Desktop manages programs that run on your computer, so its boundary is drawn sharply. Try attacking it from “another website” below."
    },
    sim: "shield",
    points: [
      { zh: "**只在本机：** 只监听 127.0.0.1；拒绝其他主机名的请求，防 DNS 重绑定；拒绝跨站写入。", en: "**Local only:** listens on 127.0.0.1, rejects other host names to stop DNS rebinding, and refuses cross-site writes." },
      { zh: "**进程管理器要令牌：** 负责启停程序的 vibed 只接受带私有令牌的请求。", en: "**The supervisor needs a token:** vibed, which starts and stops programs, only accepts requests carrying a private token." },
      { zh: "**没有账号、没有遥测、不上云。**", en: "**No account, no telemetry, no cloud.**" },
      { zh: "**开源：** Apache-2.0 许可证，完整源码在 GitHub，发布包带签名。", en: "**Open source:** Apache-2.0, complete source on GitHub, signed releases." }
    ],
    install: true,
    missions: [
      { id: "shield", event: "shield:blocked", text: { zh: "从「别的网站」发起三种攻击，全部被挡下", en: "Launch all three attacks from “another website” and see each one stopped" } },
      { id: "copy", event: "install:copied", text: { zh: "复制安装命令（准备好在电脑上运行）", en: "Copy the install command (ready for your computer)" } }
    ]
  }
];
