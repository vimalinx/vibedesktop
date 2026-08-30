import type { AppDirectoryItem, BuiltinWallpaper, DesktopApp, OpeningMode } from "@/lib/contracts";
import { desktopGridMinColumns, maxGridXForSpan, weatherWidgetGridSpan, type DesktopGridSpan } from "@/lib/desktop-grid";

export const builtinWallpapers: BuiltinWallpaper[] = [
  {
    id: "noir-dawn",
    name: "Noir dawn",
    cssValue:
      "radial-gradient(ellipse 90% 60% at 78% -10%, rgba(200,255,61,.1), transparent 55%), radial-gradient(ellipse 70% 55% at 8% 108%, rgba(232,99,58,.1), transparent 58%), radial-gradient(ellipse 120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,.42) 100%), linear-gradient(165deg, #1b1713 0%, #131110 42%, #0d0c0b 100%)"
  },
  {
    id: "midnight-orbit",
    name: "Midnight orbit",
    cssValue:
      "radial-gradient(ellipse 80% 55% at 70% -5%, rgba(94,168,214,.16), transparent 55%), radial-gradient(ellipse 60% 50% at 12% 105%, rgba(200,255,61,.06), transparent 55%), linear-gradient(160deg, #10161c 0%, #0c1116 48%, #080b0e 100%)"
  },
  {
    id: "ember-night",
    name: "Ember night",
    cssValue:
      "radial-gradient(ellipse 75% 55% at 82% -8%, rgba(232,99,58,.16), transparent 55%), radial-gradient(ellipse 55% 45% at 8% 102%, rgba(255,178,92,.08), transparent 55%), linear-gradient(158deg, #1c1410 0%, #141010 50%, #0c0a09 100%)"
  },
  {
    id: "mineral-morning",
    name: "Mineral morning",
    cssValue:
      "radial-gradient(circle at 18% 16%, rgba(248,213,107,.38), transparent 30%), radial-gradient(circle at 84% 18%, rgba(148,196,220,.35), transparent 32%), linear-gradient(140deg, #f2ede1 0%, #c6d3c8 46%, #8aa4ac 100%)"
  },
  {
    id: "quiet-orbit",
    name: "Quiet orbit",
    cssValue:
      "radial-gradient(ellipse 70% 45% at 50% -6%, rgba(169,243,208,.22), transparent 55%), linear-gradient(168deg, #0d1724 0%, #1d3a52 52%, #8f8371 88%, #d6c7a2 100%)"
  },
  {
    id: "paper-sky",
    name: "Paper sky",
    cssValue:
      "radial-gradient(circle at 24% 20%, rgba(255,255,255,.85), transparent 26%), linear-gradient(148deg, #f8f2e4 0%, #cfdfe8 48%, #9db8c6 100%)"
  },
  {
    id: "paper-linen",
    name: "Paper linen",
    cssValue:
      "radial-gradient(circle at 76% 14%, rgba(255,255,255,.6), transparent 30%), radial-gradient(circle at 18% 88%, rgba(214,196,158,.5), transparent 42%), linear-gradient(145deg, #f3ecdc 0%, #e4d9c2 55%, #c9b995 100%)"
  }
];

export const appDirectory: AppDirectoryItem[] = [
  {
    id: "chatgpt",
    title: "ChatGPT",
    url: "https://chatgpt.com",
    description: "OpenAI's general AI assistant.",
    iconUrl: "https://icons.duckduckgo.com/ip3/chatgpt.com.ico",
    openingMode: "desktop_window",
    category: "global-ai",
    catalogKind: "website"
  },
  {
    id: "claude",
    title: "Claude",
    url: "https://claude.ai",
    description: "Anthropic's AI assistant.",
    iconUrl: "https://icons.duckduckgo.com/ip3/claude.ai.ico",
    openingMode: "desktop_window",
    category: "global-ai",
    catalogKind: "website"
  },
  {
    id: "deepseek",
    title: "DeepSeek",
    url: "https://chat.deepseek.com",
    description: "DeepSeek chat for coding and reasoning.",
    iconUrl: "https://icons.duckduckgo.com/ip3/deepseek.com.ico",
    openingMode: "desktop_window",
    category: "china-ai",
    catalogKind: "website"
  },
  {
    id: "kimi",
    title: "Kimi",
    url: "https://kimi.moonshot.cn",
    description: "Moonshot AI's long-context assistant.",
    iconUrl: "https://icons.duckduckgo.com/ip3/kimi.moonshot.cn.ico",
    openingMode: "desktop_window",
    category: "china-ai",
    catalogKind: "website"
  },
  {
    id: "doubao",
    title: "Doubao",
    url: "https://www.doubao.com",
    description: "ByteDance's AI assistant.",
    iconUrl: "https://icons.duckduckgo.com/ip3/doubao.com.ico",
    openingMode: "desktop_window",
    category: "china-ai",
    catalogKind: "website"
  },
  {
    id: "qwen",
    title: "Qwen",
    url: "https://chat.qwen.ai",
    description: "Alibaba Qwen chat.",
    iconUrl: "https://icons.duckduckgo.com/ip3/chat.qwen.ai.ico",
    openingMode: "desktop_window",
    category: "china-ai",
    catalogKind: "website"
  },
  {
    id: "yuanbao",
    title: "Tencent Yuanbao",
    url: "https://yuanbao.tencent.com",
    description: "Tencent Yuanbao AI assistant.",
    iconUrl: "https://icons.duckduckgo.com/ip3/yuanbao.tencent.com.ico",
    openingMode: "desktop_window",
    category: "china-ai",
    catalogKind: "website"
  },
  {
    id: "wenxin",
    title: "Wenxin",
    url: "https://yiyan.baidu.com",
    description: "Baidu Wenxin/ERNIE assistant.",
    iconUrl: "https://icons.duckduckgo.com/ip3/yiyan.baidu.com.ico",
    openingMode: "desktop_window",
    category: "china-ai",
    catalogKind: "website"
  },
  {
    id: "github-n8n",
    title: "n8n",
    url: "https://n8n.io",
    description: "Visual workflow automation with AI and 400+ integrations.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "automation",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/n8n-io/n8n",
    stars: 202736,
    language: "TypeScript",
    license: "NOASSERTION",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-dify",
    title: "Dify",
    url: "https://dify.ai",
    description: "Build agentic workflows and RAG pipelines in one workspace.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "ai-platforms",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/langgenius/dify",
    stars: 153791,
    language: "TypeScript",
    license: "NOASSERTION",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-open-webui",
    title: "Open WebUI",
    url: "https://openwebui.com",
    description: "Self-hosted AI interface for Ollama and OpenAI-compatible APIs.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "ai-platforms",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/open-webui/open-webui",
    stars: 150265,
    language: "Python",
    license: "NOASSERTION",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-excalidraw",
    title: "Excalidraw",
    url: "https://excalidraw.com",
    description: "Hand-drawn style collaborative whiteboard and diagram tool.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "design",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/excalidraw/excalidraw",
    stars: 130729,
    language: "TypeScript",
    license: "MIT",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-immich",
    title: "Immich",
    url: "https://immich.app",
    description: "High-performance self-hosted photo and video management.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "media",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/immich-app/immich",
    stars: 112892,
    language: "TypeScript",
    license: "AGPL-3.0",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-stirling-pdf",
    title: "Stirling PDF",
    url: "https://stirling.com",
    description: "Self-hosted browser toolkit for editing and converting PDFs.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "documents",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/Stirling-Tools/Stirling-PDF",
    stars: 90870,
    language: "Java",
    license: "NOASSERTION",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-uptime-kuma",
    title: "Uptime Kuma",
    url: "https://uptime.kuma.pet",
    description: "Self-hosted service monitoring and status dashboard.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "monitoring",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/louislam/uptime-kuma",
    stars: 90722,
    language: "JavaScript",
    license: "MIT",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-anything-llm",
    title: "AnythingLLM",
    url: "https://anythingllm.com",
    description: "Local-first AI workspace with agents, documents, and models.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "ai-platforms",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/Mintplex-Labs/anything-llm",
    stars: 65348,
    language: "JavaScript",
    license: "MIT",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-memos",
    title: "Memos",
    url: "https://usememos.com",
    description: "Lightweight self-hosted Markdown note-taking for quick capture.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "notes",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/usememos/memos",
    stars: 62626,
    language: "Go",
    license: "MIT",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-penpot",
    title: "Penpot",
    url: "https://penpot.app",
    description: "Open-source design and prototyping platform for product teams.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "design",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/penpot/penpot",
    stars: 59333,
    language: "Clojure",
    license: "MPL-2.0",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-appsmith",
    title: "Appsmith",
    url: "https://www.appsmith.com",
    description: "Build internal tools, admin panels, and dashboards.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "developer-tools",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/appsmithorg/appsmith",
    stars: 40779,
    language: "TypeScript",
    license: "Apache-2.0",
    verifiedAt: "2026-08-29"
  },
  {
    id: "github-actual-budget",
    title: "Actual Budget",
    url: "https://actualbudget.org",
    description: "Local-first personal finance and budgeting application.",
    iconUrl: "",
    openingMode: "external_tab",
    category: "finance",
    catalogKind: "github_app",
    repositoryUrl: "https://github.com/actualbudget/actual",
    stars: 28426,
    language: "TypeScript",
    license: "MIT",
    verifiedAt: "2026-08-29"
  }
];

const builtInSystemApps = [
  {
    id: "start-board",
    title: "Start Board",
    description: "System health and managed WebUI processes.",
    iconUrl: "vd://icon/start-board",
    openingMode: "desktop_window" as OpeningMode
  },
  {
    id: "weather",
    title: "Weather",
    description: "Animated live weather widget.",
    iconUrl: "vd://icon/weather",
    openingMode: "desktop_window" as OpeningMode
  },
  {
    id: "app-store",
    title: "App Store",
    description: "Curated websites and high-star GitHub applications.",
    iconUrl: "vd://icon/app-store",
    openingMode: "desktop_window" as OpeningMode
  },
  {
    id: "local-apps",
    title: "Local WebApps",
    description: "Spawn and control local web servers from vibe-daemon.",
    iconUrl: "vd://icon/local-apps",
    openingMode: "desktop_window" as OpeningMode
  },
  {
    id: "settings",
    title: "Settings",
    description: "Desktop preferences.",
    iconUrl: "vd://icon/settings",
    openingMode: "desktop_window" as OpeningMode
  }
];

export function createDefaultApps(desktopId: string, now: string): DesktopApp[] {
  const seededDirectory = appDirectory.slice(0, 6);
  const seed = [
    ...builtInSystemApps.map((app) => ({
      kind: "builtin" as const,
      source: "seed" as const,
      title: app.title,
      url: null,
      description: app.description,
      openingMode: app.openingMode,
      iconKind: "builtin" as const,
      iconUrl: app.iconUrl
    })),
    ...seededDirectory.map((app) => ({
      kind: "url" as const,
      source: "seed" as const,
      title: app.title,
      url: app.url,
      description: app.description,
      openingMode: app.openingMode,
      iconKind: "favicon" as const,
      iconUrl: app.iconUrl
    }))
  ];

  const positions = assignSeedGridPositions(seed);

  return seed.map((app, index) => {
    const position = positions[index] ?? { gridX: index % 5, gridY: Math.floor(index / 5) };

    return {
      id: crypto.randomUUID(),
      desktopId,
      ...app,
      gridX: position.gridX,
      gridY: position.gridY,
      // The weather widget's multi-cell footprint is data now, not a code
      // branch: it seeds as a "reading" tile at its historical span.
      ...(app.title === "Weather"
        ? { spanColumns: weatherWidgetGridSpan.columns, spanRows: weatherWidgetGridSpan.rows, tileVariant: "reading" }
        : app.kind === "url"
          ? { spanColumns: 1, spanRows: 1, tileVariant: "app" }
          : { spanColumns: 1, spanRows: 1, tileVariant: "icon" }),
      sortOrder: index,
      metadata: {},
      createdAt: now,
      updatedAt: now
    };
  });
}

function assignSeedGridPositions(seed: Array<{ title: string }>): Array<{ gridX: number; gridY: number }> {
  const taken = new Set<string>();

  return seed.map((app) => {
    const span = app.title === "Weather" ? weatherWidgetGridSpan : { columns: 1, rows: 1 };
    const position = firstOpenSeedCell(taken, span);

    for (let y = position.gridY; y < position.gridY + span.rows; y += 1) {
      for (let x = position.gridX; x < position.gridX + span.columns; x += 1) {
        taken.add(`${x}:${y}`);
      }
    }

    return position;
  });
}

function firstOpenSeedCell(taken: Set<string>, span: DesktopGridSpan): { gridX: number; gridY: number } {
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x <= maxGridXForSpan(desktopGridMinColumns, span); x += 1) {
      let available = true;

      for (let yy = y; yy < y + span.rows; yy += 1) {
        for (let xx = x; xx < x + span.columns; xx += 1) {
          available = available && !taken.has(`${xx}:${yy}`);
        }
      }

      if (available) {
        return { gridX: x, gridY: y };
      }
    }
  }

  return { gridX: 0, gridY: 24 };
}
