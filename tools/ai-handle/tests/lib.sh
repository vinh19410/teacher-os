#!/usr/bin/env bash
# Shared sandbox for the ai-handle shell tests. Source it, then call
# setup_sandbox. Nothing here talks to GitHub, Discord or a model: `gh`,
# `omp` and `curl` resolve to the stubs in ./stubs, the git origin is a local
# bare repository, and every state/config/worktree path lives in a temp dir.

TESTS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TOOL_DIR=$(cd "$TESTS_DIR/.." && pwd)
WATCH_SH="${WATCH_SH:-$TOOL_DIR/watch.sh}"

PASS=0
FAIL=0

setup_sandbox() {
  T=$(mktemp -d "${TMPDIR:-/tmp}/ai-handle-test.XXXXXX")
  export AI_HANDLE_TEST_DIR="$T"
  export AI_HANDLE_TEST_BOARD="$T/board.json"
  export AI_HANDLE_TEST_CALLS="$T/calls.log"
  : > "$AI_HANDLE_TEST_CALLS"
  export TEACHER_OS_AI_HANDLE_STATE_DIR="$T/state"
  export TEACHER_OS_AI_HANDLE_CONFIG_DIR="$T/config"
  export TEACHER_OS_AI_HANDLE_CLONE_DIR="$T/clone"
  export TEACHER_OS_AI_HANDLE_ORCA_PROJECT="$T/project"
  export TEACHER_OS_AI_HANDLE_WEBHOOK_URL="http://discord.test/hook"
  export TEACHER_OS_AI_HANDLE_GH_TOKEN_FILE="$T/config/gh-token"
  export TEACHER_OS_AI_HANDLE_TICK_SECS=1
  export TEACHER_OS_AI_HANDLE_HEARTBEAT_SECS=1
  export PATH="$TESTS_DIR/stubs:$PATH"
  mkdir -p "$T/config" "$T/state" "$T/project"

  git init -q --bare -b develop "$T/origin.git"
  git clone -q "$T/origin.git" "$T/seed" 2>/dev/null
  (
    cd "$T/seed"
    git checkout -q -b develop
    git config user.email test@example.com
    git config user.name test
    echo seed > README.md
    git add README.md
    git commit -q -m seed
    git push -q origin develop
  )
  git clone -q "$T/origin.git" "$TEACHER_OS_AI_HANDLE_CLONE_DIR"

  cat > "$AI_HANDLE_TEST_BOARD" <<'JSON'
{"options":{"Backlog":"o_backlog","Ready":"o_ready","In progress":"o_prog","In review":"o_review","Ready to ship":"o_rts","Done":"o_done"},"items":[]}
JSON
  trap 'teardown_sandbox' EXIT
}

teardown_sandbox() {
  local f pid
  [ -n "${T:-}" ] && [ -d "$T" ] || return 0
  unset AI_HANDLE_TEST_OMP_SLEEP AI_HANDLE_TEST_OMP_MODE AI_HANDLE_TEST_SLOW_READY \
    AI_HANDLE_TEST_SLOW_ITEMS AI_HANDLE_TEST_OFFLINE TEACHER_OS_AI_HANDLE_STALL_SECS \
    TEACHER_OS_AI_HANDLE_KILL_GRACE_SECS TEACHER_OS_AI_HANDLE_INFRA_BACKOFF_SECS \
    AI_HANDLE_TEST_OMP_NOPR AI_HANDLE_TEST_OMP_FILES AI_HANDLE_TEST_PR AI_HANDLE_TEST_BRANCH \
    AI_HANDLE_TEST_ORCA_CHAT TEACHER_OS_AI_HANDLE_ORCA_PROJECT \
    TEACHER_OS_AI_HANDLE_MODEL TEACHER_OS_AI_HANDLE_RETRY_COOLDOWN TEACHER_OS_AI_HANDLE_SPEC_GATE
  for f in "$T"/state/running/*/pid; do
    [ -f "$f" ] || continue
    pid=$(cat "$f" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
    fi
  done
  pkill -f "$T" 2>/dev/null || true
  rm -rf "$T"
  return 0
}

# board_add <number> <status> <title> [labels-csv] [body]
board_add() {
  local n="$1" status="$2" title="$3" labels="${4-ai-handle}" tmp
  local body="${5-$'### Acceptance criteria\n\n- [ ] done\n'}"
  tmp=$(mktemp)
  jq --argjson n "$n" --arg s "$status" --arg t "$title" --arg l "$labels" --arg b "$body" '
    .items += [{id:("ITEM_"+($n|tostring)), number:$n, title:$t, state:"OPEN",
      url:("https://github.com/vinh19410/teacher-os/issues/"+($n|tostring)),
      repo:"vinh19410/teacher-os", status:$s, labels:($l|split(",")|map(select(length>0))), body:$b, comments:[]}]
  ' "$AI_HANDLE_TEST_BOARD" > "$tmp" && mv "$tmp" "$AI_HANDLE_TEST_BOARD"
}

board_set() { # <number> <jq-path-assignment e.g. .status="Ready">
  local tmp
  tmp=$(mktemp)
  jq --argjson n "$1" "(.items[] | select(.number==\$n)) |= ($2)" "$AI_HANDLE_TEST_BOARD" > "$tmp" && mv "$tmp" "$AI_HANDLE_TEST_BOARD"
}

board_field() { # <number> <jq-expr on the item>
  jq -r --argjson n "$1" ".items[] | select(.number==\$n) | $2" "$AI_HANDLE_TEST_BOARD"
}

pr_add() { # <jq-object-literal> — append a PR fixture to the board file
  local tmp
  tmp=$(mktemp)
  jq --argjson pr "$1" '.prs = ((.prs // []) + [$pr])' "$AI_HANDLE_TEST_BOARD" > "$tmp" && mv "$tmp" "$AI_HANDLE_TEST_BOARD"
}

pr_set() { # <number> <jq assignment on the PR>
  local tmp
  tmp=$(mktemp)
  jq --argjson n "$1" "(.prs[] | select(.number==\$n)) |= ($2)" "$AI_HANDLE_TEST_BOARD" > "$tmp" && mv "$tmp" "$AI_HANDLE_TEST_BOARD"
}

pr_field() { # <number> <jq-expr on the PR>
  jq -r --argjson n "$1" ".prs[] | select(.number==\$n) | $2" "$AI_HANDLE_TEST_BOARD"
}

board_status() { board_field "$1" .status; }
stage_is() { [ "$(state_field "$1" .stage)" = "$2" ]; }
board_is() { [ "$(board_status "$1")" = "$2" ]; }
lock_exists() { [ -f "$TEACHER_OS_AI_HANDLE_STATE_DIR/running/issue-$1/pid" ]; }
outbox_lines() { local c; c=$(grep -c . "$TEACHER_OS_AI_HANDLE_STATE_DIR/outbox.jsonl" 2>/dev/null || true); echo "${c:-0}"; }

calls_count() { # <grep-ere>
  grep -cE -- "$1" "$AI_HANDLE_TEST_CALLS" 2>/dev/null || true
}

impl_calls() { local c; c=$(grep -c -- '^LAUNCH' "$T/omp-calls.log" 2>/dev/null || true); echo "${c:-0}"; }
orca_calls() { local c; c=$(grep -cE -- "$1" "$T/orca-calls.log" 2>/dev/null || true); echo "${c:-0}"; }
orca_wt_count() { # ai-handle worktrees still registered on the sandbox clone
  local c; c=$(git -C "$TEACHER_OS_AI_HANDLE_CLONE_DIR" worktree list 2>/dev/null | grep -c 'ai-handle-issue-' || true); echo "${c:-0}"; }
merge_count() { calls_count '^MERGE pr #'; }

ledger_rows() { # <where-clause> -> "outcome|stage|cause" lines
  sqlite3 "$TEACHER_OS_AI_HANDLE_STATE_DIR/ledger.db" \
    "select outcome, stage, ifnull(failure_cause,'') from attempts where $1 order by id" 2>/dev/null
}

omp_calls() { local c; c=$(grep -c . "$T/omp-calls.log" 2>/dev/null || true); echo "${c:-0}"; }

state_field() { # <issue> <jq-expr on the run record>
  jq -r --arg n "$1" ".runs[\$n] | $2" "$TEACHER_OS_AI_HANDLE_STATE_DIR/state.json" 2>/dev/null
}

live_workers() { # per-issue locks whose holder is alive
  local c=0 f pid
  for f in "$TEACHER_OS_AI_HANDLE_STATE_DIR"/running/issue-*/pid; do
    [ -f "$f" ] || continue
    pid=$(cat "$f" 2>/dev/null || true)
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && c=$((c + 1))
  done
  echo "$c"
}

workers_running() { # any worker process of THIS checkout's watch.sh, or a live slot
  pgrep -f "bash $WATCH_SH --worker" >/dev/null 2>&1 && return 0
  [ "$(live_workers)" != "0" ]
}

wait_workers() { # [timeout-seconds]
  local i max="${1:-60}"
  sleep 0.4
  for i in $(seq 1 $((max * 5))); do
    workers_running || return 0
    sleep 0.2
  done
  echo "timeout waiting for workers" >&2
  return 1
}

wait_for() { # <timeout-seconds> <command...> — poll until it succeeds
  local i max="$1"; shift
  for i in $(seq 1 $((max * 5))); do
    "$@" >/dev/null 2>&1 && return 0
    sleep 0.2
  done
  return 1
}

run_watch() { bash "$WATCH_SH" "$@"; }

ok() { # <name>
  PASS=$((PASS + 1)); echo "  ok: $1"
}
bad() { # <name> <detail>
  FAIL=$((FAIL + 1)); echo "  FAIL: $1 — $2"
}
check() { # <name> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1 -> $3"; else bad "$1" "expected '$2', got '$3'"; fi
}
check_contains() { # <name> <needle> <haystack>
  case "$3" in *"$2"*) ok "$1" ;; *) bad "$1" "'$2' not found in: $(printf '%s' "$3" | head -c 300)" ;; esac
}
check_absent() { # <name> <needle> <haystack>
  case "$3" in *"$2"*) bad "$1" "'$2' unexpectedly present" ;; *) ok "$1" ;; esac
}

finish() {
  echo "== result: $PASS passed, $FAIL failed =="
  [ "$FAIL" -eq 0 ]
}
