from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import add
import manager
import scan


class AddAppRecipeTests(unittest.TestCase):
    def test_vite_configured_port_is_detected_and_forced_strictly(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp)
            (project / "package.json").write_text(json.dumps({
                "scripts": {"dev": "vite"},
                "devDependencies": {"vite": "1.0.0"},
            }))
            (project / "vite.config.ts").write_text(
                "export default { server: { port: 3000 }, proxy: { target: 'http://localhost:9000' } };"
            )

            recipe = scan.recipe_for_dir(project)

            self.assertIsNotNone(recipe)
            assert recipe is not None
            self.assertEqual(recipe.port, 3000)
            self.assertEqual(recipe.framework, "vite")
            self.assertIn("configured port", recipe.note)
            self.assertEqual(add._port_override_args(recipe.framework, 3003), [
                "--", "--port", "3003", "--strictPort",
            ])

    def test_package_script_port_beats_framework_default(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp)
            (project / "package.json").write_text(json.dumps({
                "scripts": {"dev": "vite --port=4310"},
                "devDependencies": {"vite": "1.0.0"},
            }))

            recipe = scan.recipe_for_dir(project)

            self.assertIsNotNone(recipe)
            assert recipe is not None
            self.assertEqual(recipe.port, 4310)

    def test_multiservice_project_collects_frontend_then_backend(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp)
            frontend = project / "frontend"
            backend = project / "backend"
            frontend.mkdir()
            backend.mkdir()
            (frontend / "package.json").write_text(json.dumps({
                "scripts": {"dev": "vite --port 4311"},
                "devDependencies": {"vite": "1.0.0"},
            }))
            (backend / "requirements.txt").write_text("fastapi\nuvicorn\n")
            (backend / "app.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n")

            recipes = scan.recipes_for_dir(project)

            self.assertEqual([recipe.framework for recipe in recipes], ["vite", "fastapi"])
            self.assertEqual([recipe.port for recipe in recipes], [4311, 8000])

    def test_root_orchestrator_wins_over_child_recipes(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp)
            frontend = project / "frontend"
            frontend.mkdir()
            package = {"scripts": {"dev": "vite"}, "devDependencies": {"vite": "1.0.0"}}
            (project / "package.json").write_text(json.dumps(package))
            (frontend / "package.json").write_text(json.dumps(package))

            recipes = scan.recipes_for_dir(project)

            self.assertEqual(len(recipes), 1)
            self.assertEqual(recipes[0].cwd, str(project))


class ManagedBundleTests(unittest.TestCase):
    def test_writes_private_manifest_and_executable_wrapper(self) -> None:
        with tempfile.TemporaryDirectory() as temp, mock.patch.dict(
            os.environ, {"VIBE_MANAGED_APPS_DIR": str(Path(temp) / "managed")}
        ):
            project = Path(temp) / "project with spaces"
            project.mkdir()
            manifest = manager.build_manifest("Full Stack", str(project), [{
                "name": "frontend",
                "command": "npm",
                "args": ["run", "dev", "--", "--title", "hello world"],
                "cwd": str(project),
                "port": 4312,
                "framework": "vite",
            }, {
                "name": "backend",
                "command": "python3",
                "args": ["-m", "http.server", "8312"],
                "cwd": str(project),
                "port": 8312,
                "framework": "python",
            }])

            manifest_path, wrapper_path = manager.write_bundle(manifest)

            stored = json.loads(manifest_path.read_text())
            self.assertEqual(stored["primaryPort"], 4312)
            self.assertEqual(len(stored["services"]), 2)
            self.assertEqual(manifest_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(wrapper_path.stat().st_mode & 0o777, 0o700)
            wrapper = wrapper_path.read_text()
            self.assertIn("wait -n", wrapper)
            self.assertIn("'hello world'", wrapper)
            self.assertIn("trap cleanup EXIT", wrapper)
            self.assertLess(wrapper.index("starting backend"), wrapper.index("starting frontend"))

    def test_plan_flag_does_not_imply_start(self) -> None:
        target, start, plan = add.parse_target(["/tmp/example", "--plan"])
        self.assertEqual(target, ("path", "/tmp/example"))
        self.assertFalse(start)
        self.assertTrue(plan)

    def test_registration_error_removes_generated_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temp, mock.patch.dict(
            os.environ, {"VIBE_MANAGED_APPS_DIR": str(Path(temp) / "managed")}
        ):
            project = Path(temp) / "project"
            project.mkdir()
            prepared = {
                "name": "Failure fixture",
                "projectRoot": str(project),
                "services": [{
                    "name": "web", "command": "python3", "args": ["server.py"],
                    "cwd": str(project), "port": 4313, "framework": "python",
                }],
                "_daemon": {"port": 7780, "token": "not-a-real-token"},
                "_listening": set(),
            }
            target = manager.bundle_dir(prepared["name"], prepared["projectRoot"])
            with mock.patch.object(
                add.urllib.request, "urlopen", side_effect=add.urllib.error.URLError("offline")
            ):
                with self.assertRaises(add.urllib.error.URLError):
                    add.register(prepared)
            self.assertFalse(target.exists())

    def test_failed_start_invokes_registration_rollback(self) -> None:
        bundle = {
            "name": "fixture", "projectRoot": "/tmp/fixture",
            "services": [{"name": "web", "command": "node", "args": [], "cwd": "/tmp/fixture", "port": 4314}],
        }
        prepared = {**bundle, "_daemon": {}, "_listening": set()}
        manifest_path = Path("/tmp/not-written/manifest.json")
        with (
            mock.patch.object(add.sys, "argv", ["add.py", "/tmp/fixture", "--start"]),
            mock.patch.object(add, "resolve", return_value=(bundle, "fixture")),
            mock.patch.object(add, "prepare", return_value=prepared),
            mock.patch.object(add, "register", return_value=({"id": "app-1"}, manifest_path)),
            mock.patch.object(add, "control", return_value=False),
            mock.patch.object(add, "rollback_registration") as rollback,
        ):
            self.assertEqual(add.main(), 1)
        rollback.assert_called_once_with("app-1", manifest_path)


class ListenerFilteringTests(unittest.TestCase):
    def test_accepts_a_real_http_response(self) -> None:
        response = mock.Mock(status=200)
        response.read.return_value = b"<!doctype html><title>Local app</title>"
        response.getheader.return_value = "text/html; charset=utf-8"
        connection = mock.Mock()
        connection.getresponse.return_value = response
        with mock.patch.object(scan.http.client, "HTTPConnection", return_value=connection):
            self.assertTrue(scan._is_http_listener(4321))
        connection.request.assert_called_once()
        response.read.assert_called_once_with(512)
        connection.close.assert_called_once()

    def test_rejects_an_api_only_http_service(self) -> None:
        response = mock.Mock(status=200)
        response.read.return_value = b'{"ok":true}'
        response.getheader.return_value = "application/json"
        connection = mock.Mock()
        connection.getresponse.return_value = response
        with mock.patch.object(scan.http.client, "HTTPConnection", return_value=connection):
            self.assertFalse(scan._is_http_listener(7780))
        connection.close.assert_called_once()

    def test_rejects_a_non_http_listener(self) -> None:
        connection = mock.Mock()
        connection.getresponse.side_effect = scan.http.client.BadStatusLine("SSH-2.0")
        with mock.patch.object(scan.http.client, "HTTPConnection", return_value=connection):
            self.assertFalse(scan._is_http_listener(22))
        connection.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
