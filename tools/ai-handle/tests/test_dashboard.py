import http.client
import json
import os
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import dashboard  # noqa: E402
import ledger  # noqa: E402

ENV_KEYS = ("TEACHER_OS_AI_HANDLE_STATE_DIR", "TEACHER_OS_AI_HANDLE_CONFIG_DIR", "TEACHER_OS_AI_HANDLE_WATCH_SH",
            "TEACHER_OS_AI_HANDLE_LAUNCHCTL", "TEACHER_OS_AI_HANDLE_GH", "TEACHER_OS_AI_HANDLE_HEARTBEAT_SECS")


def write(path, text, mode=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)
    if mode is not None:
        os.chmod(path, mode)


def script(path, body):
    write(path, "#!/bin/sh\n" + body)
    os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR)


class Fixture(unittest.TestCase):
    """A fake state dir, config dir and command stubs; restores env afterwards."""

    def setUp(self):
        self.saved_env = {k: os.environ.get(k) for k in ENV_KEYS}
        self.tmp = tempfile.TemporaryDirectory()
        root = self.tmp.name
        self.state = os.path.join(root, "state")
        self.config = os.path.join(root, "config")
        self.calls = os.path.join(root, "calls.log")
        os.makedirs(self.state)
        os.makedirs(self.config)
        os.environ.update({
            "TEACHER_OS_AI_HANDLE_STATE_DIR": self.state, "TEACHER_OS_AI_HANDLE_CONFIG_DIR": self.config,
            "TEACHER_OS_AI_HANDLE_WATCH_SH": os.path.join(root, "bin/watch.sh"),
            "TEACHER_OS_AI_HANDLE_LAUNCHCTL": os.path.join(root, "bin/launchctl"),
            "TEACHER_OS_AI_HANDLE_GH": os.path.join(root, "bin/gh"),
            "TEACHER_OS_AI_HANDLE_HEARTBEAT_SECS": "60",
        })
        script(os.path.join(root, "bin/watch.sh"),
               'echo "watch.sh $*" >> "%s"\n'
               'if [ -e "%s/refuse" ]; then echo "refusing: a worker is still running" >&2; exit 1; fi\n'
               'echo "ok $*"\n' % (self.calls, root))
        script(os.path.join(root, "bin/launchctl"), 'echo "launchctl $*" >> "%s"\n' % self.calls)
        script(os.path.join(root, "bin/gh"),
               'echo "gh $* token=${GH_TOKEN:+set}" >> "%s"\n'
               'case "$1 $2" in\n'
               '  "auth status") [ -n "$GH_TOKEN" ] && exit 0; exit 1 ;;\n'
               '  "issue view") echo \'{"number":12,"state":"OPEN","title":"t","labels":[],'
               '"url":"https://github.com/vinh19410/teacher-os/issues/12",'
               '"projectItems":[{"status":{"name":"In review"},"title":"Teacher OS"}]}\' ;;\n'
               '  "pr view") echo \'{"number":5,"state":"OPEN","mergeable":"MERGEABLE","reviewDecision":"",'
               '"url":"\'"$3"\'","statusCheckRollup":[{"conclusion":"SUCCESS"},{"conclusion":"FAILURE"},'
               '{"status":"IN_PROGRESS"}]}\' ;;\n'
               '  *) exit 3 ;;\n'
               'esac\n' % self.calls)
        # A live "worker": its command line contains watch.sh, like the real one.
        sleeper = os.path.join(root, "sleeper/watch.sh")
        write(sleeper, "while true; do sleep 1; done\n")
        self.worker = subprocess.Popen(["bash", sleeper])
        self.addCleanup(self.worker.wait)
        self.addCleanup(self.worker.kill)
        self.build_state()

    def tearDown(self):
        for k, v in self.saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        dashboard._gh_cache.clear()
        self.tmp.cleanup()

    def s(self, *parts):
        return os.path.join(self.state, *parts)

    def build_state(self):
        now = int(time.time())
        runs = {
            "10": {"status": "running", "attempts": [], "item": "I10"},
            "11": {"status": "failed", "last_log": "/etc/passwd", "last_verify": "../../etc/hosts",
                   "attempts": [{"ts": now - 100, "log": "x", "cause": "test"}]},
            "12": {"status": "awaiting_review", "attempts": [{"ts": now}],
                   "prs": ["https://github.com/vinh19410/teacher-os/pull/5", "https://evil.example/pull/1"]},
            "13": {"status": "running", "attempts": []},
        }
        write(self.s("state.json"), json.dumps({"runs": runs}))
        pid = str(self.worker.pid)
        write(self.s("running/issue-10/pid"), pid)
        write(self.s("running/issue-10/heartbeat"), str(now - 5))
        write(self.s("running/issue-13/pid"), pid)
        write(self.s("running/issue-13/heartbeat"), str(now - 1000))  # stale
        write(self.s("running/issue-11/pid"), "99999998")                # orphan
        write(self.s("running/issue-14.break/pid"), pid)                 # ignored
        write(self.s("logs/issue-10-20261016-090000.log"), "old attempt\n")
        write(self.s("logs/issue-10-20261016-100000.log"), "line one\nline two\n")
        write(self.s("logs/issue-100-20261016-100000.log"), "other issue\n")
        write(self.s("logs/workers.log"), "worker started\n")
        write(self.s("launchd.out.log"), "pass done: 1 worker(s) dispatched, 2 live\nother\n")
        write(self.s("evidence/issue-11-attempt-1.json"), json.dumps({"verdict": "fail", "reasons": ["x"]}))
        write(self.s("evidence/issue-11-attempt-1/checks.json"), json.dumps({"base": "origin/develop"}))
        write(self.s("evidence/issue-11-attempt-1/delta.json"), "{broken")
        write(self.s("evidence/issue-11-attempt-1/llm.status"), "ok")
        write(self.s("evidence/issue-11-attempt-1/comment.md"), "verifier said no")
        write(self.s("outbox.jsonl"), '{"kind":"a"}\n{"kind":"b"}\n')
        conn = ledger.connect(self.s("ledger.db"))
        ledger.record(conn, issue=11, attempt=1, stage="verify", outcome="failed", failure_cause="test",
                      started_at=now - 200, ended_at=now - 100, tokens_in=10, tokens_out=2, cost_usd=0.5)
        ledger.record(conn, issue=12, attempt=1, stage="gate", outcome="awaiting_review", risk="high",
                      ended_at=now)
        conn.close()

    def calls_log(self):
        try:
            with open(self.calls) as f:
                return f.read().splitlines()
        except FileNotFoundError:
            return []


class ReadLayerTest(Fixture):
    def test_load_runs_missing_and_corrupt(self):
        os.remove(self.s("state.json"))
        self.assertEqual(dashboard.load_runs(), {})
        write(self.s("state.json"), '{"runs": ')
        with self.assertRaises(dashboard.StateError):
            dashboard.load_runs()
        view = dashboard.runs_view()
        self.assertIn("state.json", view["error"])
        self.assertEqual({r["n"] for r in view["runs"]}, {10, 11, 13})  # locks still listed

    def test_locks_alive_orphan_stale_and_break_ignored(self):
        locks = dashboard.list_locks()
        self.assertEqual(set(locks), {"10", "11", "13"})
        self.assertTrue(locks["10"]["alive"])
        self.assertFalse(locks["10"]["stale"])
        self.assertTrue(locks["13"]["alive"])
        self.assertTrue(locks["13"]["stale"])
        self.assertTrue(locks["11"]["orphan"])
        self.assertFalse(locks["11"]["alive"])

    def test_live_pid_that_is_not_a_watcher_is_orphan(self):
        write(self.s("running/issue-10/pid"), str(os.getpid()))  # alive, but python, not watch.sh
        self.assertTrue(dashboard.list_locks()["10"]["orphan"])

    def test_lock_without_pid_uses_mtime_grace(self):
        os.makedirs(self.s("running/issue-20"))
        self.assertTrue(dashboard.list_locks()["20"]["alive"])
        old = time.time() - 120
        os.utime(self.s("running/issue-20"), (old, old))
        self.assertTrue(dashboard.list_locks()["20"]["orphan"])

    def test_safe_path_stays_inside_state_dir(self):
        self.assertIsNone(dashboard.safe_path("/etc/passwd"))
        self.assertIsNone(dashboard.safe_path(self.s("..", "config", "gh-token")))
        self.assertIsNone(dashboard.safe_path(""))
        self.assertIsNone(dashboard.safe_path(None))
        inside = dashboard.safe_path(self.s("logs", "workers.log"))
        self.assertEqual(str(inside), os.path.realpath(self.s("logs", "workers.log")))

    def test_current_log_prefers_newest_and_rejects_unsafe_last_log(self):
        self.assertEqual(dashboard.current_log(10).name, "issue-10-20261016-100000.log")
        self.assertIsNone(dashboard.current_log(11))  # last_log is /etc/passwd
        self.assertEqual([x["name"] for x in dashboard.list_logs(10)],
                         ["issue-10-20261016-090000.log", "issue-10-20261016-100000.log"])

    def test_issue_detail_has_evidence_and_ledger(self):
        d = dashboard.issue_detail(11)
        self.assertEqual(d["summary"]["status"], "failed")
        self.assertTrue(d["summary"]["lock"]["orphan"])
        self.assertIsNone(d["current_log"])
        ev = d["evidence"][0]
        self.assertEqual(ev["attempt"], 1)
        self.assertEqual(ev["verdict"]["verdict"], "fail")
        self.assertEqual(ev["checks"], {"base": "origin/develop"})
        self.assertIn("error", ev["delta"])
        self.assertEqual(ev["llm_status"], "ok")
        self.assertEqual(ev["comment_md"], "verifier said no")
        self.assertIsNone(ev["risk_comment_md"])
        row = d["ledger_attempts"][0]
        self.assertEqual((row["attempt"], row["outcome"], row["cost_usd"], row["duration_s"]),
                         (1, "failed", 0.5, 100))
        self.assertIsNone(dashboard.issue_detail(999))

    def test_overview(self):
        o = dashboard.overview()
        self.assertEqual(o["counts"], {"running": 2, "failed": 1, "awaiting_review": 1})
        self.assertEqual((o["live"], o["orphans"], o["stale"]), (2, 1, 1))
        self.assertEqual(o["outbox"], 2)
        self.assertEqual(o["max_concurrent"], "3")
        self.assertFalse(o["paused"])
        self.assertEqual(o["last_pass"]["line"], "pass done: 1 worker(s) dispatched, 2 live")

    def test_ledger_summary_matches_ledger_report(self):
        got = dashboard.ledger_summary("7d")
        self.assertEqual(got["report"]["awaiting_review"], 1)
        self.assertEqual(got["report"]["failure_causes"], {"test": 1})
        self.assertIn("Báo cáo ai-handle 7 ngày qua", got["text"])
        os.remove(self.s("ledger.db"))
        self.assertIsNone(dashboard.ledger_summary("7d")["report"])
        self.assertFalse(os.path.exists(self.s("ledger.db")))  # never created by reading


class PauseResumeTest(Fixture):
    CONF = ("# local overrides\n"
            "TEACHER_OS_AI_HANDLE_VERIFY_MODEL=some/model\n"
            "# comment kept\n")

    def conf(self):
        with open(os.path.join(self.config, "watch.conf")) as f:
            return f.read()

    def test_pause_resume_restores_previous_value(self):
        write(os.path.join(self.config, "watch.conf"), self.CONF + "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=2\n", 0o600)
        self.assertTrue(dashboard.pause()["ok"])
        self.assertEqual(self.conf(), self.CONF + "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=0\n")
        self.assertTrue(dashboard.overview()["paused"])
        self.assertEqual(stat.S_IMODE(os.stat(os.path.join(self.config, "watch.conf")).st_mode), 0o600)
        self.assertIn("already paused", dashboard.pause()["stdout"])  # memo not overwritten
        self.assertTrue(dashboard.resume()["ok"])
        self.assertEqual(self.conf(), self.CONF + "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=2\n")
        self.assertFalse(os.path.exists(self.s("dashboard.json")))
        self.assertIn("not paused", dashboard.resume()["stdout"])

    def test_pause_without_line_appends_and_resume_removes_it(self):
        write(os.path.join(self.config, "watch.conf"), self.CONF.rstrip("\n"))  # no trailing newline
        dashboard.pause()
        self.assertTrue(self.conf().endswith("# comment kept\nTEACHER_OS_AI_HANDLE_MAX_CONCURRENT=0\n"))
        dashboard.resume()
        self.assertEqual(self.conf(), self.CONF)
        self.assertEqual(dashboard.effective_max_concurrent(), "3")

    def test_round_trip_keeps_a_missing_final_newline(self):
        original = self.CONF + "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=5"
        write(os.path.join(self.config, "watch.conf"), original)
        dashboard.pause()
        self.assertEqual(self.conf(), self.CONF + "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=0")
        dashboard.resume()
        self.assertEqual(self.conf(), original)

    def test_resume_without_memo_drops_the_line(self):
        write(os.path.join(self.config, "watch.conf"), "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=0\n" + self.CONF)
        dashboard.resume()
        self.assertEqual(self.conf(), self.CONF)

    def test_first_line_wins_and_duplicates_are_collapsed(self):
        write(os.path.join(self.config, "watch.conf"),
              "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=4\n" + self.CONF + "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=1\n")
        self.assertEqual(dashboard.effective_max_concurrent(), "4")
        dashboard.pause()
        self.assertEqual(self.conf(), "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=0\n" + self.CONF)
        dashboard.resume()
        self.assertEqual(self.conf(), "TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=4\n" + self.CONF)


class HttpBase(Fixture):
    def setUp(self):
        super().setUp()
        self.server = dashboard.make_server(0)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host = "127.0.0.1:%d" % self.port

    def tearDown(self):
        self.server.stopping = True
        self.server.shutdown()
        self.server.server_close()
        super().tearDown()

    def request(self, method, path, body=None, headers=None, token=True, raw=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": self.host}
        if method == "POST":
            h["Content-Type"] = "application/json"
            if token:
                h["X-Dashboard-Token"] = self.server.token
        h.update(headers or {})
        payload = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        conn.request(method, path, body=payload, headers=h)
        resp = conn.getresponse()
        data = resp.read().decode()
        conn.close()
        return resp, data

    def post(self, path, body=None, **kw):
        resp, data = self.request("POST", path, body if body is not None else {}, **kw)
        return resp.status, (json.loads(data) if data.startswith("{") else data)


class HttpTest(HttpBase):
    def test_page_has_token_and_csp_and_token_stays_out_of_the_api(self):
        resp, html = self.request("GET", "/")
        self.assertEqual(resp.status, 200)
        self.assertIn(self.server.token, html)
        self.assertNotIn(dashboard.TOKEN_PLACEHOLDER, html)
        self.assertIn("default-src 'self'", resp.getheader("Content-Security-Policy"))
        self.assertIsNone(resp.getheader("Access-Control-Allow-Origin"))
        for path in ("/api/overview", "/api/runs", "/api/issue/11", "/api/ledger"):
            resp, data = self.request("GET", path)
            self.assertEqual(resp.status, 200, path)
            self.assertNotIn(self.server.token, data, path)
            self.assertEqual(resp.getheader("Cache-Control"), "no-store")

    def test_foreign_host_is_rejected(self):
        resp, _ = self.request("GET", "/api/runs", headers={"Host": "evil.example"})
        self.assertEqual(resp.status, 403)
        resp, _ = self.request("GET", "/", headers={"Host": "evil.example:%d" % self.port})
        self.assertEqual(resp.status, 403)
        status, _ = self.post("/api/action/kickstart", headers={"Host": "evil.example"})
        self.assertEqual(status, 403)
        resp, _ = self.request("GET", "/api/runs", headers={"Host": "localhost:%d" % self.port})
        self.assertEqual(resp.status, 200)

    def test_post_guards(self):
        self.assertEqual(self.post("/api/action/kickstart", token=False)[0], 403)
        self.assertEqual(self.post("/api/action/kickstart", headers={"X-Dashboard-Token": "nope"})[0], 403)
        self.assertEqual(self.post("/api/action/kickstart", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.post("/api/action/kickstart", headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.post("/api/action/kickstart",
                                   headers={"Content-Type": "application/x-www-form-urlencoded"})[0], 415)
        resp, _ = self.request("POST", "/api/action/kickstart", raw=b"{" + b" " * 5000 + b"}")
        self.assertEqual(resp.status, 413)
        for bad in ("12", -1, 0, 1.5, True, None, 10_000_000):
            self.assertEqual(self.post("/api/action/dispatch", {"issue": bad})[0], 400, bad)
        self.assertEqual(self.post("/api/action/shell", {"issue": 1})[0], 404)
        self.assertEqual(self.calls_log(), [])  # nothing ran

    def test_actions_run_the_right_commands(self):
        status, res = self.post("/api/action/dispatch", {"issue": 12},
                                headers={"Origin": "http://127.0.0.1:%d" % self.port})
        self.assertEqual(status, 200)
        self.assertTrue(res["ok"])
        self.assertEqual(res["stdout"], "ok --issue 12\n")
        self.post("/api/action/recover", {"issue": 12})
        self.post("/api/action/reset", {"issue": 12})
        self.post("/api/action/kickstart")
        self.assertEqual(self.calls_log(), [
            "watch.sh --issue 12", "watch.sh --recover 12", "watch.sh --reset 12",
            "launchctl kickstart gui/%d/com.teacheros.ai-handle" % os.getuid()])

    def test_refusal_from_watch_sh_is_shown(self):
        open(os.path.join(self.tmp.name, "refuse"), "w").close()
        status, res = self.post("/api/action/reset", {"issue": 10})
        self.assertEqual(status, 200)
        self.assertFalse(res["ok"])
        self.assertEqual(res["exit_code"], 1)
        self.assertIn("refusing", res["stderr"])

    def test_concurrent_action_gets_409(self):
        self.server.action_lock.acquire()
        try:
            self.assertEqual(self.post("/api/action/kickstart")[0], 409)
        finally:
            self.server.action_lock.release()

    def test_pause_and_resume_over_http(self):
        status, res = self.post("/api/action/pause")
        self.assertTrue(res["ok"])
        self.assertTrue(json.loads(self.request("GET", "/api/overview")[1])["paused"])
        self.post("/api/action/resume")
        self.assertFalse(json.loads(self.request("GET", "/api/overview")[1])["paused"])

    def test_bad_parameters(self):
        self.assertEqual(self.request("GET", "/api/issue/abc")[0].status, 400)
        self.assertEqual(self.request("GET", "/api/issue/1234567")[0].status, 400)
        self.assertEqual(self.request("GET", "/api/issue/999")[0].status, 404)
        self.assertEqual(self.request("GET", "/api/ledger?since=forever")[0].status, 400)
        self.assertEqual(self.request("GET", "/api/stream?log=../../etc/passwd")[0].status, 400)
        self.assertEqual(self.request("GET", "/api/stream?issue=../1")[0].status, 400)

    def test_traversal_through_state_json_is_not_served(self):
        resp, data = self.request("GET", "/api/issue/11")
        self.assertEqual(resp.status, 200)
        self.assertNotIn("root:", data)
        self.assertIsNone(json.loads(data)["current_log"])

    def test_github_detail_uses_token_fallback_and_cache(self):
        write(os.path.join(self.config, "gh-token"), "secret-token-value\n")
        resp, data = self.request("GET", "/api/issue/12/github")
        self.assertEqual(resp.status, 200)
        self.assertNotIn("secret-token-value", data)
        got = json.loads(data)
        self.assertEqual(got["issue"]["projectItems"][0]["status"]["name"], "In review")
        self.assertEqual(len(got["prs"]), 1)  # the non-GitHub URL is skipped
        self.assertEqual(got["prs"][0]["checks"], {"success": 1, "failure": 1, "pending": 1})
        calls = self.calls_log()
        self.assertIn("gh issue view 12 --repo vinh19410/teacher-os --json "
                      "number,title,state,labels,url,projectItems token=set", calls)
        self.request("GET", "/api/issue/12/github")
        self.assertEqual(self.calls_log(), calls)  # served from cache

    def test_github_error_is_reported_not_500(self):
        script(os.environ["TEACHER_OS_AI_HANDLE_GH"], 'echo "boom" >&2; exit 1\n')
        resp, data = self.request("GET", "/api/issue/12/github")
        self.assertEqual(resp.status, 200)
        self.assertIn("boom", json.loads(data)["issue"]["error"])


class StreamTest(HttpBase):
    def setUp(self):
        super().setUp()
        self.saved = (dashboard.SSE_TICK, dashboard.SSE_RESOLVE_SECS)
        dashboard.SSE_TICK, dashboard.SSE_RESOLVE_SECS = 0.05, 0.1

    def tearDown(self):
        dashboard.SSE_TICK, dashboard.SSE_RESOLVE_SECS = self.saved
        super().tearDown()

    def open_stream(self, query):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", "/api/stream?" + query, headers={"Host": self.host})
        resp = conn.getresponse()
        self.addCleanup(conn.close)
        self.assertEqual(resp.status, 200)
        self.assertTrue(resp.getheader("Content-Type").startswith("text/event-stream"))
        return resp

    def read_until(self, resp, needle):
        buf = ""
        deadline = time.time() + 5
        while needle not in buf and time.time() < deadline:
            line = resp.fp.readline().decode()
            if not line:
                break
            buf += line
        self.assertIn(needle, buf)
        return buf

    def test_issue_stream_backfills_follows_and_switches_file(self):
        resp = self.open_stream("issue=10")
        buf = self.read_until(resp, "data: line two")
        self.assertIn("event: file\ndata: issue-10-20261016-100000.log", buf)
        self.assertNotIn("old attempt", buf)
        with open(self.s("logs/issue-10-20261016-100000.log"), "a") as f:
            f.write("line three\n")
        self.read_until(resp, "data: line three")
        write(self.s("logs/issue-10-20261016-110000.log"), "new attempt\n")
        buf = self.read_until(resp, "data: new attempt")
        self.assertIn("data: issue-10-20261016-110000.log", buf)

    def test_backfill_is_limited_and_starts_on_a_line_boundary(self):
        write(self.s("logs/workers.log"), "".join("row %06d\n" % i for i in range(20000)))
        resp = self.open_stream("log=workers")
        buf = self.read_until(resp, "data: row 019999")
        self.assertNotIn("row 000000", buf)
        first = [x for x in buf.splitlines() if x.startswith("data: row")][0]
        self.assertRegex(first, r"^data: row \d{6}$")
        self.assertLess(len(buf), dashboard.BACKFILL * 2)

    def test_system_log_stream(self):
        resp = self.open_stream("log=launchd")
        self.read_until(resp, "data: pass done: 1 worker(s) dispatched, 2 live")


if __name__ == "__main__":
    unittest.main()
