#!/usr/bin/env bash
# watch.conf: local overrides are read safely and never beat the environment.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

setup_sandbox
unset TEACHER_OS_AI_HANDLE_MODEL TEACHER_OS_AI_HANDLE_SPEC_GATE 2>/dev/null || true
cat > "$T/config/watch.conf" <<CONF
# a comment
TEACHER_OS_AI_HANDLE_MODEL=model-from-file
TEACHER_OS_AI_HANDLE_SPEC_GATE=off
TEACHER_OS_AI_HANDLE_Z[\$(touch $T/pwned)]=1
NOT_OURS=1
CONF
out=$(run_watch --dry-run 2>&1)
check_contains "file sets the model" "model=model-from-file" "$out"
check_contains "file switches the spec gate off" "spec_gate=off" "$out"
check "nothing in the file was executed" 0 "$(ls "$T/pwned" 2>/dev/null | wc -l | tr -d ' ')"
out=$(TEACHER_OS_AI_HANDLE_MODEL=model-from-env run_watch --dry-run 2>&1)
check_contains "the environment wins over the file" "model=model-from-env" "$out"
check_contains "defaults are visible" "max_attempts=5 agent=orca(agent omp) run_cap=4h" "$out"
out=$(TEACHER_OS_AI_HANDLE_MAX_ATTEMPTS=7 run_watch --dry-run 2>&1)
check_contains "max attempts is configurable" "max_attempts=7" "$out"
teardown_sandbox
finish
