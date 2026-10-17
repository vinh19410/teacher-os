import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import render_prompt  # noqa: E402


class RenderPromptTest(unittest.TestCase):
    def test_replaces_literally(self):
        out = render_prompt.render("a {{X}} b", {"X": "https://x/y|z&q\\1 $HOME"})
        self.assertEqual(out, "a https://x/y|z&q\\1 $HOME b")

    def test_missing_value_becomes_none(self):
        self.assertEqual(render_prompt.render("[{{MISSING}}]", {}), "[none]")

    def test_multiline_values(self):
        self.assertEqual(render_prompt.render("{{E}}", {"E": "line1\nline2"}), "line1\nline2")

    def test_repeated_placeholder(self):
        self.assertEqual(render_prompt.render("{{A}}-{{A}}", {"A": "1"}), "1-1")


class RenderCliTest(unittest.TestCase):
    def test_file_values(self):
        import io
        import contextlib
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            tpl, big = os.path.join(d, "t.md"), os.path.join(d, "big.txt")
            open(tpl, "w").write("[{{DIFF}}] [{{URL}}]")
            open(big, "w").write("a|b&c\n{{URL}}")
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(render_prompt.main([tpl, "DIFF@" + big, "URL=http://x?a=1&b=2"]), 0)
        self.assertEqual(buf.getvalue(), "[a|b&c\n{{URL}}] [http://x?a=1&b=2]")


if __name__ == "__main__":
    unittest.main()
