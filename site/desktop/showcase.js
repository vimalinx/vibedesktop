/* 它能做什么 What it does: four short, hands-on pages about the parts of Vibe
   Desktop that only the installed version can do. Every claim matches the README
   and docs/guide.md; anything that would touch a real computer is a simulation. */
import { SIMS, installCard } from "./sims.js";
import { h } from "./util.js";
import { lang, pick, t } from "./i18n.js";

export const SECTIONS = [
  {
    id: "one-icon",
    tab: { zh: "一个图标", en: "One icon" },
    title: { zh: "前端一个终端，后端一个终端？交给它。", en: "One terminal for the frontend, one for the backend? Hand them over." },
    lead: {
      zh: "很多开源项目是前后端分离的：前端用 Vite 或 Next.js，后端用 FastAPI、Flask 或 Node。Vibe Desktop 把这样一个项目变成桌面上的一个图标：一起启动、一起停止、检查是否健康、分服务看日志。",
      en: "Many open-source projects split a Vite or Next.js frontend from a FastAPI, Flask or Node backend. Vibe Desktop turns such a project into one desktop icon: start and stop together, health checks, logs per service."
    },
    blocks: [
      { sim: "storm", lead: { zh: "这是你现在的屏幕。按一下按钮试试。", en: "This is your screen today. Press the button." } },
      { sim: "import", lead: { zh: "实际怎么导入：指向文件夹 → 看计划 → 注册并启动。崩溃了会整组按退避策略重启。", en: "How importing works: point at a folder → read the plan → register and start. A crash restarts the whole group with back-off." } }
    ],
    points: [
      { zh: "**识别的结构：** `web/`、`frontend/`、`client/` 加 `server/`、`backend/`、`api/`，或根目录的统一启动脚本；Next.js、Vite、FastAPI、Flask、Django、Streamlit、Gradio 等常见框架。", en: "**Layouts it recognises:** `web/`, `frontend/`, `client/` plus `server/`, `backend/`, `api/`, or a root orchestrator; common frameworks such as Next.js, Vite, FastAPI, Flask, Django, Streamlit and Gradio." },
      { zh: "**端口规则：** 前端端口被占用时换一个空闲端口并显式传入；后端端口绝不悄悄改。", en: "**Port rules:** a busy frontend port is swapped for a free one and passed explicitly; a backend port is never silently changed." },
      { zh: "**没有黑箱：** 每个项目生成可读的 `run.sh` 和 `manifest.json`，源码一个字都不改。", en: "**Nothing hidden:** each project gets a readable `run.sh` and `manifest.json`; your source is never modified." },
      { zh: "**命令行和 AI 也行：** `vibedesktop add ~/Projects/my-app --start`，或对 Claude Code / Codex 说「用 add-app 把它加到 Vibe Desktop」。", en: "**Command line and agents too:** `vibedesktop add ~/Projects/my-app --start`, or ask Claude Code / Codex to “use add-app to add it to Vibe Desktop”." }
    ],
    shot: { src: "/ui/local-apps.png", caption: { zh: "真实界面：Vite 前端加 Flask 后端，作为一个应用运行。", en: "The real thing: a Vite frontend and a Flask backend running as one app." } }
  },
  {
    id: "market",
    tab: { zh: "一键安装", en: "One-click install" },
    title: { zh: "看清每一条命令，再安装。", en: "See every command, then install." },
    lead: {
      zh: "应用市场收录自带 `.vibedesktop/app.json` 的开源项目。点「安装」会唤起你电脑上的 Vibe Desktop，先弹出确认窗口。下面用市场里真实的示例应用走一遍。",
      en: "The app market lists open-source projects that ship `.vibedesktop/app.json`. Install wakes Vibe Desktop on your computer and shows a confirmation dialog first. Here it is with a real app from the market."
    },
    blocks: [{ sim: "market" }],
    points: [
      { zh: "**网页只能「请求」：** 安装链接只会打开确认窗口，你点确认之前什么都不会运行。", en: "**A web page can only ask:** an install link only opens the dialog; nothing runs until you confirm." },
      { zh: "**锁定一个提交：** 装的是确切的 commit；**Community** 自动收录、没人审过，**Reviewed** 是维护者审过那个提交。", en: "**Pinned to one commit:** **Community** apps are listed automatically and unreviewed; **Reviewed** apps were checked at that exact commit." },
      { zh: "**能打开才算装好：** 每个服务都要过健康检查；失败完整回滚，更新失败自动换回旧版本，数据保留。", en: "**Installed means it opens:** every service must pass its health check; failures roll back, a failed update restores the previous version, data is kept." }
    ]
  },
  {
    id: "author",
    tab: { zh: "给开源作者", en: "For authors" },
    title: { zh: "一个文件加一个 topic，就能被一键安装。", en: "One file and one topic make it installable." },
    lead: {
      zh: "在仓库里放 `.vibedesktop/app.json`，写清楚安装命令和要启动的服务，再加 GitHub topic `vibedesktop-app`，6 小时内出现在市场里。不需要账号，也不需要填表。",
      en: "Commit `.vibedesktop/app.json` with the setup commands and services, add the GitHub topic `vibedesktop-app`, and the market lists it within six hours. No account, no form."
    },
    blocks: [{ sim: "manifest", lead: { zh: "找茬：下面这份 app.json 藏着 3 个问题，改到右边全绿。检查用的就是桌面安装时用的同一个校验器。", en: "Spot the bugs: this app.json hides 3 problems. Edit until the panel turns green; it is the same validator the desktop runs." } }],
    points: [
      { zh: "第一个服务就是打开的页面；最多 6 个服务，端口 1024–65535；主服务用 `$PORT` 才能在冲突时换端口。", en: "The first service is the page that opens; up to six services, ports 1024–65535; use `$PORT` so the primary port can move on a conflict." },
      { zh: "`check.py --run` 会像桌面一样安装、启动，再检查每个健康路径。", en: "`check.py --run` installs and starts the app like the desktop, then checks every health path." },
      { zh: "装上 `vibedesktop-app` 技能，AI Agent 能替你完成全部步骤。", en: "With the `vibedesktop-app` skill, an AI agent can do every step for you." }
    ],
    commands: ["curl -fsSL https://vibedesktop.online/skill.sh | sh", "python3 ~/.claude/skills/vibedesktop-app/scripts/check.py . --run", "gh repo edit --add-topic vibedesktop-app"]
  },
  {
    id: "safety",
    tab: { zh: "安全与安装", en: "Safety and install" },
    title: { zh: "网页只能请求，你的电脑说了算。", en: "Pages can only ask; your computer decides." },
    lead: {
      zh: "Vibe Desktop 管的是会在你电脑上运行的程序，所以边界画得很清楚。试着从「别的网站」攻击它。",
      en: "Vibe Desktop manages programs that run on your computer, so the boundary is sharp. Try attacking it from “another website”."
    },
    blocks: [{ sim: "shield" }],
    points: [
      { zh: "**只在本机：** 只监听 127.0.0.1，拒绝其他主机名（防 DNS 重绑定），拒绝跨站写入；进程管理器 vibed 只认私有令牌。", en: "**Local only:** listens on 127.0.0.1, rejects other host names (DNS rebinding) and cross-site writes; the vibed supervisor only accepts a private token." },
      { zh: "**没有账号、没有遥测、不上云。** Apache-2.0 开源，发布包带签名。", en: "**No account, no telemetry, no cloud.** Apache-2.0, signed releases." }
    ],
    install: true
  }
];

export function mountShowcase(body, ctx) {
  let index = Math.max(0, SECTIONS.findIndex((section) => section.id === ctx.params?.section));
  let sims = [];
  const tabs = h("div", { class: "show-tabs", role: "tablist", "aria-label": t("app.showcase") });
  const page = h("div", { class: "show-page", role: "tabpanel", tabindex: "-1" });
  body.append(h("div", { class: "show" }, tabs, page));

  function go(next) {
    index = next;
    render();
    page.scrollTop = 0;
  }

  function render() {
    for (const sim of sims) sim.unmount?.();
    sims = [];
    tabs.replaceChildren(...SECTIONS.map((section, i) => h("button", {
      type: "button", role: "tab", class: "show-tab", "aria-selected": String(i === index), text: pick(section.tab), onClick: () => go(i)
    })));
    const section = SECTIONS[index];
    const parts = [h("h3", { class: "show-title", text: pick(section.title) }), h("p", { class: "show-lead", rich: pick(section.lead) })];
    for (const block of section.blocks) {
      const sim = SIMS[block.sim](ctx);
      sims.push(sim);
      parts.push(h("section", { class: "show-block" }, block.lead ? h("p", { class: "show-block-lead", text: pick(block.lead) }) : null, sim.node));
    }
    parts.push(h("ul", { class: "show-points" }, section.points.map((point) => h("li", { rich: pick(point) }))));
    if (section.shot) {
      parts.push(h("figure", { class: "show-shot" },
        h("img", { src: section.shot.src, alt: pick(section.shot.caption), loading: "lazy", width: "1800", height: "1125" }),
        h("figcaption", {}, h("span", { class: "sim-tag", text: t("show.real") }), " ", pick(section.shot.caption))));
    }
    if (section.commands) {
      parts.push(h("div", { class: "show-commands" }, section.commands.map((command) => h("pre", {}, h("code", { text: command })))),
        h("p", { class: "show-links" },
          h("button", { type: "button", class: "link-button", onClick: () => ctx.openApp("developers") }, t("app.developers"), " →"),
          h("a", { href: "https://github.com/vimalinx/vibedesktop/blob/main/docs/app-format.md", target: "_blank", rel: "noreferrer", text: lang === "zh" ? "完整格式说明 ↗" : "Full format reference ↗" })));
    }
    if (section.install) parts.push(h("section", { class: "show-install" }, h("p", { class: "show-lead", text: t("install.req") }), installCard()));
    const next = SECTIONS[index + 1];
    parts.push(h("nav", { class: "show-nav" },
      next
        ? h("button", { type: "button", class: "button primary", onClick: () => go(index + 1) }, `${pick(next.tab)} →`)
        : h("button", { type: "button", class: "button primary", onClick: () => ctx.openApp("install") }, t("welcome.install"), " →")));
    page.replaceChildren(...parts);
  }

  render();
  return {
    params: () => ({ section: SECTIONS[index].id }),
    update: (params) => {
      const next = SECTIONS.findIndex((section) => section.id === params?.section);
      if (next >= 0) go(next);
    },
    unmount() {
      for (const sim of sims) sim.unmount?.();
    }
  };
}
