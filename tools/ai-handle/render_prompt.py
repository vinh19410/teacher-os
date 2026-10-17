#!/usr/bin/env python3
"""Render a prompt template: replace {{NAME}} with a value, literally.

Usage: render_prompt.py <template-file> [NAME=VALUE | NAME@FILE ...]
NAME@FILE reads the value from a file (keeps big diffs out of argv).
Values are inserted verbatim (no regex or shell expansion), so URLs and
multi-line evidence containing |, & or \\ are safe. A {{NAME}} left without a
value is replaced with "none" so a missing optional section never leaks a
raw placeholder to the agent.
"""
import re
import sys


def render(template, values):
    return re.sub(r"\{\{([A-Z_]+)\}\}", lambda m: values.get(m.group(1), "none"), template)


def main(argv):
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    values = {}
    for pair in argv[1:]:
        m = re.match(r"^([A-Z_]+)([=@])(.*)$", pair, re.S)
        if not m:
            print("bad NAME=VALUE or NAME@FILE: %r" % pair[:60], file=sys.stderr)
            return 2
        name, op, value = m.groups()
        if op == "@":
            with open(value, errors="replace") as f:
                value = f.read()
        values[name] = value
    with open(argv[0]) as f:
        sys.stdout.write(render(f.read(), values))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
