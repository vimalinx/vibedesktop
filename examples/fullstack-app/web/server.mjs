// The frontend: serves one page on $PORT and forwards /api/* to the backend.
// Vibe Desktop passes every service's port as VIBE_PORT_<NAME>.
import { createServer, request } from "node:http";
import { readFile } from "node:fs/promises";

const portFlag = process.argv.indexOf("--port");
const port = Number(portFlag > 0 ? process.argv[portFlag + 1] : process.env.PORT || 4310);
const apiPort = Number(process.env.VIBE_PORT_API || 4311);
const page = await readFile(new URL("./index.html", import.meta.url));

createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    const upstream = request({ host: "127.0.0.1", port: apiPort, path: req.url, method: req.method, headers: req.headers }, (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502, { "content-type": "application/json" }); res.end('{"error":"api unavailable"}'); });
    req.pipe(upstream);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page);
}).listen(port, "127.0.0.1", () => console.log(`web on http://127.0.0.1:${port} (api :${apiPort})`));
