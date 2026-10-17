#!/usr/bin/env bash
# Operations ledger, ops agent and the human-merge follow-up. Stubs only.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

AC_BODY=$'### Acceptance criteria\n\n- [ ] it works\n'

start() {
  setup_sandbox
  export TEACHER_OS_AI_HANDLE_MODEL=impl-model TEACHER_OS_AI_HANDLE_RETRY_COOLDOWN=0 TEACHER_OS_AI_HANDLE_MAX_ATTEMPTS=3
  board_add 1 Ready "ledger me" ai-handle "$AC_BODY"
}
run_once() { run_watch > "$T/pass.out" 2>&1; wait_workers 120; }

echo "== a shipped run: one merged row with usage =="
start
run_once
check "ledger row" "merged|implement|" "$(ledger_rows 'issue=1')"
check "model recorded" impl-model "$(sqlite3 "$T/state/ledger.db" "select model from attempts where issue=1")"
check "no token usage: the agent runs inside Orca" 1 "$(sqlite3 "$T/state/ledger.db" "select count(*) from attempts where issue=1 and cost_usd is null and tokens_in is null")"
check "PR number recorded" 100 "$(sqlite3 "$T/state/ledger.db" "select pr from attempts where issue=1")"
check "report falls back to run minutes" 1 "$(python3 "$TOOL_DIR/ledger.py" report --since 7d | grep -c 'Cost per Accepted Task: .*phút chạy')"
teardown_sandbox

echo "== failures: omp failure is a model cause, outage an infrastructure cause =="
start
printf 'fail\n' > "$T/omp-modes"
run_once
check "agent failure" "failed|implement|model" "$(ledger_rows 'issue=1')"
teardown_sandbox
start
export TEACHER_OS_AI_HANDLE_INFRA_BACKOFF_SECS="3600"
printf 'netfail\n' > "$T/omp-modes"
run_once
check "outage" "infra_failure|implement|infrastructure" "$(ledger_rows 'issue=1')"
teardown_sandbox

echo "== blocked: the ops agent comments once and tags the cause =="
start
export AI_HANDLE_TEST_OMP_NOPR=1                  # every run ends without a PR -> failure
for i in 1 2 3; do run_once; done
check "three attempts used" 3 "$(state_field 1 '.attempts | length')"
check "last row is blocked" blocked "$(ledger_rows 'issue=1' | tail -1 | cut -d'|' -f1)"
check "ops comment posted once" 1 "$(board_field 1 '[.comments[] | select(.body | contains("ai-handle:ops"))] | length')"
check_contains "ops comment carries the runbook" "run watch.sh --status" "$(board_field 1 '.comments[-1].body')"
check "ledger cause set by the ops agent" infrastructure "$(ledger_rows 'issue=1' | tail -1 | cut -d'|' -f3)"
run_watch --ops 1 again > /dev/null 2>&1
check "a second request does not comment again" 1 "$(board_field 1 '[.comments[] | select(.body | contains("ai-handle:ops"))] | length')"
teardown_sandbox

echo "== a human merges a PR the agent left open =="
start
printf 'open\n' > "$T/omp-modes"
run_once
check "parked" awaiting_review "$(state_field 1 .status)"
pr_set 100 '.state="MERGED"'
run_watch > "$T/2.out" 2>&1
check "state records the human merge" merged "$(state_field 1 .status)"
check "card Ready to ship" "Ready to ship" "$(board_status 1)"
check "label added" 1 "$(calls_count 'LABEL \+ready to ship beta #1')"
check "ledger has both rows" "awaiting_review/implement merged/merge" \
  "$(sqlite3 "$T/state/ledger.db" "select group_concat(outcome||'/'||stage, ' ') from attempts where issue=1")"
run_watch > "$T/3.out" 2>&1
check "idempotent: no second merged row" 1 "$(sqlite3 "$T/state/ledger.db" "select count(*) from attempts where outcome='merged'")"
teardown_sandbox

echo "== manual overrides are counted as human interventions =="
start
board_add 2 "In progress" "stuck" ai-handle "$AC_BODY"
run_watch --recover 2 > /dev/null 2>&1
printf '{"runs":{"2":{"status":"failed","attempts":[]}}}' > "$T/state/state.json"
run_watch --reset 2 > /dev/null 2>&1
check "recover and reset rows" "manual_recover manual_reset" "$(sqlite3 "$T/state/ledger.db" "select group_concat(outcome, ' ') from attempts where issue=2")"
teardown_sandbox

finish
