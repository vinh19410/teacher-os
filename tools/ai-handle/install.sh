#!/usr/bin/env bash
# Install / update the teacher-os ai-handle automation on this machine.
#
# - Copies watch.sh + webhook_receiver.py + dashboard + helper modules and the launchd plists from this
#   directory to their deployed locations using ATOMIC RENAMES, so a vibe run
#   that is mid-flight keeps executing its own (old) inode and is never
#   corrupted. Never edit the deployed copies in place.
# - Ensures the local secrets exist (never printed, never committed):
#     ~/.config/teacher-os-ai-handle/github-webhook-secret  HMAC secret for the
#                                                       webhook receiver
#     ~/.config/teacher-os-ai-handle/discord-webhook        Discord notify URL
#     ~/.config/teacher-os-ai-handle/gh-token               keychain-loss fallback
# - Lock-aware: if a worker is running, the poller reload is DEFERRED
#   (bootout would kill it). Files are still installed; the command to
#   finish the reload is printed.
#
# Usage: install.sh [--files-only]
# Env:   TEACHER_OS_AI_HANDLE_LIB_DIR, TEACHER_OS_AI_HANDLE_STATE_DIR, TEACHER_OS_AI_HANDLE_CONFIG_DIR

set -euo pipefail

SRC_DIR=$(cd "$(dirname "$0")" && pwd)
LIB_DIR="${TEACHER_OS_AI_HANDLE_LIB_DIR:-$HOME/.local/lib/teacher-os-ai-handle}"
STATE_DIR="${TEACHER_OS_AI_HANDLE_STATE_DIR:-$HOME/.local/state/teacher-os-ai-handle}"
CONFIG_DIR="${TEACHER_OS_AI_HANDLE_CONFIG_DIR:-$HOME/.config/teacher-os-ai-handle}"
PLIST_DIR="$HOME/Library/LaunchAgents"
UID_N=$(id -u)
FILES_ONLY=false
[ "${1:-}" = "--files-only" ] && FILES_ONLY=true

echo "== teacher-os ai-handle install =="
for dep in jq gh python3; do
  command -v "$dep" >/dev/null 2>&1 || { echo "missing dependency: $dep" >&2; exit 4; }
done
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated (run: gh auth login)" >&2; exit 4; }

mkdir -p "$LIB_DIR" "$STATE_DIR/logs" "$CONFIG_DIR" "$PLIST_DIR"

install_file() { # <src> <dest-dir> [mode]
  local src="$1" dir="$2" mode="${3:-755}" name tmp
  name=$(basename "$src")
  tmp=$(mktemp "$dir/.install.XXXXXX")
  cp "$src" "$tmp"
  chmod "$mode" "$tmp"
  mv -f "$tmp" "$dir/$name"
  echo "installed $dir/$name"
}

install_tree() { # <src-dir> <dest-dir>: atomic per-file install of a flat directory
  local src="$1" dest="$2" f
  mkdir -p "$dest"
  for f in "$src"/*; do
    [ -f "$f" ] && install_file "$f" "$dest" 644
  done
}

install_file "$SRC_DIR/watch.sh" "$LIB_DIR"
install_file "$SRC_DIR/webhook_receiver.py" "$LIB_DIR"
install_file "$SRC_DIR/dashboard.py" "$LIB_DIR"
install_file "$SRC_DIR/dashboard.html" "$LIB_DIR" 644
install_file "$SRC_DIR/outbox.py" "$LIB_DIR"
install_file "$SRC_DIR/spec_gate.py" "$LIB_DIR"
install_file "$SRC_DIR/render_prompt.py" "$LIB_DIR"
install_file "$SRC_DIR/ledger.py" "$LIB_DIR"
install_file "$SRC_DIR/json_extract.py" "$LIB_DIR"
install_file "$SRC_DIR/release_draft.sh" "$LIB_DIR"
install_tree "$SRC_DIR/prompts" "$LIB_DIR/prompts"

# The verify, risk gate, audit and CI monitor steps were removed (the agent now
# ships with /ak:vibe --ship). Drop their deployed copies; a run still executing
# one keeps its open inode.
for old in verify_checks.sh verify_verdict.py test_delta.py risk_gate.py risk-rules.json \
    jev_shadow.py audit_merges.sh monitor_dev_ci.sh prompts/verifier.md prompts/qa-verifier.md; do
  if [ -e "$LIB_DIR/$old" ]; then rm -f "$LIB_DIR/$old"; echo "removed obsolete $LIB_DIR/$old"; fi
done
install_file "$SRC_DIR/com.teacheros.ai-handle.plist" "$PLIST_DIR" 644
install_file "$SRC_DIR/com.teacheros.ai-handle-webhook.plist" "$PLIST_DIR" 644
install_file "$SRC_DIR/com.teacheros.ai-handle-report.plist" "$PLIST_DIR" 644
install_file "$SRC_DIR/com.teacheros.ai-handle-dashboard.plist" "$PLIST_DIR" 644

SECRET_FILE="$CONFIG_DIR/github-webhook-secret"
if [ ! -s "$SECRET_FILE" ]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32 > "$SECRET_FILE"
  else
    python3 -c 'import secrets; print(secrets.token_hex(32))' > "$SECRET_FILE"
  fi
  chmod 600 "$SECRET_FILE"
  echo "generated $SECRET_FILE (paste the same value into the GitHub webhook config)"
else
  echo "secret already present at $SECRET_FILE (kept)"
fi

if [ ! -s "$CONFIG_DIR/gh-token" ] && token=$(gh auth token 2>/dev/null) && [ -n "$token" ]; then
  printf '%s\n' "$token" > "$CONFIG_DIR/gh-token"
  chmod 600 "$CONFIG_DIR/gh-token"
  echo "wrote $CONFIG_DIR/gh-token (launchd keychain-loss fallback)"
else
  echo "gh-token already present or unavailable (kept)"
fi

if [ ! -e "$CONFIG_DIR/watch.conf" ]; then
  cat > "$CONFIG_DIR/watch.conf" <<'ENV'
# Local overrides for tools/ai-handle (never committed). One KEY=VALUE per line,
# TEACHER_OS_AI_HANDLE_* names only; variables already in the environment win.
#
# TEACHER_OS_AI_HANDLE_MODEL=<model>          implementing model (empty = the omp default)
# TEACHER_OS_AI_HANDLE_MAX_CONCURRENT=3       parallel workers (0 stops new work)
# TEACHER_OS_AI_HANDLE_SPEC_GATE=off          claim issues without acceptance criteria
ENV
  echo "wrote $CONFIG_DIR/watch.conf"
else
  echo "watch.conf already present (kept)"
fi

[ -s "$CONFIG_DIR/discord-webhook" ] \
  && echo "discord webhook present at $CONFIG_DIR/discord-webhook" \
  || echo "NOTE: no discord webhook at $CONFIG_DIR/discord-webhook — notifications disabled until you add it"

if [ "$FILES_ONLY" = true ]; then
  echo "files installed (--files-only: launchd untouched)"
  exit 0
fi

reload_service() { # <label>
  local i
  launchctl bootout "gui/$UID_N/$1" >/dev/null 2>&1 || true
  # bootout returns before a KeepAlive job is fully gone; bootstrapping too early fails.
  for i in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "gui/$UID_N/$1" >/dev/null 2>&1 || break
    sleep 0.5
  done
  launchctl bootstrap "gui/$UID_N" "$PLIST_DIR/$1.plist" >/dev/null 2>&1
}

# Receiver: safe to (re)load anytime (KeepAlive, no lock interplay).
if reload_service com.teacheros.ai-handle-webhook; then
  echo "receiver loaded (127.0.0.1:8897)"
else
  echo "WARNING: receiver bootstrap failed — check $PLIST_DIR/com.teacheros.ai-handle-webhook.plist" >&2
fi

# Weekly report: read-only, safe to (re)load anytime.
if reload_service com.teacheros.ai-handle-report; then
  echo "weekly report loaded (Mondays 09:00)"
else
  echo "WARNING: report bootstrap failed — check $PLIST_DIR/com.teacheros.ai-handle-report.plist" >&2
fi

# Dashboard: safe to (re)load anytime. It holds no pipeline lock, and workers it
# dispatched survive a restart (AbandonProcessGroup). A port held by something
# else is reported, never killed and never worked around with another port.
DASHBOARD_PORT=8898
if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -nP -iTCP:"$DASHBOARD_PORT" -sTCP:LISTEN -t 2>/dev/null); do
    if ! ps -p "$pid" -o command= 2>/dev/null | grep -q 'dashboard\.py'; then
      echo "WARNING: port $DASHBOARD_PORT is held by another process (pid $pid); the dashboard cannot start until it is freed. Inspect: lsof -i :$DASHBOARD_PORT" >&2
    fi
  done
fi
if reload_service com.teacheros.ai-handle-dashboard; then
  echo "dashboard loaded (http://127.0.0.1:$DASHBOARD_PORT)"
else
  echo "WARNING: dashboard bootstrap failed — check $PLIST_DIR/com.teacheros.ai-handle-dashboard.plist" >&2
fi

# Poller: DEFER while a worker is running. Workers are detached children of the
# poller job (AbandonProcessGroup keeps launchd from killing them), but a bootout
# of the job would still take them down.
LIVE_PIDS=""
for pidfile in "$STATE_DIR"/running/issue-*/pid; do
  [ -f "$pidfile" ] || continue
  pid=$(cat "$pidfile" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then LIVE_PIDS="$LIVE_PIDS $pid"; fi
done
if [ -n "$LIVE_PIDS" ]; then
  echo "DEFERRED poller reload: worker(s) running (pid$LIVE_PIDS)."
  echo "When they finish, run:"
  echo "  launchctl bootout gui/$UID_N/com.teacheros.ai-handle 2>/dev/null; launchctl bootstrap gui/$UID_N $PLIST_DIR/com.teacheros.ai-handle.plist"
else
  if reload_service com.teacheros.ai-handle; then
    echo "poller loaded (interval 300s)"
  else
    echo "WARNING: poller bootstrap failed — check $PLIST_DIR/com.teacheros.ai-handle.plist" >&2
  fi
fi

launchctl list | grep com.teacheros.ai-handle || true
echo "== done =="
