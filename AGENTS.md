# AGENTS.md — Conventions cho AI collaborator

## Ngôn ngữ giao tiếp

- **Response, summary, completion report, giải thích: TIẾNG VIỆT** (mặc định cho mọi session/agent trong repo này).
- Giữ nguyên tiếng Anh cho: commit message (conventional commits), PR title, code identifier, tên test, thuật ngữ kỹ thuật đã tiếng Anh hoá trong codebase.
- PR body / issue comment / changelog theo precedent tiếng Việt của repo (xem PR #281, #284).

## Lưu ý vận hành

- CI/E2E workflow chỉ trigger cho target `main`; PR vào `develop` không có checks — gate verification là bộ lệnh local (`pnpm check`, `pnpm check-types`, `pnpm --filter <app> test`, `pnpm --filter e2e e2e`).
- Dev stack local chiếm port 8000/8001/8003 — e2e dùng override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.
