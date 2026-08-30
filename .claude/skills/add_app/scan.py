#!/usr/bin/env python3
"""
vibe-scan — discover local webapps Vibe Desktop's daemon could manage.

Read-only. JSON array of candidates to stdout; one-line summary to stderr.

Three discovery signals, so apps are found in ANY state (running OR installed-but-stopped):
  1. listening TCP ports + the owning process's full cmdline + cwd (via /proc)
  2. package managers / PATH binaries / install dirs + a known-app catalog
  3. a static walk of dev roots (~/Projects, ~/code, ...) for webapp projects

Signal 1 is what finds things YOU wrote: if your `npm run dev` / `python app.py`
is serving a port right now, the scanner reads the exact command + cwd and offers
it as a daemon-launchable recipe. Signal 3 finds those projects even when stopped.

Locates the project root by walking up from this file. Never prints the daemon token.
"""
from __future__ import annotations

import base64
import http.client
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from collections import deque
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from urllib.parse import urljoin


@dataclass(frozen=True)
class Candidate:
    name: str
    source: str               # e.g. "port:7860", "which:ollama", "cmdline", "project:Projects/foo"
    port: int | None
    command: str | None       # executable the daemon should spawn
    args: list[str]
    cwd: str | None
    running: bool
    registerable: bool        # daemon can launch/stop it (we know a command)
    already_registered: bool  # daemon already has an app on this port
    dev: bool                 # looks like one of the user's own projects
    note: str
    icon_kind: str = "fallback"   # "favicon" once captured from the running app
    icon: str | None = None       # data URL of the app's own favicon (when running)


@dataclass(frozen=True)
class KnownApp:
    name: str
    default_port: int
    packages: tuple[str, ...] = ()
    binaries: tuple[str, ...] = ()
    dirs: tuple[str, ...] = ()
    command: str = ""
    args: tuple[str, ...] = ()
    cwd_from_dir: bool = False


@dataclass(frozen=True)
class Listener:
    port: int
    pid: int | None
    name: str
    cwd: str | None
    cmdline: list[str]


SYSTEM_SKIP_PORTS: set[int] = {53, 631, 5353, 9050, 9222}
SKIP_PROC_NAMES: set[str] = {
    "chrome", "chromium", "google-chrome", "firefox", "brave",
    "agent-browser-l", "ssh", "sshd", "sing-box", "clash-verge",
}
# cmdline substrings that look like servers but aren't user webapps (kernel sockets etc.)
CMDLINE_DENYLIST: tuple[str, ...] = ("ipykernel", "multiprocessing.fork", "resource_tracker")

DEV_ROOTS: tuple[str, ...] = (
    "~/Projects", "~/code", "~/dev", "~/src", "~/repos", "~/workspace",
    "~/work", "~/Developer", "~/go/src", "~/documents/code",
)

# package.json dependency names that mark a JS webapp, plus their default dev port.
JS_WEB_MARKERS: tuple[tuple[str, int], ...] = (
    ("next", 3000),
    ("vite", 5173),
    ("@vue/devserver", 5173),
    ("react-scripts", 3000),
    ("astro", 4321),
    ("svelte", 5173),
    ("nuxt", 3000),
)

JS_CONFIG_FILES: tuple[str, ...] = (
    "vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs",
    "vite.config.mts", "vite.config.cts",
    "astro.config.ts", "astro.config.js", "astro.config.mjs", "astro.config.cjs",
)

CATALOG: tuple[KnownApp, ...] = (
    KnownApp("ComfyUI", 8188,
             packages=("comfyui",), binaries=("comfyui",),
             dirs=("~/ComfyUI", "~/comfyui"),
             command="python3", args=("main.py", "--listen", "127.0.0.1", "--port", "8188"),
             cwd_from_dir=True),
    KnownApp("Stable Diffusion WebUI", 7860,
             dirs=("~/stable-diffusion-webui",),
             command="python3", args=("launch.py", "--listen", "--port", "7860"),
             cwd_from_dir=True),
    KnownApp("Ollama", 11434,
             packages=("ollama",), binaries=("ollama",),
             command="ollama", args=("serve",)),
    KnownApp("Open WebUI", 8080,
             packages=("open-webui",), binaries=("open-webui",),
             command="open-webui", args=()),
    KnownApp("JupyterLab", 8888,
             packages=("jupyterlab",), binaries=("jupyter-lab", "jupyter"),
             command="jupyter", args=("lab", "--no-browser", "--port", "8888")),
    KnownApp("Jupyter Notebook", 8889,
             packages=("notebook",), binaries=("jupyter-notebook",),
             command="jupyter", args=("notebook", "--no-browser", "--port", "8889")),
    KnownApp("n8n", 5678,
             packages=("n8n",), binaries=("n8n",),
             command="n8n", args=()),
    KnownApp("code-server", 8080,
             packages=("code-server",), binaries=("code-server",),
             command="code-server", args=("--auth", "none", "--port", "8080")),
    KnownApp("Streamlit", 8501,
             packages=("streamlit",), binaries=("streamlit",),
             command="", args=()),
)


def run(cmd: list[str], timeout: float = 6.0) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout or ""
    except Exception:
        return ""


def find_project_root() -> Path | None:
    here = Path(__file__).resolve().parent
    for cand in [here, *here.parents]:
        if (cand / ".data" / "daemon.token").exists() or (
            (cand / "package.json").exists()
            and '"vibedesktop"' in (cand / "package.json").read_text(errors="ignore")
        ):
            return cand
    return None


def daemon_data_dir(root: Path | None = None) -> Path:
    """Resolve the installed daemon state first, with repo `.data` as a dev fallback."""
    override = os.environ.get("VIBE_DAEMON_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()

    configured_data_home = os.environ.get("XDG_DATA_HOME", "").strip()
    data_home = Path(configured_data_home).expanduser() if configured_data_home else Path.home() / ".local" / "share"
    if not data_home.is_absolute():
        data_home = Path.home() / ".local" / "share"
    installed = data_home / "vibed-vibedesktop"
    if (installed / "daemon.port").exists() or (installed / "daemon.token").exists() or root is None:
        return installed
    return root / ".data"


def _proc_info(pid: int) -> tuple[str, str | None, list[str]]:
    """(comm_name, cwd, cmdline) for a pid via /proc — best effort."""
    try:
        name = Path(f"/proc/{pid}/comm").read_text().strip()
    except OSError:
        name = ""
    cwd: str | None = None
    try:
        cwd = os.readlink(f"/proc/{pid}/cwd")
    except OSError:
        pass
    cmdline: list[str] = []
    try:
        raw = Path(f"/proc/{pid}/cmdline").read_bytes()
        cmdline = [c for c in raw.decode("utf-8", "replace").split("\0") if c]
    except OSError:
        pass
    return (name or f"pid-{pid}", cwd, cmdline)


def dev_root_of(path: str | None) -> str | None:
    if not path:
        return None
    for root in DEV_ROOTS:
        rp = os.path.expanduser(root)
        if path == rp or path.startswith(rp + os.sep):
            return os.path.relpath(path, os.path.expanduser("~"))
    return None


def listening_ports() -> list[Listener]:
    out = run(["ss", "-tlnpH"])
    listeners: list[Listener] = []
    seen: set[int] = set()
    for line in out.splitlines():
        cells = line.split()
        if len(cells) < 5 or cells[0] != "LISTEN":
            continue
        local = cells[3]
        if ":" not in local:
            continue
        port_str = local.rsplit(":", 1)[1]
        if not port_str.isdigit():
            continue
        port = int(port_str)
        if port in seen:
            continue
        seen.add(port)
        pid_match = re.search(r"pid=(\d+)", line)
        pid = int(pid_match.group(1)) if pid_match else None
        if pid:
            name, cwd, cmdline = _proc_info(pid)
        else:
            name, cwd, cmdline = f"port-{port}", None, []
        listeners.append(Listener(port=port, pid=pid, name=name, cwd=cwd, cmdline=cmdline))
    return listeners


def pip_packages() -> set[str]:
    out = run(["python3", "-m", "pip", "list", "--format=freeze"])
    return {line.split("==", 1)[0].lower() for line in out.splitlines() if "==" in line}


def pacman_packages() -> set[str]:
    out = run(["pacman", "-Q"])
    return {line.split()[0].lower() for line in out.splitlines() if line.strip()}


def docker_containers() -> list[tuple[str, list[int]]]:
    out = run(["docker", "ps", "--format", "{{.Names}}\t{{.Ports}}"])
    results: list[tuple[str, list[int]]] = []
    for line in out.splitlines():
        if "\t" not in line:
            continue
        name, ports_field = line.split("\t", 1)
        ports = [int(p) for p in re.findall(r":(\d+)->", ports_field)]
        results.append((name, ports))
    return results


def daemon_endpoint(root: Path | None) -> tuple[int, str] | None:
    state_dir = daemon_data_dir(root)
    port_file = state_dir / "daemon.port"
    token_file = state_dir / "daemon.token"
    if not (port_file.exists() and token_file.exists()):
        return None
    try:
        port = int(port_file.read_text().strip())
        token = token_file.read_text().strip()
    except ValueError:
        return None
    if port <= 0 or len(token) < 32:
        return None
    return port, token


def daemon_apps(root: Path | None) -> list[dict]:
    """Raw daemon /apps list (empty if the daemon is down)."""
    ep = daemon_endpoint(root)
    if not ep:
        return []
    port, token = ep
    out = run([
        "curl", "-s", "-H", f"Authorization: Bearer {token}",
        f"http://127.0.0.1:{port}/apps",
    ])
    try:
        return (json.loads(out).get("apps", []) if out else [])
    except (ValueError, TypeError):
        return []


def daemon_registered_ports(root: Path | None) -> set[int]:
    return {int(a.get("port", 0)) for a in daemon_apps(root) if a.get("port")}


def expand(path: str) -> Path:
    return Path(os.path.expanduser(path))


def _launchable_command(cmd0: str) -> bool:
    """Is cmd0 something the daemon could actually exec (shell:false)?"""
    if not cmd0:
        return False
    if " " in cmd0 or "(" in cmd0:
        # rewritten process title, e.g. next.js sets process.title = "next-server (v...)"
        return False
    if shutil.which(cmd0):
        return True
    if os.path.isabs(cmd0) and Path(cmd0).exists():
        return True
    return False


def _is_http_listener(port: int, timeout: float = 0.75) -> bool:
    """Return true only when a listener completes a real HTTP handshake.

    A launchable process is not necessarily a web app: SSH, databases, local
    proxies and developer infrastructure all own TCP listeners. Requiring a
    valid HTTP response keeps SCAN ALL focused on pages the desktop can open.
    """
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        connection.request(
            "GET",
            "/",
            headers={
                "Accept": "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.1",
                "Connection": "close",
                "User-Agent": "vibe-scan",
            },
        )
        response = connection.getresponse()
        sample = response.read(512).lstrip().lower()
        content_type = (response.getheader("content-type") or "").lower()
        is_html = (
            "text/html" in content_type
            or "application/xhtml+xml" in content_type
            or sample.startswith(b"<!doctype html")
            or sample.startswith(b"<html")
        )
        return 100 <= response.status <= 599 and is_html
    except (OSError, http.client.HTTPException):
        return False
    finally:
        connection.close()


def _js_default_port(deps: dict) -> int | None:
    for marker, port in JS_WEB_MARKERS:
        if marker in deps:
            return port
    return None


def _recover_recipe(cwd: str | None) -> tuple[str, list[str]] | None:
    """When a process hid its real cmdline (rewrote process.title), rebuild a
    launch recipe from its project dir's package.json."""
    if not cwd:
        return None
    pkg = Path(cwd) / "package.json"
    if not pkg.is_file():
        return None
    try:
        data = json.loads(pkg.read_text(errors="ignore"))
    except ValueError:
        return None
    scripts = data.get("scripts") or {}
    for script in ("dev", "start"):
        if script in scripts:
            return ("npm", ["run", script])
    return None


@dataclass(frozen=True)
class StaticProject:
    cwd: str
    port: int
    command: str
    args: tuple[str, ...]
    framework: str
    note: str


def _valid_port(value: str) -> int | None:
    try:
        port = int(value)
    except ValueError:
        return None
    return port if 1 <= port <= 65535 else None


def _configured_js_port(project: Path, script_command: str) -> int | None:
    """Read an explicit dev-server port before falling back to framework defaults.

    Package scripts win. For Vite/Astro configs, only inspect the bounded slice
    beginning at the top-level `server` block so proxy target ports elsewhere in
    the file cannot be mistaken for the browser-facing port.
    """
    for pattern in (
        r"(?:^|[\s;&])PORT\s*=\s*(\d{1,5})\b",
        r"(?:--port(?:=|\s+)|(?:^|\s)-p\s+)(\d{1,5})\b",
    ):
        match = re.search(pattern, script_command)
        if match:
            port = _valid_port(match.group(1))
            if port:
                return port

    for name in JS_CONFIG_FILES:
        path = project / name
        if not path.is_file():
            continue
        try:
            text = path.read_text(errors="ignore")[:250_000]
        except OSError:
            continue
        server = re.search(r"\bserver\s*:\s*\{", text)
        if not server:
            continue
        match = re.search(r"\bport\s*:\s*(\d{1,5})\b", text[server.end():server.end() + 3000])
        if match:
            port = _valid_port(match.group(1))
            if port:
                return port
    return None


def _python_interpreter(project: Path) -> str:
    """Prefer the project's venv interpreter so installed deps resolve."""
    for venv in (".venv", "venv", "env"):
        py = project / venv / "bin" / "python"
        if py.exists():
            return str(py)
    return "python3"


def _python_deps_text(project: Path) -> str:
    parts: list[str] = []
    pyproject = project / "pyproject.toml"
    if pyproject.is_file():
        try:
            parts.append(pyproject.read_text(errors="ignore"))
        except OSError:
            pass
    for req in project.glob("requirements*.txt"):
        try:
            parts.append(req.read_text(errors="ignore"))
        except OSError:
            pass
    return "\n".join(parts).lower()


def _iter_py_files(project: Path, limit_per_dir: int = 25) -> list[Path]:
    """Shallow .py search: project root + one level into common code dirs."""
    out: list[Path] = []
    dirs = [project]
    for sub in ("app", "api", "src", "server", "backend", project.name):
        d = project / sub
        if d.is_dir():
            dirs.append(d)
    for d in dirs:
        try:
            for f in sorted(d.glob("*.py"))[:limit_per_dir]:
                try:
                    if f.stat().st_size <= 500_000:
                        out.append(f)
                except OSError:
                    continue
        except OSError:
            continue
    return out


def _find_app_target(project: Path, framework_pattern: str) -> tuple[str, str] | None:
    """Return (module_path, var_name) for the first .py matching framework_pattern.
    module_path is dotted, .py stripped, leading 'src.' removed."""
    rx = re.compile(framework_pattern)
    for f in _iter_py_files(project):
        try:
            text = f.read_text(errors="ignore")
        except OSError:
            continue
        m = rx.search(text)
        if not m:
            continue
        var = m.group(1) if m.groups() else "app"
        rel = f.relative_to(project).with_suffix("")
        mod = ".".join(rel.parts)
        if mod.startswith("src."):
            mod = mod[4:]
        return (mod, var)
    return None


def _python_recipe(project: Path) -> tuple[str, list[str], int, str] | None:
    """Return (command, args, port, framework) for a Python webapp, or None."""
    deps = _python_deps_text(project)
    interp = _python_interpreter(project)

    # Django: manage.py + django dep
    if (project / "manage.py").is_file() and "django" in deps:
        return (interp, ["manage.py", "runserver", "127.0.0.1:8000"], 8000, "django")

    # FastAPI / Starlette (uvicorn)
    if "fastapi" in deps or "starlette" in deps:
        target = _find_app_target(project, r"(\w+)\s*=\s*(?:FastAPI|Starlette)\s*\(")
        if target:
            mod, var = target
            return (interp, ["-m", "uvicorn", f"{mod}:{var}",
                             "--host", "127.0.0.1", "--port", "8000"], 8000, "fastapi")

    # Flask
    if "flask" in deps:
        target = _find_app_target(project, r"(\w+)\s*=\s*Flask\s*\(")
        if target:
            mod, var = target
            return (interp, ["-m", "flask", "--app", f"{mod}:{var}",
                             "run", "--host", "127.0.0.1", "--port", "5000"], 5000, "flask")

    # Streamlit: needs an entry file
    if "streamlit" in deps:
        entry: Path | None = None
        for candidate_name in ("streamlit_app.py", "app.py", "home.py", "🏠_home.py", "main.py"):
            p = project / candidate_name
            if p.is_file():
                entry = p
                break
        if entry is None:
            for f in _iter_py_files(project):
                try:
                    if "import streamlit" in f.read_text(errors="ignore"):
                        entry = f
                        break
                except OSError:
                    continue
        if entry is not None:
            streamlit_bin = "streamlit"
            for venv in (".venv", "venv", "env"):
                b = project / venv / "bin" / "streamlit"
                if b.exists():
                    streamlit_bin = str(b)
                    break
            return (streamlit_bin, ["run", str(entry),
                                    "--server.port", "8501", "--server.address", "127.0.0.1"], 8501, "streamlit")

    return None


def _collect_project_dirs(root: Path, max_depth: int = 4, max_dirs: int = 1500) -> list[Path]:
    """Dirs that look like project roots. BFS so a bushy non-project branch can't
    starve its siblings; descends until it finds a project (has a marker file),
    then does NOT descend into it. Bounded; skips noise."""
    markers = ("package.json", "pyproject.toml")
    skip = {"node_modules", ".git", ".venv", "venv", "env", "__pycache__",
            "dist", "build", ".next", ".cache", "target", "site-packages"}
    out: list[Path] = []
    visited: set[str] = set()
    queue: deque[tuple[Path, int]] = deque([(root, 0)])
    while queue and len(visited) < max_dirs:
        d, depth = queue.popleft()
        try:
            key = str(d.resolve())
        except OSError:
            continue
        if key in visited:
            continue
        visited.add(key)
        try:
            entries = list(d.iterdir())
        except OSError:
            continue
        if any((d / m).is_file() for m in markers) or any(d.glob("requirements*.txt")):
            out.append(d)
            continue  # don't descend into a project
        if depth >= max_depth:
            continue
        for e in entries:
            if not e.is_dir() or e.name.startswith(".") or e.name in skip:
                continue
            queue.append((e, depth + 1))
    return out


def _recipe_in_dir(cdir: Path) -> StaticProject | None:
    """Detect a JS or Python webapp recipe in a single directory."""
    pkg = cdir / "package.json"
    if pkg.is_file():
        try:
            data = json.loads(pkg.read_text(errors="ignore"))
            deps = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}
            scripts = data.get("scripts") or {}
            for marker, default_port in JS_WEB_MARKERS:
                if marker in deps:
                    script = "dev" if "dev" in scripts else ("start" if "start" in scripts else None)
                    if script:
                        configured_port = _configured_js_port(cdir, str(scripts.get(script) or ""))
                        port = configured_port or default_port
                        return StaticProject(
                            cwd=str(cdir), port=port, command="npm",
                            args=("run", script),
                            framework=marker,
                            note=(f"js:{marker} npm run {script} "
                                  f"({'configured' if configured_port else 'inferred'} port)"),
                        )
                    break
        except ValueError:
            pass
    if (cdir / "pyproject.toml").is_file() or any(cdir.glob("requirements*.txt")):
        recipe = _python_recipe(cdir)
        if recipe:
            cmd, args, port, framework = recipe
            return StaticProject(
                cwd=str(cdir), port=port, command=cmd, args=tuple(args),
                framework=framework,
                note=f"python:{framework} (inferred port — verify)",
            )
    return None


def recipe_for_dir(cdir: Path) -> StaticProject | None:
    """Detect a webapp launch recipe at an arbitrary project dir (JS or Python).
    Used by find_static_projects (scan-all broad walk) and add.py (add-one targeted).
    Descends one level into common webapp subdirs for monorepo layouts."""
    recipes = recipes_for_dir(cdir)
    return recipes[0] if recipes else None


def recipes_for_dir(cdir: Path) -> list[StaticProject]:
    """Return the launch set for a project.

    A root-level recipe wins because monorepo tools commonly orchestrate their
    own children. Otherwise collect the conventional frontend/backend child
    projects so add.py can generate one process-group-managed bundle.
    """
    root_recipe = _recipe_in_dir(cdir)
    if root_recipe:
        return [root_recipe]

    recipes: list[StaticProject] = []
    seen: set[tuple[str, int]] = set()
    for sub in ("web", "frontend", "client", "ui", "site", "app", "server", "backend", "api"):
        sd = cdir / sub
        if not sd.is_dir():
            continue
        recipe = _recipe_in_dir(sd)
        if not recipe:
            continue
        key = (recipe.cwd, recipe.port)
        if key not in seen:
            seen.add(key)
            recipes.append(recipe)
    return recipes


def recipe_for_port(port: int) -> Candidate | None:
    """Find the process listening on `port` and capture its launch recipe from /proc."""
    for l in listening_ports():
        if l.port != port:
            continue
        joined = " ".join(l.cmdline)
        if any(deny in joined for deny in CMDLINE_DENYLIST):
            return None
        cmd0 = l.cmdline[0] if l.cmdline else ""
        if cmd0 and not os.path.isabs(cmd0) and "/" in cmd0 and l.cwd:
            abs0 = os.path.normpath(os.path.join(l.cwd, cmd0))
            if Path(abs0).exists():
                cmd0 = abs0
        if cmd0 and _launchable_command(cmd0):
            dev_rel = dev_root_of(l.cwd)
            return Candidate(
                name=(Path(l.cwd).name + " (dev)") if dev_rel else l.name,
                source=f"cmdline:{dev_rel}" if dev_rel else f"cmdline:{l.name}",
                port=l.port, command=cmd0, args=l.cmdline[1:], cwd=l.cwd,
                running=True, registerable=True, already_registered=False,
                dev=bool(dev_rel),
                note="running externally — stop it before daemon-starting (port conflict)",
            )
        recovered = _recover_recipe(l.cwd)
        if recovered:
            cmd, rargs = recovered
            return Candidate(
                name=(Path(l.cwd).name + " (dev)") if l.cwd else l.name,
                source=f"recipe:{l.cwd}", port=l.port, command=cmd, args=list(rargs),
                cwd=l.cwd, running=True, registerable=True, already_registered=False,
                dev=True,
                note="rebuilt `npm run dev` from project (raw cmdline hidden by process.title)",
            )
        return None
    return None


def find_static_projects() -> list[StaticProject]:
    """Static scan of DEV_ROOTS for webapp projects (running or not), JS + Python."""
    found: list[StaticProject] = []
    seen_dirs: set[str] = set()
    for root in DEV_ROOTS:
        rp = expand(root)
        if not rp.is_dir():
            continue
        for cdir in _collect_project_dirs(rp):
            key = str(cdir)
            if key in seen_dirs:
                continue
            seen_dirs.add(key)
            proj = recipe_for_dir(cdir)
            if proj:
                found.append(proj)
    return found


def fetch_app_icon(base_url: str, timeout: float = 3.0) -> tuple[bytes, str] | None:
    """Fetch a running local app's own icon. Returns (bytes, mime) or None.

    Python fetching loopback is not CORS-gated (unlike the browser), so this runs
    at registration time. Tries <link rel=icon>/<link rel=apple-touch-icon> in the
    page first, then /favicon.ico. Best-effort; never raises.
    """
    def _get(url: str) -> tuple[bytes, str]:
        req = urllib.request.Request(url, headers={"User-Agent": "vibe-scan"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(), (r.headers.get("content-type") or "").split(";")[0].strip()

    def _guess_mime(url: str) -> str:
        p = url.split("?")[0].lower()
        if p.endswith(".svg"): return "image/svg+xml"
        if p.endswith(".ico"): return "image/x-icon"
        if p.endswith(".png"): return "image/png"
        if p.endswith(".jpg") or p.endswith(".jpeg"): return "image/jpeg"
        if p.endswith(".webp"): return "image/webp"
        return "image/png"

    def _accept(blob: bytes, ct: str, ext_hint: str) -> tuple[bytes, str] | None:
        # Reject non-image responses — a misconfigured app serves its HTML 404
        # page for /favicon.ico, which must not be embedded as an "icon".
        mime = (ct or _guess_mime(ext_hint)).split(";")[0].strip().lower()
        if not mime.startswith("image/") or not blob:
            return None
        return blob, mime

    try:
        html_bytes, _ = _get(base_url)
        text = html_bytes.decode("utf-8", "replace")[:200_000]
        hrefs: list[str] = []
        for tag in re.findall(r"<link\b[^>]*>", text, re.IGNORECASE):
            rel = re.search(r'rel\s*=\s*["\']([^"\']+)["\']', tag, re.IGNORECASE)
            if not rel or "icon" not in rel.group(1).lower():
                continue
            href = re.search(r'href\s*=\s*["\']([^"\']+)["\']', tag, re.IGNORECASE)
            if href:
                hrefs.append(href.group(1))
        for href in hrefs:
            try:
                blob, ct = _get(urljoin(base_url, href))
                got = _accept(blob, ct, href)
                if got:
                    return got
            except Exception:
                continue
    except Exception:
        pass

    try:
        blob, ct = _get(base_url.rstrip("/") + "/favicon.ico")
        got = _accept(blob, ct, "favicon.ico")
        if got:
            return got
    except Exception:
        pass
    return None


def icon_data_url(blob: bytes, mime: str) -> str:
    """Wrap raw icon bytes as a data URL the daemon can store in `iconUrl`."""
    return f"data:{mime or 'image/png'};base64,{base64.b64encode(blob).decode('ascii')}"


def scan() -> list[Candidate]:
    root = find_project_root()
    listeners = listening_ports()
    listeners_by_port = {l.port: l for l in listeners}
    pips = pip_packages()
    pacmans = pacman_packages()
    registered = daemon_registered_ports(root)

    ep = daemon_endpoint(root)
    daemon_port = ep[0] if ep else None
    project_root_str = str(root) if root else None

    def is_self(port: int, cwd: str | None) -> bool:
        if daemon_port and port == daemon_port:
            return True
        if project_root_str and cwd and (cwd == project_root_str or cwd.startswith(project_root_str + os.sep)):
            return True
        return False

    candidates: list[Candidate] = []
    seen_ports: set[int] = set()
    seen_cwds: set[str] = set()

    # 1) Catalog matches -> launchable (found even when stopped).
    for app in CATALOG:
        hit_dir: Path | None = None
        for d in app.dirs:
            p = expand(d)
            if p.exists():
                hit_dir = p
                break
        hit_pkg = any(p in pips or p in pacmans for p in app.packages)
        hit_bin = any(shutil.which(b) for b in app.binaries)
        if not (hit_dir or hit_pkg or hit_bin):
            continue
        source_bits = []
        if hit_bin:
            b = next(b for b in app.binaries if shutil.which(b))
            source_bits.append(f"which:{b}")
        if hit_pkg:
            source_bits.append("pkg")
        if hit_dir:
            source_bits.append(f"dir:{hit_dir}")
        registerable = bool(app.command)
        running = app.default_port in listeners_by_port
        cwd_val = str(hit_dir) if (app.cwd_from_dir and hit_dir) else None
        candidates.append(Candidate(
            name=app.name,
            source="+".join(source_bits),
            port=app.default_port,
            command=app.command or None,
            args=list(app.args),
            cwd=cwd_val,
            running=running,
            registerable=registerable,
            already_registered=app.default_port in registered,
            dev=False,
            note=("needs a target app script to launch" if not registerable
                  else ("running" if running else "stopped (launchable)")),
        ))
        seen_ports.add(app.default_port)
        if cwd_val:
            seen_cwds.add(cwd_val)

    # 2) Running processes -> capture their launch recipe from /proc.
    for l in sorted(listeners, key=lambda x: x.port):
        if l.port in seen_ports or l.port in SYSTEM_SKIP_PORTS:
            continue
        if is_self(l.port, l.cwd):
            continue
        if l.name in SKIP_PROC_NAMES:
            continue
        if not _is_http_listener(l.port):
            continue
        joined = " ".join(l.cmdline)
        if any(deny in joined for deny in CMDLINE_DENYLIST):
            # not a real webapp (kernel socket etc.) -> bookmark only
            candidates.append(_bookmark_candidate(l, registered))
            continue

        cmd0 = l.cmdline[0] if l.cmdline else ""
        # Resolve a project-relative interpreter (e.g. ".venv/bin/python") against cwd.
        if cmd0 and not os.path.isabs(cmd0) and "/" in cmd0 and l.cwd:
            abs0 = os.path.normpath(os.path.join(l.cwd, cmd0))
            if Path(abs0).exists():
                cmd0 = abs0
        if cmd0 and _launchable_command(cmd0):
            dev_rel = dev_root_of(l.cwd)
            name = (Path(l.cwd).name + " (dev)") if dev_rel else l.name
            source = f"cmdline:{dev_rel}" if dev_rel else f"cmdline:{l.name}"
            candidates.append(Candidate(
                name=name,
                source=source,
                port=l.port,
                command=cmd0,
                args=l.cmdline[1:],
                cwd=l.cwd,
                running=True,
                registerable=True,
                already_registered=l.port in registered,
                dev=bool(dev_rel),
                note=("your project, running externally — recipe captured; "
                      "stop the external process before daemon-starting (port conflict)")
                      if dev_rel else
                      "running externally — recipe captured; stop it before daemon-starting",
            ))
            seen_ports.add(l.port)
            if l.cwd:
                seen_cwds.add(l.cwd)
        else:
            recovered = _recover_recipe(l.cwd)
            if recovered:
                rcmd, rargs = recovered
                dev_rel = dev_root_of(l.cwd)
                candidates.append(Candidate(
                    name=Path(l.cwd).name + " (dev)" if l.cwd else l.name,
                    source=f"recipe:{dev_rel or l.cwd}",
                    port=l.port,
                    command=rcmd,
                    args=rargs,
                    cwd=l.cwd,
                    running=True,
                    registerable=True,
                    already_registered=l.port in registered,
                    dev=True,
                    note="rebuilt `npm run dev` from project (raw cmdline hidden by process.title)",
                ))
                seen_ports.add(l.port)
                if l.cwd:
                    seen_cwds.add(l.cwd)
            else:
                candidates.append(_bookmark_candidate(l, registered))
                seen_ports.add(l.port)

    # 3) Static dev-roots scan -> user projects that may NOT be running.
    for proj in find_static_projects():
        if proj.cwd in seen_cwds or proj.port in seen_ports:
            continue
        if project_root_str and (proj.cwd == project_root_str or proj.cwd.startswith(project_root_str + os.sep)):
            continue  # don't suggest registering Vibe Desktop itself
        running = proj.port in listeners_by_port
        rel = dev_root_of(proj.cwd) or proj.cwd
        candidates.append(Candidate(
            name=Path(proj.cwd).name,
            source=f"project:{rel}",
            port=proj.port,
            command=proj.command,
            args=list(proj.args),
            cwd=proj.cwd,
            running=running,
            registerable=True,
            already_registered=proj.port in registered,
            dev=True,
            note=("running" if running else "stopped ") + f"; {proj.note}",
        ))
        seen_ports.add(proj.port)
        seen_cwds.add(proj.cwd)

    # 4) Docker containers with published ports -> bookmark only.
    for name, ports in docker_containers():
        for port in ports:
            if port in seen_ports or port in listeners_by_port or port in SYSTEM_SKIP_PORTS:
                continue
            candidates.append(Candidate(
                name=f"docker:{name}",
                source=f"docker:{name}:{port}",
                port=port,
                command=None,
                args=[],
                cwd=None,
                running=True,
                registerable=False,
                already_registered=port in registered,
                dev=False,
                note="docker container; add as URL bookmark for an icon",
            ))

    # Capture each running launchable app's own favicon at scan time so it can be
    # embedded in the registration POST (icon on the desktop immediately, even
    # before the app is started again). Loopback fetch in Python is not CORS-gated.
    resolved: list[Candidate] = []
    for c in candidates:
        if c.running and c.registerable and c.port and not c.icon:
            fetched = fetch_app_icon(f"http://localhost:{c.port}")
            if fetched:
                blob, mime = fetched
                c = replace(c, icon_kind="favicon", icon=icon_data_url(blob, mime))
        resolved.append(c)
    return resolved


def _bookmark_candidate(l: Listener, registered: set[int]) -> Candidate:
    return Candidate(
        name=l.name,
        source=f"port:{l.port}",
        port=l.port,
        command=None,
        args=[],
        cwd=None,
        running=True,
        registerable=False,
        already_registered=l.port in registered,
        dev=False,
        note="running service; add as URL bookmark (Add App) for an icon",
    )


def main() -> int:
    cands = scan()
    launchable = [c for c in cands if c.registerable and not c.already_registered]
    mine = [c for c in launchable if c.dev]
    info = [c for c in cands if not c.registerable and not c.already_registered]
    already = [c for c in cands if c.already_registered]
    print(
        f"[vibe-scan] {len(cands)} candidate(s): {len(launchable)} launchable "
        f"({len(mine)} look like your own projects), {len(info)} bookmark-only, "
        f"{len(already)} already registered.",
        file=sys.stderr,
    )
    json.dump([asdict(c) for c in cands], sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
