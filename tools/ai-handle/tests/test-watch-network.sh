#!/usr/bin/env bash
# Network resilience: outages are not attempts, runs resume in place, and
# GitHub/Discord writes made while offline are replayed later. Stubs only.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

echo "== (1) omp dies on a network error: not counted, worktree kept =="
setup_sandbox
board_add 1 Ready "net 1"
export TEACHER_OS_AI_HANDLE_INFRA_BACKOFF_SECS="1 1 1 1 1"
printf 'netfail\n' > "$T/omp-modes"
run_watch > "$T/1.out" 2>&1
wait_workers 30
check "state is infra_failure" infra_failure "$(state_field 1 .status)"
check "attempts untouched" 0 "$(state_field 1 '.attempts | length')"
check "infra attempt counted separately" 1 "$(state_field 1 .infra_attempts)"
check "orca worktree kept for the resume" 1 "$(orca_wt_count)"
check "nothing retired yet" 0 "$(orca_calls '^WORKTREE-RM')"
check "card back to Ready" Ready "$(board_status 1)"
check "no issue lock left" 0 "$(ls "$T"/state/running 2>/dev/null | wc -l | tr -d ' ')"
first_name=$(grep -o 'name=ai-handle-issue-1' "$T/omp-calls.log" | head -1)

echo "== (2) next pass resumes the same worktree and session =="
sleep 1.5
run_watch > "$T/2.out" 2>&1
wait_workers 30
check "second omp call made" 2 "$(omp_calls)"
check "both runs used the issue's worktree name" 2 "$(grep -c 'name=ai-handle-issue-1' "$T/omp-calls.log")"
check "orca receipt kept for monitoring" 1 "$(ls "$T"/state/sessions/issue-1/orca-launch.json 2>/dev/null | wc -l | tr -d ' ')"
check_contains "prompt carries the resume notice" "RESUME NOTICE" "$(cat "$T/omp-prompts/2.txt")"
check "the resumed run shipped" merged "$(state_field 1 .status)"
check "only the real run counts as an attempt" 1 "$(state_field 1 '.attempts | length')"
check "infra counter reset" 0 "$(state_field 1 .infra_attempts)"
check "card Ready to ship" "Ready to ship" "$(board_status 1)"
check "no sandbox worktree left after the merge" 0 "$(orca_wt_count)"
teardown_sandbox

echo "== (3) offline while settling: queued, replayed after reconnect =="
setup_sandbox
board_add 1 Ready "net 3"
export TEACHER_OS_AI_HANDLE_INFRA_BACKOFF_SECS="3600"
export AI_HANDLE_TEST_OMP_SLEEP=3
printf 'netfail\n' > "$T/omp-modes"
run_watch > "$T/1.out" 2>&1
sleep 1
touch "$T/offline"
wait_workers 30
check "outbox holds the board move and the notice" 2 "$(outbox_lines)"
check "card not moved while offline" "In progress" "$(board_status 1)"
check "state saved locally" infra_failure "$(state_field 1 .status)"
set +e; run_watch > "$T/off.out" 2>&1; set -e
check_contains "offline pass skips" "offline" "$(cat "$T/off.out")"
rm -f "$T/offline"
run_watch > "$T/2.out" 2>&1
check "outbox drained" 0 "$(outbox_lines)"
check "card back to Ready after replay" Ready "$(board_status 1)"
check_contains "queued notice delivered" "network/infrastructure" "$(cat "$T/discord.log")"
check_contains "backoff respected" "backing off" "$(cat "$T/2.out")"
check "no extra omp run" 1 "$(omp_calls)"
teardown_sandbox

echo "== (4) hung connection: watchdog stops omp, classified as infrastructure =="
setup_sandbox
board_add 1 Ready "net 4"
export TEACHER_OS_AI_HANDLE_STALL_SECS=3
export TEACHER_OS_AI_HANDLE_KILL_GRACE_SECS=2
export TEACHER_OS_AI_HANDLE_INFRA_BACKOFF_SECS="3600"
printf 'hang\n' > "$T/omp-modes"
run_watch > "$T/1.out" 2>&1
wait_workers 40
check "state is infra_failure" infra_failure "$(state_field 1 .status)"
check "attempts untouched" 0 "$(state_field 1 '.attempts | length')"
check_contains "watchdog noted in the log" "watchdog" "$(cat "$T"/state/logs/issue-1-*.log)"
check "card back to Ready" Ready "$(board_status 1)"
teardown_sandbox

echo "== (5) infrastructure keeps failing: blocked after 5, not retried =="
setup_sandbox
board_add 1 Ready "net 5"
export TEACHER_OS_AI_HANDLE_INFRA_BACKOFF_SECS="0 0 0 0 0"
for i in 1 2 3 4 5; do
  printf 'netfail\n' >> "$T/omp-modes"
done
for i in 1 2 3 4 5 6; do
  run_watch > "$T/p$i.out" 2>&1
  wait_workers 30
done
check "five omp runs, no sixth" 5 "$(impl_calls)"
check "state blocked" blocked "$(state_field 1 .status)"
check "card stays In progress" "In progress" "$(board_status 1)"
check "attempts never counted" 0 "$(state_field 1 '.attempts | length')"
teardown_sandbox

finish
