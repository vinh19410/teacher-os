#!/usr/bin/env bash
# Launch the Teacher OS verification stack (e2e API + vite web/student/admin).
# Does NOT use alchemy/Cloudflare — same path as CI e2e.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_repo
require_node24

mkdir -p "${VERIFY_INSTANCE_DIR}" "${VERIFY_EVIDENCE_DIR}"
echo "${VERIFY_RUN_ID}" >"${VERIFY_ROOT}/current-run"

for port in "${E2E_API_PORT}" "${E2E_WEB_PORT}" "${E2E_STUDENT_PORT}" "${E2E_ADMIN_PORT}"; do
	if port_in_use "${port}"; then
		echo "verify-teacher-os launch: port ${port} already in use. Free it or override E2E_*_PORT." >&2
		exit 1
	fi
done

cd "${REPO_ROOT}"

# boot:api wipes apps/e2e/local.db every start — disposable state for this run.
(
	cd apps/e2e
	env E2E_API_PORT="${E2E_API_PORT}" \
		E2E_WEB_PORT="${E2E_WEB_PORT}" \
		E2E_STUDENT_PORT="${E2E_STUDENT_PORT}" \
		E2E_ADMIN_PORT="${E2E_ADMIN_PORT}" \
		pnpm run boot:api
) >"${VERIFY_INSTANCE_DIR}/api.log" 2>&1 &
echo $! >"${VERIFY_INSTANCE_DIR}/api.pid"

env VITE_SERVER_URL="${VERIFY_API_URL}" \
	VITE_AI_ENABLED=true \
	VITE_TEACHER_SIGNUP_ENABLED=true \
	pnpm --filter web exec vite --port "${E2E_WEB_PORT}" --strictPort \
	>"${VERIFY_INSTANCE_DIR}/web.log" 2>&1 &
echo $! >"${VERIFY_INSTANCE_DIR}/web.pid"

env VITE_SERVER_URL="${VERIFY_API_URL}" \
	pnpm --filter student exec vite --port "${E2E_STUDENT_PORT}" --strictPort \
	>"${VERIFY_INSTANCE_DIR}/student.log" 2>&1 &
echo $! >"${VERIFY_INSTANCE_DIR}/student.pid"

env VITE_SERVER_URL="${VERIFY_API_URL}" \
	pnpm --filter admin exec vite --port "${E2E_ADMIN_PORT}" --strictPort \
	>"${VERIFY_INSTANCE_DIR}/admin.log" 2>&1 &
echo $! >"${VERIFY_INSTANCE_DIR}/admin.pid"

cat >"${VERIFY_INSTANCE_DIR}/meta.json" <<EOF
{
  "runId": "${VERIFY_RUN_ID}",
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "apiUrl": "${VERIFY_API_URL}",
  "webUrl": "${VERIFY_WEB_URL}",
  "studentUrl": "${VERIFY_STUDENT_URL}",
  "adminUrl": "${VERIFY_ADMIN_URL}",
  "ports": {
    "api": ${E2E_API_PORT},
    "web": ${E2E_WEB_PORT},
    "student": ${E2E_STUDENT_PORT},
    "admin": ${E2E_ADMIN_PORT}
  },
  "db": "${REPO_ROOT}/apps/e2e/local.db",
  "evidenceDir": "${VERIFY_EVIDENCE_DIR}"
}
EOF

ready=0
for _ in $(seq 1 90); do
	api_ok=0; web_ok=0; student_ok=0; admin_ok=0
	curl -sf "${VERIFY_API_URL}/readyz" >/dev/null && api_ok=1
	curl -sf "${VERIFY_WEB_URL}/" >/dev/null && web_ok=1
	curl -sf "${VERIFY_STUDENT_URL}/login" >/dev/null && student_ok=1
	admin_code="$(curl -s -o /dev/null -w "%{http_code}" "${VERIFY_ADMIN_URL}/" || true)"
	if [[ -n "${admin_code}" && "${admin_code}" -lt 404 ]]; then admin_ok=1; fi
	if [[ "${api_ok}" -eq 1 && "${web_ok}" -eq 1 && "${student_ok}" -eq 1 && "${admin_ok}" -eq 1 ]]; then
		ready=1
		break
	fi
	sleep 1
done

if [[ "${ready}" -ne 1 ]]; then
	echo "verify-teacher-os launch: stack not ready within 90s" >&2
	echo "--- api.log (tail) ---" >&2
	tail -n 40 "${VERIFY_INSTANCE_DIR}/api.log" >&2 || true
	echo "--- web.log (tail) ---" >&2
	tail -n 40 "${VERIFY_INSTANCE_DIR}/web.log" >&2 || true
	"${SCRIPT_DIR}/cleanup.sh" || true
	exit 1
fi

# Ready = usable: /readyz OK after migrations+vocab seed (boot logs the listen line).
if ! grep -q "\[e2e-boot\] api on" "${VERIFY_INSTANCE_DIR}/api.log"; then
	echo "verify-teacher-os launch: api process up but boot banner missing — check api.log" >&2
	"${SCRIPT_DIR}/cleanup.sh" || true
	exit 1
fi

echo "verify-teacher-os launch: ready"
echo "  runId=${VERIFY_RUN_ID}"
echo "  web=${VERIFY_WEB_URL}"
echo "  api=${VERIFY_API_URL}"
echo "  evidence=${VERIFY_EVIDENCE_DIR}"
echo "  meta=${VERIFY_INSTANCE_DIR}/meta.json"
