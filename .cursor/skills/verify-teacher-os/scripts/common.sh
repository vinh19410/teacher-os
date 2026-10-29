#!/usr/bin/env bash
# Shared env for verify-teacher-os helpers. Source from other scripts.
set -euo pipefail

# Prefer Node 24 (CI pin). Cloud agents often have /exec-daemon/node (v22) first.
if [[ -d "${HOME}/.nvm/versions/node" ]]; then
	_node24="$(ls -d "${HOME}"/.nvm/versions/node/v24.* 2>/dev/null | sort -V | tail -n1 || true)"
	if [[ -n "${_node24}" ]]; then
		export PATH="${_node24}/bin:${PATH}"
	fi
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
export REPO_ROOT

# Dedicated ports so verification does not collide with alchemy/dev on 800x.
export E2E_API_PORT="${E2E_API_PORT:-8100}"
export E2E_WEB_PORT="${E2E_WEB_PORT:-8101}"
export E2E_STUDENT_PORT="${E2E_STUDENT_PORT:-8103}"
export E2E_ADMIN_PORT="${E2E_ADMIN_PORT:-8104}"

export VERIFY_API_URL="http://localhost:${E2E_API_PORT}"
export VERIFY_WEB_URL="http://localhost:${E2E_WEB_PORT}"
export VERIFY_STUDENT_URL="http://localhost:${E2E_STUDENT_PORT}"
export VERIFY_ADMIN_URL="http://localhost:${E2E_ADMIN_PORT}"

# Instance + evidence roots. Evidence survives cleanup; instance does not.
export VERIFY_ROOT="${VERIFY_ROOT:-/tmp/verify-teacher-os}"
export VERIFY_RUN_ID="${VERIFY_RUN_ID:-}"
if [[ -z "${VERIFY_RUN_ID}" ]]; then
	if [[ -f "${VERIFY_ROOT}/current-run" ]]; then
		VERIFY_RUN_ID="$(cat "${VERIFY_ROOT}/current-run")"
	else
		VERIFY_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
	fi
fi
export VERIFY_RUN_ID
export VERIFY_INSTANCE_DIR="${VERIFY_ROOT}/${VERIFY_RUN_ID}/instance"
export VERIFY_EVIDENCE_DIR="${VERIFY_ROOT}/${VERIFY_RUN_ID}/evidence"

require_repo() {
	if [[ ! -f "${REPO_ROOT}/apps/e2e/package.json" ]]; then
		echo "verify-teacher-os: cannot find apps/e2e from REPO_ROOT=${REPO_ROOT}" >&2
		exit 1
	fi
}

require_node24() {
	local major
	major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
	if [[ "${major}" -lt 24 ]]; then
		echo "verify-teacher-os: need Node >= 24 (got $(node -v)). Prepend nvm Node 24 to PATH." >&2
		exit 1
	fi
}

port_in_use() {
	local port="$1"
	if command -v ss >/dev/null 2>&1; then
		ss -ltn | grep -qE ":${port}\\b"
		return $?
	fi
	# Fallback: try binding via node
	node -e "const n=require('node:net');const s=n.createServer();s.once('error',e=>{process.exit(e.code==='EADDRINUSE'?0:1)});s.listen(${port},'127.0.0.1',()=>{s.close(()=>process.exit(1))});" >/dev/null 2>&1
}
