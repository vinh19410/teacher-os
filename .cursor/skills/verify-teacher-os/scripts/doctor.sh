#!/usr/bin/env bash
# Read-only health check: is this verification instance worth driving?
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_repo
require_node24

fail=0
say() { printf '%s\n' "$*"; }
bad() { printf 'FAIL: %s\n' "$*" >&2; fail=1; }
ok() { printf 'OK: %s\n' "$*"; }

if [[ ! -f "${VERIFY_INSTANCE_DIR}/meta.json" ]]; then
	bad "no instance meta at ${VERIFY_INSTANCE_DIR}/meta.json — run launch.sh first"
	exit 1
fi

say "runId=${VERIFY_RUN_ID}"
say "meta=${VERIFY_INSTANCE_DIR}/meta.json"

for name in api web student admin; do
	pid_file="${VERIFY_INSTANCE_DIR}/${name}.pid"
	if [[ ! -f "${pid_file}" ]]; then
		bad "missing ${name}.pid"
		continue
	fi
	pid="$(cat "${pid_file}")"
	if kill -0 "${pid}" 2>/dev/null; then
		ok "${name} pid ${pid} alive"
	else
		bad "${name} pid ${pid} not running"
	fi
done

if curl -sf "${VERIFY_API_URL}/readyz" >/dev/null; then
	ok "GET ${VERIFY_API_URL}/readyz"
else
	bad "GET ${VERIFY_API_URL}/readyz"
fi

code_web="$(curl -s -o /dev/null -w '%{http_code}' "${VERIFY_WEB_URL}/" || true)"
if [[ "${code_web}" =~ ^[23] ]]; then
	ok "GET ${VERIFY_WEB_URL}/ → ${code_web}"
else
	bad "GET ${VERIFY_WEB_URL}/ → ${code_web}"
fi

code_student="$(curl -s -o /dev/null -w '%{http_code}' "${VERIFY_STUDENT_URL}/login" || true)"
if [[ "${code_student}" =~ ^[23] ]]; then
	ok "GET ${VERIFY_STUDENT_URL}/login → ${code_student}"
else
	bad "GET ${VERIFY_STUDENT_URL}/login → ${code_student}"
fi

# Playwright treats status < 404 as available for vite apps.
code_admin="$(curl -s -o /dev/null -w '%{http_code}' "${VERIFY_ADMIN_URL}/" || true)"
if [[ -n "${code_admin}" && "${code_admin}" -lt 404 ]]; then
	ok "GET ${VERIFY_ADMIN_URL}/ → ${code_admin}"
else
	bad "GET ${VERIFY_ADMIN_URL}/ → ${code_admin}"
fi

# Port ownership: the listening process should be a descendant of our launch PIDs.
# Soft check — warn if something else answers (reuseExistingServer is forbidden).
if [[ -f "${REPO_ROOT}/apps/e2e/local.db" ]]; then
	ok "disposable db present at apps/e2e/local.db"
else
	bad "apps/e2e/local.db missing (boot:api should have created it)"
fi

node_v="$(node -v)"
say "node=${node_v}"
if [[ "${node_v}" != v24* ]]; then
	bad "Node is ${node_v}; expected v24.x"
fi

if [[ "${fail}" -ne 0 ]]; then
	echo "doctor: UNHEALTHY" >&2
	exit 1
fi
echo "doctor: HEALTHY"
