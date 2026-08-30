#!/usr/bin/env node
/**
 * Hello WebApp — a tiny demo local webapp for Vibe Desktop's daemon.
 *
 * Run directly:
 *   node examples/hello-webapp/server.mjs
 *   node examples/hello-webapp/server.mjs --port 7879 --name "My App"
 *
 * Daemon typically spawns it with:
 *   command: "node"
 *   args: ["examples/hello-webapp/server.mjs"]
 *   port: 7878
 */
import http from "node:http";
import { hostname } from "node:os";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = Number(arg("port", "7878"));
const NAME = arg("name", "Hello WebApp");
const startedAt = Date.now();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: NAME, pid: process.pid, uptime: process.uptime() }));
    return;
  }

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderPage());
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`[${NAME}] listening on http://127.0.0.1:${PORT} (pid ${process.pid})`);
});

function renderPage() {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${NAME}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { --signal: #c8ff3d; --ink: #1a1714; --muted: #6b6358; --surface: #f2ebde; }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body {
    display: grid; place-items: center;
    font-family: "Geist", system-ui, sans-serif;
    background: #13110f; color: var(--surface);
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: min(560px, 90vw);
    background: var(--surface); color: var(--ink);
    border-radius: 22px; padding: 48px 40px;
    box-shadow: 0 24px 64px -12px rgba(0,0,0,.7);
  }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: "Geist Mono", monospace; font-size: .72rem;
    letter-spacing: .18em; text-transform: uppercase; color: #4a6b1a;
    margin-bottom: 18px;
  }
  .eyebrow::before {
    content: ""; width: 6px; height: 6px; border-radius: 999px;
    background: var(--signal); box-shadow: 0 0 10px var(--signal);
  }
  h1 {
    font-family: "Instrument Serif", serif; font-style: italic;
    font-weight: 400; font-size: clamp(2.4rem, 6vw, 3.6rem);
    line-height: .95; letter-spacing: -.03em; margin-bottom: 16px;
  }
  h1 em { font-style: italic; color: #4a6b1a; }
  p { color: var(--muted); line-height: 1.6; max-width: 440px; margin-bottom: 24px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat {
    border: 1px solid rgba(26,23,20,.1); border-radius: 12px; padding: 12px 14px;
  }
  .stat label {
    display: block; font-family: "Geist Mono", monospace; font-size: .62rem;
    letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;
  }
  .stat strong { font-family: "Geist Mono", monospace; font-size: 1rem; font-weight: 500; font-variant-numeric: tabular-nums; }
  footer {
    margin-top: 28px; padding-top: 16px; border-top: 1px solid rgba(26,23,20,.1);
    font-family: "Geist Mono", monospace; font-size: .72rem; color: var(--muted);
  }
</style>
</head>
<body>
  <main class="card">
    <span class="eyebrow">Vibe Daemon · Live</span>
    <h1>Hello from <em>${NAME}</em>.</h1>
    <p>This page is served by a local Node process managed by <code>vibe-daemon</code>. If you can read this, the daemon successfully spawned and is proxying to port ${PORT}.</p>
    <div class="stats">
      <div class="stat"><label>PID</label><strong>${process.pid}</strong></div>
      <div class="stat"><label>Uptime</label><strong id="uptime">${uptime}s</strong></div>
      <div class="stat"><label>Clock</label><strong id="clock">--:--:--</strong></div>
    </div>
    <footer>Started ${new Date(startedAt).toISOString()} · host ${hostname()}</footer>
  </main>
  <script>
    const startedAtServer = ${startedAt};
    setInterval(() => {
      const s = Math.floor((Date.now() - startedAtServer) / 1000);
      document.getElementById('uptime').textContent = s + 's';
      const d = new Date();
      document.getElementById('clock').textContent =
        String(d.getHours()).padStart(2,'0') + ':' +
        String(d.getMinutes()).padStart(2,'0') + ':' +
        String(d.getSeconds()).padStart(2,'0');
    }, 1000);
  </script>
</body>
</html>`;
}
