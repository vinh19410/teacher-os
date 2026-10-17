#!/usr/bin/env python3
"""teacher-os ai-handle webhook receiver.

Fast-path trigger for the board-driven watcher (tools/ai-handle/watch.sh).
It listens locally and accepts GitHub webhooks ONLY when every check passes:

  1. Signature: X-Hub-Signature-256 must equal
     "sha256=" + hex(HMAC-SHA256(shared_secret, raw_body)), compared in
     constant time. Anything else is rejected before any processing.
  2. Repository: payload repository.full_name must be in the allowlist.
  3. Event/action: X-GitHub-Event == "issues" and payload.action == "labeled"
     (the "ping" handshake event is acknowledged with 200 "pong").
  4. Label: the added label must be the configured ai-handle label and the
     issue must be open.

On success it spawns `watch.sh --issue <number>`, which re-verifies repo,
label and board Status ("Ready") through the authenticated GitHub API before
claiming. Failures return 2xx "ignored" for valid but irrelevant events so
GitHub does not retry or disable the hook, and 4xx/5xx for real problems.

The shared secret is read from GITHUB_WEBHOOK_SECRET or
~/.config/teacher-os-ai-handle/github-webhook-secret (never committed).

Env overrides: TEACHER_OS_AI_HANDLE_{WEBHOOK_PORT,LABEL,STATE_DIR,CONFIG_DIR,
WATCH_SH,WEBHOOK_DRY_RUN}.
"""

import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("TEACHER_OS_AI_HANDLE_WEBHOOK_PORT", "8897"))
LABEL = os.environ.get("TEACHER_OS_AI_HANDLE_LABEL", "ai-handle")
STATE_DIR = Path(os.environ.get(
    "TEACHER_OS_AI_HANDLE_STATE_DIR", Path.home() / ".local/state/teacher-os-ai-handle"))
CONFIG_DIR = Path(os.environ.get(
    "TEACHER_OS_AI_HANDLE_CONFIG_DIR", Path.home() / ".config/teacher-os-ai-handle"))
WATCH_SH = Path(os.environ.get(
    "TEACHER_OS_AI_HANDLE_WATCH_SH",
    Path.home() / ".local/lib/teacher-os-ai-handle/watch.sh"))
DRY_RUN = os.environ.get("TEACHER_OS_AI_HANDLE_WEBHOOK_DRY_RUN") == "1"

# Repos this receiver may enqueue work for. Anything else: ignore.
ALLOWLIST = {"vinh19410/teacher-os"}
SECRET_FILE = CONFIG_DIR / "github-webhook-secret"
LOG_FILE = STATE_DIR / "webhook-receiver.log"
MAX_BODY = 1_000_000  # 1 MB is generous for issue events


def shared_secret() -> bytes:
    value = os.environ.get("GITHUB_WEBHOOK_SECRET")
    if value:
        return value.encode()
    try:
        return SECRET_FILE.read_bytes().strip()
    except OSError:
        return b""


def log(message: str) -> None:
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%S%z')} {message}"
    print(line, flush=True)
    try:
        with LOG_FILE.open("a") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


class Handler(BaseHTTPRequestHandler):
    server_version = "teacher-os-ai-handle/1.0"

    def _respond(self, code: int, body: str) -> None:
        payload = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):  # noqa: N802 - http.server API
        self._respond(200, "teacher-os ai-handle receiver up\n")

    def do_POST(self):  # noqa: N802 - http.server API
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            log(f"reject: bad body length {length}")
            self._respond(413, "bad body length")
            return
        raw = self.rfile.read(length)

        secret = shared_secret()
        if not secret:
            log("reject: no webhook secret configured (fail closed)")
            self._respond(503, "receiver not configured")
            return
        signature = self.headers.get("X-Hub-Signature-256") or ""
        expected = "sha256=" + hmac.new(secret, raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            log("reject: invalid X-Hub-Signature-256")
            self._respond(401, "invalid signature")
            return

        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            log("reject: body is not JSON (but was signed)")
            self._respond(400, "invalid JSON")
            return

        event = self.headers.get("X-GitHub-Event") or ""
        if event == "ping":
            log("accept: ping")
            self._respond(200, "pong")
            return
        if event != "issues":
            log(f"ignore: event {event!r}")
            self._respond(200, "ignored")
            return

        action = payload.get("action")
        repo = (payload.get("repository") or {}).get("full_name")
        label = (payload.get("label") or {}).get("name")
        issue = payload.get("issue") or {}
        number = issue.get("number")
        state = issue.get("state")

        if action != "labeled":
            log(f"ignore: issues.{action}")
            self._respond(200, "ignored")
            return
        if repo not in ALLOWLIST:
            log(f"ignore: repo {repo!r} not in allowlist")
            self._respond(200, "ignored")
            return
        if label != LABEL:
            log(f"ignore: label {label!r} != {LABEL!r}")
            self._respond(200, "ignored")
            return
        if state != "open" or not isinstance(number, int):
            log(f"ignore: issue {number} state {state!r}")
            self._respond(200, "ignored")
            return

        # All checks passed. watch.sh re-verifies repo/label/board status
        # against the authenticated API and claims via the board, so a
        # duplicate webhook or a racing scheduler cannot double-run.
        cmd = ["bash", str(WATCH_SH), "--issue", str(number)]
        if DRY_RUN:
            log(f"dry-run: would spawn {cmd}")
            self._respond(202, "dry-run accepted")
            return
        try:
            logfh = LOG_FILE.open("a")
            subprocess.Popen(
                cmd, stdin=subprocess.DEVNULL, stdout=logfh,
                stderr=subprocess.STDOUT, start_new_session=True)
        except OSError as exc:
            log(f"error: spawn failed for issue #{number}: {exc}")
            self._respond(500, "spawn failed")
            return
        log(f"accept: issue #{number} ({repo}) labeled {label!r} -> watch.sh --issue {number}")
        self._respond(202, "accepted")

    def log_message(self, fmt, *args):  # quiet default access log
        pass


def main() -> int:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not WATCH_SH.exists():
        log(f"fatal: watch.sh not found at {WATCH_SH}")
        return 1
    if not shared_secret():
        log("fatal: no webhook secret (GITHUB_WEBHOOK_SECRET or "
            f"{SECRET_FILE}) — refusing to start")
        return 1
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    log(f"listening on 127.0.0.1:{PORT} label={LABEL!r} allowlist={sorted(ALLOWLIST)}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
