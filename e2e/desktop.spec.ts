import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { DesktopPayload } from "../src/lib/contracts";
let baseline: DesktopPayload;
test.beforeAll(async ({ request }) => { baseline = await (await request.get("/api/desktop")).json(); baseline.apps = baseline.apps.filter(a => a.source === "seed"); });
test.beforeEach(async ({ page, request }) => {
  const result = await request.post("/api/desktop/restore", { data: baseline, headers: { Origin: "http://127.0.0.1:3110" } });
  expect(result.ok()).toBeTruthy();
  await page.addInitScript(() => {
    localStorage.setItem("vd:onboarding:v1:dismissed", "true");
    localStorage.setItem("vd:desktop-package:v1", JSON.stringify("classic"));
    localStorage.setItem("vd:locale:v1", "en");
  });
  await page.route("**/api/v1/local-apps", route => route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, json: { apps: [] } }));
  await page.route("https://**/*", route => route.abort());
});
async function openSettings(page: Page) {
  const settings = baseline.apps.find(a => a.iconUrl === "vd://icon/settings")!;
  await page.locator(`.desktop-icon[data-app-id="${settings.id}"]`).click();
  await expect(page.locator(".system-settings")).toBeVisible();
}
async function addFixture(request: import("@playwright/test").APIRequestContext, openingMode = "desktop_window") {
  const response = await request.post("/api/apps", { headers: { Origin: "http://127.0.0.1:3110" }, data: {
    title: "Acceptance App", url: "http://127.0.0.1:3110/acceptance-fixture", description: "test", openingMode, iconKind: "fallback", iconUrl: null
  } });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as DesktopPayload).apps.find(a => a.title === "Acceptance App")!;
}

test("minimize preserves the live iframe and restores unsaved content", async ({ page, request }) => {
  const app = await addFixture(request);
  let frameLoads = 0;
  await page.route("**/acceptance-fixture", route => { if (route.request().isNavigationRequest()) frameLoads++; return route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, contentType: "text/html", body: '<label>Unsaved note<input aria-label="Unsaved note"></label>' }); });
  await page.goto("/");
  await page.locator(`.desktop-icon[data-app-id="${app.id}"]`).click();
  const input = page.frameLocator('iframe[title="Acceptance App"]').getByLabel("Unsaved note");
  await input.fill("keep this unsaved draft");
  const initialFrameLoads = frameLoads;
  const win = page.locator(".app-window").filter({ has: page.locator('iframe[title="Acceptance App"]') });
  await win.getByRole("button", { name: "Minimize", exact: true }).click();
  await expect(win).toBeHidden();
  expect(await page.locator('iframe[title="Acceptance App"]').count()).toBe(1);
  await page.locator(".dock-windows").getByRole("button", { name: "Acceptance App" }).click();
  await expect(input).toHaveValue("keep this unsaved draft");
  expect(frameLoads).toBe(initialFrameLoads);
});

test("saved external opening mode opens a browser tab", async ({ page, request }) => {
  const app = await addFixture(request, "external_tab");
  await page.goto("/");
  expect(app.openingMode).toBe("external_tab");
  const popupPromise = page.context().waitForEvent("page");
  await page.locator(`.desktop-icon[data-app-id="${app.id}"]`).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/acceptance-fixture/);
  await expect(page.locator('iframe[title="Acceptance App"]')).toHaveCount(0);
  await popup.close();
});

test("refresh restores windows and their maximized state", async ({ page }) => {
  await page.goto("/"); await openSettings(page);
  const win = page.locator(".app-window").filter({ has: page.locator(".system-settings") });
  await win.getByRole("button", { name: "Maximize", exact: true }).click();
  await expect(win).toHaveClass(/is-maximized/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vd:windows:v1"))).toContain('"maximized":true');
  await page.reload(); await expect(page.locator(".system-settings")).toBeVisible();
  await expect(page.locator(".app-window").filter({ has: page.locator(".system-settings") })).toHaveClass(/is-maximized/);
});

test("exports and restores images, preferences and desktop configuration through settings", async ({ page, request }, info) => {
  await page.goto("/"); await openSettings(page);
  await page.getByRole("button", { name: "Backup & restore", exact: true }).click();
  const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "Export backup", exact: true }).click();
  const file = await downloaded; const filePath = info.outputPath("backup.json"); await file.saveAs(filePath);
  const backup = JSON.parse(await readFile(filePath, "utf8"));
  expect(backup.format).toBe("vibedesktop-backup");
  const key = `desktop:${backup.snapshot.desktop.id}:wallpaper`;
  backup.snapshot.desktop.wallpaperKind = "custom_local";
  backup.snapshot.desktop.themeId = "paper-ink";
  backup.assets = [{ key, name: "pixel.png", type: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGFEAAAAASUVORK5CYII=" }];
  backup.preferences["vd:catalog:followed-developers:v1"] = '["example"]';
  await page.locator('.system-settings input[type="file"]').setInputFiles({ name: "restore.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByRole("dialog", { name: "Restore desktop backup" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm restore", exact: true }).click();
  await expect.poll(async () => (await (await request.get("/api/desktop")).json()).desktop.themeId).toBe("paper-ink");
  await expect(page.locator(".system-settings")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vd:catalog:followed-developers:v1"))).toBe('["example"]');
  // Export after the reload, proving IndexedDB bytes survived the round-trip.
  await page.getByRole("button", { name: "Backup & restore", exact: true }).click();
  const secondDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Export backup", exact: true }).click();
  const secondFile = await secondDownload; const secondPath = info.outputPath("restored.json"); await secondFile.saveAs(secondPath);
  const restored = JSON.parse(await readFile(secondPath, "utf8"));
  expect(restored.assets).toEqual(backup.assets);
  expect(restored.snapshot.desktop.wallpaperKind).toBe("custom_local");
});

test("temporary daemon failure keeps icons and shows actionable feedback", async ({ page }) => {
  let offline = false;
  const app = { id: "fixture-local", name: "Local Fixture", port: 3119, command: "fixture", cwd: "/fixture", args: [], status: { running: false, healthy: false, url: "http://127.0.0.1:3119", pid: null, lastError: null } };
  await page.unroute("**/api/v1/local-apps");
  await page.route("**/api/v1/local-apps", route => offline ? route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, status: 503, json: { error: { code: "daemon_unreachable", message: "Fixture daemon offline" } } }) : route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, json: { apps: [app] } }));
  await page.route("**/api/v1/local-apps/fixture-local/control", route => route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, status: 503, json: { error: { code: "start_failed", message: "Fixture failed to start" } } }));
  await page.goto("/");
  const icon = page.locator('.desktop-icon[data-app-id="local-app:fixture-local"]');
  await expect(icon).toBeVisible();
  await icon.click(); await expect(page.locator(".tile-notice[role=alert]")).toContainText("Fixture failed to start");
  await expect(page.locator('iframe[title="Local Fixture"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  offline = true;
  await expect(page.locator(".tile-notice[role=alert]")).toContainText("application manager is unreachable", { timeout: 12_000 });
  await expect(icon).toBeVisible();
  offline = false;
  await page.getByRole("button", { name: "Retry connection", exact: true }).click();
  await expect(page.locator(".tile-notice[role=alert]")).toHaveCount(0);
});

test("failed restore rolls back browser preferences and rejects malformed backup before mutation", async ({ page, request }, info) => {
  await page.goto("/"); await openSettings(page);
  await page.getByRole("button", { name: "Backup & restore", exact: true }).click();
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Export backup", exact: true }).click();
  const download = await downloadPromise; const file = info.outputPath("before-failure.json"); await download.saveAs(file);
  const previous = JSON.parse(await readFile(file, "utf8"));
  const before = await (await request.get("/api/desktop")).json();
  const input = page.locator('.system-settings input[type="file"]');
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"format":"wrong"}') });
  await expect(page.locator(".system-toast[role=alert]")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const candidate = structuredClone(previous); candidate.preferences["vd:custom-font"] = '"mono"'; candidate.snapshot.desktop.themeId = "paper-ink";
  await page.route("**/api/v1/desktop/restore", route => route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, status: 500, json: { error: { code: "write_failed", message: "Fixture write failure" } } }));
  await input.setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(candidate)) });
  await page.getByRole("button", { name: "Confirm restore", exact: true }).click();
  await expect(page.locator(".system-toast[role=alert]")).toContainText("Fixture write failure");
  expect(await page.evaluate(() => localStorage.getItem("vd:custom-font"))).toBe(previous.preferences["vd:custom-font"] ?? null);
  expect((await (await request.get("/api/desktop")).json()).desktop.themeId).toBe(before.desktop.themeId);
  await page.getByRole("button", { name: "Recover previous desktop", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Restore desktop backup" })).toBeVisible();
});

test("parallel HTTP writes survive concurrent polling and restore requires same origin", async ({ request }) => {
  const before: DesktopPayload = await (await request.get("/api/desktop")).json();
  await Promise.all(Array.from({ length: 12 }, async (_, i) => {
    const [created] = await Promise.all([
      request.post("/api/apps", { headers: { Origin: "http://127.0.0.1:3110" }, data: { title: `Parallel ${i}`, url: `https://example.com/${i}`, openingMode: "desktop_window", iconKind: "fallback", iconUrl: null, description: null } }),
      request.get("/api/desktop"), request.get("/api/me")
    ]);
    expect(created.ok()).toBeTruthy();
  }));
  const after: DesktopPayload = await (await request.get("/api/desktop")).json();
  expect(after.apps.length - before.apps.length).toBe(12);
  const denied = await request.post("/api/desktop/restore", { headers: { Origin: "https://unrelated.example" }, data: before });
  expect(denied.status()).toBe(403);
  const malformed = await request.patch(`/api/apps/${before.apps[0].id}`, { headers: { Origin: "http://127.0.0.1:3110", "Content-Type": "application/json" }, data: "{" });
  expect(malformed.status()).toBe(400);
  expect((await (await request.get("/api/desktop")).json()).apps.length).toBe(after.apps.length);
});

test("window sessions work without a daemon and tour fixtures do not become real apps", async ({ page }) => {
  await page.unroute("**/api/v1/local-apps");
  await page.route("**/api/v1/local-apps", route => route.fulfill({ headers: { "x-vibe-protocol": "1.0" }, status: 503, json: { error: { code: "daemon_unreachable", message: "offline" } } }));
  await page.addInitScript(() => { if (!sessionStorage.getItem("tour-tested")) localStorage.removeItem("vd:onboarding:v1:dismissed"); });
  await page.goto("/");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.locator('.desktop-icon[data-app-id="local-app:demo-local-1"]')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("tour-tested", "true"));
  await openSettings(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vd:windows:v1"))).toContain(baseline.apps.find(a => a.iconUrl === "vd://icon/settings")!.id);
  await page.reload();
  await expect(page.locator(".system-settings")).toBeVisible();
  await expect(page.locator('.desktop-icon[data-app-id="local-app:demo-local-1"]')).toHaveCount(0);
});


test("session restoration still honors the configured start app", async ({ page, request }) => {
  const settings = baseline.apps.find(a => a.iconUrl === "vd://icon/settings")!;
  await request.patch("/api/desktop", { headers: { Origin: "http://127.0.0.1:3110" }, data: { startAppId: settings.id } });
  await page.addInitScript(desktopId => localStorage.setItem("vd:windows:v1", JSON.stringify({ desktopId, windows: [] })), baseline.desktop.id);
  await page.goto("/");
  await expect(page.locator(".system-settings")).toBeVisible();
});

test("quick search focuses existing windows and renders friendly setting labels", async ({page})=>{
  await page.goto("/");
  await expect(page.getByRole("button",{name:"Quick search",exact:true})).toBeVisible();
  await page.keyboard.press("Control+k");
  const search=page.getByRole("dialog",{name:"Quick search"});
  await search.getByRole("searchbox").fill("Settings");
  await page.keyboard.press("Enter");
  await expect(page.locator(".system-settings")).toBeVisible();
  await expect(page.locator(".settings-select").first()).not.toContainText("__none__");
  await page.keyboard.press("Control+k");
  await search.getByRole("searchbox").fill("Settings");await page.keyboard.press("Enter");
  await expect(page.locator(".system-settings")).toHaveCount(1);
});

test("scenes preserve mounted drafts and split geometry survives reload", async({page,request})=>{
  const app=await addFixture(request);
  await page.route("**/acceptance-fixture",route=>route.fulfill({ headers: { "x-vibe-protocol": "1.0" },contentType:"text/html",body:'<input aria-label="Scene draft">'}));
  await page.goto("/");await page.locator(`.desktop-icon[data-app-id="${app.id}"]`).click();
  const draft=page.frameLocator('iframe[title="Acceptance App"]').getByLabel("Scene draft");await draft.fill("scene content");
  await page.getByRole("button",{name:"Windows",exact:true}).click();
  const overview=page.getByRole("dialog",{name:"Windows",exact:true});
  await overview.getByRole("button",{name:"Left half"}).click();await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Work scenes",exact:true}).click();
  const scenes=page.getByRole("dialog",{name:"Work scenes"});await scenes.getByLabel("Scene name").fill("Writing");await scenes.getByRole("button",{name:"Save current scene"}).click();await page.keyboard.press("Escape");
  const win=page.locator(".app-window").filter({has:page.locator('iframe[title="Acceptance App"]')});
  await win.getByRole("button",{name:"Minimize",exact:true}).click();
  await openSettings(page);
  await page.getByRole("button",{name:"Work scenes",exact:true}).click();await scenes.getByRole("button",{name:"Restore scene"}).click();
  await expect(draft).toHaveValue("scene content");await expect(page.locator(".system-settings")).toBeHidden();
  await expect.poll(async()=>Math.round((await win.boundingBox())!.width)).toBe(708);
  await page.reload();await expect(win).toBeVisible();await expect.poll(async()=>Math.round((await win.boundingBox())!.width)).toBe(708);
});

test("grouping persists and batch undo preserves later additions",async({page,request})=>{
  const app=await addFixture(request);await page.goto("/");
  await page.getByRole("button",{name:"Organize apps",exact:true}).click();
  const organize=page.getByRole("dialog",{name:"Organize apps"});
  await organize.getByRole("checkbox",{name:"Acceptance App"}).check();
  await organize.getByLabel("Target group").fill("Writing");await organize.getByRole("button",{name:"Move to group"}).click();await page.keyboard.press("Escape");
  await page.getByLabel("Filter group").selectOption("Writing");await expect(page.locator(".desktop-icon")).toHaveCount(1);
  await page.reload();await page.getByLabel("Filter group").selectOption("Writing");await expect(page.locator(".desktop-icon")).toHaveCount(1);
  await page.getByRole("button",{name:"Organize apps",exact:true}).click();await organize.getByRole("checkbox",{name:"Acceptance App"}).check();await organize.getByRole("button",{name:"Remove selected shortcuts"}).click();await organize.getByRole("button",{name:"Confirm removal"}).click();await expect(organize.getByRole("button",{name:"Undo removal"})).toBeVisible();
  const later=await request.post("/api/apps",{headers:{Origin:"http://127.0.0.1:3110"},data:{title:"Added later",url:"https://example.com/later",description:"",openingMode:"external_tab",iconKind:"fallback",iconUrl:null}});expect(later.ok()).toBeTruthy();
  await organize.getByRole("button",{name:"Undo removal"}).click();await expect(organize.getByRole("checkbox",{name:"Added later"})).toBeVisible();await expect(organize.getByRole("checkbox",{name:"Acceptance App"})).toBeVisible();
  const denied=await request.post("/api/apps/batch",{headers:{Origin:"https://evil.example"},data:{action:"delete",ids:[app.id]}});expect(denied.status()).toBe(403);
});

test("history snapshots preview safely and record task results",async({page})=>{
  await page.goto("/");await openSettings(page);await page.getByRole("button",{name:"Backup & restore",exact:true}).click();
  await page.getByLabel("Frequency",{exact:true}).selectOption("24");
  await page.getByRole("button",{name:"Save snapshot now"}).click();await expect(page.getByRole("button",{name:"Preview restore"})).toHaveCount(1);
  await page.getByRole("button",{name:"Preview restore"}).click();await expect(page.getByRole("dialog")).toBeVisible();await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Activity",exact:true}).click();await expect(page.getByRole("dialog",{name:"Activity"})).toContainText("Completed");
  await page.keyboard.press("Escape");await page.reload();await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("vd:backup-schedule")||"{}").hours)).toBe(24);
});

test("version management identifies source mode and rejects unsafe operations",async({page,request})=>{
  await page.goto("/");await openSettings(page);await page.getByRole("button",{name:"Version management",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Installed version"})).toBeVisible();await expect(page.getByRole("button",{name:"Install update",exact:true})).toBeDisabled();
  const denied=await request.post("/api/desktop/version",{headers:{Origin:"https://evil.example"},data:{action:"rollback",confirm:true}});expect(denied.status()).toBe(403);
  const source=await request.post("/api/desktop/version",{headers:{Origin:"http://127.0.0.1:3110"},data:{action:"rollback",confirm:true}});expect(source.status()).toBe(409);
});

test("small screens keep desktop tools and a full width window reachable",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/");await page.getByRole("button",{name:"Quick search",exact:true}).click();
  await page.getByRole("searchbox").fill("Settings");await page.keyboard.press("Enter");await expect(page.locator(".system-settings")).toBeVisible();
  const bounds=await page.locator(".app-window").boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.width).toBeLessThanOrEqual(390);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(844);
  const dock=await page.locator(".dock").boundingBox();expect(dock!.height).toBeLessThan(80);expect(bounds!.y+bounds!.height).toBeLessThan(dock!.y);
  await page.getByRole("button",{name:"Windows",exact:true}).click();await expect(page.getByRole("dialog",{name:"Windows",exact:true})).toBeVisible();
});

test("minimized built-in panels pause their health polling",async({page})=>{
  let reads=0;
  await page.route("**/api/v1/local-apps/daemon-status",route=>{reads++;return route.fulfill({ headers: { "x-vibe-protocol": "1.0" },json:{ok:true,version:"fixture",uptime:1}});});
  await page.goto("/");
  const local=baseline.apps.find(a=>a.iconUrl==="vd://icon/local-apps")!;
  // Locate the local-app system entry by its displayed button if the seed uses another icon identifier.
  if(local)await page.locator(`.desktop-icon[data-app-id="${local.id}"]`).click();
  else await page.getByRole("button",{name:"Open Local WebApps",exact:true}).click();
  const pane=page.locator(".app-window").filter({has:page.locator(".local-apps-panel")});
  await expect.poll(()=>reads).toBeGreaterThan(0);
  await pane.getByRole("button",{name:"Minimize",exact:true}).click();
  await page.waitForTimeout(1000);
  const afterMinimize=reads;
  await page.waitForTimeout(5500);
  expect(reads).toBe(afterMinimize);
});

test("installation activity resumes after reload and finishes with the panel closed",async({page})=>{
  await page.addInitScript(()=>localStorage.setItem("vd:activity:v1",JSON.stringify([{id:"catalog:fixture",title:"Fixture install",state:"running",detail:"queued",at:new Date().toISOString()}])));
  let installed=false;
  await page.route("**/api/v1/catalog-installs",route=>route.fulfill({ headers: { "x-vibe-protocol": "1.0" },json:{installs:[{itemId:"fixture",title:"Fixture install",state:installed?"installed":"installing",message:installed?"Ready":"Installing fixture",workspacePath:"/fixture",updatedAt:new Date().toISOString()}]}}));
  await page.goto("/");await page.getByRole("button",{name:"Activity",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Activity",exact:true});await expect(dialog).toContainText("Installing fixture");await page.keyboard.press("Escape");
  installed=true;await page.waitForTimeout(2500);
  await page.getByRole("button",{name:"Activity",exact:true}).click();await expect(dialog).toContainText("Completed");await expect(dialog).toContainText("Ready");
});
