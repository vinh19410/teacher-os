#!/usr/bin/env bash
# Spec gate: issues without acceptance criteria are never claimed. Stubs only.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

AC_BODY=$'### Acceptance criteria\n\n- [ ] it works\n\n### Risk\n\nLow\n'
HIGH_BODY=$'### Acceptance criteria\n\n- [ ] it works\n\n### Risk\n\nHigh\n'

echo "== missing AC: comment once, card to Backlog, no run =="
setup_sandbox
export AI_HANDLE_TEST_OMP_SLEEP=1
board_add 1 Ready "no ac" ai-handle $'### Context\n\nsome words\n\n### Acceptance criteria\n\n_No response_\n'
board_add 2 Ready "has ac" ai-handle "$AC_BODY"
run_watch > "$T/1.out" 2>&1
wait_workers 30
check "only the valid issue ran" 1 "$(omp_calls)"
check "rejected card moved to Backlog" Backlog "$(board_status 1)"
check "rejected issue never claimed" 0 "$(calls_count 'MUT status ITEM_1 In progress')"
check "one spec-gate comment" 1 "$(calls_count 'COMMENT issue #1')"
check_contains "comment carries the marker" "ai-handle:spec-gate" "$(board_field 1 '.comments[0].body')"
check "valid issue claimed" 1 "$(calls_count 'MUT status ITEM_2 In progress')"

echo "== dragged back to Ready without fixing: still one comment =="
board_set 1 '.status="Ready"'
run_watch > "$T/2.out" 2>&1
check "no second comment" 1 "$(calls_count 'COMMENT issue #1')"
check "card back in Backlog" Backlog "$(board_status 1)"
check "still no run for it" 1 "$(calls_count 'gh issue comment 1 ')"

echo "== --issue path goes through the same gate =="
board_add 3 Ready "webhook no ac" ai-handle "nothing useful"
run_watch --issue 3 > "$T/3.out" 2>&1
check "webhook path rejected" Backlog "$(board_status 3)"
check "webhook path ran nothing" 1 "$(omp_calls)"
teardown_sandbox

echo "== dry run reports but mutates nothing =="
setup_sandbox
board_add 1 Ready "no ac" ai-handle "nothing"
run_watch --dry-run > "$T/dry.out" 2>&1
check_contains "dry-run explains" "spec gate: missing acceptance criteria" "$(cat "$T/dry.out")"
check "dry-run left the card Ready" Ready "$(board_status 1)"
check "dry-run commented nothing" 0 "$(calls_count 'gh issue comment')"
teardown_sandbox

echo "== risk: High body ships like any other issue =="
setup_sandbox
export AI_HANDLE_TEST_OMP_SLEEP=1
board_add 1 Ready "high risk" ai-handle "$HIGH_BODY"
run_watch > "$T/1.out" 2>&1
wait_workers 30
check "no risk label any more" 0 "$(calls_count 'risk:high')"
check_contains "same shipping prompt" "--ship --beta --advice" "$(cat "$T/omp-prompts/1.txt")"
check "shipped" merged "$(state_field 1 .status)"
teardown_sandbox

echo "== gate switched off =="
setup_sandbox
export AI_HANDLE_TEST_OMP_SLEEP=1
export TEACHER_OS_AI_HANDLE_SPEC_GATE=off
board_add 1 Ready "legacy issue" ai-handle "no criteria here"
run_watch > "$T/1.out" 2>&1
wait_workers 30
check "ran without AC when disabled" 1 "$(omp_calls)"
unset TEACHER_OS_AI_HANDLE_SPEC_GATE
teardown_sandbox

finish
