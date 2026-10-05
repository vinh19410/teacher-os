# AGENTS.md — Conventions cho AI collaborator

## Ngôn ngữ giao tiếp

- **Response, summary, completion report, giải thích: TIẾNG VIỆT** (mặc định cho mọi session/agent trong repo này).
- Giữ nguyên tiếng Anh cho: commit message (conventional commits), PR title, code identifier, tên test, thuật ngữ kỹ thuật đã tiếng Anh hoá trong codebase.
- PR body / issue comment / changelog theo precedent tiếng Việt của repo (xem PR #281, #284).

## Lưu ý vận hành

- CI/E2E workflow chỉ trigger cho target `main`; PR vào `develop` không có checks — gate verification là bộ lệnh local (`pnpm check`, `pnpm check-types`, `pnpm --filter <app> test`, `pnpm --filter e2e e2e`).
- Dev stack local chiếm port 8000/8001/8003 — e2e dùng override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103`.

## Quy ước UI

- Đọc `DESIGN.md` trước khi sửa/Thêm UI: token màu/type/motion và quy tắc chip/card lấy từ đó,
  không hard-code giá trị lệch scale của `packages/ui/src/styles/globals.css`.
- Trang list có bộ lọc: filter sống trong URL (search param), ô search debounce ~300ms mới đẩy
  lên URL; taxonomy hai cấp nhóm chip theo nhãn; badge đếm `aria-hidden`. Xem `apps/web/src/components/ui/chip-filter.tsx`
  và `/assignments` làm mẫu.
- Verify UI ở 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus theo `REVIEW.md`; PR
  đụng hình ảnh kèm screenshot.
