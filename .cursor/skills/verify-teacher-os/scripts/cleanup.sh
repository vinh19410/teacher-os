#!/usr/bin/env bash
# Tear down processes started by launch.sh. Never deletes evidence.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [[ ! -d "${VERIFY_INSTANCE_DIR}" ]]; then
	echo "verify-teacher-os cleanup: no instance dir ${VERIFY_INSTANCE_DIR} (nothing to stop)"
	exit 0
fi

kill_tree() {
	local pid="$1"
	if [[ -z "${pid}" ]]; then
		return 0
	fi
	if ! kill -0 "${pid}" 2>/dev/null; then
		return 0
	fi
	# Kill process group if launched in background from bash (&) — children are
	# vite/tsx under the same shell job. Prefer SIGTERM of the recorded PID and
	# its children via pkill -P, never killall by name.
	local children
	children="$(pgrep -P "${pid}" 2>/dev/null || true)"
	for c in ${children}; do
		kill_tree "${c}"
	done
	kill -TERM "${pid}" 2>/dev/null || true
}

for name in api web student admin; do
	pid_file="${VERIFY_INSTANCE_DIR}/${name}.pid"
	if [[ -f "${pid_file}" ]]; then
		pid="$(cat "${pid_file}")"
		echo "stopping ${name} pid=${pid}"
		kill_tree "${pid}"
	fi
done

# Wait briefly for ports to release.
for _ in $(seq 1 20); do
	busy=0
	for port in "${E2E_API_PORT}" "${E2E_WEB_PORT}" "${E2E_STUDENT_PORT}" "${E2E_ADMIN_PORT}"; do
		if port_in_use "${port}"; then
			busy=1
			break
		fi
	done
	[[ "${busy}" -eq 0 ]] && break
	sleep 0.5
done

# Force any leftover recorded PIDs.
for name in api web student admin; do
	pid_file="${VERIFY_INSTANCE_DIR}/${name}.pid"
	if [[ -f "${pid_file}" ]]; then
		pid="$(cat "${pid_file}")"
		kill -KILL "${pid}" 2>/dev/null || true
		pgrep -P "${pid}" 2>/dev/null | while read -r c; do
			kill -KILL "${c}" 2>/dev/null || true
		done || true
	fi
done

# Scratch instance state only — evidence stays.
rm -f "${VERIFY_INSTANCE_DIR}"/*.pid
# Keep logs for post-mortem of this run; mark cleaned.
date -u +%Y-%m-%dT%H:%M:%SZ >"${VERIFY_INSTANCE_DIR}/cleaned-at"

if [[ -f "${VERIFY_ROOT}/current-run" ]] && [[ "$(cat "${VERIFY_ROOT}/current-run")" == "${VERIFY_RUN_ID}" ]]; then
	rm -f "${VERIFY_ROOT}/current-run"
fi

echo "verify-teacher-os cleanup: stopped instance ${VERIFY_RUN_ID}"
echo "  evidence retained at ${VERIFY_EVIDENCE_DIR}"
