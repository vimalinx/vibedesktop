import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { DesktopPayload } from "../src/protocol/v1";
import type { DesktopPackageBundle } from "../src/protocol/shell/package";
const origin = "http://127.0.0.1:3110";
const headers = { Origin: origin };
let baseline: DesktopPayload;
test.beforeAll(async ({ request }) => { baseline = await (await request.get("/api/desktop")).json(); });
test.beforeEach(async ({ page, request }) => {
  expect((await request.post("/api/desktop/restore", { headers, data: baseline })).ok()).toBeTruthy();
  await page.addInitScript(() => { localStorage.setItem("vd:onboarding:v1:dismissed", "true"); localStorage.setItem("vd:locale:v1", "zh"); });
  await page.route("https://**/*", route => route.abort());
});
test.afterEach(async ({ request }) => { await request.post("/api/desktop/restore", { headers, data: baseline }); });
async function ready(page: Page, style = "windows") {
  await page.goto(`/?desktop=${style}`);
  await expect(page.locator(".os-shell")).toBeVisible();
  await expect(page.getByRole("button", { name: "桌面外观", exact: true })).toBeVisible();
}
async function choose(page: Page, name: string) {
  await page.getByRole("button", { name: "桌面外观", exact: true }).click();
  await page.getByRole("button", { name: `使用 ${name} 桌面`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "选择你的桌面" })).toHaveCount(0);
  await expect(page.locator(name === "macOS" ? ".os-shell.macos" : ".os-shell.windows")).toBeVisible();
}

test("both desktop packages run app search, native window controls and snapping", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索应用" }).fill("设置");
  await page.locator(".launcher-apps").getByRole("button", { name: "设置", exact: true }).click();
  const frame = page.locator('.shell-window[aria-label="设置"]');
  await expect(frame).toBeVisible();
  await frame.getByRole("button", { name: "窗口布局", exact: true }).click();
  await page.getByRole("button", { name: "靠左分屏", exact: true }).click();
  await expect.poll(async () => Math.round((await frame.boundingBox())!.x)).toBe(10);
  expect((await frame.boundingBox())!.width).toBeLessThan(730);
  await frame.getByRole("button", { name: "最大化窗口", exact: true }).click();
  await expect(frame).toHaveClass(/is-maximized/);
  await frame.getByRole("button", { name: "还原窗口", exact: true }).click();
  await frame.getByRole("button", { name: "最小化", exact: true }).click();
  await expect(frame).toBeHidden();
  await page.locator(".pinned-apps").getByRole("button", { name: "设置", exact: true }).click();
  await expect(frame).toBeVisible();
  await choose(page, "macOS");
  await expect(frame).toBeVisible();
  await expect(page.locator(".menu-bar")).toBeVisible();
  const controls = await frame.locator(".window-controls button").all();
  expect(await controls[0].getAttribute("aria-label")).toBe("关闭");
  await page.getByRole("button", { name: "搜索应用", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索应用" }).fill("天气");
  await page.locator(".launcher-apps").getByRole("button", { name: "天气", exact: true }).click();
  await expect(page.locator(".shell-window")).toHaveCount(2);
  await frame.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(frame).toHaveCount(0);
});

test("switching packages preserves an iframe draft and its original browsing context", async ({ page, request }) => {
  const response = await request.post("/api/v1/apps", { headers, data: { title: "草稿窗口", url: `${origin}/package-draft-fixture`, openingMode: "desktop_window", iconKind: "fallback", iconUrl: null, description: null } });
  expect(response.ok()).toBeTruthy();
  let navigations = 0;
  await page.route("**/package-draft-fixture", route => { if (route.request().isNavigationRequest()) navigations++; return route.fulfill({ contentType: "text/html", body: '<label>Draft<input aria-label="Draft"></label>' }); });
  await ready(page);
  await page.getByRole("button", { name: "搜索应用", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索应用" }).fill("草稿窗口");
  await page.locator(".launcher-apps").getByRole("button", { name: "草稿窗口", exact: true }).click();
  const input = page.frameLocator('iframe[title="草稿窗口"]').getByRole("textbox", { name: "Draft" });
  await input.fill("Keep my unsaved work");
  expect(navigations).toBe(1);
  await choose(page, "macOS");
  await expect(input).toHaveValue("Keep my unsaved work");
  expect(navigations).toBe(1);
  await choose(page, "Windows 11");
  await expect(input).toHaveValue("Keep my unsaved work");
  expect(navigations).toBe(1);
});

test("effect settings persist per package and reduced motion stops animation", async ({ page, request }) => {
  await ready(page);
  await page.getByRole("button", { name: "外观与特效", exact: true }).click();
  await page.locator('[data-toggle="particles"]').click();
  await expect(page.locator(".effect-canvas")).toBeVisible();
  await expect.poll(async () => (await (await request.get("/api/v1/desktop/packages/org.vibedesktop.windows/preferences")).json()).values.particles).toBe(true);
  await expect.poll(async () => page.locator(".effect-canvas").evaluate((node: HTMLCanvasElement) => Array.from(node.getContext("2d")!.getImageData(0, 0, node.width, node.height).data).some((v, i) => i % 4 === 3 && v > 0))).toBe(true);
  await page.locator('[data-toggle="ambient"]').click();
  await page.locator('[data-toggle="dark"]').click();
  await expect(page.locator(".os-shell")).toHaveClass(/is-dark/);
  await page.reload();
  await expect(page.locator(".os-shell")).toHaveClass(/is-dark/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".os-shell")).toHaveClass(/reduce-motion/);
  await expect(page.locator(".wallpaper-light")).toHaveCSS("animation-name", "none");
  await choose(page, "macOS");
  await expect(page.locator(".os-shell")).not.toHaveClass(/is-dark/);
});

test("an imported HTML CSS JS package runs effects, survives reload, exports and can be removed", async ({ page }) => {
  const bundle: DesktopPackageBundle = JSON.parse(await readFile("public/desktop-packages/windows.vibepack.json", "utf8"));
  bundle.manifest = { ...bundle.manifest, id: "org.example.effects-test", name: "Effects Test" };
  bundle.files["desktop.html"].text = '<main class="custom-desktop"><h1>Independent HTML shell</h1><canvas width="140" height="80"></canvas><button id="customize">Change desktop</button></main>';
  bundle.files["desktop.css"].text = '.custom-desktop{position:absolute;inset:0;padding:60px;background:#102940;color:white;font:18px sans-serif}.custom-desktop canvas{display:block;margin:25px 0;filter:drop-shadow(0 0 10px cyan)}';
  bundle.files["desktop.js"].text = 'export function mount(host){const root=host.root;const canvas=root.querySelector("canvas");const ctx=canvas.getContext("2d");ctx.fillStyle="cyan";ctx.fillRect(10,10,60,60);root.querySelector("h1").animate([{opacity:.5},{opacity:1}],{duration:400});root.querySelector("#customize").addEventListener("click",host.managePackages,{signal:host.signal});return()=>{canvas.dataset.cleaned="true"}}';
  await ready(page);
  await page.getByRole("button", { name: "桌面外观", exact: true }).click();
  await page.locator('.package-import input[type="file"]').setInputFiles({ name: "effects.vibepack.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)) });
  await expect(page.getByText("安装「Effects Test」？")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Independent HTML shell" })).toHaveCount(0);
  await page.getByRole("button", { name: "信任并安装" }).click();
  await page.locator(".package-installed>div").filter({ hasText: "Effects Test" }).getByRole("button", { name: "使用", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Independent HTML shell" })).toBeVisible();
  expect(await page.locator(".custom-desktop canvas").evaluate((c: HTMLCanvasElement) => [...c.getContext("2d")!.getImageData(20, 20, 1, 1).data])).toEqual([0, 255, 255, 255]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Independent HTML shell" })).toBeVisible();
  await page.getByRole("button", { name: "Change desktop" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Effects Test", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("org.example.effects-test");
  await page.getByRole("button", { name: "使用 macOS 桌面", exact: true }).click();
  await page.getByRole("button", { name: "桌面外观", exact: true }).click();
  await page.getByRole("button", { name: "移除 Effects Test", exact: true }).click();
  await expect(page.locator(".package-installed")).toHaveCount(0);
});

test("broken packages fail visibly and the recovery desktop remains reachable", async ({ page }) => {
  await page.route("**/desktop-packages/windows.vibepack.json", route => route.fulfill({ status: 500, body: "failed" }));
  await page.goto("/?desktop=windows");
  await expect(page.getByText("桌面包暂时无法启动")).toBeVisible();
  await page.getByRole("button", { name: "进入恢复桌面", exact: true }).click();
  await expect(page.locator(".desktop-brand")).toBeVisible();
});

test("small screens keep both shells, menus and app windows inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const style of ["windows", "macos"]) {
    await ready(page, style);
    await page.getByRole("button", { name: style === "macos" ? "启动台" : "开始", exact: true }).click();
    const menu = page.locator(".panel-launcher");
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(391);
    await menu.getByRole("button", { name: "设置", exact: true }).click();
    const frame = page.locator(".shell-window");
    const windowBox = (await frame.boundingBox())!;
    expect(windowBox.width).toBeLessThanOrEqual(390); expect(windowBox.y).toBeGreaterThanOrEqual(0);
    await expect(frame.getByRole("button", { name: "关闭", exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "关闭", exact: true }).click();
  }
});

test("dragged icons reserve their position before defaults and survive reload", async ({ page, request }) => {
  await ready(page);
  const icons = page.locator(".os-desktop-icon");
  const first = (await icons.nth(0).boundingBox())!, last = icons.nth(4), from = (await last.boundingBox())!;
  const id = await last.getAttribute("data-app");
  await page.mouse.move(from.x + 35, from.y + 30); await page.mouse.down();
  await page.mouse.move(first.x + 35, first.y + 30, { steps: 12 }); await page.mouse.up();
  await expect.poll(async () => (await (await request.get("/api/v1/desktop/packages/org.vibedesktop.windows/preferences")).json()).values.positions?.[id!]).toEqual({ column: 0, row: 0 });
  await expect.poll(async () => Math.round((await last.boundingBox())!.y)).toBe(Math.round(first.y));
  await page.reload();
  await expect.poll(async () => Math.round((await page.locator(`.os-desktop-icon[data-app="${id}"]`).boundingBox())!.y)).toBe(Math.round(first.y));
  const boxes = await icons.evaluateAll(nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return `${b.x}:${b.y}`; }));
  expect(new Set(boxes).size).toBe(boxes.length);
});

test("complete backup restores package code and failed restore rolls it back", async ({ page }, info) => {
  const bundle: DesktopPackageBundle = JSON.parse(await readFile("public/desktop-packages/macos.vibepack.json", "utf8"));
  bundle.manifest = { ...bundle.manifest, id: "org.example.backup-test", name: "Backup Test" };
  await ready(page);
  await page.getByRole("button", { name: "桌面外观", exact: true }).click();
  await page.locator('.package-import input[type="file"]').setInputFiles({ name: "backup-test.vibepack.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)) });
  await page.getByRole("button", { name: "信任并安装" }).click();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await page.getByRole("button", { name: "使用 Windows 11 桌面", exact: true }).click();
  await page.locator(".pinned-apps").getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("navigation", { name: "桌面设置", exact: true }).getByRole("button", { name: "备份与恢复", exact: true }).click();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "导出备份", exact: true }).click();
  const file = info.outputPath("packages-backup.json"); await (await download).saveAs(file);
  const backup = JSON.parse(await readFile(file, "utf8"));
  expect(backup.packages).toEqual([bundle]);
  // A rejected server write must restore the old browser package collection.
  const failing = { ...backup, packages: [] };
  await page.route("**/api/v1/desktop/restore", route => route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, status: 500, json: { error: { code: "write_failed", message: "Package rollback fixture" } } }));
  await page.locator('.system-settings input[type="file"]').setInputFiles({ name: "failing.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(failing)) });
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(page.getByText("Package rollback fixture").first()).toBeVisible();
  await page.getByRole("button", { name: "桌面外观", exact: true }).click();
  await expect(page.getByRole("button", { name: "移除 Backup Test", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "移除 Backup Test", exact: true }).click();
  await page.getByRole("button", { name: "使用 Windows 11 桌面", exact: true }).click();
  await page.unroute("**/api/v1/desktop/restore");
  await page.locator('.system-settings input[type="file"]').setInputFiles(file);
  await expect(page.getByText("此备份包含 1 个桌面包及其 JavaScript", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "恢复桌面备份" })).toHaveCount(0);
  await expect(page.locator(".os-shell")).toBeVisible();
  await page.getByRole("button", { name: "桌面外观", exact: true }).click();
  await page.locator(".package-installed>div").filter({ hasText: "Backup Test" }).getByRole("button", { name: "使用", exact: true }).click();
  await expect(page.locator('.package-surface[data-desktop-package="org.example.backup-test"] .os-shell.macos')).toBeVisible();
});

test("the documented Aurora source packs and runs with app slots and effect cleanup", async ({ page }, info) => {
  const { execFileSync } = await import("node:child_process");
  const file = info.outputPath("aurora.vibepack.json");
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/package-desktop.ts", "examples/effects-desktop", file], { encoding: "utf8" });
  await ready(page);
  await page.getByRole("button", { name: "桌面外观", exact: true }).click();
  await page.locator('.package-import input[type="file"]').setInputFiles(file);
  await page.getByRole("button", { name: "信任并安装", exact: true }).click();
  await page.locator(".package-installed>div").filter({ hasText: "Aurora Lab" }).getByRole("button", { name: "使用", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aurora Lab" })).toBeVisible();
  await expect.poll(async () => page.locator(".ambient-canvas").evaluate((c: HTMLCanvasElement) => [...c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data].some((v, i) => i % 4 === 3 && v > 0))).toBe(true);
  await page.locator(".application-grid").getByRole("button", { name: "设 设置", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "桌面设置" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Pause effects", exact: true }).click();
  await expect(page.locator(".orb")).toHaveCSS("animation-play-state", "paused");
  await page.reload(); await expect(page.getByRole("button", { name: "Resume effects", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Desktop collection", exact: true }).click();
  await page.getByRole("button", { name: "使用 Windows 11 桌面", exact: true }).click();
  await expect(page.locator('style[data-desktop-content-style="org.example.aurora-desktop"]')).toHaveCount(0);
});

test("package desktops keep group filtering accessible while launchers show every app", async ({ page }) => {
  await ready(page);
  await page.locator(".wallpaper").click({ button: "right", position: { x: 900, y: 200 } });
  await page.getByRole("button", { name: "分组与整理", exact: true }).click();
  const organize = page.getByRole("dialog", { name: "整理应用", exact: true });
  await organize.getByRole("checkbox", { name: "设置", exact: true }).check();
  await organize.getByLabel("目标分组").fill("Work");
  await organize.getByRole("button", { name: "移动到分组", exact: true }).click();
  await organize.getByLabel("筛选分组").selectOption("Work");
  await page.keyboard.press("Escape");
  await expect(page.locator(".os-desktop-icon")).toHaveCount(1);
  await expect(page.locator(".os-desktop-icon")).toHaveAttribute("aria-label", "设置");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(page.locator(".launcher-apps button")).toHaveCount(baseline.apps.length);
  await page.keyboard.press("Escape");
  await choose(page, "macOS");
  await expect(page.locator(".os-desktop-icon")).toHaveCount(1);
});
