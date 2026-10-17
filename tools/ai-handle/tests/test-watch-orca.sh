#!/usr/bin/env bash
# The Orca runner: worktree-create launch against the PROJECT repo, saved
# receipt JSON, terminal monitoring, close + worktree retire on session end,
# chat-kind refusal, runtime-down retry and orphan cleanup. Stubs only.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

echo "== happy path: worktree create -> monitor -> close -> retire -> settle =="
setup_sandbox
board_add 1 Ready "orca me"
run_watch > "$T/1.out" 2>&1
wait_workers 30
check "prompt is the orca template with the issue url" \
  "call ak-vibe skill with flag --ship --beta --advice https://github.com/vinh19410/teacher-os/issues/1" \
  "$(head -1 "$T/omp-prompts/1.txt")"
check_contains "create targets the project repo" "--repo path:$TEACHER_OS_AI_HANDLE_ORCA_PROJECT" "$(grep '^LAUNCH' "$T/omp-calls.log")"
check_contains "issue linked to the worktree" "--issue 1 " "$(grep '^LAUNCH' "$T/omp-calls.log")"
check_contains "agent named" "WORKTREE-CREATE mode=ok name=ai-handle-issue-1 agent=omp" "$(cat "$T/orca-calls.log")"
check "receipt json saved for monitoring (B3)" 1 "$(ls "$T"/state/sessions/issue-1/orca-launch.json 2>/dev/null | wc -l | tr -d ' ')"
check "receipt holds the terminal handle" "term_test_1" "$(jq -r '.result.launch.outcome.handle' "$T/state/sessions/issue-1/orca-launch.json")"
check "receipt holds the worktree id" "wt-test::$T/orca-workspaces/ai-handle-issue-1" "$(jq -r '.result.worktree.id' "$T/state/sessions/issue-1/orca-launch.json")"
check_contains "terminal was monitored" "READ term_test_1" "$(cat "$T/orca-calls.log")"
check_contains "terminal titled per issue" "RENAME term_test_1 ai-handle #1" "$(cat "$T/orca-calls.log")"
check "terminal closed after the session ended (B4)" 1 "$(orca_calls '^CLOSE term_test_1')"
check "orca worktree retired after the merge" 1 "$(orca_calls '^WORKTREE-RM ai-handle-issue-1')"
check "no sandbox worktree leaked" 0 "$(orca_wt_count)"
check "settled from the PR state (B5)" merged "$(state_field 1 .status)"
check "board updated" "Ready to ship" "$(board_status 1)"
check "handle cleared from state after settle" null "$(state_field 1 .orca_handle)"
check "worktree cleared from state after settle" null "$(state_field 1 .orca_worktree)"
teardown_sandbox

echo "== launch opens a chat instead of a terminal: refuse, park as infra =="
setup_sandbox
board_add 1 Ready "chat ui on"
export TEACHER_OS_AI_HANDLE_INFRA_BACKOFF_SECS="3600"
AI_HANDLE_TEST_ORCA_CHAT=1 run_watch > "$T/1.out" 2>&1
wait_workers 30
check "parked as infra_failure" infra_failure "$(state_field 1 .status)"
check_contains "log explains the chat outcome" "not a terminal" "$(cat "$T"/state/logs/issue-1-*.log)"
check "no terminal close attempted blindly" 0 "$(orca_calls '^CLOSE')"
check "chat worktree retired on the infra settle" 1 "$(orca_calls '^WORKTREE-RM ai-handle-issue-1')"
teardown_sandbox

echo "== runtime down: open once, retry the launch, still ships =="
setup_sandbox
board_add 1 Ready "orca restart"
touch "$T/orca-down"
run_watch > "$T/1.out" 2>&1
wait_workers 30
check "launch retried after orca open" 2 "$(orca_calls '^WORKTREE-CREATE')"
check "the retry shipped" merged "$(state_field 1 .status)"
teardown_sandbox

echo "== worker lost: the orphan terminal and worktree are retired =="
setup_sandbox
board_add 1 Ready "orphan terminal"
export AI_HANDLE_TEST_OMP_MODE=hang
run_watch > "$T/1.out" 2>&1
wait_for 10 lock_exists 1 || bad "worker lock appeared" "never"
wait_for 10 grep -q orca_handle "$T/state/state.json" || bad "agent launched and recorded" "never"
wpid=$(cat "$T/state/running/issue-1/pid")
kill -9 "$wpid"
sleep 0.5
run_watch > "$T/2.out" 2>&1
check_contains "lost worker reported" "worker lost" "$(cat "$T/2.out")"
check "orphan orca terminal closed by the reconciler" 1 "$(orca_calls '^CLOSE term_test_1')"
check "orphan orca worktree retired by the reconciler" 1 "$(orca_calls '^WORKTREE-RM ai-handle-issue-1')"
check "card returned to Ready" Ready "$(board_status 1)"
teardown_sandbox

finish
