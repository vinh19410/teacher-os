import json
import os
import sqlite3
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import ledger  # noqa: E402

NOW = 2_000_000_000


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["TEACHER_OS_AI_HANDLE_STATE_DIR"] = self.tmp.name
        self.conn = ledger.connect()

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def add(self, issue, outcome, cost=None, dur=600, stage="implement", ended=NOW - 100, **kw):
        ledger.record(self.conn, issue=issue, outcome=outcome, stage=stage, ended_at=ended,
                      duration_s=dur, cost_usd=cost, **kw)

    def sample(self):
        """Issue 1: failed once then merged. 2: merged first try. 3: parked for review. 4: blocked."""
        self.add(1, "failed", cost=1.0, failure_cause="test")
        self.add(1, "merged", cost=2.0, stage="merge", risk="low", jev_status="ok", jev_agree=1)
        self.add(2, "merged", cost=3.0, stage="merge", risk="low", jev_status="ok", jev_agree=0)
        self.add(3, "awaiting_review", cost=4.0, stage="gate", risk="high")
        self.add(4, "failed", cost=1.0, failure_cause="requirements")
        self.add(4, "failed", cost=1.0, failure_cause="requirements")
        self.add(4, "blocked", cost=1.0, failure_cause="requirements")

    def test_cost_per_accepted_task(self):
        self.sample()
        rep = ledger.report(self.conn, NOW - 7 * 86400, NOW)
        # accepted issues 1 and 2 cost (1+2) + 3 = 6 in total -> 3.0 each
        self.assertEqual(rep["accepted"], 2)
        self.assertAlmostEqual(rep["cost_per_accepted"], 3.0)
        self.assertEqual(rep["cost_basis"], "usd")

    def test_human_intervention_rate(self):
        self.sample()
        rep = ledger.report(self.conn, NOW - 7 * 86400, NOW)
        # finished: 1, 2, 3, 4; human: 3 (review) and 4 (blocked)
        self.assertEqual(rep["issues_finished"], 4)
        self.assertAlmostEqual(rep["human_intervention_rate"], 0.5)

    def test_manual_overrides_count_as_intervention(self):
        self.sample()
        self.add(2, "manual_recover", stage="manual", dur=0)
        rep = ledger.report(self.conn, NOW - 7 * 86400, NOW)
        self.assertAlmostEqual(rep["human_intervention_rate"], 0.75)

    def test_retries_causes_and_jev_agreement(self):
        self.sample()
        rep = ledger.report(self.conn, NOW - 7 * 86400, NOW)
        self.assertAlmostEqual(rep["avg_retries"], 3 / 4)       # three `failed` rows over four issues
        self.assertEqual(rep["failure_causes"], {"test": 1, "requirements": 3})
        self.assertEqual((rep["jev_checked"], rep["jev_agreed"]), (2, 1))

    def test_minutes_replace_cost_when_usage_is_unknown(self):
        self.add(1, "merged", cost=None, dur=600, stage="merge")
        self.add(1, "failed", cost=None, dur=1200)
        rep = ledger.report(self.conn, NOW - 86400, NOW)
        self.assertEqual(rep["cost_basis"], "minutes")
        self.assertAlmostEqual(rep["cost_per_accepted"], 30.0)

    def test_window_excludes_old_rows(self):
        self.add(9, "merged", ended=NOW - 30 * 86400, stage="merge")
        rep = ledger.report(self.conn, NOW - 7 * 86400, NOW)
        self.assertEqual(rep["issues_finished"], 0)
        self.assertIsNone(rep["human_intervention_rate"])
        self.assertIn("n/a", ledger.format_report(rep, 7))

    def test_report_text_names_the_two_headline_numbers(self):
        self.sample()
        text = ledger.format_report(ledger.report(self.conn, NOW - 7 * 86400, NOW), 7)
        self.assertIn("Cost per Accepted Task: $3.00", text)
        self.assertIn("Human Intervention Rate: 50%", text)

    def test_set_cause_updates_the_latest_attempt(self):
        self.add(5, "failed")
        self.add(5, "blocked")
        ledger.set_cause(self.conn, 5, "infrastructure")
        rows = [r["failure_cause"] for r in self.conn.execute("SELECT failure_cause FROM attempts WHERE issue=5 ORDER BY id")]
        self.assertEqual(rows, [None, "infrastructure"])

    def test_migration_adds_a_column_and_keeps_old_rows(self):
        path = os.path.join(self.tmp.name, "old.db")
        old = sqlite3.connect(path)
        old.execute(ledger.MIGRATIONS[0])
        old.execute("PRAGMA user_version = 1")
        old.execute("INSERT INTO attempts (issue, outcome, stage) VALUES (7, 'merged', 'merge')")
        old.commit()
        old.close()
        conn = ledger.connect(path)
        row = conn.execute("SELECT issue, outcome, note FROM attempts").fetchone()
        self.assertEqual((row["issue"], row["outcome"], row["note"]), (7, "merged", None))
        self.assertEqual(conn.execute("PRAGMA user_version").fetchone()[0], len(ledger.MIGRATIONS))
        backups = [f for f in os.listdir(self.tmp.name) if f.startswith("old.db.bak-")]
        self.assertEqual(len(backups), 1)
        conn.close()

    def test_usage_sums_messages_after_a_cutoff(self):
        d = os.path.join(self.tmp.name, "sess")
        os.makedirs(d)
        with open(os.path.join(d, "a.jsonl"), "w") as f:
            for ts, inp, out, cost in ((1000, 10, 1, 0.1), (5000, 20, 2, 0.2), (6000, 30, 3, 0.3)):
                f.write(json.dumps({"type": "message", "message": {"role": "assistant", "timestamp": ts * 1000,
                        "usage": {"input": inp, "output": out, "cost": {"total": cost}}}}) + "\n")
            f.write(json.dumps({"type": "message", "message": {"role": "user", "timestamp": 9000000}}) + "\n")
            f.write("not json\n")
        self.assertEqual(ledger.usage([d], since=0)["tokens_in"], 60)
        u = ledger.usage([d], since=5000)
        self.assertEqual((u["tokens_in"], u["tokens_out"]), (50, 5))
        self.assertAlmostEqual(u["cost_usd"], 0.5)

    def test_discord_post_uses_the_webhook(self):
        os.environ["TEACHER_OS_AI_HANDLE_WEBHOOK_URL"] = "http://discord.test/hook"
        seen = []
        try:
            self.assertTrue(ledger.post_discord("hello", opener=lambda req, timeout: seen.append(req)))
        finally:
            del os.environ["TEACHER_OS_AI_HANDLE_WEBHOOK_URL"]
        self.assertEqual(seen[0].full_url, "http://discord.test/hook")
        self.assertIn(b"hello", seen[0].data)

    def test_parse_since(self):
        self.assertEqual(ledger.parse_since("7d", 1000000), 1000000 - 7 * 86400)
        self.assertEqual(ledger.parse_since("12h", 100000), 100000 - 43200)


if __name__ == "__main__":
    unittest.main()
