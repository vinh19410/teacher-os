#!/usr/bin/env bash
# Baseline: one Ready + ai-handle card is claimed, run by one worker that ships
# by itself (/ak:vibe --ship --beta --advice), and settled from the PR state.
# Stubs only.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

echo "== the agent ships: PR merged into develop, card Ready to ship =="
setup_sandbox
board_add 1 Ready "baseline issue" ai-handle
board_add 2 Backlog "not ready" ai-handle
board_add 3 Ready "no label" ""
export AI_HANDLE_TEST_OMP_SLEEP=1
run_watch > "$T/dispatch.out" 2>&1
wait_workers 30

check "worker spawned exactly once" 1 "$(omp_calls)"
check "only #1 claimed (In progress mutation)" 1 "$(calls_count 'MUT status ITEM_1 In progress')"
check "unlabelled/backlog cards untouched" 0 "$(calls_count 'MUT status ITEM_(2|3) ')"
check "claim sets both dates" 2 "$(calls_count 'MUT date ITEM_1 ')"
check "state records the merge" merged "$(state_field 1 .status)"
check "card Ready to ship" "Ready to ship" "$(board_status 1)"
check "ready to ship beta label ensured" 1 "$(calls_count 'LABEL \+ready to ship beta #1')"
check "one attempt recorded" 1 "$(state_field 1 '.attempts | length')"
check "PR url captured from the report" "https://github.com/vinh19410/teacher-os/pull/100" "$(state_field 1 '.prs[0]')"
check "branch captured from the report" "ai/issue-test" "$(state_field 1 .branch)"
check "orca worktree retired after the merge" 1 "$(orca_calls '^WORKTREE-RM ai-handle-issue-1')"
check "no sandbox worktree leaked" 0 "$(orca_wt_count)"
check_contains "discord notified" "shipped: PR merged into develop" "$(cat "$T/discord.log")"
check "the watcher itself never merged" 0 "$(merge_count)"
prompt=$(cat "$T/omp-prompts/1.txt")
check_contains "prompt ships with all three flags" "--ship --beta --advice https://github.com/vinh19410/teacher-os/issues/1" "$prompt"
check_contains "prompt keeps main off limits" "NEVER merge into main or master" "$prompt"
check_absent "no raw placeholders leak" "{{" "$prompt"
run_watch > "$T/dispatch2.out" 2>&1
wait_workers 10
check "a shipped issue is not run again" 1 "$(omp_calls)"
check "no audit or CI monitor runs any more" 0 "$(calls_count 'run list|--state merged|ISSUE-CREATE')"
teardown_sandbox

echo "== PR left open: the card goes to a human, who merges later =="
setup_sandbox
board_add 1 Ready "cannot merge" ai-handle
printf 'open\n' > "$T/omp-modes"
run_watch > /dev/null 2>&1
wait_workers 30
check "parked for a human" awaiting_review "$(state_field 1 .status)"
check "card In review" "In review" "$(board_status 1)"
check "one attempt recorded" 1 "$(state_field 1 '.attempts | length')"
pr_set 100 '.state="MERGED"'
run_watch > /dev/null 2>&1
check "the human merge is picked up" merged "$(state_field 1 .status)"
check "merged by a human" human "$(state_field 1 .merged_by)"
check "card Ready to ship" "Ready to ship" "$(board_status 1)"
teardown_sandbox

echo "== merged, then the run failed (e.g. watching CI): still shipped =="
setup_sandbox
board_add 1 Ready "late failure" ai-handle
printf 'mergedfail\n' > "$T/omp-modes"
run_watch > /dev/null 2>&1
wait_workers 30
check "counted as merged" merged "$(state_field 1 .status)"
check "card Ready to ship" "Ready to ship" "$(board_status 1)"
check_contains "discord mentions the exit" "but the run exited 1" "$(cat "$T/discord.log")"
teardown_sandbox

echo "== PR looked up when the report names none =="
setup_sandbox
board_add 1 Ready "no pr in report" ai-handle
pr_add '{"number":77,"url":"https://github.com/vinh19410/teacher-os/pull/77","title":"x","body":"Closes #1","headRefName":"ai/found-by-search","baseRefName":"develop","state":"MERGED"}'
AI_HANDLE_TEST_OMP_NOPR=1 run_watch > /dev/null 2>&1
wait_workers 30
check "merged PR found by searching the issue reference" "https://github.com/vinh19410/teacher-os/pull/77" "$(state_field 1 '.prs[0]')"
check "branch taken from the found PR" "ai/found-by-search" "$(state_field 1 .branch)"
check "settled as merged" merged "$(state_field 1 .status)"
teardown_sandbox

echo "== no PR at all: a failed attempt, card back to Ready =="
setup_sandbox
board_add 1 Ready "no pr" ai-handle
AI_HANDLE_TEST_OMP_NOPR=1 run_watch > /dev/null 2>&1
wait_workers 30
check "failed" failed "$(state_field 1 .status)"
check "card back to Ready" Ready "$(board_status 1)"
check_contains "discord says why" "without a merged or open pull request" "$(cat "$T/discord.log")"
teardown_sandbox

finish
