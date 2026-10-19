import { test, expect, type Page } from "@playwright/test";
import type { LocalAppView } from "../src/lib/contracts";
import type { DesktopPayload } from "../src/protocol/v1";
const headers = { Origin: "http://127.0.0.1:3110" };
let baseline: DesktopPayload;
test.beforeAll(async ({ request }) => { baseline = await (await request.get("/api/desktop")).json(); });
test.beforeEach(async ({ page, request }) => {
  await request.post("/api/desktop/restore", { headers, data: baseline });
  await page.addInitScript(() => { localStorage.setItem("vd:locale:v1", "zh"); localStorage.setItem("vd:onboarding:v1:dismissed", "true"); });
  await page.route("https://**/*", route => route.abort());
});
test.afterEach(async ({ request }) => { await request.post("/api/desktop/restore", { headers, data: baseline }); });
async function ready(page: Page, style = "windows") { await page.goto(`/?desktop=${style}`); await expect(page.locator(".os-shell")).toBeVisible(); }
async function settings(page: Page) { await page.locator(".pinned-apps").getByRole("button", { name: "设置", exact: true }).click(); await expect(page.locator(".system-settings")).toBeVisible(); }

test("first-run chooses a system before the complete mouse guide and preserves real apps", async ({ page, request }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("guide-test-started")) { localStorage.removeItem("vd:onboarding:v1:dismissed"); sessionStorage.setItem("guide-test-started", "true"); } });
  await page.goto("/");
  const guide = page.getByRole("dialog", { name: "欢迎使用 Vibe Desktop" });
  await expect(guide.getByRole("heading", { name: "先选一个熟悉的系统" })).toBeVisible();
  await expect(guide.getByRole("button", { name: "导入桌面包" })).toBeVisible();
  await guide.getByRole("button", { name: "使用 macOS 桌面", exact: true }).click();
  await expect(page.locator(".os-shell.macos")).toBeVisible();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "使用这个系统，继续", exact: true }).click();
  for (const title of ["从桌面打开应用", "找到应用，继续工作", "用鼠标安排窗口", "在系统设置里调整桌面", "选择与分享更多系统"]) {
    await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await guide.getByRole("button", { name: title === "选择与分享更多系统" ? "开始使用" : "下一步", exact: true }).click();
  }
  await expect(guide).toHaveCount(0);
  expect((await (await request.get("/api/desktop")).json()).apps).toEqual(baseline.apps);
  await page.reload(); await expect(page.locator(".os-shell.macos")).toBeVisible(); await expect(guide).toHaveCount(0);
});

test("system settings switch shells internally and save actual themed controls", async ({ page, request }) => {
  await ready(page); await settings(page);
  await expect(page.getByRole("heading", { name: "主页", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.locator(".os-shell")).toHaveClass(/is-dark/);
  await expect(page.locator(".package-surface")).toHaveAttribute("data-system-color-scheme", "dark");
  await expect.poll(async () => (await (await request.get("/api/v1/desktop/packages/org.vibedesktop.windows/preferences")).json()).values.dark).toBe(true);
  await page.getByRole("button", { name: "选择桌面", exact: true }).click();
  await page.getByRole("button", { name: "使用 macOS 桌面", exact: true }).click();
  await expect(page.locator(".system-settings")).toHaveAttribute("data-native-layout", "macos");
  await expect(page.locator(".shell-window")).toHaveCount(1);
  await expect(page.locator(".os-shell")).not.toHaveClass(/is-dark/);
  const transparency = page.getByRole("switch", { name: "透明效果", exact: true });
  await expect(transparency).toHaveCSS("background-color", "rgb(41, 121, 237)");
  await transparency.click(); await expect(page.locator(".os-shell")).toHaveClass(/solid-surfaces/);
  await page.getByRole("button", { name: "紫色", exact: true }).click();
  await expect(page.getByRole("switch", { name: "动画效果", exact: true })).toHaveCSS("background-color", "rgb(163, 96, 232)");
  await page.getByRole("button", { name: "通用", exact: true }).click();
  await page.getByRole("combobox").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  expect(await page.locator(".system-select-positioner").evaluate(n => !!n.closest(".desktop"))).toBe(true);
  await page.getByRole("option", { name: "只打开桌面", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索设置", exact: true }).fill("备份");
  await expect(page.getByRole("button", { name: "备份与恢复", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "外观", exact: true })).toHaveCount(0);
});

test("titlebar clicks keep maximization, all resize edges work and layout is reachable by mouse", async ({ page }) => {
  await ready(page); await settings(page);
  const frame = page.locator(".shell-window");
  await expect(frame.locator(".resize-edge")).toHaveCount(8);
  await frame.getByRole("button", { name: "最大化窗口", exact: true }).click();
  await frame.locator(".window-caption>span").click();
  await expect(frame).toHaveClass(/is-maximized/);
  await frame.locator(".window-caption>span").dblclick();
  await expect(frame).not.toHaveClass(/is-maximized/);
  const before = (await frame.boundingBox())!, edge = (await frame.locator(".resize-w").boundingBox())!;
  await page.mouse.move(edge.x + 2, edge.y + edge.height / 2); await page.mouse.down();
  await page.mouse.move(edge.x - 40, edge.y + edge.height / 2, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(before.width + 30);
  await frame.locator(".shell-titlebar").click({ button: "right", position: { x: 100, y: 20 } });
  await expect(page.locator(".context-popover")).toHaveAttribute("aria-label", "窗口菜单");
  await page.getByRole("button", { name: "靠左分屏", exact: true }).click();
  await expect.poll(async () => Math.round((await frame.boundingBox())!.x)).toBe(10);
  await frame.getByRole("button", { name: "窗口布局", exact: true }).click();
  await page.getByRole("button", { name: "右下四分屏", exact: true }).click();
  expect((await frame.boundingBox())!.y).toBeGreaterThan(400);
  await frame.getByRole("button", { name: "窗口布局", exact: true }).click();
  await page.getByRole("button", { name: "中间三分屏", exact: true }).click();
  expect((await frame.boundingBox())!.width).toBeLessThan(490);
});

test("dock pinning persists and show desktop restores only windows it hid", async ({ page }) => {
  await ready(page); await settings(page);
  await page.locator(".pinned-apps").getByRole("button", { name: "天气", exact: true }).click();
  const weather = page.locator('.shell-window[aria-label="天气"]'), prefs = page.locator('.shell-window[aria-label="设置"]');
  await weather.getByRole("button", { name: "最小化", exact: true }).click();
  await page.getByRole("button", { name: "显示桌面", exact: true }).click(); await expect(prefs).toBeHidden();
  await page.getByRole("button", { name: "显示桌面", exact: true }).click(); await expect(prefs).toBeVisible(); await expect(weather).toBeHidden();
  await page.locator(".pinned-apps").getByRole("button", { name: "设置", exact: true }).click({ button: "right" });
  await page.getByRole("button", { name: "从任务栏取消固定", exact: true }).click();
  await expect(page.locator(".pinned-apps").getByRole("button", { name: "设置", exact: true })).toBeVisible();
  await prefs.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.locator(".pinned-apps").getByRole("button", { name: "设置", exact: true })).toHaveCount(0);
  await page.reload(); await expect(page.locator(".pinned-apps").getByRole("button", { name: "设置", exact: true })).toHaveCount(0);
  await page.locator('.os-desktop-icon[aria-label="设置"]').click({ button: "right" });
  await page.getByRole("button", { name: "固定到任务栏", exact: true }).click();
  await expect(page.locator(".pinned-apps").getByRole("button", { name: "设置", exact: true })).toBeVisible();
});

test("mac menu hover changes menus and a click in app content dismisses popovers", async ({ page }) => {
  await ready(page, "macos"); await settings(page);
  await page.getByRole("button", { name: "文件", exact: true }).click();
  await expect(page.getByRole("button", { name: "添加应用快捷方式", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "窗口", exact: true }).hover();
  await expect(page.getByRole("button", { name: "显示所有窗口", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await expect(page.locator(".shell-panel")).toHaveCount(0);
});

test("native system tool layouts expose actual task and library views", async ({ page }) => {
  for (const style of ["windows", "macos"]) {
    await ready(page, style);
    await page.locator(".pinned-apps").getByRole("button", { name: style === "macos" ? "活动监视器" : "任务管理器", exact: true }).click();
    await expect(page.locator(".task-manager-panel")).toHaveAttribute("data-native-layout", style);
    await page.locator(".native-task-navigation").getByRole("button", { name: "性能", exact: true }).click();
    await expect(page.locator(".task-manager-panel")).toHaveAttribute("data-view", "performance");
    await page.locator(".shell-window").getByRole("button", { name: "关闭", exact: true }).click();
    await page.locator(".pinned-apps").getByRole("button", { name: "本地 WebApp", exact: true }).click();
    await expect(page.locator(".local-apps-panel")).toHaveAttribute("data-native-layout", style);
    await expect(page.locator(".native-library-search input")).toBeVisible();
    await page.locator(".native-library-navigation").getByRole("button", { name: "正在运行", exact: true }).click();
    await page.locator(".shell-window").getByRole("button", { name: "关闭", exact: true }).click();
  }
});

test("native local library filters real-shaped rows and opens its editor without overflow", async ({ page }, info) => {
  const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message));
  const fixtureApps: LocalAppView[] = [true, false].map((running, index) => ({
    id: running ? "native-running" : "native-stopped", name: running ? "示例笔记" : "示例看板", port: 3119 + index,
    command: "fixture", cwd: "/fixture", args: [], iconKind: running ? "favicon" : "fallback", createdAt: "2026-09-05T00:00:00Z", updatedAt: "2026-09-05T00:00:00Z",
    status: { id: running ? "native-running" : "native-stopped", running, healthy: running, url: `http://127.0.0.1:${3119 + index}`, pid: running ? 123 : null,
      lastError: null, startedAt: null, lastExitCode: null, restartCount: 0, cpuPercent: running ? 1.2 : 0, memoryBytes: running ? 10000000 : 0,
      processCount: running ? 1 : 0, readBytes: 0, writeBytes: 0, sampledAt: "2026-09-05T00:00:00Z" }
  }));
  await page.route("**/api/v1/local-apps", route => route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, json: { apps: fixtureApps } }));
  await page.route("**/api/v1/local-apps/daemon-status", route => route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, json: { ok: true, version: "1.0.0" } }));
  for (const style of ["windows", "macos"]) {
    await ready(page, style);
    await page.locator(".pinned-apps").getByRole("button", { name: "本地 WebApp", exact: true }).click();
    await expect(page.locator(".local-app-card")).toHaveCount(2);
    await expect(page.getByText("守护进程在线", { exact: true })).toBeVisible();
    await page.locator(".native-library-navigation").getByRole("button", { name: "正在运行", exact: true }).click();
    await expect(page.locator(".local-app-card")).toHaveCount(1);
    await expect(page.locator(".local-app-card")).toContainText("示例笔记");
    await page.getByRole("textbox", { name: "搜索本地应用", exact: true }).fill("不存在");
    await expect(page.getByText("此视图中没有应用", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "搜索本地应用", exact: true }).fill("");
    await page.locator(".local-app-card").getByRole("button", { name: "编辑", exact: true }).click();
    const editor = page.locator(".local-app-form");
    await expect(editor.getByRole("heading", { name: "示例笔记", exact: true })).toBeInViewport();
    await expect(editor.getByRole("textbox").first()).toHaveValue("示例笔记");
    await page.screenshot({ path: info.outputPath(`${style}-library-editor-fixture.png`) });
    const widths = await page.locator(".package-app-content").evaluate(n => ({ client: n.clientWidth, scroll: n.scrollWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    await editor.getByRole("button", { name: "取消", exact: true }).first().click();
    await expect(editor).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await page.locator(".shell-window").getByRole("button", { name: "关闭", exact: true }).click();
  }
});

test("small native settings and tutorial keep content and primary actions inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const style of ["windows", "macos"]) {
    await ready(page, style); await settings(page);
    await page.getByRole("button", { name: "外观", exact: true }).click();
    await expect(page.getByRole("button", { name: "选择桌面", exact: true })).toBeInViewport({ ratio: 1 });
    const widths = await page.locator(".system-settings").evaluate(n => ({ client: n.clientWidth, scroll: n.scrollWidth, columns: getComputedStyle(n).gridTemplateColumns }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    expect(widths.columns.split(" ")).toHaveLength(1);
    await page.getByRole("button", { name: "通用", exact: true }).click();
    await page.getByRole("button", { name: "打开引导", exact: true }).click();
    const guide = page.getByRole("dialog", { name: "欢迎使用 Vibe Desktop" });
    await expect(guide.getByRole("button", { name: "使用这个系统，继续", exact: true })).toBeInViewport({ ratio: 1 });
    await guide.getByRole("button", { name: "使用这个系统，继续", exact: true }).click();
    await expect(guide.getByRole("button", { name: "下一步", exact: true })).toBeInViewport({ ratio: 1 });
    await guide.getByRole("button", { name: "关闭", exact: true }).click();
    await page.locator(".shell-window").getByRole("button", { name: "关闭", exact: true }).click();
    await page.locator(".pinned-apps").getByRole("button", { name: "本地 WebApp", exact: true }).click();
    expect(await page.locator(".local-apps-panel").evaluate(n => getComputedStyle(n).gridTemplateColumns.split(" ").length)).toBe(1);
    await page.locator(".shell-window").getByRole("button", { name: "关闭", exact: true }).click();
  }
});
