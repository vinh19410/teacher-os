import json
import os
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import outbox  # noqa: E402


class OutboxTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["TEACHER_OS_AI_HANDLE_STATE_DIR"] = self.tmp.name
        self.log = os.path.join(self.tmp.name, "delivered.log")
        self.runner = os.path.join(self.tmp.name, "runner.sh")
        # Fails on any payload containing "bad" while the marker file exists.
        with open(self.runner, "w") as f:
            f.write('#!/bin/sh\n'
                    'if [ -e "%s/fail" ] && printf %%s "$2" | grep -q bad; then exit 1; fi\n'
                    'echo "$1 $2" >> "%s"\n' % (self.tmp.name, self.log))
        os.chmod(self.runner, os.stat(self.runner).st_mode | stat.S_IXUSR)

    def tearDown(self):
        self.tmp.cleanup()

    def delivered(self):
        try:
            return open(self.log).read().splitlines()
        except FileNotFoundError:
            return []

    def test_enqueue_and_flush_keep_order(self):
        outbox.enqueue("board_status", {"item": "A", "status": "Ready"})
        outbox.enqueue("notify", {"title": "t"})
        outbox.enqueue("board_status", {"item": "A", "status": "In review"})
        self.assertEqual(outbox.count(), 3)
        delivered, remaining = outbox.flush([self.runner])
        self.assertEqual((delivered, remaining), (3, 0))
        got = self.delivered()
        self.assertEqual([g.split(" ")[0] for g in got], ["board_status", "notify", "board_status"])
        self.assertIn('"In review"', got[2])

    def test_flush_stops_at_first_failure_and_keeps_rest(self):
        open(os.path.join(self.tmp.name, "fail"), "w").close()
        outbox.enqueue("n", {"v": "ok1"})
        outbox.enqueue("n", {"v": "bad"})
        outbox.enqueue("n", {"v": "ok2"})
        delivered, remaining = outbox.flush([self.runner])
        self.assertEqual((delivered, remaining), (1, 2))
        self.assertEqual(len(self.delivered()), 1)
        os.remove(os.path.join(self.tmp.name, "fail"))
        delivered, remaining = outbox.flush([self.runner])
        self.assertEqual((delivered, remaining), (2, 0))

    def test_poisoned_entry_is_dropped_after_max_tries(self):
        open(os.path.join(self.tmp.name, "fail"), "w").close()
        outbox.enqueue("n", {"v": "bad"})
        outbox.enqueue("n", {"v": "ok"})
        for _ in range(outbox.MAX_TRIES - 1):
            outbox.flush([self.runner])
        self.assertEqual(outbox.count(), 2)
        outbox.flush([self.runner])  # drops the poisoned head, then delivers the rest
        self.assertEqual(outbox.count(), 0)
        self.assertEqual(len(self.delivered()), 1)

    def test_empty_flush_is_a_noop(self):
        self.assertEqual(outbox.flush([self.runner]), (0, 0))

    def test_cli_enqueue_roundtrip(self):
        self.assertEqual(outbox.main(["enqueue", "k", json.dumps({"a": 1})]), 0)
        self.assertEqual(outbox.count(), 1)


if __name__ == "__main__":
    unittest.main()
