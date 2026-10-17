import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from json_extract import extract_json  # noqa: E402


class ExtractJsonTest(unittest.TestCase):
    def test_last_json_fence_wins(self):
        text = 'a\n```json\n{"n": 1}\n```\nb\n```json\n{"n": 2}\n```\n'
        self.assertEqual(extract_json(text), {"n": 2})

    def test_bare_object_when_no_fence(self):
        self.assertEqual(extract_json('Diagnosis: {"severity": "P2", "runbook": ["x"]} done'),
                         {"severity": "P2", "runbook": ["x"]})

    def test_broken_fence_falls_back_to_a_bare_object(self):
        self.assertEqual(extract_json('{"ok": true}\n```json\n{broken\n```'), {"ok": True})

    def test_nothing_found(self):
        self.assertIsNone(extract_json("no json here"))
        self.assertIsNone(extract_json(""))


if __name__ == "__main__":
    unittest.main()
