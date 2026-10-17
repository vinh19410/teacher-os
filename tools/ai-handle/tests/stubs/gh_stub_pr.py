"""PR / run / commit handlers for the gh test stub.

PRs live in board.json under "prs"; CI runs under "runs". Fields a test may
set on a PR: number, url, title, body, headRefName, baseRefName, state
(OPEN|MERGED|CLOSED), labels, files [{path,additions,deletions}], diff,
checks [{name,bucket,state}], behind, mergedBy, mergeCommit {oid, message}.
"""
import json
import os
import subprocess
import sys
import time

REPO = "vinh19410/teacher-os"


def flag(argv, name, default=None):
    for i, a in enumerate(argv):
        if a == name and i + 1 < len(argv):
            return argv[i + 1]
    return default


def has(argv, name):
    return name in argv


def positional(argv):
    """First bare token after the subcommand (the PR / run number)."""
    skip = {"--repo", "--head", "--base", "--state", "--search", "--json", "--jq", "--limit",
            "--body", "--body-file", "--title", "--subject", "--add-label", "--remove-label",
            "--branch", "-R", "-L", "-q", "-t", "-b", "-H", "-B"}
    i = 2
    while i < len(argv):
        if argv[i] in skip:
            i += 2
            continue
        if not argv[i].startswith("-"):
            return argv[i]
        i += 1
    return None


def emit(obj, argv):
    """Print JSON, honouring --json FIELDS (filter) and --jq EXPR (post-process)."""
    fields = flag(argv, "--json")
    if fields:
        wanted = [f.strip() for f in fields.split(",")]
        if isinstance(obj, list):
            obj = [{k: v for k, v in o.items() if k in wanted} for o in obj]
        else:
            obj = {k: v for k, v in obj.items() if k in wanted}
    text = json.dumps(obj)
    expr = flag(argv, "--jq") or flag(argv, "-q")
    if expr:
        text = subprocess.run(["jq", "-r", expr], input=text, capture_output=True, text=True).stdout.rstrip("\n")
    print(text)


def find_pr(data, number):
    for p in data.get("prs", []):
        if p["number"] == int(number):
            return p
    return None


def view_of(p):
    out = dict(p)
    out.setdefault("url", "https://github.com/%s/pull/%d" % (REPO, p["number"]))
    out.setdefault("labels", [])
    out["labels"] = [{"name": l} if isinstance(l, str) else l for l in out["labels"]]
    out.setdefault("mergedAt", None)
    out.setdefault("mergeCommit", None)
    out["isDraft"] = False
    out["mergeStateStatus"] = "BEHIND" if p.get("behind") else "CLEAN"
    return out


def advance_dev(n):
    """A real merge moves origin/develop: mimic it so update-branch logic has work to do."""
    seed = os.path.join(os.environ.get("AI_HANDLE_TEST_DIR", ""), "seed")
    if not os.path.isdir(seed):
        return
    for cmd in (["commit", "-q", "--allow-empty", "-m", "merge pr %s" % n], ["push", "-q", "origin", "develop"]):
        subprocess.run(["git", "-C", seed, "-c", "user.email=t@e.com", "-c", "user.name=t", *cmd],
                       capture_output=True)


def handle(argv, Board, log):
    cmd, sub = argv[0], (argv[1] if len(argv) > 1 else "")
    if cmd == "pr":
        return handle_pr(argv, sub, Board, log)
    if cmd == "run":
        return handle_run(argv, sub, Board, log)
    if cmd == "api" and argv[1].startswith("repos/%s/commits/" % REPO):
        sha = argv[1].rsplit("/", 1)[1]
        with Board() as b:
            for p in b.data.get("prs", []):
                mc = p.get("mergeCommit") or {}
                if mc.get("oid") == sha:
                    emit({"sha": sha, "commit": {"message": mc.get("message", "")}}, argv)
                    return True
        sys.exit(1)
    return False


def handle_pr(argv, sub, Board, log):
    with Board() as b:
        data = b.data
        if sub == "list":
            out = [view_of(p) for p in data.get("prs", [])]
            head, base, state = flag(argv, "--head"), flag(argv, "--base"), (flag(argv, "--state") or "open").lower()
            if head:
                out = [p for p in out if p["headRefName"] == head]
            if base:
                out = [p for p in out if p.get("baseRefName", "develop") == base]
            if state != "all":
                out = [p for p in out if p["state"].lower() == state]
            search = flag(argv, "--search")
            if search and search.startswith("#"):
                ref = search.split()[0]
                out = [p for p in out if ref in (p.get("body") or "") or ref in (p.get("title") or "")]
            emit(out, argv)
            return True
        if sub == "create":
            n = max([p["number"] for p in data.get("prs", [])] + [100]) + 1
            body = flag(argv, "--body")
            if body is None and flag(argv, "--body-file"):
                body = open(flag(argv, "--body-file")).read()
            data.setdefault("prs", []).append({
                "number": n, "title": flag(argv, "--title", ""), "body": body or "",
                "headRefName": flag(argv, "--head", ""), "baseRefName": flag(argv, "--base", "develop"),
                "state": "OPEN", "labels": [], "files": [], "checks": [], "diff": ""})
            log("PR-CREATE #%d head=%s base=%s title=%s" % (n, flag(argv, "--head", ""), flag(argv, "--base", "develop"), flag(argv, "--title", "")))
            print("https://github.com/%s/pull/%d" % (REPO, n))
            return True
        n = positional(argv)
        p = find_pr(data, n) if n else None
        if p is None:
            print("gh stub: no such PR %s" % n, file=sys.stderr)
            sys.exit(1)
        if sub == "view":
            emit(view_of(p), argv)
        elif sub == "diff":
            if has(argv, "--name-only"):
                print("\n".join(f["path"] for f in p.get("files", [])))
            else:
                print(p.get("diff", ""))
        elif sub == "checks":
            checks = p.get("checks", [])
            if has(argv, "--json") or flag(argv, "--json"):
                emit(checks, argv)
            else:
                for c in checks:
                    print("%s\t%s" % (c["name"], c.get("bucket", "pass")))
            if any(c.get("bucket") == "fail" for c in checks):
                sys.exit(1)
            if any(c.get("bucket") == "pending" for c in checks):
                sys.exit(8)
        elif sub == "comment":
            body = flag(argv, "--body")
            if body is None and flag(argv, "--body-file"):
                body = open(flag(argv, "--body-file")).read()
            p.setdefault("comments", []).append({"body": body or ""})
            log("COMMENT pr #%s" % n)
        elif sub == "edit":
            for i, a in enumerate(argv):
                if a == "--add-label" and argv[i + 1] not in p["labels"]:
                    p["labels"].append(argv[i + 1])
        elif sub == "update-branch":
            p["behind"] = False
            p["updates"] = p.get("updates", 0) + 1
            for c in p.get("checks", []):
                if c.get("rerun_pass", True):
                    c["bucket"] = "pass"
            log("UPDATE-BRANCH pr #%s" % n)
        elif sub == "merge":
            if os.environ.get("AI_HANDLE_TEST_MERGE_FAIL") == "1":
                print("merge failed (stub)", file=sys.stderr)
                sys.exit(1)
            message = flag(argv, "--body") or ""
            p["state"] = "MERGED"
            p["mergedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            p["mergedBy"] = os.environ.get("AI_HANDLE_TEST_MERGER", "vinh19410")
            p["mergeCommit"] = {"oid": "sha%d" % int(n), "message": (flag(argv, "--subject") or "Merge") + "\n\n" + message}
            data.setdefault("merge_order", []).append(int(n))
            log("MERGE pr #%s msg=%s" % (n, message.replace("\n", " | ")))
            advance_dev(n)
            if os.environ.get("AI_HANDLE_TEST_FAIL_AFTER_MERGE") == "1":
                open(os.path.join(os.environ.get("AI_HANDLE_TEST_DIR", ""), "npm-fail"), "w").close()
        else:
            return False
        return True


def handle_run(argv, sub, Board, log):
    with Board() as b:
        runs = b.data.get("runs", [])
        if sub == "list":
            branch = flag(argv, "--branch")
            out = [r for r in runs if not branch or r.get("headBranch") == branch]
            emit(out, argv)
            return True
        if sub == "view":
            n = positional(argv)
            r = next((x for x in runs if str(x["databaseId"]) == str(n)), None)
            if r is None:
                sys.exit(1)
            if has(argv, "--log-failed") or has(argv, "--log"):
                print(r.get("log", ""))
            else:
                emit(r, argv)
            return True
    return False
