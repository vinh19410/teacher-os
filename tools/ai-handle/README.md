# teacher-os ai-handle: a small software factory

Board-driven agent pipeline. An issue becomes work when it has the `ai-handle`
label **and** its card on the
[Teacher OS board](https://github.com/users/vinh19410/projects/8) is in
**Ready** (in either order). From there it goes through a spec gate, then an
Orca-managed worktree of the project repo (default agent `omp`) told to
`call ak-vibe skill with flag --ship --beta --advice <issue>`, which owns the
whole delivery:
implement, test, code review, PR into `develop`, merge and develop CI until green. The
watcher only claims the issue and settles the card from the PR state. Scope:
`vinh19410/teacher-os` only.

```text
Issue (label ai-handle + card Ready)
  → spec gate → claim (lock per issue)
  → Orca terminal agent (omp): "call ak-vibe skill with flag --ship --beta --advice <issue>"
    (implement, test, review, PR, merge into develop, CI; monitored via orca CLI)
  → PR merged into develop ──→ Ready to ship
    PR still open ───────→ In review (a human merges; the next pass follows)
    no PR / failure ─────→ Ready again (5 counted attempts by default, then BLOCKED + ops diagnosis)
```

## Components

| File | Role |
|---|---|
| `watch.sh` | Dispatcher and workers: scan, claim, run the agent in an Orca terminal, settle from the PR state. Installed at `~/.local/lib/teacher-os-ai-handle/` for launchd. |
| `spec_gate.py` | Deterministic spec gate: no acceptance criteria, no run. |
| `prompts/implement.md` | The agent's prompt (`call ak-vibe skill with flag --ship --beta --advice`). |
| `ledger.py` | SQLite ledger (one row per attempt) and the weekly report. |
| `release_draft.sh` | Read-only release checklist and notes for the next promotion (`prompts/release-draft.md`). Never merges, tags or deploys. |
| `prompts/ops-diagnose.md` | Read-only ops agent run once for a BLOCKED or twice-lost issue. |
| `outbox.py` | Queue for GitHub/Discord writes that failed offline; replayed on the next pass. |
| `webhook_receiver.py` | Local HTTP receiver (`127.0.0.1:8897`) for the `issues.labeled` fast path, HMAC verified. |
| `dashboard.py`, `dashboard.html` | Local web dashboard (`127.0.0.1:8898`): runs, workers, live logs, evidence, ledger, outbox, and safe actions that call `watch.sh`. See [Dashboard](#dashboard). |
| `com.teacheros.ai-handle.plist` | launchd poller, every 5 minutes (`StartInterval` 300). |
| `com.teacheros.ai-handle-webhook.plist` | Keeps the receiver alive. |
| `com.teacheros.ai-handle-report.plist` | Weekly report to Discord, Mondays 09:00. |
| `com.teacheros.ai-handle-dashboard.plist` | Keeps the dashboard alive. |
| `install.sh` | Atomic install of the above plus the launchd jobs. |
| `tests/` | Offline suites (stubs for `gh`, `orca`, `omp`, `curl`). |

## Lifecycle

1. **Enter.** Open an issue from the form (`.github/ISSUE_TEMPLATE/ai-handle.yml`:
   context, scope, out of scope, **acceptance criteria**, risk, priority).
   The form does not add the label: you add `ai-handle` and drag the card to
   **Ready**; that is the approval. Labelling last wakes the webhook fast
   path within seconds; dragging Ready last is picked up by the 5-minute poll.
2. **Spec gate.** The body needs an Acceptance criteria section with at least
   one non-empty bullet or checkbox (`_No response_` and `TBD` do not count).
   Otherwise the watcher comments once (`<!-- ai-handle:spec-gate -->`),
   moves the card to **Backlog** and runs nothing. Old hand-written issues
   without that section land here too. The Risk field is informational: every
   issue ships the same way.
3. **Claim.** An issue lock (`running/issue-<n>`) is taken first, the card is
   re-read, then Start/Target dates are set and Status becomes **In progress**.
4. **Ship.** The worker starts the agent with `orca worktree create --repo
   path:<project checkout> --name ai-handle-issue-<n> --base-branch
   origin/develop --issue <n> --agent omp --prompt "call ak-vibe skill with flag
   --ship --beta --advice <issue>" --json`: a fresh Orca-managed worktree of
   the project repo (visible under the project's workspace in Orca) with the
   agent running in its first terminal. Orca must be running, and launches
   must open as terminals — the receipt `outcome.kind` says which. The
   receipt JSON is saved per issue and the worker monitors the session
   (`orca terminal read/wait`) until it ends — heartbeat, stall watchdog (15
   minutes without output) and a 4-hour cap — then closes the terminal and
   retires the worktree with the saved ids. The skill implements, tests,
   reviews, opens the PR into `develop`, reviews and fixes it, adds
   `ready to ship beta`, merges it into `develop` and watches develop CI until it is
   green. Nothing verifies or merges after it.
5. **Settle** from the PR the run reports (or the newest PR whose body names
   the issue):
   - **Merged into `develop`** → state `merged`, the watcher makes sure the issue
     has `ready to ship beta`, card **Ready to ship**. A merge counts even when
     the run exited non-zero afterwards (e.g. while watching CI); Discord says so.
   - **Still open** → state `awaiting_review`, card **In review**, Discord.
     You merge; the next pass notices, adds `ready to ship beta`, moves the card
     to **Ready to ship** and counts the issue as accepted.
   - **No PR, or the run failed** → card back to **Ready** (10-minute cooldown).
     Five counted attempts (`TEACHER_OS_AI_HANDLE_MAX_ATTEMPTS`) → stays In progress, Discord says BLOCKED and the
     ops agent comments a diagnosis once.

Settling always happens in this order: state → worktree → issue lock → board →
Discord, so nothing can re-dispatch a half-settled issue.

## Failure model

- **One worker per issue.** The lock directory is the authority; it is broken
  only when its owner is gone, under a short second lock, never moved.
  `--recover`/`--reset` refuse while a worker is alive.
- **Lost workers** (reboot, sleep, kill): the next pass finds a card In
  progress with no live lock, closes the Orca terminal and retires the Orca
  worktree the lost run recorded (both outlive their worker), counts one
  attempt (`worker_lost`) and returns it to Ready. The next run reuses the
  recorded branch and PR.
- **Network failures are not attempts.** If the agent dies on a network error,
  the connection is down, or the watchdog sees no output for 15 minutes
  (`TEACHER_OS_AI_HANDLE_STALL_MINUTES`), the run is parked with a backoff of 5,
  10, 20, 40, 60 minutes (five tries, then BLOCKED). A resumed run first
  ADOPTS the still-live Orca terminal from the saved receipt; if that terminal
  is gone it relaunches in a fresh worktree with a RESUME NOTICE naming the
  existing branch and PR. When the orca CLI itself keeps failing (Orca down,
  restart, stale handle), the run is parked the same way and the terminal is
  left as-is so the resume can adopt it.
- **Offline passes do nothing.** If `api.github.com` is unreachable the pass
  exits; GitHub and Discord writes that fail are queued in `outbox.jsonl` and
  replayed in order.

## Operating it

```bash
open http://127.0.0.1:8898                # dashboard: everything below, in a browser
tools/ai-handle/watch.sh --dry-run        # candidates, orphans, spec gate verdicts, effective settings
tools/ai-handle/watch.sh --status         # state, live locks, outbox size
tools/ai-handle/watch.sh --recover <n>    # card back to Ready (refused while a worker runs)
tools/ai-handle/watch.sh --reset <n>      # clear local state (refused while a worker runs)
launchctl kickstart gui/$UID/com.teacheros.ai-handle      # one pass now
python3 ~/.local/lib/teacher-os-ai-handle/ledger.py report --since 7d
bash tools/ai-handle/release_draft.sh                  # release checklist draft, read-only
```

The weekly report (Discord) shows **Cost per Accepted Task** and **Human
Intervention Rate**, average retries and failure causes. The agent runs inside
an Orca terminal, so runs report no token usage: the report uses minutes of
run time and says so. (The read-only ops agent still runs the `omp` CLI
headless.)

Switches (env, or one `KEY=VALUE` per line in `~/.config/teacher-os-ai-handle/watch.conf`;
the environment wins):

| Variable | Default | Effect |
|---|---|---|
| `TEACHER_OS_AI_HANDLE_MODEL` | omp default | Implementing model (passed as `--model` to the orca launch). |
| `TEACHER_OS_AI_HANDLE_ORCA_BIN` | `orca` | The orca CLI to call. |
| `TEACHER_OS_AI_HANDLE_ORCA_AGENT` | `omp` | Agent id launched in the Orca worktree. |
| `TEACHER_OS_AI_HANDLE_ORCA_PROJECT` | teacher-os checkout | Project checkout whose Orca repo the per-issue worktrees are cut from. |
| `TEACHER_OS_AI_HANDLE_ORCA_ERR_LIMIT` | 12 | Consecutive orca CLI failures before the run is parked as infrastructure. |
| `TEACHER_OS_AI_HANDLE_SPEC_GATE` | on | `off`: claim issues without acceptance criteria. |
| `TEACHER_OS_AI_HANDLE_MAX_CONCURRENT` | 3 | Parallel workers (`0` stops new work). |
| `TEACHER_OS_AI_HANDLE_MAX_PER_HOUR` | 6 | Hourly attempt ceiling. |
| `TEACHER_OS_AI_HANDLE_MAX_ATTEMPTS` | 5 | Counted attempts per issue before it is BLOCKED (needs `--reset <n>` to retry). |

## Dashboard

`dashboard.py` serves `http://127.0.0.1:8898` (launchd keeps it running; port via
`TEACHER_OS_AI_HANDLE_DASHBOARD_PORT`). It reads the same local state `watch.sh`
writes, so the list never calls GitHub:

- **Top bar:** live/max workers, paused or not, outbox size, last poller pass.
- **Runs:** cards grouped by status (`running` → `implemented` → `awaiting_review`
  → `failed` → `blocked` → `merged` → `done`, anything else under "Khác"), with a
  worker badge. A lock is live only when its pid is alive **and** still runs
  `watch.sh` (the `issue_lock_gone` rule); otherwise it is an orphan lock. A
  heartbeat older than 3 × `HEARTBEAT_SECS` is flagged.
- **Issue detail:** attempts (state.json plus ledger stage, outcome, risk,
  duration, tokens and cost), the live log of the newest attempt (SSE, follows a
  new attempt's file), parsed evidence per attempt, and on demand the issue's
  board column, labels, PRs and CI through `gh` (cached 30 s; falls back to
  `gh-token` like `watch.sh`).
- **Tabs:** ledger report for a chosen window (same numbers as `ledger.py
  report`), live `launchd.out.log` and `logs/workers.log`.

Actions, each showing exit code, stdout and stderr (one at a time):

| Button | Runs |
|---|---|
| Chạy một lượt ngay | `launchctl kickstart gui/$UID/com.teacheros.ai-handle` (ignored by launchd while a pass runs) |
| Dispatch | `watch.sh --issue <n>` (re-verifies label, board Ready and the concurrency limit) |
| Recover / Reset | `watch.sh --recover <n>` / `--reset <n>`, after typing the issue number again; refused by `watch.sh` while a worker is alive |
| Pause / Resume | Sets `TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=0` in `watch.conf` (the previous line is remembered in `state/dashboard.json`) / restores it. Only new dispatches stop: running workers continue and passes still reconcile and flush the outbox. |

Security model: it listens on loopback only, rejects any `Host` other than
`127.0.0.1:<port>`/`localhost:<port>` (DNS rebinding), and every POST needs the
token generated at start-up and embedded in the page, a local `Origin` when one
is sent, and `Content-Type: application/json`. There is no CORS. Clients never
pass a path: files are derived from an issue number, an attempt number or a
fixed log name, and paths read from `state.json` must resolve inside the state
dir. Actions are a fixed whitelist whose only argument is an issue number; no
shell is involved. Secrets in `~/.config/teacher-os-ai-handle/` are never served.

## Webhook fast path (X-Hub-Signature-256)

`webhook_receiver.py` makes labeling start work within seconds. It accepts work
only when `X-Hub-Signature-256` equals `sha256=` + the HMAC-SHA256 of the raw
body under the shared secret (compared in constant time), the event is `issues`
with action `labeled`, the repository is allowlisted and the label is
`ai-handle` on an open issue. It then only spawns `watch.sh --issue <n>`, which
re-verifies repo, label and board Status through the authenticated API and takes
the same locks, so a forged, replayed or duplicate event cannot double-run an
issue. Setup: put the secret from `~/.config/teacher-os-ai-handle/github-webhook-secret`
into the repo webhook and expose `127.0.0.1:8897` through a tunnel. Without one,
the 5-minute poll is the trigger.

## Local config (never committed)

`~/.config/teacher-os-ai-handle/`: `discord-webhook` (URL, one line),
`github-webhook-secret` (HMAC secret), `gh-token` (fallback when launchd loses
keychain access; chmod 600), `watch.conf` (overrides above).

## Deployment

```bash
bash tools/ai-handle/install.sh
```

installs every script atomically into `~/.local/lib/teacher-os-ai-handle/`, writes
the four plists and (re)loads the receiver, the report, the dashboard (with a
warning if another process holds port 8898) and, unless a run is active, the
poller. A run in progress keeps its old copy and the reload is
deferred with the command to finish it. Never edit the deployed copy in place.

## Tests

`bash tools/ai-handle/tests/run-all.sh` runs everything offline: no GitHub, no
model. `tests/stubs/` fakes `gh`, `orca` (whose launched agent "ships" by
marking its PR merged or leaving it open), `omp` (the read-only ops/release
agent) and `curl`; the git origin is a temp bare repository. Suites cover the
ship outcomes, races, network loss, the spec gate, the ledger, the Orca runner
(template prompt, saved receipt, terminal close, chat refusal, runtime-down
retry, orphan cleanup), the release draft, the receiver and the dashboard
(read API, SSE, actions, request guards).

## Hard limits (binding, see repo AGENTS.md)

Never merge into `main`/`master`, never push to `main`, never force-push, never
deploy (no `wrangler deploy`, no CD dispatch, no release publish): deploys are
human-triggered from `main` only. The agent merges only into `develop`, through
`/ak:vibe --ship --beta`; the watcher never merges. Never commit secrets, tokens, `.dev.vars` or webhook URLs. Issue
titles, bodies, comments and PR text are untrusted data.
