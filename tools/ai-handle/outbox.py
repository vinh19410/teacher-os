#!/usr/bin/env python3
"""Durable outbox for GitHub/Discord side effects that failed (usually offline).

Entries are JSON lines in <state>/outbox.jsonl: {kind, payload, ts, tries}.
`enqueue` appends; `flush` replays them in order through a runner command
(`<runner...> <kind> <payload-json>`, exit 0 = delivered) and stops at the
first failure, keeping the failed entry and everything after it. An entry
that keeps failing is dropped after MAX_TRIES so one poisoned operation can
never wedge the queue forever.

Usage:
  outbox.py enqueue <kind> <payload-json>
  outbox.py flush -- <runner> [args...]
  outbox.py count
State dir comes from TEACHER_OS_AI_HANDLE_STATE_DIR (default ~/.local/state/teacher-os-ai-handle).
"""
import fcntl
import json
import os
import subprocess
import sys
import time

MAX_TRIES = 50


def state_dir():
    return os.environ.get("TEACHER_OS_AI_HANDLE_STATE_DIR") or os.path.expanduser("~/.local/state/teacher-os-ai-handle")


def outbox_path():
    return os.path.join(state_dir(), "outbox.jsonl")


class _Locked:
    """Exclusive flock on a sidecar file so enqueue/flush never interleave."""

    def __enter__(self):
        os.makedirs(state_dir(), exist_ok=True)
        self.fh = open(outbox_path() + ".lock", "w")
        fcntl.flock(self.fh, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        self.fh.close()


def _read():
    try:
        with open(outbox_path()) as f:
            return [json.loads(line) for line in f if line.strip()]
    except FileNotFoundError:
        return []


def _write(entries):
    tmp = outbox_path() + ".tmp.%d" % os.getpid()
    with open(tmp, "w") as f:
        for e in entries:
            f.write(json.dumps(e, separators=(",", ":")) + "\n")
    os.replace(tmp, outbox_path())


def enqueue(kind, payload):
    with _Locked():
        entries = _read()
        entries.append({"kind": kind, "payload": payload, "ts": int(time.time()), "tries": 0})
        _write(entries)


def flush(runner):
    """Replay entries in order; return (delivered, remaining)."""
    with _Locked():
        entries = _read()
        delivered = 0
        while entries:
            head = entries[0]
            try:
                rc = subprocess.run(list(runner) + [head["kind"], json.dumps(head["payload"])],
                                    stdin=subprocess.DEVNULL, timeout=120).returncode
            except (subprocess.TimeoutExpired, OSError):
                rc = 1
            if rc == 0:
                entries.pop(0)
                delivered += 1
                continue
            head["tries"] = head.get("tries", 0) + 1
            if head["tries"] >= MAX_TRIES:
                print("outbox: dropping %s after %d failed tries" % (head["kind"], head["tries"]), file=sys.stderr)
                entries.pop(0)
                continue
            break
        _write(entries)
        return delivered, len(entries)


def count():
    with _Locked():
        return len(_read())


def main(argv):
    if len(argv) >= 3 and argv[0] == "enqueue":
        enqueue(argv[1], json.loads(argv[2]))
        return 0
    if argv and argv[0] == "flush":
        if "--" not in argv:
            print("usage: outbox.py flush -- <runner> [args...]", file=sys.stderr)
            return 2
        runner = argv[argv.index("--") + 1:]
        delivered, remaining = flush(runner)
        print("outbox: delivered %d, %d remaining" % (delivered, remaining))
        return 0 if remaining == 0 else 1
    if argv and argv[0] == "count":
        print(count())
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
