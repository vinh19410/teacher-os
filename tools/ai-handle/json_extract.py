#!/usr/bin/env python3
"""Print the last JSON object found in stdin (a ```json fence, else a bare {...}).

Exit 1 when there is none. Used to read the machine-readable block that the
read-only agents (ops, release) end their answer with.
"""
import json
import sys


def extract_json(text):
    """Last JSON object in the text: a ```json fence first, else a balanced {...}."""
    if not text:
        return None
    fence = text.rfind("```json")
    if fence != -1:
        start = text.find("\n", fence)
        end = text.find("```", start)
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end])
            except ValueError:
                pass
    # Fallback: scan backwards for the last balanced object.
    end = text.rfind("}")
    while end != -1:
        depth = 0
        for i in range(end, -1, -1):
            if text[i] == "}":
                depth += 1
            elif text[i] == "{":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[i:end + 1])
                    except ValueError:
                        break
        end = text.rfind("}", 0, end)
    return None


if __name__ == "__main__":
    obj = extract_json(sys.stdin.read())
    if obj is None:
        sys.exit(1)
    print(json.dumps(obj))
