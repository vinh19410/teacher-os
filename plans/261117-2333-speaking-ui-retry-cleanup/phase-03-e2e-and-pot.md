# Phase 03 — E2E Verification, POT, Isolated Review & `--merge --beta`

## Files Owned
- `apps/e2e/specs/profile-placement-test.spec.ts`
- `apps/e2e/specs/student-placement-test.spec.ts`
- `plans/reports/*` (POT screenshots)

## Steps
1. Cập nhật `apps/e2e/specs/profile-placement-test.spec.ts` và `apps/e2e/specs/student-placement-test.spec.ts` để kiểm chứng toàn bộ hành vi mới:
   - Không còn hướng dẫn 3 bước `<ol>` / mô tả dài;
   - Bộ đếm chuẩn bị nằm giữa màn hình;
   - Nút tròn đỏ icon Pause nằm giữa màn hình khi ghi âm;
   - Bấm Pause dừng lượt ghi, bấm retry câu hiện tại tối đa 2 lần (lần 3 bị khóa `disabled`), sau đó đi tiếp & ghép file nộp thành công (`POST` + `PUT`);
   - Bỏ nút `Ghi lại từ đầu` ở màn xem lại;
   - Nút kết thúc sớm tách ở footer riêng và có xác nhận ngắn trước khi kết thúc sớm;
   - Chụp ảnh POT cho cả `apps/student` (light + dark, 3 viewport `1440×900`, `768×1024`, `375×812` + kiểm tra 320px reflow) và `apps/profile` (3 viewport).
2. Chạy gates:
   - `pnpm exec biome check .`
   - `pnpm check-types`
   - `pnpm --filter student test && pnpm --filter profile test`
   - Chạy 2 spec E2E lẻ với port override `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`
3. Chạy isolated code review (`code-reviewer` subagent), fix toàn bộ findings và review lại tới khi sạch.
4. Commit & push, cập nhật POT lên issue #780, mở PR vào `develop` (`--beta`), kiểm tra CI/merge (`--merge --beta`), cập nhật issue label sang `shipped`.
