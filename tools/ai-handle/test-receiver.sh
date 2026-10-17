#!/usr/bin/env bash
# Self-test for tools/ai-handle/webhook_receiver.py — runs fully local.
#
# Covers the security contract: HMAC-SHA-256 signature (incl. cross-check
# against openssl), repository/event/action/label filtering, ping handshake,
# body-length cap, fail-closed startup without a secret, and the spawn path
# (fake watch.sh — no real agent run). The production receiver is untouched.
set -euo pipefail

TOOL_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$TOOL_DIR/../.." && pwd)
RECEIVER_SRC="${RECEIVER_SRC:-$TOOL_DIR/webhook_receiver.py}"
[ -f "$RECEIVER_SRC" ] || RECEIVER_SRC="$HOME/.local/lib/teacher-os-ai-handle/webhook_receiver.py"
[ -f "$RECEIVER_SRC" ] || { echo "webhook_receiver.py not found" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'kill ${SRV_PID:-0} 2>/dev/null || true' EXIT
PORT=8931
SECRET="selftest-secret-0123456789abcdef"
SECRET2="different-secret-ffffffffffffffff"

cat > "$TMP/fake-watch.sh" <<EOF
#!/usr/bin/env bash
echo "watch invoked args=[*]" >> "$TMP/watch.log"
EOF
chmod +x "$TMP/fake-watch.sh"

start_receiver() { # <secret-env> <dryrun-flag> -> pid
  env \
    TEACHER_OS_AI_HANDLE_STATE_DIR="$TMP/state" \
    TEACHER_OS_AI_HANDLE_WATCH_SH="$TMP/fake-watch.sh" \
    TEACHER_OS_AI_HANDLE_WEBHOOK_PORT=$PORT \
    GITHUB_WEBHOOK_SECRET="$1" \
    ${2:+TEACHER_OS_AI_HANDLE_WEBHOOK_DRY_RUN=1} \
    python3 "$RECEIVER_SRC" > "$TMP/server.log" 2>&1 &
  echo $!
}

wait_up() {
  for _ in $(seq 1 50); do
    curl -fsS "http://127.0.0.1:$PORT/" -o /dev/null 2>/dev/null && return 0
    sleep 0.2
  done
  echo "receiver did not come up"; cat "$TMP/server.log"; exit 1
}

sig() { python3 -c "import hmac,hashlib,sys; print('sha256='+hmac.new('$1'.encode(), sys.stdin.buffer.read(), hashlib.sha256).hexdigest())"; }

post() { # <event> <payload> <signature>
  curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Content-Type: application/json" -H "X-GitHub-Event: $1" \
    -H "X-Hub-Signature-256: $3" --data "$2" "http://127.0.0.1:$PORT/"
}

LABELED=$(jq -nc '{action:"labeled", repository:{full_name:"vinh19410/teacher-os"}, label:{name:"ai-handle"}, issue:{number:99, state:"open"}}')
OTHER_LABEL=$(jq -nc '{action:"labeled", repository:{full_name:"vinh19410/teacher-os"}, label:{name:"bug"}, issue:{number:99, state:"open"}}')
WRONG_REPO=$(jq -nc '{action:"labeled", repository:{full_name:"evil/repo"}, label:{name:"ai-handle"}, issue:{number:1, state:"open"}}')
OPENED=$(jq -nc '{action:"opened", repository:{full_name:"vinh19410/teacher-os"}, issue:{number:99, state:"open"}}')
PUSH=$(jq -nc '{action:"pushed", repository:{full_name:"vinh19410/teacher-os"}}')
CLOSED_ISSUE=$(jq -nc '{action:"labeled", repository:{full_name:"vinh19410/teacher-os"}, label:{name:"ai-handle"}, issue:{number:99, state:"closed"}}')

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok: $1 -> $3"
          else fail=$((fail+1)); echo "  FAIL: $1 — expected $2, got $3"; fi; }

echo "== startup fail-closed (no secret anywhere) =="
TEACHER_OS_AI_HANDLE_STATE_DIR="$TMP/state-nosec" \
TEACHER_OS_AI_HANDLE_CONFIG_DIR="$TMP/noconfig" \
TEACHER_OS_AI_HANDLE_WATCH_SH="$TMP/fake-watch.sh" \
TEACHER_OS_AI_HANDLE_WEBHOOK_PORT=$PORT \
python3 "$RECEIVER_SRC" > "$TMP/nosecret.log" 2>&1 && rc=0 || rc=$?
check "refuses to start without secret (exit 1)" 1 "$rc"

echo "== matrix (DRY_RUN=1: verified requests accepted, nothing spawned) =="
SRV_PID=$(start_receiver "$SECRET" dryrun)
wait_up
S=$(printf '%s' "$LABELED" | sig "$SECRET")

check "GET / health"                    200 "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/)"
check "empty body (Content-Length 0)"   413 "$(post issues '' '')"
check "ping, valid signature"           200 "$(post ping '{}' "$(printf '%s' '{}' | sig "$SECRET")")"
check "valid issues.labeled (dry)"      202 "$(post issues "$LABELED" "$S")"
check "tampered body, stale signature"  401 "$(post issues "$LABELED" "$(printf '%s' '{"tampered":1}' | sig "$SECRET")")"
check "missing signature"               401 "$(post issues "$LABELED" '')"
check "wrong secret signs correctly"    401 "$(post issues "$LABELED" "$(printf '%s' "$LABELED" | sig "$SECRET2")")"
check "repo not allowlisted"            200 "$(post issues "$WRONG_REPO" "$(printf '%s' "$WRONG_REPO" | sig "$SECRET")")"
check "non-trigger label"               200 "$(post issues "$OTHER_LABEL" "$(printf '%s' "$OTHER_LABEL" | sig "$SECRET")")"
check "issues action=opened"            200 "$(post issues "$OPENED" "$(printf '%s' "$OPENED" | sig "$SECRET")")"
check "closed issue labeled"            200 "$(post issues "$CLOSED_ISSUE" "$(printf '%s' "$CLOSED_ISSUE" | sig "$SECRET")")"
check "unlisted event (push)"           200 "$(post push "$PUSH" "$(printf '%s' "$PUSH" | sig "$SECRET")")"

echo "== openssl HMAC cross-check =="
S_OSSL=$(printf '%s' "$LABELED" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print "sha256="$2}')
check "openssl-computed signature"      202 "$(post issues "$LABELED" "$S_OSSL")"
check "nothing spawned in dry-run"      "" "$(cat "$TMP/watch.log" 2>/dev/null || true)"

echo "== real spawn path (fake watch.sh) =="
kill $SRV_PID 2>/dev/null; wait $SRV_PID 2>/dev/null || true
SRV_PID=$(start_receiver "$SECRET")
wait_up
check "labeled -> 202 accepted"         202 "$(post issues "$LABELED" "$(printf '%s' "$LABELED" | sig "$SECRET")")"
sleep 0.5
check "watch.sh spawned with --issue 99" 1 "$(grep -c 'args=[--issue 99]' "$TMP/watch.log" 2>/dev/null || true)"

echo "== result: $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
