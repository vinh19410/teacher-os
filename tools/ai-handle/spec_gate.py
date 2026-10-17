#!/usr/bin/env python3
"""Deterministic spec gate for ai-handle issues (no LLM involved).

Reads an issue body on stdin and prints JSON: {"ok": bool, "missing": [...],
"risk": "low"|"high", "priority": "P0".."P3"}. An issue is `ok` only when its
Acceptance criteria section holds at least one non-empty bullet or checkbox.

Recognises both the issue form's rendering ("### Acceptance criteria") and a
hand-written issue with a heading such as "## AC" or "## Acceptance criteria".
"""
import json
import re
import sys

HEADING = re.compile(r"^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$")
BULLET = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*\S)?\s*$")
NO_CONTENT = {"", "_no response_", "no response", "tbd", "todo", "n/a", "na", "none", "..."}
AC_TITLES = {"acceptance criteria", "acceptance", "ac", "acceptance criterion"}


def normalize(title):
    return re.sub(r"[^a-z0-9 ]+", "", title.lower()).strip()


def sections(body):
    """Map normalized heading -> list of body lines."""
    out, current = {}, None
    for line in body.splitlines():
        m = HEADING.match(line)
        if m:
            current = normalize(m.group(1))
            out.setdefault(current, [])
        elif current is not None:
            out[current].append(line)
    return out


def meaningful(text):
    return normalize(text) not in NO_CONTENT and text.strip().lower() not in NO_CONTENT


def acceptance_ok(lines):
    for line in lines:
        m = BULLET.match(line)
        if m and m.group(1) and meaningful(m.group(1)):
            return True
    return False


def first_value(lines):
    for line in lines:
        text = line.strip()
        if text and meaningful(text):
            return text
    return ""


def check(body):
    secs = sections(body or "")
    ac_lines = next((v for k, v in secs.items() if k in AC_TITLES or k.startswith("acceptance criteria")), None)
    missing = [] if ac_lines is not None and acceptance_ok(ac_lines) else ["acceptance criteria"]
    risk_value = first_value(secs.get("risk", [])).lower()
    priority = first_value(secs.get("priority", [])).upper()
    return {
        "ok": not missing,
        "missing": missing,
        "risk": "high" if risk_value.startswith("high") else "low",
        "priority": priority if priority in {"P0", "P1", "P2", "P3"} else "P2",
    }


if __name__ == "__main__":
    print(json.dumps(check(sys.stdin.read()), ensure_ascii=False))
