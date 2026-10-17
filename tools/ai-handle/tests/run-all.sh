#!/usr/bin/env bash
# Run every ai-handle test: shell suites (test-*.sh) and Python unit tests.
set -uo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
TOOL=$(cd "$DIR/.." && pwd)
fail=0

for t in "$DIR"/test-*.sh "$TOOL"/test-receiver.sh; do
  [ -f "$t" ] || continue
  echo "### $(basename "$t")"
  bash "$t" || { echo "### FAILED: $(basename "$t")"; fail=1; }
done

if ls "$DIR"/test_*.py >/dev/null 2>&1; then
  echo "### python unittest"
  (cd "$TOOL" && python3 -m unittest discover -s tests -p 'test_*.py') || fail=1
fi

[ "$fail" -eq 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit "$fail"
