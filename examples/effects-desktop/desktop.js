/** No React, Next.js or application imports. Everything here is ordinary browser code. */
export function mount(host) {
  const root = host.root, signal = host.signal;
  const shell = root.querySelector(".aurora"), list = root.querySelector(".application-grid"), windows = root.querySelector(".hosted-windows");
  host.styleContent(":host>.package-app-content{width:100%;height:100%;overflow:auto;background:#f5f8fc;color:#25344b;font-family:system-ui}");
  root.querySelector("#packages").addEventListener("click", host.managePackages, { signal });
  let paused = host.snapshot().preferences.values.paused === true;
  let reduced = host.snapshot().reducedMotion;
  const toggle = root.querySelector("#motion");
  const apply = () => { shell.classList.toggle("paused", paused || reduced); toggle.textContent = paused ? "Resume effects" : "Pause effects"; };
  toggle.addEventListener("click", async () => { paused = !paused; apply(); schedule(); try { await host.savePreferences({ paused }); } catch (error) { host.notify(error.message); } }, { signal });
  let signature = "";
  const frames = new Map();
  const canvas = root.querySelector("canvas"), ctx = canvas.getContext("2d");
  let frame = 0;
  const unsubscribe = host.subscribe(state => {
    reduced = state.reducedMotion; apply(); schedule();
    const next = state.apps.map(a => a.id + a.label).join();
    if (signature !== next) {
      signature = next; list.replaceChildren();
      for (const app of state.apps) {
        const button = document.createElement("button"), icon = document.createElement("strong"), label = document.createElement("span");
        icon.textContent = app.label.slice(0, 1); label.textContent = app.label; button.append(icon, label);
        button.addEventListener("click", () => host.open(app.id), { signal }); list.append(button);
      }
    }
    for (const [id, frame] of frames) if (!state.windows.some(w => w.id === id)) { frame.remove(); frames.delete(id); }
    for (const win of state.windows) {
      let frame = frames.get(win.id);
      if (!frame) {
        frame = document.createElement("section"); frame.className = "aurora-window";
        const bar = document.createElement("div"), title = document.createElement("span"), close = document.createElement("button");
        title.textContent = state.apps.find(a => a.id === win.app.id)?.label || win.app.title; close.textContent = "Close";
        close.addEventListener("click", () => host.close(win.id), { signal }); bar.append(title, close); frame.append(bar, host.content(win.id));
        frame.addEventListener("pointerdown", () => host.focus(win.id), { signal }); windows.append(frame); frames.set(win.id, frame);
      }
      Object.assign(frame.style, { left: `${Math.max(12, Math.min(win.x, innerWidth - 330))}px`, top: `${Math.max(40, win.y)}px`, width: `${Math.min(win.width, innerWidth - 24)}px`, height: `${Math.min(win.height, innerHeight - 140)}px`, zIndex: win.z, display: win.mode === "minimized" ? "none" : "flex" });
    }
  });
  function schedule() { if (!frame && !paused && !reduced && !document.hidden) frame = requestAnimationFrame(draw); }
  function draw(t) {
    frame = 0; if (paused || reduced || document.hidden || signal.aborted || !ctx) return;
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) { canvas.width = innerWidth; canvas.height = innerHeight; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc((i * 131) % innerWidth, ((i * 77 + t / 70) % innerHeight), 1 + i % 2, 0, Math.PI * 2); ctx.fillStyle = "#c4efff70"; ctx.fill(); }
    schedule();
  }
  document.addEventListener("visibilitychange", schedule, { signal }); schedule();
  if (!reduced) shell.querySelector("h1").animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 700, easing: "ease-out" });
  return () => { unsubscribe(); cancelAnimationFrame(frame); };
}
