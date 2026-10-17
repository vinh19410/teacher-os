#!/usr/bin/env python3
"""teacher-os ai-handle dashboard: watch and steer the pipeline from a browser.

Serves dashboard.html and a small JSON/SSE API on 127.0.0.1 only. Everything it
shows is read from the local state watch.sh writes (state.json, running/,
logs/, evidence/, ledger.db, outbox.jsonl); GitHub is queried only for the
detail view of one issue. Every state-changing action goes back through the
deployed watch.sh (or launchctl / watch.conf), so watch.sh's own locks and
refusals stay the authority.

Protection: loopback bind, Host must be 127.0.0.1/localhost:<port> (DNS
rebinding), POST needs the per-start token embedded in the page, a matching
Origin when present and Content-Type application/json. Clients never send a
path: files are derived from an issue number, an attempt number or a fixed
log name, and paths taken from state.json must resolve inside the state dir.

Env: TEACHER_OS_AI_HANDLE_{STATE_DIR,CONFIG_DIR,DASHBOARD_PORT,WATCH_SH,LAUNCHCTL,GH,
HEARTBEAT_SECS}.
"""

import hmac
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ledger  # noqa: E402

REPO = "vinh19410/teacher-os"
POLLER_LABEL = "com.teacheros.ai-handle"
MAX_KEY = "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT"
DEFAULT_MAX_CONCURRENT = "3"
NUM = re.compile(r"^[0-9]{1,6}$")
SINCE = re.compile(r"^[0-9]{1,4}[dhm]$")
PR_URL = re.compile(r"^https://github\.com/vinh19410/teacher-os/pull/[0-9]+$")
SYSTEM_LOGS = {"launchd": "launchd.out.log", "workers": "logs/workers.log"}
EVIDENCE_JSON = ("checks.json", "delta.json")
EVIDENCE_TEXT = ("llm.status", "evidence.flag", "comment.md", "risk-comment.md")
LEDGER_FIELDS = ("attempt", "stage", "outcome", "failure_cause", "risk", "duration_s",
                 "tokens_in", "tokens_out", "cost_usd", "ended_at")
TOKEN_PLACEHOLDER = "__DASHBOARD_TOKEN__"
CSP = ("default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; "
       "connect-src 'self'; frame-ancestors 'none'")
BACKFILL = 64 * 1024     # bytes of log sent when a stream opens
TEXT_LIMIT = 64 * 1024   # cap for evidence text and command output
MAX_BODY = 4096
CMD_TIMEOUT = 120
GH_TIMEOUT = 20
GH_CACHE_SECS = 30
SSE_TICK = 1.0
SSE_RESOLVE_SECS = 5
SSE_PING_SECS = 15


# --- configuration (read per call so tests can point it elsewhere) ----------
def state_dir():
    return Path(os.environ.get("TEACHER_OS_AI_HANDLE_STATE_DIR")
                or Path.home() / ".local/state/teacher-os-ai-handle")


def config_dir():
    return Path(os.environ.get("TEACHER_OS_AI_HANDLE_CONFIG_DIR")
                or Path.home() / ".config/teacher-os-ai-handle")


def watch_sh():
    return os.environ.get("TEACHER_OS_AI_HANDLE_WATCH_SH") or str(HERE / "watch.sh")


def launchctl_bin():
    return os.environ.get("TEACHER_OS_AI_HANDLE_LAUNCHCTL") or "launchctl"


def gh_bin():
    return os.environ.get("TEACHER_OS_AI_HANDLE_GH") or "gh"


def heartbeat_secs():
    try:
        return int(os.environ.get("TEACHER_OS_AI_HANDLE_HEARTBEAT_SECS") or 60)
    except ValueError:
        return 60


class StateError(Exception):
    pass


# --- small file helpers -----------------------------------------------------
def read_text(path, limit=TEXT_LIMIT):
    try:
        with open(path, "rb") as fh:
            data = fh.read(limit + 1)
    except OSError:
        return None
    text = data[:limit].decode("utf-8", errors="replace")
    return text + "\n… (truncated)" if len(data) > limit else text


def read_json(path):
    text = read_text(path, 4 * TEXT_LIMIT)
    if text is None:
        return None
    try:
        return json.loads(text)
    except ValueError as exc:
        return {"error": "invalid JSON: %s" % exc}


def read_int(path):
    text = read_text(path, 64)
    try:
        return int((text or "").strip())
    except ValueError:
        return None


def safe_path(value):
    """A path from state.json, only if it resolves inside the state dir."""
    if not value or not isinstance(value, str):
        return None
    try:
        resolved = Path(value).resolve()
        resolved.relative_to(state_dir().resolve())
    except (OSError, ValueError):
        return None
    return resolved


def atomic_write(path, text, mode=None):
    path = Path(path)
    tmp = path.with_name(".%s.tmp.%d" % (path.name, os.getpid()))
    with open(tmp, "w") as fh:
        fh.write(text)
    if mode is not None:
        os.chmod(tmp, mode)
    os.replace(tmp, path)


# --- runs and locks ---------------------------------------------------------
def load_runs():
    path = state_dir() / "state.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError) as exc:
        raise StateError("cannot read state.json: %s" % exc)
    runs = data.get("runs") if isinstance(data, dict) else None
    return runs if isinstance(runs, dict) else {}


def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def proc_is_watcher(pid):
    """Same rule as watch.sh: the pid still runs watch.sh (not a recycled pid)."""
    try:
        out = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True,
                             text=True, timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        return False
    return "watch.sh" in out


def lock_info(lock_dir, now):
    pid = read_int(lock_dir / "pid")
    heartbeat = read_int(lock_dir / "heartbeat")
    if pid:
        alive = pid_alive(pid) and proc_is_watcher(pid)
    else:
        # The dispatcher writes pid right after mkdir; give it 30s like watch.sh.
        try:
            alive = now - lock_dir.stat().st_mtime <= 30
        except OSError:
            alive = False
    age = now - heartbeat if heartbeat else None
    return {
        "pid": pid, "alive": alive, "orphan": not alive,
        "heartbeat_age": age, "started": read_int(lock_dir / "started"),
        "stale": bool(alive and age is not None and age > 3 * heartbeat_secs()),
    }


def list_locks(now=None):
    now = now or int(time.time())
    running = state_dir() / "running"
    locks = {}
    if not running.is_dir():
        return locks
    for d in sorted(running.glob("issue-*")):
        n = d.name[len("issue-"):]
        if not d.is_dir() or d.name.endswith(".break") or not NUM.match(n):
            continue
        locks[n] = lock_info(d, now)
    return locks


# --- watch.conf (pause/resume) ----------------------------------------------
def conf_path():
    return config_dir() / "watch.conf"


def conf_max_concurrent():
    """First TEACHER_OS_AI_HANDLE_MAX_CONCURRENT line wins, as in watch.sh; None when absent."""
    try:
        lines = conf_path().read_text().splitlines()
    except OSError:
        return None
    for line in lines:
        if line.startswith(MAX_KEY + "="):
            return line[len(MAX_KEY) + 1:].strip()
    return None


def effective_max_concurrent():
    value = conf_max_concurrent()
    return DEFAULT_MAX_CONCURRENT if value is None else value


def conf_write_max(value):
    """Set (value) or drop (None) the MAX_CONCURRENT line; every other line is kept."""
    path = conf_path()
    try:
        text = path.read_text()
        mode = path.stat().st_mode & 0o777
    except FileNotFoundError:
        text, mode = "", None
    out, done = [], False
    for line in text.splitlines(keepends=True):
        if line.startswith(MAX_KEY + "="):
            if value is not None and not done:
                out.append("%s=%s%s" % (MAX_KEY, value, "\n" if line.endswith("\n") else ""))
            done = True
            continue
        out.append(line)
    if value is not None and not done:
        if out and not out[-1].endswith("\n"):
            out[-1] += "\n"
        out.append("%s=%s\n" % (MAX_KEY, value))
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(path, "".join(out), mode)


def memo_path():
    return state_dir() / "dashboard.json"


def pause():
    before = conf_max_concurrent()
    if effective_max_concurrent() == "0":
        return result(True, 0, "already paused (%s=0)\n" % MAX_KEY)
    state_dir().mkdir(parents=True, exist_ok=True)
    atomic_write(memo_path(), json.dumps({"max_concurrent": before, "paused_at": int(time.time())}))
    conf_write_max("0")
    return result(True, 0, "paused: %s %s -> 0 (running workers keep going)\n"
                  % (MAX_KEY, before if before is not None else "unset"))


def resume():
    if effective_max_concurrent() != "0":
        return result(True, 0, "not paused (%s=%s)\n" % (MAX_KEY, effective_max_concurrent()))
    memo = read_json(memo_path()) or {}
    previous = memo.get("max_concurrent") if isinstance(memo, dict) else None
    conf_write_max(previous)
    try:
        memo_path().unlink()
    except OSError:
        pass
    return result(True, 0, "resumed: %s %s\n" % (
        MAX_KEY, previous if previous is not None else "line removed (default %s)" % DEFAULT_MAX_CONCURRENT))


# --- logs, evidence, ledger, outbox -----------------------------------------
def list_logs(n):
    logs = []
    for p in sorted((state_dir() / "logs").glob("issue-%s-*.log" % n)):
        try:
            st = p.stat()
        except OSError:
            continue
        logs.append({"name": p.name, "size": st.st_size, "mtime": int(st.st_mtime)})
    return logs


def current_log(n, run=None):
    """The newest attempt log of issue n (names sort by timestamp), else last_log."""
    logs = list_logs(n)
    if logs:
        return state_dir() / "logs" / logs[-1]["name"]
    if run is None:
        try:
            run = load_runs().get(str(n))
        except StateError:
            run = None
    return safe_path((run or {}).get("last_log"))


def evidence_attempts(n):
    seen = set()
    for p in (state_dir() / "evidence").glob("issue-%s-attempt-*" % n):
        k = p.name[len("issue-%s-attempt-" % n):]
        if k.endswith(".json"):
            k = k[:-5]
        if NUM.match(k):
            seen.add(int(k))
    return sorted(seen)


def read_evidence(n, k):
    base = state_dir() / "evidence"
    d = base / ("issue-%s-attempt-%s" % (n, k))
    out = {"attempt": int(k), "verdict": read_json(base / ("issue-%s-attempt-%s.json" % (n, k)))}
    for name in EVIDENCE_JSON:
        out[name.split(".")[0]] = read_json(d / name)
    for name in EVIDENCE_TEXT:
        out[name.replace(".", "_").replace("-", "_")] = read_text(d / name)
    return out


def ledger_db():
    return state_dir() / "ledger.db"


def ledger_attempts(n):
    if not ledger_db().exists():
        return []
    conn = ledger.connect(str(ledger_db()))
    try:
        rows = conn.execute("SELECT %s FROM attempts WHERE issue = ? ORDER BY id" % ",".join(LEDGER_FIELDS),
                            (int(n),)).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def ledger_summary(since="7d"):
    if not ledger_db().exists():
        return {"since": since, "report": None, "text": "ledger.db chưa tồn tại"}
    now = int(time.time())
    start = ledger.parse_since(since, now)
    conn = ledger.connect(str(ledger_db()))
    try:
        rep = ledger.report(conn, start, now)
    finally:
        conn.close()
    return {"since": since, "report": rep, "text": ledger.format_report(rep, round((now - start) / 86400))}


def outbox_count():
    """Count queued entries without outbox.py's flock: a flush holds that lock while
    it replays (minutes when offline). The file is replaced atomically, so a plain
    read always sees a whole queue."""
    try:
        with open(state_dir() / "outbox.jsonl") as fh:
            return sum(1 for line in fh if line.strip())
    except OSError:
        return 0


def tail_bytes(path, size):
    try:
        with open(path, "rb") as fh:
            fh.seek(0, os.SEEK_END)
            end = fh.tell()
            fh.seek(max(0, end - size))
            return fh.read()
    except OSError:
        return b""


def last_pass():
    path = state_dir() / "launchd.out.log"
    lines = tail_bytes(path, BACKFILL).decode("utf-8", errors="replace").splitlines()
    line = next((x for x in reversed(lines) if x.startswith("pass done")), None)
    try:
        mtime = int(path.stat().st_mtime)
    except OSError:
        mtime = None
    return {"line": line, "log_mtime": mtime}


# --- views ------------------------------------------------------------------
def run_summary(n, run, lock):
    run = run if isinstance(run, dict) else {}
    return {
        "n": int(n), "status": run.get("status") or ("running" if lock else "unknown"),
        "stage": run.get("stage"), "attempts": len(run.get("attempts") or []),
        "infra_attempts": run.get("infra_attempts"), "prs": run.get("prs") or [],
        "branch": run.get("branch"), "started": run.get("started"), "lock": lock,
        "in_state": bool(run),
    }


def runs_view():
    error = None
    try:
        runs = load_runs()
    except StateError as exc:
        runs, error = {}, str(exc)
    locks = list_locks()
    keys = {k for k in runs if NUM.match(str(k))} | set(locks)
    items = [run_summary(k, runs.get(k), locks.get(k)) for k in keys]
    items.sort(key=lambda r: -r["n"])
    return {"runs": items, "error": error}


def overview():
    view = runs_view()
    counts = {}
    for r in view["runs"]:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    locks = [r["lock"] for r in view["runs"] if r["lock"]]
    max_c = effective_max_concurrent()
    return {
        "counts": counts, "live": sum(1 for lk in locks if lk["alive"]),
        "orphans": sum(1 for lk in locks if lk["orphan"]),
        "stale": sum(1 for lk in locks if lk["stale"]),
        "max_concurrent": max_c, "paused": max_c == "0",
        "outbox": outbox_count(), "last_pass": last_pass(), "error": view["error"],
        "now": int(time.time()),
    }


def issue_detail(n):
    try:
        runs = load_runs()
        error = None
    except StateError as exc:
        runs, error = {}, str(exc)
    run = runs.get(str(n))
    lock = list_locks().get(str(n))
    logs = list_logs(n)
    attempts = evidence_attempts(n)
    if run is None and lock is None and not logs and not attempts:
        return None
    current = current_log(n, run)
    return {
        "n": int(n), "run": run, "summary": run_summary(n, run, lock), "error": error,
        "logs": logs, "current_log": current.name if current else None,
        "evidence": [read_evidence(n, k) for k in attempts],
        "ledger_attempts": ledger_attempts(n),
    }


# --- commands ---------------------------------------------------------------
def result(ok, exit_code, stdout="", stderr="", argv=None):
    return {"ok": ok, "exit_code": exit_code, "stdout": stdout[-TEXT_LIMIT:],
            "stderr": stderr[-TEXT_LIMIT:], "argv": argv}


def run_cmd(argv, timeout=CMD_TIMEOUT, env=None):
    try:
        proc = subprocess.run(argv, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                              errors="replace", timeout=timeout, env=env, start_new_session=True)
    except subprocess.TimeoutExpired:
        return result(False, None, "", "timed out after %ss" % timeout, argv)
    except OSError as exc:
        return result(False, None, "", "cannot run %s: %s" % (argv[0], exc), argv)
    return result(proc.returncode == 0, proc.returncode, proc.stdout, proc.stderr, argv)


def action(name, issue=None):
    if name == "kickstart":
        return run_cmd([launchctl_bin(), "kickstart", "gui/%d/%s" % (os.getuid(), POLLER_LABEL)])
    if name in ("dispatch", "recover", "reset"):
        flag = {"dispatch": "--issue", "recover": "--recover", "reset": "--reset"}[name]
        return run_cmd(["bash", watch_sh(), flag, str(issue)])
    if name == "pause":
        return pause()
    if name == "resume":
        return resume()
    raise KeyError(name)


ISSUE_ACTIONS = {"dispatch", "recover", "reset"}
ACTIONS = ISSUE_ACTIONS | {"kickstart", "pause", "resume"}


def gh_env():
    """Like watch.sh ensure_gh_auth: fall back to GH_TOKEN from the token file when
    launchd lost keychain access. The token is never logged or returned."""
    env = dict(os.environ)
    if run_cmd([gh_bin(), "auth", "status"], timeout=GH_TIMEOUT)["ok"]:
        return env
    token = (read_text(config_dir() / "gh-token", 512) or "").strip().split("\n")[0].strip()
    if token:
        env["GH_TOKEN"] = token
    return env


def check_summary(rollup):
    summary = {"success": 0, "failure": 0, "pending": 0}
    for c in rollup or []:
        state = (c.get("conclusion") or c.get("state") or c.get("status") or "").upper()
        if state in ("SUCCESS", "NEUTRAL", "SKIPPED"):
            summary["success"] += 1
        elif state in ("FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"):
            summary["failure"] += 1
        else:
            summary["pending"] += 1
    return summary


def gh_json(argv, env):
    res = run_cmd([gh_bin()] + argv, timeout=GH_TIMEOUT, env=env)
    if not res["ok"]:
        return {"error": (res["stderr"] or res["stdout"] or "gh failed").strip()[-2000:]}
    try:
        return json.loads(res["stdout"])
    except ValueError:
        return {"error": "gh returned invalid JSON"}


_gh_cache = {}
_gh_cache_lock = threading.Lock()


def github_detail(n):
    now = time.time()
    with _gh_cache_lock:
        hit = _gh_cache.get(n)
        if hit and now - hit[0] < GH_CACHE_SECS:
            return hit[1]
    env = gh_env()
    issue = gh_json(["issue", "view", str(n), "--repo", REPO, "--json",
                     "number,title,state,labels,url,projectItems"], env)
    try:
        run = load_runs().get(str(n)) or {}
    except StateError:
        run = {}
    prs = []
    for url in run.get("prs") or []:
        if not isinstance(url, str) or not PR_URL.match(url):
            continue
        pr = gh_json(["pr", "view", url, "--json",
                      "number,state,mergeable,reviewDecision,statusCheckRollup,url"], env)
        if "error" not in pr:
            pr["checks"] = check_summary(pr.pop("statusCheckRollup", None))
        else:
            pr["url"] = url
        prs.append(pr)
    data = {"issue": issue, "prs": prs, "fetched_at": int(now)}
    with _gh_cache_lock:
        _gh_cache[n] = (now, data)
    return data


# --- HTTP -------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "teacher-os-ai-handle-dashboard/1.0"

    # responses
    def _send(self, code, body, ctype, extra=None):
        payload = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def _json(self, code, data):
        self._send(code, json.dumps(data, ensure_ascii=False), "application/json; charset=utf-8")

    def _error(self, code, message):
        self._json(code, {"error": message})

    # request guard
    def _allowed_hosts(self):
        port = self.server.server_address[1]
        return {"127.0.0.1:%d" % port, "localhost:%d" % port}

    def check_request(self, method):
        """Return None when the request may proceed, else (code, message)."""
        if (self.headers.get("Host") or "").lower() not in self._allowed_hosts():
            return 403, "forbidden host"
        if method != "POST":
            return None
        origin = self.headers.get("Origin")
        if origin is not None and origin.lower() not in {"http://" + h for h in self._allowed_hosts()}:
            return 403, "forbidden origin"
        token = self.headers.get("X-Dashboard-Token") or ""
        if not hmac.compare_digest(token.encode(), self.server.token.encode()):
            return 403, "missing or invalid token"
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            return 415, "content-type must be application/json"
        return None

    def do_GET(self):  # noqa: N802 - http.server API
        denied = self.check_request("GET")
        if denied:
            return self._error(*denied)
        url = urlsplit(self.path)
        path, query = url.path, parse_qs(url.query)
        try:
            self.route_get(path, query)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def route_get(self, path, query):
        if path in ("/", "/index.html"):
            return self.serve_page()
        if path == "/api/overview":
            return self._json(200, overview())
        if path == "/api/runs":
            return self._json(200, runs_view())
        if path == "/api/ledger":
            since = (query.get("since") or ["7d"])[0]
            if not SINCE.match(since):
                return self._error(400, "since must look like 7d, 24h or 90m")
            return self._json(200, ledger_summary(since))
        if path == "/api/stream":
            return self.serve_stream(query)
        m = re.match(r"^/api/issue/([^/]+)(/github)?$", path)
        if m:
            n = m.group(1)
            if not NUM.match(n):
                return self._error(400, "issue must be a number")
            if m.group(2):
                return self._json(200, github_detail(int(n)))
            detail = issue_detail(int(n))
            return self._json(200, detail) if detail else self._error(404, "no data for #%s" % n)
        return self._error(404, "not found")

    def serve_page(self):
        try:
            html = (HERE / "dashboard.html").read_text()
        except OSError:
            return self._error(500, "dashboard.html missing next to dashboard.py")
        html = html.replace(TOKEN_PLACEHOLDER, self.server.token)
        self._send(200, html, "text/html; charset=utf-8",
                   {"Content-Security-Policy": CSP, "Referrer-Policy": "no-referrer"})

    # live log tail
    def serve_stream(self, query):
        issue, log = (query.get("issue") or [None])[0], (query.get("log") or [None])[0]
        if issue is not None:
            if not NUM.match(issue):
                return self._error(400, "issue must be a number")
            resolve = lambda: current_log(int(issue))  # noqa: E731
        elif log in SYSTEM_LOGS:
            fixed = state_dir() / SYSTEM_LOGS[log]
            resolve = lambda: fixed  # noqa: E731
        else:
            return self._error(400, "need issue=<n> or log=%s" % "|".join(sorted(SYSTEM_LOGS)))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        self.close_connection = True
        try:
            self.stream_loop(resolve)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def _event(self, data, event=None):
        out = ""
        if event:
            out += "event: %s\n" % event
        for line in data.split("\n"):
            out += "data: %s\n" % line
        self.wfile.write((out + "\n").encode())
        self.wfile.flush()

    def stream_loop(self, resolve):
        current, pos, pending = None, 0, b""
        last_resolve = last_ping = 0.0
        while not getattr(self.server, "stopping", False):
            now = time.monotonic()
            if now - last_resolve >= SSE_RESOLVE_SECS or current is None:
                last_resolve = now
                path = resolve()
                if path != current:
                    current, pending = path, b""
                    self._event(path.name if path else "", "file")
                    pos = max(0, self._size(path) - BACKFILL) if path else 0
                    if pos:
                        pending = None  # drop the partial first line after seeking
            if current is not None:
                size = self._size(current)
                if size < pos:  # truncated or replaced
                    pos, pending = 0, b""
                if size > pos:
                    with open(current, "rb") as fh:
                        fh.seek(pos)
                        chunk = fh.read(min(size - pos, BACKFILL))
                    pos += len(chunk)
                    if pending is None:
                        cut = chunk.find(b"\n")
                        chunk, pending = (chunk[cut + 1:] if cut >= 0 else b""), b""
                    buf = pending + chunk
                    cut = buf.rfind(b"\n")
                    if cut >= 0:
                        self._event(buf[:cut].decode("utf-8", errors="replace"))
                        pending = buf[cut + 1:]
                    else:
                        pending = buf
                    if len(pending) > BACKFILL:  # a huge line without newline
                        self._event(pending.decode("utf-8", errors="replace"))
                        pending = b""
                    last_ping = now
            if now - last_ping >= SSE_PING_SECS:
                self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                last_ping = now
            time.sleep(SSE_TICK)

    @staticmethod
    def _size(path):
        try:
            return path.stat().st_size
        except OSError:
            return 0

    # actions
    def do_POST(self):  # noqa: N802 - http.server API
        denied = self.check_request("POST")
        if denied:
            return self._error(*denied)
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY:
            return self._error(413, "body too large")
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, UnicodeDecodeError):
            return self._error(400, "body must be JSON")
        if not isinstance(body, dict):
            return self._error(400, "body must be a JSON object")
        m = re.match(r"^/api/action/([a-z]+)$", urlsplit(self.path).path)
        if not m or m.group(1) not in ACTIONS:
            return self._error(404, "unknown action")
        name, issue = m.group(1), None
        if name in ISSUE_ACTIONS:
            issue = body.get("issue")
            if isinstance(issue, bool) or not isinstance(issue, int) or not 0 < issue < 1_000_000:
                return self._error(400, "issue must be a positive integer")
        if not self.server.action_lock.acquire(blocking=False):
            return self._error(409, "another action is still running")
        try:
            res = action(name, issue)
        finally:
            self.server.action_lock.release()
        log("action %s%s -> exit %s" % (name, " #%d" % issue if issue else "", res["exit_code"]))
        self._json(200, res)

    def log_message(self, fmt, *args):  # quiet default access log
        pass


def log(message):
    print("%s %s" % (time.strftime("%Y-%m-%dT%H:%M:%S%z"), message), flush=True)


def make_server(port):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    server.token = secrets.token_urlsafe(32)
    server.action_lock = threading.Lock()
    server.stopping = False
    return server


def main():
    port = int(os.environ.get("TEACHER_OS_AI_HANDLE_DASHBOARD_PORT", "8898"))
    try:
        server = make_server(port)
    except OSError as exc:
        log("fatal: cannot listen on 127.0.0.1:%d: %s" % (port, exc))
        return 1
    log("dashboard listening on http://127.0.0.1:%d (state %s)" % (port, state_dir()))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
