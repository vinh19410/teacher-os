#!/usr/bin/env bash
# Concurrency guarantees: no issue ever has two workers, and no re-dispatch
# can slip into a half-settled issue. Stubs only.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

echo "== (a) two dispatchers on one stale board snapshot -> one worker =="
setup_sandbox
board_add 1 Ready "race a"
export AI_HANDLE_TEST_OMP_SLEEP=6
AI_HANDLE_TEST_SLOW_ITEMS=2 run_watch > "$T/b.out" 2>&1 &
bpid=$!
sleep 0.6                     # B has read its (soon stale) snapshot and is waiting
run_watch > "$T/a.out" 2>&1
wait "$bpid" || true
check "exactly one worker started" 1 "$(omp_calls)"
check "claimed exactly once" 1 "$(calls_count 'MUT status ITEM_1 In progress')"
check_contains "second dispatcher stood down" "already has a live worker" "$(cat "$T/b.out")"
teardown_sandbox

echo "== (b) card dragged back to Ready while the worker is alive =="
setup_sandbox
board_add 1 Ready "race b"
export AI_HANDLE_TEST_OMP_MODE=hang
run_watch > "$T/1.out" 2>&1
wait_for 10 lock_exists 1 || bad "worker lock appeared" "never"
wait_for 10 test "$(omp_calls)" = 1 || true
board_set 1 '.status="Ready"'
run_watch > "$T/2.out" 2>&1
check_contains "second pass skipped the running issue" "already has a live worker" "$(cat "$T/2.out")"
check "still one omp process" 1 "$(omp_calls)"
check "no second claim" 1 "$(calls_count 'MUT status ITEM_1 In progress')"
set +e; run_watch --reset 1 > "$T/reset.out" 2>&1; rc=$?; set -e
check "--reset refuses while a worker runs" 1 "$rc"
set +e; run_watch --recover 1 > "$T/recover.out" 2>&1; rc=$?; set -e
check "--recover refuses while a worker runs" 1 "$rc"
check "orca worktree untouched" 1 "$(orca_wt_count)"
teardown_sandbox

echo "== (c) failing worker: no re-dispatch window before state is written =="
setup_sandbox
board_add 1 Ready "race c"
export AI_HANDLE_TEST_OMP_MODE=fail
export AI_HANDLE_TEST_SLOW_READY=4
run_watch > "$T/1.out" 2>&1
wait_for 20 board_is 1 Ready || bad "card returned to Ready" "never"
# The card shows Ready but the worker is still inside the board call.
check "state already holds the attempt" 1 "$(state_field 1 '.attempts | length')"
check "state not left running" failed "$(state_field 1 .status)"
run_watch > "$T/2.out" 2>&1
check "no re-dispatch inside the window" 1 "$(omp_calls)"
check "claimed once" 1 "$(calls_count 'MUT status ITEM_1 In progress')"
wait_workers 20
teardown_sandbox

echo "== (d) stale lock with a dead pid contested by 8 processes =="
setup_sandbox
sleep 0.05 & dead=$!
wait "$dead" || true
mkdir -p "$T/state/running/issue-1"
printf '%s' "$dead" > "$T/state/running/issue-1/pid"
for i in 1 2 3 4 5 6 7 8; do
  ( run_watch --lock-probe 1 3 > "$T/probe-$i.out" 2>&1 || true ) &
done
wait
winners=$(cat "$T"/probe-*.out | grep -c '^acquired' || true)
check "exactly one process won the stale lock" 1 "$winners"
teardown_sandbox

echo "== (e) worker killed with SIGKILL: next pass reclaims it =="
setup_sandbox
board_add 1 Ready "race e"
export AI_HANDLE_TEST_OMP_MODE=hang
run_watch > "$T/1.out" 2>&1
wait_for 10 lock_exists 1 || true
wait_for 10 test "$(omp_calls)" = 1 || true
wpid=$(cat "$T/state/running/issue-1/pid")
kill -9 "$wpid"
pkill -f "$T/state/sessions" || true
sleep 0.5
run_watch > "$T/2.out" 2>&1
check_contains "lost worker reported" "worker lost" "$(cat "$T/2.out")"
check "card returned to Ready" Ready "$(board_status 1)"
check "one attempt counted" 1 "$(state_field 1 '.attempts | length')"
check "attempt marked worker_lost" worker_lost "$(state_field 1 '.attempts[0].cause')"
teardown_sandbox

finish
