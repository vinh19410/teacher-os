#!/usr/bin/env bash
# An issue enters the factory when it has the ai-handle label AND a Ready card,
# whichever happened last; with either missing nothing runs. Stubs only.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

setup_sandbox
export AI_HANDLE_TEST_OMP_SLEEP=1

echo "== label last (webhook path): --issue starts it =="
board_add 1 Ready "label last" ai-handle
run_watch --issue 1 > "$T/1.out" 2>&1
wait_workers 30
check "worker ran" 1 "$(omp_calls)"

echo "== Ready last (poll path) =="
board_add 2 Backlog "ready last" ai-handle
run_watch > "$T/2.out" 2>&1
wait_workers 30
check "not Ready yet: nothing ran" 1 "$(omp_calls)"
board_set 2 '.status="Ready"'
run_watch > "$T/3.out" 2>&1
wait_workers 30
check "after the drag the poll starts it" 2 "$(omp_calls)"

echo "== one condition missing: ignored on both paths =="
board_add 3 Ready "no label" ""
board_add 4 Backlog "label but not ready" ai-handle
run_watch --issue 3 > "$T/4.out" 2>&1
run_watch --issue 4 > "$T/5.out" 2>&1
run_watch > "$T/6.out" 2>&1
wait_workers 30
check "neither was started" 2 "$(omp_calls)"
check_contains "unlabelled issue named" "does not carry label" "$(cat "$T/4.out")"
check_contains "wrong status named" "need Ready" "$(cat "$T/5.out")"

echo "== closed issue and foreign repo are ignored =="
board_add 5 Ready "closed" ai-handle
board_set 5 '.state="CLOSED"'
board_add 6 Ready "other repo" ai-handle
board_set 6 '.repo="someone/else"'
run_watch > "$T/7.out" 2>&1
wait_workers 30
check "still two runs" 2 "$(omp_calls)"

teardown_sandbox
finish
