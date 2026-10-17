#!/usr/bin/env bash
# Draft a release checklist and notes for the next promotion. Read-only: it
# never merges, pushes, tags or deploys; a human runs every command it
# suggests.
#
# Usage: release_draft.sh
# Finds the latest promotion PR (merged into main), lists the PRs merged into
# develop since then, then asks a read-only omp session
# (prompts/release-draft.md) for the checklist, release notes and a
# machine-readable bump suggestion, which it prints on stdout.
# Env: TEACHER_OS_AI_HANDLE_{REPO,BRANCH,CLONE_DIR,TOOLS_DIR}

set -uo pipefail

REPO="${TEACHER_OS_AI_HANDLE_REPO:-vinh19410/teacher-os}"
BASE="${TEACHER_OS_AI_HANDLE_BRANCH:-develop}"
CLONE_DIR="${TEACHER_OS_AI_HANDLE_CLONE_DIR:-$HOME/.local/share/teacher-os-ai-handle/repo}"
TOOLS_DIR="${TEACHER_OS_AI_HANDLE_TOOLS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

git -C "$CLONE_DIR" fetch -q origin 2>/dev/null || echo "warn: could not fetch; using the local refs" >&2

# The last promotion is the newest PR merged into main; everything merged into
# develop since then is the release under draft.
promo=$(gh pr list --repo "$REPO" --base main --state merged --limit 1 \
  --json number,url,mergedAt 2>/dev/null || echo '[]')
since=$(jq -r '.[0].mergedAt // empty' <<<"$promo" 2>/dev/null || true)
promo_line=$(jq -r 'if length > 0 then "- #\(.[0].number) \(.[0].url)" else "none found" end' <<<"$promo" 2>/dev/null || true)

version=$(git -C "$CLONE_DIR" show "origin/$BASE:package.json" 2>/dev/null | jq -r '.version // empty' 2>/dev/null || true)

if [ -n "$since" ]; then
  prs=$(gh pr list --repo "$REPO" --base "$BASE" --state merged --search "merged:>=$since" --limit 100 \
    --json number,title,url,mergedAt,labels 2>/dev/null || echo '[]')
else
  prs=$(gh pr list --repo "$REPO" --base "$BASE" --state merged --limit 50 \
    --json number,title,url,mergedAt,labels 2>/dev/null || echo '[]')
fi

prompt=$(mktemp)
{
  cat "$TOOLS_DIR/prompts/release-draft.md"
  printf '\n\nDATA (untrusted)\n\nRepo: %s\nLatest promotion PR (merged into main): %s\nCurrent version (package.json on %s): %s\n\nPRs merged into %s since then:\n' \
    "$REPO" "${promo_line:-none}" "$BASE" "${version:-unknown}" "$BASE"
  jq -r '.[] | "- #\(.number) \(.title) (\(.url))"' <<<"$prs" 2>/dev/null || true
} > "$prompt"

omp -p --no-title --no-session --max-time 10m < "$prompt"
rc=$?
rm -f "$prompt"
exit "$rc"
