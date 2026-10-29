#!/usr/bin/env bash
# Fetch + chạy design v2 (repo private, SHA ghim) cho harness so sánh ảnh.
# Dùng: fetch-design.sh [run|stop]  — run: clone/install/dev trên :8200; stop: dừng đúng PID.
# DESIGN_PORT env override (#397): capture.mjs chọn free port mỗi run để khỏi
# đụng worktree AI song song / dev stack.
# Idempotent: clone tồn tại → checkout lại SHA; node_modules tồn tại → bỏ qua install.
set -euo pipefail

SHA="7a53fc0fcbf415367d245539cedc3855606266a7"
DIR=".cache/design-v2"
PID_FILE="$DIR/.pid"
PORT="${DESIGN_PORT:-8200}"
LOG="$(pwd)/$DIR/.dev.log"

cmd="${1:-run}"

case "$cmd" in
	run)
		if [ ! -d "$DIR/.git" ]; then
			gh repo clone vinh19410/teacheros-design-v2 "$DIR"
		fi
		git -C "$DIR" fetch origin "$SHA" >/dev/null 2>&1 || true
		git -C "$DIR" checkout -q "$SHA"
		if [ ! -d "$DIR/node_modules" ]; then
			# --ignore-workspace: tránh bị hút vào pnpm workspace của teacher-os.
			(cd "$DIR" && pnpm install --ignore-workspace --silent)
		fi
		if curl -sf "http://localhost:$PORT" >/dev/null 2>&1; then
			echo "design v2 already on :$PORT"
			exit 0
		fi
		(cd "$DIR" && nohup pnpm exec vite --port "$PORT" --strictPort >"$LOG" 2>&1 & echo $! >"$PID_FILE")
		for _ in $(seq 1 60); do
			if curl -sf "http://localhost:$PORT" >/dev/null 2>&1; then
				echo "design v2 on :$PORT (pid $(cat "$PID_FILE"))"
				exit 0
			fi
			sleep 1
		done
		echo "design v2 failed to start; last log:" >&2
		tail -20 "$LOG" >&2
		exit 1
		;;
	stop)
		if [ -f "$PID_FILE" ]; then
			PID="$(cat "$PID_FILE")"
			# #397 review F5: kill pnpm wrapper có thể để node vite cháu sống
			# (orphan cùng class như capture.mjs) — kill con trước rồi wrapper.
			pkill -P "$PID" 2>/dev/null || true
			kill "$PID" 2>/dev/null || true
			rm -f "$PID_FILE"
			echo "design v2 stopped"
		else
			echo "not running (no $PID_FILE)"
		fi
		;;
	*)
		echo "usage: $0 [run|stop]" >&2
		exit 2
		;;
esac
