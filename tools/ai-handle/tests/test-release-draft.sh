#!/usr/bin/env bash
# The release draft command is read-only. Stubs only.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

merged_pr() { # <number> <base> <message>
  pr_add "$(jq -nc --argjson n "$1" --arg base "$2" --arg msg "$3" --arg at "$(now_iso)" \
    '{number:$n, url:("https://github.com/vinh19410/teacher-os/pull/"+($n|tostring)), title:"agent change", body:"",
      headRefName:"ai/x", baseRefName:$base, state:"MERGED", mergedAt:$at, mergeCommit:{oid:("sha"+($n|tostring)), message:$msg},
      reviews:[], files:[], checks:[]}')"
}

echo "== release draft: read-only =="
setup_sandbox
merged_pr 300 main "chore(release): v0.0.14"
merged_pr 301 develop "Merge pull request #301"
(
  cd "$T/clone"
  git config user.email test@example.com
  git config user.name test
  echo '{"version":"0.0.15"}' > package.json
  git add package.json
  git commit -q -m "seed package version"
  git push -q origin develop
) >/dev/null 2>&1
: > "$T/calls.log"
out=$(bash "$TOOL_DIR/release_draft.sh" 2>&1)
check_contains "prints the draft" "Release draft for the stub" "$out"
check_contains "lists the merged PR to the agent" "#301" "$(cat "$T/omp-prompts/1.txt")"
check_contains "names the latest promotion" "#300" "$(cat "$T/omp-prompts/1.txt")"
check_contains "names the current version" "0.0.15" "$(cat "$T/omp-prompts/1.txt")"
check "no write command reached GitHub" 0 "$(grep -cE '^gh (pr (merge|create|comment|edit|update-branch)|issue (create|comment|edit)|release|label create)|^(MERGE|PR-CREATE|COMMENT|LABEL|MUT)' "$T/calls.log" || true)"
check "clone untouched by the draft" "$(git -C "$T/clone" rev-parse HEAD)" "$(git -C "$T/clone" rev-parse origin/develop)"
teardown_sandbox

finish
