import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import spec_gate  # noqa: E402

FORM_BODY = """### Context

Âm thanh không phát offline.

### Scope

- [x] android
- [ ] ios

### Out of scope

_No response_

### Acceptance criteria

- [ ] Phát được âm thanh khi offline
- [ ] `npm run typecheck && npm test` pass

### Risk

Low

### Priority

P1
"""


class SpecGateTest(unittest.TestCase):
    def test_full_form_body_is_ok(self):
        r = spec_gate.check(FORM_BODY)
        self.assertTrue(r["ok"])
        self.assertEqual(r["missing"], [])
        self.assertEqual(r["risk"], "low")
        self.assertEqual(r["priority"], "P1")

    def test_no_response_acceptance_is_rejected(self):
        body = FORM_BODY.replace(
            "- [ ] Phát được âm thanh khi offline\n- [ ] `npm run typecheck && npm test` pass", "_No response_")
        r = spec_gate.check(body)
        self.assertFalse(r["ok"])
        self.assertEqual(r["missing"], ["acceptance criteria"])

    def test_handwritten_issue_with_ac_heading(self):
        body = "Fix the thing.\n\n## AC\n\n- the thing works\n- tests pass\n"
        self.assertTrue(spec_gate.check(body)["ok"])

    def test_handwritten_acceptance_criteria_heading_numbered(self):
        body = "## Acceptance Criteria:\n\n1. one\n2. two\n"
        self.assertTrue(spec_gate.check(body)["ok"])

    def test_empty_checkbox_is_not_a_criterion(self):
        self.assertFalse(spec_gate.check("## AC\n\n- [ ] \n- [ ]\n")["ok"])

    def test_placeholder_bullets_are_not_criteria(self):
        self.assertFalse(spec_gate.check("## AC\n\n- TBD\n- n/a\n")["ok"])

    def test_empty_body(self):
        r = spec_gate.check("")
        self.assertFalse(r["ok"])
        self.assertEqual(r["risk"], "low")

    def test_none_body(self):
        self.assertFalse(spec_gate.check(None)["ok"])

    def test_issue_without_ac_section(self):
        self.assertFalse(spec_gate.check("## Context\n\n- a bullet that is not AC\n")["ok"])

    def test_risk_high(self):
        r = spec_gate.check(FORM_BODY.replace("### Risk\n\nLow", "### Risk\n\nHigh"))
        self.assertTrue(r["ok"])
        self.assertEqual(r["risk"], "high")

    def test_bullets_in_other_sections_do_not_count(self):
        body = "### Scope\n\n- [x] api\n\n### Acceptance criteria\n\n_No response_\n"
        self.assertFalse(spec_gate.check(body)["ok"])


if __name__ == "__main__":
    unittest.main()
