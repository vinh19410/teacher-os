#!/usr/bin/env python3
"""Operations ledger for ai-handle: one row per attempt, plus the weekly report.

DB: <state dir>/ledger.db (SQLite). Subcommands:
  record --issue N --attempt K --stage S --outcome O [--model M --started T --ended T
         --failure-cause C --risk R --jev-risk X --jev-agree 0|1 --jev-status S --pr N
         --tokens-in N --tokens-out N --cost-usd F --note TEXT]
  cause  --issue N --cause C            set failure_cause on the issue's latest attempt
  usage  [--since EPOCH] DIR...         sum token usage / cost from OMP session files
  report [--since 7d] [--discord]       Cost per Accepted Task, Human Intervention Rate, ...

Stage: implement | merge | manual (verify and gate appear in rows written before
       the agent shipped by itself).
Outcome: merged | awaiting_review | failed | infra_failure | blocked | worker_lost |
         manual_recover | manual_reset (merged_outside_gate in older rows).
--risk and --jev-* are kept for older rows; nothing writes them any more.
Failure cause: requirements | context | model | skill | test | infrastructure.
"""
import argparse
import glob
import json
import os
import shutil
import sqlite3
import sys
import time
import urllib.request

TERMINAL = ("merged", "awaiting_review", "blocked", "merged_outside_gate")
HUMAN = ("awaiting_review", "blocked", "merged_outside_gate", "manual_recover", "manual_reset")

# Each migration only ever ADDS: existing rows are never rewritten or dropped.
MIGRATIONS = [
    """CREATE TABLE attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, issue INTEGER NOT NULL, attempt INTEGER,
        stage TEXT, model TEXT, started_at INTEGER, ended_at INTEGER, duration_s INTEGER,
        outcome TEXT NOT NULL, failure_cause TEXT, risk TEXT, jev_risk TEXT, jev_agree INTEGER,
        jev_status TEXT, pr INTEGER, tokens_in INTEGER, tokens_out INTEGER, cost_usd REAL)""",
    "ALTER TABLE attempts ADD COLUMN note TEXT",
]


def state_dir():
    return os.environ.get("TEACHER_OS_AI_HANDLE_STATE_DIR") or os.path.expanduser("~/.local/state/teacher-os-ai-handle")


def db_path():
    return os.path.join(state_dir(), "ledger.db")


def connect(path=None):
    path = path or db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if version < len(MIGRATIONS):
        if version > 0 and os.path.getsize(path) > 0:
            shutil.copy2(path, "%s.bak-%d" % (path, int(time.time())))   # back up before changing the schema
        for i in range(version, len(MIGRATIONS)):
            conn.execute(MIGRATIONS[i])
            conn.execute("PRAGMA user_version = %d" % (i + 1))
        conn.commit()
    return conn


COLUMNS = ("issue", "attempt", "stage", "model", "started_at", "ended_at", "duration_s", "outcome",
           "failure_cause", "risk", "jev_risk", "jev_agree", "jev_status", "pr", "tokens_in",
           "tokens_out", "cost_usd", "note")


def record(conn, **fields):
    row = {c: fields.get(c) for c in COLUMNS}
    if row["duration_s"] is None and row["started_at"] and row["ended_at"]:
        row["duration_s"] = max(0, int(row["ended_at"]) - int(row["started_at"]))
    if row["ended_at"] is None:
        row["ended_at"] = int(time.time())
    conn.execute("INSERT INTO attempts (%s) VALUES (%s)" % (",".join(COLUMNS), ",".join("?" * len(COLUMNS))),
                 [row[c] for c in COLUMNS])
    conn.commit()


def set_cause(conn, issue, cause):
    conn.execute("UPDATE attempts SET failure_cause = ? WHERE id = "
                 "(SELECT id FROM attempts WHERE issue = ? ORDER BY id DESC LIMIT 1)", (cause, issue))
    conn.commit()


def usage(dirs, since=0):
    """Sum assistant-message usage in OMP session files (per-message timestamps, ms)."""
    tin = tout = 0
    cost = 0.0
    for d in dirs:
        for path in glob.glob(os.path.join(d, "*.jsonl")):
            try:
                with open(path, errors="replace") as f:
                    lines = f.read().splitlines()
            except OSError:
                continue
            for line in lines:
                try:
                    msg = json.loads(line).get("message") or {}
                except ValueError:
                    continue
                u = msg.get("usage")
                if msg.get("role") != "assistant" or not isinstance(u, dict):
                    continue
                if since and (msg.get("timestamp") or 0) / 1000.0 < since:
                    continue
                tin += int(u.get("input") or 0)
                tout += int(u.get("output") or 0)
                cost += float((u.get("cost") or {}).get("total") or 0)
    return {"tokens_in": tin, "tokens_out": tout, "cost_usd": round(cost, 6)}


def parse_since(text, now):
    unit = {"d": 86400, "h": 3600, "m": 60}
    return now - int(text[:-1]) * unit[text[-1]]


def report(conn, since, now=None):
    now = now or int(time.time())
    rows = [dict(r) for r in conn.execute("SELECT * FROM attempts ORDER BY id")]
    window = [r for r in rows if (r["ended_at"] or 0) >= since]
    finished = {r["issue"] for r in window if r["outcome"] in TERMINAL}
    human = {r["issue"] for r in window if r["outcome"] in HUMAN}
    total = finished | human
    accepted = {r["issue"] for r in window if r["outcome"] == "merged"}

    accepted_rows = [r for r in rows if r["issue"] in accepted]
    costs = [r["cost_usd"] for r in accepted_rows if r["cost_usd"] is not None]
    have_cost = bool(costs)
    spend = sum(costs) if have_cost else sum((r["duration_s"] or 0) for r in accepted_rows) / 60.0
    failed = sum(1 for r in window if r["outcome"] == "failed")
    jev = [r for r in window if r["jev_status"] == "ok"]
    causes = {}
    for r in window:
        if r["failure_cause"]:
            causes[r["failure_cause"]] = causes.get(r["failure_cause"], 0) + 1
    outcomes = {}
    for r in window:
        outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
    return {
        "since": since, "until": now,
        "issues_finished": len(total), "accepted": len(accepted),
        "awaiting_review": len({r["issue"] for r in window if r["outcome"] == "awaiting_review"}),
        "blocked": len({r["issue"] for r in window if r["outcome"] == "blocked"}),
        "cost_basis": "usd" if have_cost else "minutes",
        "cost_per_accepted": (spend / len(accepted)) if accepted else None,
        "human_intervention_rate": (len(human) / len(total)) if total else None,
        "avg_retries": (failed / len(total)) if total else None,
        "failure_causes": causes, "outcomes": outcomes,
        "jev_checked": len(jev), "jev_agreed": sum(1 for r in jev if r["jev_agree"]),
        "risk_gate_split": {k: sum(1 for r in window if r["risk"] == k) for k in ("low", "high")},
    }


def format_report(rep, days):
    def pct(x):
        return "n/a" if x is None else "%d%%" % round(x * 100)

    if rep["cost_per_accepted"] is None:
        cost = "n/a (chưa có issue nào được chấp nhận)"
    elif rep["cost_basis"] == "usd":
        cost = "$%.2f" % rep["cost_per_accepted"]
    else:
        cost = "%.1f phút chạy (agent không báo chi phí, dùng thời gian thay thế)" % rep["cost_per_accepted"]
    causes = ", ".join("%s=%d" % kv for kv in sorted(rep["failure_causes"].items())) or "không có"
    return "\n".join([
        "Báo cáo ai-handle %d ngày qua" % days,
        "- Issue đã kết thúc: %d (được chấp nhận %d, chờ người %d, bị chặn %d)" % (
            rep["issues_finished"], rep["accepted"], rep["awaiting_review"], rep["blocked"]),
        "- Cost per Accepted Task: %s" % cost,
        "- Human Intervention Rate: %s" % pct(rep["human_intervention_rate"]),
        "- Số lần thử lại trung bình mỗi issue: %s" % ("n/a" if rep["avg_retries"] is None else "%.1f" % rep["avg_retries"]),
        "- Nguyên nhân thất bại: %s" % causes,
    ])


def webhook_url():
    if os.environ.get("TEACHER_OS_AI_HANDLE_WEBHOOK_URL"):
        return os.environ["TEACHER_OS_AI_HANDLE_WEBHOOK_URL"]
    cfg = os.environ.get("TEACHER_OS_AI_HANDLE_CONFIG_DIR") or os.path.expanduser("~/.config/teacher-os-ai-handle")
    try:
        return open(os.path.join(cfg, "discord-webhook")).readline().strip()
    except OSError:
        return ""


def post_discord(text, opener=urllib.request.urlopen):
    url = webhook_url()
    if not url:
        print("no discord webhook configured; report not posted", file=sys.stderr)
        return False
    body = json.dumps({"embeds": [{"title": "📊 ai-handle weekly report", "description": text,
                                   "color": 3447003, "footer": {"text": "teacher-os ai-handle"}}]}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        opener(req, timeout=30)
        return True
    except OSError as exc:
        print("discord post failed: %s" % exc, file=sys.stderr)
        return False


def main(argv):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record")
    r.add_argument("--issue", type=int, required=True)
    r.add_argument("--attempt", type=int)
    r.add_argument("--stage")
    r.add_argument("--model")
    r.add_argument("--started", type=int, dest="started_at")
    r.add_argument("--ended", type=int, dest="ended_at")
    r.add_argument("--outcome", required=True)
    r.add_argument("--failure-cause", dest="failure_cause")
    r.add_argument("--risk")
    r.add_argument("--jev-risk", dest="jev_risk")
    r.add_argument("--jev-agree", type=int, dest="jev_agree")
    r.add_argument("--jev-status", dest="jev_status")
    r.add_argument("--pr", type=int)
    r.add_argument("--tokens-in", type=int, dest="tokens_in")
    r.add_argument("--tokens-out", type=int, dest="tokens_out")
    r.add_argument("--cost-usd", type=float, dest="cost_usd")
    r.add_argument("--note")
    c = sub.add_parser("cause")
    c.add_argument("--issue", type=int, required=True)
    c.add_argument("--cause", required=True)
    u = sub.add_parser("usage")
    u.add_argument("--since", type=int, default=0)
    u.add_argument("dirs", nargs="+")
    rep = sub.add_parser("report")
    rep.add_argument("--since", default="7d")
    rep.add_argument("--discord", action="store_true")
    args = p.parse_args(argv)

    if args.cmd == "usage":
        print(json.dumps(usage(args.dirs, args.since)))
        return 0
    conn = connect()
    if args.cmd == "record":
        record(conn, **{k: v for k, v in vars(args).items() if k in COLUMNS})
    elif args.cmd == "cause":
        set_cause(conn, args.issue, args.cause)
    elif args.cmd == "report":
        now = int(time.time())
        data = report(conn, parse_since(args.since, now), now)
        text = format_report(data, round((now - data["since"]) / 86400))
        print(text)
        if args.discord and not post_discord(text):
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
