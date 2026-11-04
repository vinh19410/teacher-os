#!/usr/bin/env bash
# Fetch + chạy design v2 (repo private, SHA ghim) cho harness so sánh ảnh.
# Dùng: fetch-design.sh [run|stop] — run: clone/install/dev; stop: dừng đúng pgid.
#
# #546 (máy chia sẻ nhiều agent):
# - Kiểm tra port/chữ ký TRƯỚC mọi thao tác git/network → foreign listener bị
#   chặn <5s với exit 3, test tích hợp không cần gh/network.
# - DESIGN_NO_REUSE=1 (capture.mjs luôn set): mọi listener có sẵn trên port
#   (kể cả design-v2 của phiên khác) → exit 3; chỉ phiên tự spawn (có
#   .pid-$PORT do mình ghi) mới được dừng. Không có biến này: design-v2 chạy
#   sẵn trên port được tái sử dụng (chỉ phục vụ người chạy tay).
# - DIR neo theo vị trí script (DESIGN_CACHE_DIR override cho test), không
#   phụ thuộc pwd; log/pid tách theo port; umask 077; bind 127.0.0.1.
# - vite chạy trong process group riêng (node spawn detached — di động Linux
#   + macOS, không phụ thuộc binary setsid); stop xác minh danh tính tiến
#   trình (cmdline có vite + port) trước khi SIGTERM → SIGKILL vào -pgid.
# Idempotent: clone tồn tại → checkout lại SHA (chỉ khi HEAD khác SHA);
# node_modules tồn tại → bỏ qua install.
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Khi nâng SHA: phải kiểm tra lại chữ ký is_design_v2 (path art.tsx + TeacherDesk).
# DESIGN_V2_SHA chỉ để test tích hợp giả lập repo (prod không bao giờ set).
SHA="${DESIGN_V2_SHA:-7a53fc0fcbf415367d245539cedc3855606266a7}"
DIR="${DESIGN_CACHE_DIR:-$ROOT_DIR/.cache/design-v2}"
HOST="127.0.0.1"

# ${VAR-default} (không phải :-): DESIGN_PORT rỗng tường minh là lỗi cấu hình
# → fail-loud exit 2, KHÔNG lặng lẽ boot lên port mặc định 8200 (#546).
PORT="${DESIGN_PORT-8200}"
PID_FILE="$DIR/.pid-$PORT"
LOG="$DIR/.dev-$PORT.log"

cmd="${1:-run}"

validate_port() {
	case "$PORT" in
	'' | *[!0-9]*)
		echo "design v2 error: DESIGN_PORT không hợp lệ: '$PORT'" >&2
		exit 2
		;;
	esac
	if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
		echo "design v2 error: DESIGN_PORT ngoài 1..65535: '$PORT'" >&2
		exit 2
	fi
}

# Chữ ký nội dung design v2 (SHA ghim ở trên). Bọc output vào biến trước khi
# grep — KHÔNG pipe curl|grep -q trực tiếp: grep thoát sớm khi khớp làm curl
# dính SIGPIPE/exit 23 dưới `set -o pipefail` → false negative (#546 red-team).
is_design_v2() {
	local root_html art_src
	# --max-filesize 256KiB: khớp cap của verifyDesignV2Server (JS) — server
	# streaming không Content-Length thì --max-time 2 vẫn chặn thời gian.
	root_html="$(curl -sf --noproxy '*' --max-time 2 --max-filesize 262144 "http://$HOST:$PORT/")" || return 1
	art_src="$(curl -sf --noproxy '*' --max-time 2 --max-filesize 262144 "http://$HOST:$PORT/src/lib/art.tsx")" || return 1
	grep -Fq '<div id="root"></div>' <<<"$root_html" && grep -Fq 'TeacherDesk' <<<"$art_src"
}

# true khi có listener TCP trên port (loopback v4 lẫn v6).
port_is_listening() {
	node -e '
const net = require("node:net");
const port = Number(process.argv[1]);
const probe = (host) => new Promise((resolve) => {
  const s = net.connect({ host, port });
  const done = (v) => { s.destroy(); resolve(v); };
  s.setTimeout(500, () => done(false));
  s.on("error", () => done(false));
  s.on("connect", () => done(true));
});
Promise.all([probe("127.0.0.1"), probe("::1")]).then(([v4, v6]) => {
  process.exit(v4 || v6 ? 0 : 1);
});
' -- "$PORT"
}

# Xác minh danh tính: cmdline của pid phải chứa "vite" và port của mình.
# /proc không có (macOS) → fallback ps; vẫn không xác định được → false.
pid_identity_is_ours() {
	local pid="$1" cmdline=""
	if [ -r "/proc/$pid/cmdline" ]; then
		cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
	else
		cmdline="$(ps -p "$pid" -o args= 2>/dev/null || true)"
	fi
	case "$cmdline" in
	# "vite" + mốc "--port $PORT" (script tự spawn với đúng thứ tự argv này —
	# khớp lỏng hơn chỉ cần chứa "vite" bất kỳ đâu là quá yếu, red-team #546).
	*vite*"--port $PORT"*) return 0 ;;
	*) return 1 ;;
	esac
}

stop_by_pgid() {
	local pid="$1"
	case "$pid" in
	'' | *[!0-9]*)
		return 0
		;;
	esac
	[ "$pid" -gt 1 ] 2>/dev/null || return 0
	if ! kill -0 "$pid" 2>/dev/null; then
		return 0
	fi
	if ! pid_identity_is_ours "$pid"; then
		echo "design v2 warning: stale pid file (không phải vite của mình): $pid — chỉ xoá file" >&2
		return 0
	fi
	kill -TERM -- -"$pid" 2>/dev/null || true
	for _ in $(seq 1 30); do
		if ! kill -0 -- -"$pid" 2>/dev/null; then
			break
		fi
		sleep 0.1
	done
	if kill -0 -- -"$pid" 2>/dev/null; then
		kill -KILL -- -"$pid" 2>/dev/null || true
	fi
}

case "$cmd" in
	run)
		validate_port
		# dọn file .pid legacy (trước #546 dùng chung cho mọi port)
		if [ -f "$DIR/.pid" ]; then
			oldpid="$(cat "$DIR/.pid" 2>/dev/null || true)"
			if [ -z "$oldpid" ] || ! kill -0 "$oldpid" 2>/dev/null; then
				rm -f "$DIR/.pid"
			fi
		fi
		if is_design_v2; then
			if [ "${DESIGN_NO_REUSE:-0}" = "1" ]; then
				echo "design v2 error: port :$PORT is occupied by another design-v2 instance (DESIGN_NO_REUSE=1)" >&2
				exit 3
			fi
			echo "design v2 already on $HOST:$PORT"
			exit 0
		fi
		if port_is_listening; then
			echo "design v2 error: port :$PORT is occupied by another service (not design-v2)" >&2
			exit 3
		fi
		if [ ! -d "$DIR/.git" ]; then
			gh repo clone vinh19410/teacheros-design-v2 "$DIR"
		fi
		# chỉ chạm network khi HEAD khác SHA (lần chạy sau bỏ qua)
		if [ "$(git -C "$DIR" rev-parse HEAD 2>/dev/null || true)" != "$SHA" ]; then
			git -C "$DIR" fetch origin "$SHA" >/dev/null 2>&1 || true
			git -C "$DIR" checkout -q "$SHA"
		fi
		if [ ! -d "$DIR/node_modules" ]; then
			# --ignore-workspace: tránh bị hút vào pnpm workspace của teacher-os.
			(cd "$DIR" && pnpm install --ignore-workspace --silent)
		fi
		# Spawn vite trong process group riêng qua node (detached — pgid =
		# child.pid trên cả Linux và macOS); ghi pgid vào .pid-$PORT. Tham số
		# truyền qua argv (script trong nháy đơn) — không nội suy vào mã JS.
		mkdir -p "$DIR"
		node -e '
const { spawn } = require("node:child_process");
const { openSync, writeFileSync } = require("node:fs");
const [dir, host, port, log, pidFile] = process.argv.slice(1);
const out = openSync(log, "a");
const child = spawn("pnpm", ["exec", "vite", "--host", host, "--port", port, "--strictPort"], {
  cwd: dir,
  env: { ...process.env, FIGMA_DEV_SERVER_HOST: "127.0.0.1", FIGMA_PUBLIC_URL: "" },
  detached: true,
  stdio: ["ignore", out, out],
});
child.unref();
writeFileSync(pidFile, String(child.pid) + "\n");
' -- "$DIR" "$HOST" "$PORT" "$LOG" "$PID_FILE"
		# chờ vite ghi pidfile + sẵn sàng; vite chết sớm → fail với log tail
		for _ in $(seq 1 100); do
			pid="$(cat "$PID_FILE" 2>/dev/null || true)"
			if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
				stop_by_pgid "$pid"
				echo "design v2 failed to start; last log:" >&2
				tail -20 "$LOG" >&2
				exit 1
			fi
			if is_design_v2; then
				echo "design v2 on $HOST:$PORT (pgid $pid)"
				exit 0
			fi
			sleep 1
		done
		echo "design v2 failed to start within 100s; last log:" >&2
		tail -20 "$LOG" >&2
		stop_by_pgid "$(cat "$PID_FILE" 2>/dev/null || true)"
		exit 1
		;;
	stop)
		if [ -f "$PID_FILE" ]; then
			pid="$(cat "$PID_FILE" 2>/dev/null || true)"
			# xoá file TRƯỚC khi kill: hai stop đồng thời không double-kill
			rm -f "$PID_FILE"
			stop_by_pgid "$pid"
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
