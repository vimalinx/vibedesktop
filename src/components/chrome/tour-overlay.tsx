"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { copyTextToClipboard } from "@/lib/clipboard";
import { buildVibedInstallCommand } from "@/lib/vibed-installer-contract";

type LocalizedText = { en: string; zh: string };

interface TourStep {
  selector: string | null;
  introSelector?: string;
  spotlightPadding?: number;
  title: LocalizedText;
  body: LocalizedText;
  intro?: LocalizedText;
  action?: {
    type: "click" | "dblclick" | "mouseenter" | "contextmenu";
    selector: string;
    hint: LocalizedText;
  };
}

interface SpotlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

const BASIC: TourStep[] = [
  {
    selector: null,
    title: { zh: "欢迎来到 Vibe Desktop", en: "Welcome to Vibe Desktop" },
    body: {
      zh: "你的个人 Web 桌面。接下来走一遍核心操作，每一步都直接在真实桌面上完成。",
      en: "Your personal web desktop. Complete each core action directly on the real desktop."
    }
  },
  {
    selector: ".desktop-icon",
    spotlightPadding: 8,
    title: { zh: "① 单击图标", en: "① Single-click an icon" },
    body: { zh: "试试单击任意一个图标。", en: "Single-click any icon." },
    intro: {
      zh: "应用已经在桌面窗口内打开。单击 = 桌面内打开，拖拽 = 排列；带状态点的是本地应用。",
      en: "The app opened in a desktop window. Single-click opens here, drag rearranges, and a status dot marks a local app."
    },
    action: {
      type: "click",
      selector: ".desktop-icon",
      hint: { zh: "👆 单击任意一个图标", en: "👆 Single-click any icon" }
    }
  },
  {
    selector: '[data-app-id="demo-url-1"]',
    spotlightPadding: 8,
    title: { zh: "② 双击站内示例程序", en: "② Double-click the site sample app" },
    body: {
      zh: "双击这个「Vibe 便签」图标，它会在浏览器新标签页打开。",
      en: "Double-click the Vibe Memo icon to open it in a new browser tab."
    },
    intro: {
      zh: "示例程序已经在新标签页打开。我们不会自动切回来：请你自己回到 Vibe Desktop 标签页，再点下一步。",
      en: "The sample app opened in a new tab. We will not switch back automatically—return to the Vibe Desktop tab yourself, then continue."
    },
    action: {
      type: "dblclick",
      selector: '[data-app-id="demo-url-1"]',
      hint: { zh: "👆 双击高亮的「Vibe 便签」", en: "👆 Double-click the highlighted Vibe Memo" }
    }
  },
  {
    selector: ".dock",
    spotlightPadding: 8,
    title: { zh: "③ Dock 任务栏", en: "③ Dock" },
    body: {
      zh: "Dock 常驻在底部：用 + 添加应用，点窗口名切换窗口，锁图标控制自动隐藏。",
      en: "The Dock stays at the bottom: add apps with +, switch windows by name, and use the lock to control auto-hide."
    },
    intro: {
      zh: "Dock 常驻在底部：用 + 添加应用，点窗口名切换窗口，锁图标控制自动隐藏。",
      en: "The Dock stays at the bottom: add apps with +, switch windows by name, and use the lock to control auto-hide."
    }
  },
  {
    selector: ".apps-rail-region",
    introSelector: ".apps-rail",
    spotlightPadding: 6,
    title: { zh: "④ 后台管理面板", en: "④ Background manager" },
    body: { zh: "把鼠标移到屏幕右边缘中间的小热区。", en: "Move the pointer to the small hot zone at the middle-right edge." },
    intro: {
      zh: "面板本身更宽，但触发热区仍然很小。绿色数字是运行数量，每行可直接启动或停止。",
      en: "The panel is wide while its activation zone stays small. The green number is the running count; each row can start or stop an app."
    },
    action: {
      type: "mouseenter",
      selector: ".apps-rail-region",
      hint: { zh: "👆 移到右边缘的小竖条", en: "👆 Move to the small bar on the right edge" }
    }
  },
  {
    selector: null,
    title: { zh: "🎉 基础引导完成！", en: "🎉 Basic tour complete!" },
    body: { zh: "你已经掌握了核心操作。想继续了解本地应用和 Agent Skill 吗？", en: "You know the core actions. Continue with local apps and the Agent skill?" }
  }
];

const ADVANCED: TourStep[] = [
  {
    selector: null,
    introSelector: ".context-menu",
    spotlightPadding: 6,
    title: { zh: "⑤ 右键菜单", en: "⑤ Context menu" },
    body: { zh: "右键桌面空白处试试。", en: "Right-click an empty area of the desktop." },
    intro: {
      zh: "右键菜单现在位于遮罩上方。桌面菜单可添加应用、自动排列和更换壁纸；图标菜单可打开、编辑或删除。",
      en: "The context menu now sits above the mask. Desktop actions add, arrange, or change wallpaper; icon actions open, edit, or remove."
    },
    action: {
      type: "contextmenu",
      selector: ".desktop",
      hint: { zh: "👆 右键桌面空白处", en: "👆 Right-click empty desktop space" }
    }
  },
  {
    selector: null,
    title: { zh: "⑥ 本地应用 vs 网页应用", en: "⑥ Local apps vs web apps" },
    body: {
      zh: "🔵 网页应用只是 URL 书签，没有启停。\n\n🟢 本地应用由 vibed 管理，有运行状态，可在右栏启停，崩溃后按策略重启。\n\n对本机 Agent 说“使用 add-app，把这个项目放到 Vibe Desktop 并启动验证”，它会生成受管启动清单并注册。",
      en: "🔵 A web app is a URL bookmark and has no process controls.\n\n🟢 A local app is managed by vibed, reports runtime state, and can be started or stopped from the rail.\n\nTell your on-device Agent: ‘Use add-app to put this project on Vibe Desktop and verify it starts.’"
    }
  },
  {
    selector: null,
    title: { zh: "⑦ 一条命令装好本机运行时", en: "⑦ Install the local runtime with one command" },
    body: {
      zh: "浏览器里的页面不能直接改你的电脑。下方命令会在 Linux 本机安装 vibed 和跨 Agent 的 add-app Skill，并设置登录自启。把它粘贴到终端，或交给这台电脑上的本机 Agent 执行。",
      en: "A page in the browser cannot directly change your computer. This Linux command installs vibed plus the cross-agent add-app Skill and enables login startup. Paste it into a terminal or give it to the on-device Agent."
    }
  },
  {
    selector: null,
    title: { zh: "🎉 全部完成！", en: "🎉 Tour complete!" },
    body: { zh: "现在可以把自己的工具搬上桌面了。", en: "You can now bring your own tools onto the desktop." }
  }
];

type Phase = "action" | "intro";
type Tier = "basic" | "advanced";

export function TourOverlay({ locale, onDone }: { locale: "en" | "zh"; onDone: () => void }) {
  const zh = locale === "zh";
  const localize = (copy: LocalizedText) => (zh ? copy.zh : copy.en);
  const [tier, setTier] = useState<Tier>("basic");
  const steps = tier === "basic" ? BASIC : ADVANCED;
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("action");
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const [installerState, setInstallerState] = useState<"idle" | "copying" | "done" | "error">("idle");
  const maskId = `tour-mask-${useId().replaceAll(":", "")}`;
  const current = steps[step];
  const activeSelector = phase === "intro" && current.introSelector ? current.introSelector : current.selector;

  useEffect(() => {
    if (!activeSelector) {
      setRect(null);
      return;
    }

    let target: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let scheduledFrame = 0;
    let trackingFrame = 0;
    const trackingEndsAt = performance.now() + 700;

    const measure = () => {
      const nextTarget = document.querySelector(activeSelector);
      if (nextTarget !== target) {
        resizeObserver?.disconnect();
        target = nextTarget;
        resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
        if (target) resizeObserver?.observe(target);
      }

      if (!target) {
        setRect(null);
        return;
      }

      const bounds = target.getBoundingClientRect();
      const padding = current.spotlightPadding ?? 8;
      const left = Math.max(0, bounds.left - padding);
      const top = Math.max(0, bounds.top - padding);
      const right = Math.min(window.innerWidth, bounds.right + padding);
      const bottom = Math.min(window.innerHeight, bounds.bottom + padding);
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      const computedRadius = Number.parseFloat(window.getComputedStyle(target).borderTopLeftRadius) || 10;
      const radius = Math.min(Math.max(10, computedRadius + padding), Math.max(10, Math.min(width, height) / 2));
      const nextRect = { left, top, width, height, radius };

      setRect((previous) =>
        previous &&
        previous.left === nextRect.left &&
        previous.top === nextRect.top &&
        previous.width === nextRect.width &&
        previous.height === nextRect.height &&
        previous.radius === nextRect.radius
          ? previous
          : nextRect
      );
    };

    function scheduleMeasure() {
      window.cancelAnimationFrame(scheduledFrame);
      scheduledFrame = window.requestAnimationFrame(measure);
    }

    const trackTransitions = () => {
      measure();
      if (performance.now() < trackingEndsAt) trackingFrame = window.requestAnimationFrame(trackTransitions);
    };
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    document.addEventListener("transitionrun", scheduleMeasure, true);
    document.addEventListener("transitionend", scheduleMeasure, true);
    trackTransitions();

    return () => {
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.cancelAnimationFrame(scheduledFrame);
      window.cancelAnimationFrame(trackingFrame);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      document.removeEventListener("transitionrun", scheduleMeasure, true);
      document.removeEventListener("transitionend", scheduleMeasure, true);
    };
  }, [activeSelector, current.spotlightPadding, phase, step]);

  useEffect(() => {
    if (phase !== "action" || !current.action) return;
    const action = current.action;
    let fired = false;
    let retryTimer = 0;
    const fire = () => {
      if (fired) return;
      fired = true;
      setPhase("intro");
    };

    if (action.type === "click" || action.type === "dblclick") {
      const handler = (event: Event) => {
        if (event.type === action.type && (event.target as HTMLElement | null)?.closest(action.selector)) fire();
      };
      document.addEventListener(action.type, handler, true);
      return () => document.removeEventListener(action.type, handler, true);
    }
    if (action.type === "contextmenu") {
      const handler = (event: Event) => {
        if ((event.target as HTMLElement | null)?.closest(action.selector)) fire();
      };
      document.addEventListener("contextmenu", handler, true);
      return () => document.removeEventListener("contextmenu", handler, true);
    }

    const attach = () => {
      const element = document.querySelector(action.selector);
      if (!element) {
        retryTimer = window.setTimeout(attach, 200);
        return;
      }
      element.addEventListener("mouseenter", fire, { once: true });
    };
    attach();
    return () => {
      window.clearTimeout(retryTimer);
      document.querySelector(action.selector)?.removeEventListener("mouseenter", fire);
    };
  }, [current.action, phase, step]);

  const isLast = step === steps.length - 1;
  const isBasicDone = tier === "basic" && isLast;
  const isInstallerStep = tier === "advanced" && step === 2;

  async function copyInstallerCommand() {
    setInstallerState("copying");
    try {
      await copyTextToClipboard(buildVibedInstallCommand(window.location.href));
      setInstallerState("done");
    } catch {
      setInstallerState("error");
    }
  }

  function advance() {
    if (isBasicDone) {
      setShowChoice(true);
      return;
    }
    if (isLast) {
      onDone();
      return;
    }
    setCelebrate(true);
    window.setTimeout(() => {
      setCelebrate(false);
      setStep((currentStep) => currentStep + 1);
      setPhase("action");
    }, 900);
  }

  function startAdvanced() {
    setShowChoice(false);
    setTier("advanced");
    setStep(0);
    setPhase("action");
  }

  const targetAboveMidpoint = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : false;
  const tipStyle: CSSProperties = rect
    ? {
        position: "fixed",
        left: "50%",
        ...(targetAboveMidpoint ? { bottom: 24 } : { top: 24 }),
        transform: "translateX(-50%)",
        width: "min(520px, 92vw)",
        zIndex: 20,
        pointerEvents: "auto"
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(480px, 90vw)",
        zIndex: 20,
        pointerEvents: "auto"
      };

  const showTitle = phase === "intro" ? (zh ? "看看这个" : "Take a look") : localize(current.title);
  const showBody = phase === "intro" ? localize(current.intro ?? current.body) : localize(current.body);
  const showAction = phase === "action" && current.action;
  const showNext = (phase === "action" && !current.action) || phase === "intro";

  if (showChoice) {
    return (
      <div className="tour-choice-layer">
        <div className="tour-tooltip tour-choice-card">
          <div className="tour-choice-celebration">🎉</div>
          <h2>{zh ? "基础引导完成！" : "Basic tour complete!"}</h2>
          <p>{zh ? "想继续了解右键菜单、本地应用和 Agent Skill 吗？" : "Continue with context menus, local apps, and the Agent skill?"}</p>
          <div className="tour-nav tour-choice-actions">
            <button className="tour-next" onClick={startAdvanced}>{zh ? "学习更多 →" : "Learn more →"}</button>
            <button onClick={onDone}>{zh ? "进入桌面" : "Enter desktop"}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tour-layer">
      <svg className="tour-mask" aria-hidden="true">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {rect ? (
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx={rect.radius}
                fill="black"
              />
            ) : null}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(10, 9, 8, 0.70)" mask={`url(#${maskId})`} />
        {rect ? (
          <rect
            className="tour-spotlight-outline"
            x={rect.left + 0.5}
            y={rect.top + 0.5}
            width={Math.max(0, rect.width - 1)}
            height={Math.max(0, rect.height - 1)}
            rx={rect.radius}
          />
        ) : null}
      </svg>

      {!celebrate ? (
        <div className="tour-tooltip" style={tipStyle}>
          <span className="tour-badge">
            {tier === "basic" ? (zh ? "基础" : "Basic") : (zh ? "高级" : "Adv")} · {step + 1}/{steps.length}
          </span>
          <h2>{showTitle}</h2>
          <p className="tour-copy">{showBody}</p>

          {isInstallerStep ? (
            <>
              <button
                className="tour-skill-copy"
                disabled={installerState === "copying"}
                onClick={copyInstallerCommand}
              >
                {installerState === "copying"
                  ? "…"
                  : installerState === "done"
                    ? zh ? "✓ 连接命令已复制" : "✓ Connection command copied"
                    : installerState === "error"
                      ? zh ? "✗ 复制失败，请重试" : "✗ Copy failed—try again"
                      : zh ? "📋 复制本机连接命令" : "📋 Copy computer connection command"}
              </button>
              <span className="tour-copy-status" aria-live="polite">
                {installerState === "done"
                  ? zh ? "粘贴到 Linux 终端或交给本机 Agent，然后在浏览器确认授权。" : "Paste it into a Linux terminal or give it to the local Agent, then approve in the browser."
                  : installerState === "error"
                    ? zh ? "请允许浏览器访问剪贴板后重试。" : "Allow clipboard access, then retry."
                    : ""}
              </span>
            </>
          ) : null}

          {showAction ? (
            <div className="tour-action-hint">
              <span className="tour-action-pulse" />
              {localize(current.action!.hint)}
            </div>
          ) : null}

          <div className="tour-nav">
            <button onClick={onDone}>{zh ? "跳过" : "Skip"}</button>
            <span className="tour-nav-spacer" />
            {showNext ? (
              <button className="tour-next" onClick={advance}>
                {isBasicDone ? (zh ? "完成" : "Finish") : isLast ? (zh ? "开始使用" : "Get started") : zh ? "下一步" : "Next"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {celebrate ? (
        <div className="tour-celebration">
          <div className="tour-celebration-copy">
            <div className="tour-celebration-check">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M8 16l5 5 11-11" stroke="#1a1714" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p>{zh ? "做得好！" : "Great job!"}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
