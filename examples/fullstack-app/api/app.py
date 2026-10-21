"""The backend: a tiny JSON API that keeps its data in $VIBE_DATA_DIR."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("PORT", "4311"))
DATA = Path(os.environ.get("VIBE_DATA_DIR", ".")) / "visits.json"


def read() -> int:
    try:
        return int(json.loads(DATA.read_text())["visits"])
    except (OSError, ValueError, KeyError):
        return 0


class Handler(BaseHTTPRequestHandler):
    def reply(self, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self.reply({"ok": True})
        elif self.path == "/api/visits":
            self.reply({"visits": read()})
        else:
            self.send_error(404)

    def do_POST(self) -> None:
        if self.path != "/api/visits":
            self.send_error(404)
            return
        DATA.parent.mkdir(parents=True, exist_ok=True)
        visits = read() + 1
        DATA.write_text(json.dumps({"visits": visits}))
        self.reply({"visits": visits})


if __name__ == "__main__":
    print(f"api on http://127.0.0.1:{PORT}, data in {DATA}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
