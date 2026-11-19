# Plan #810 — Cho phép tạo/xuất bản bộ đề thư viện với tối thiểu 1 part/passage

- Issue: https://github.com/vinh19410/teacher-os/issues/810
- Branch: `feat/810-library-partial-test-publish` (target: `develop` via `--beta --merge`)
- Status: `done`

## Phạm vi & Hợp đồng

1. **Contract (`packages/api`)** — Owner: Worker 1
   - Sửa `validateTestReady(skill, parts)` trong `packages/api/src/library-contracts.ts`:
     - Khi `parts.length === 0`: trả `[{ path: "parts", message: "at least one part is required" }]`.
     - Khi `parts.length >= 1`: sắp xếp theo thứ tự `ASSIGNMENT_TEST_PRESETS[skill].slots` (các slot ngoài preset xếp sau để `partIssues` bắt `invalid part for skill`), kiểm tra trùng slot (`duplicate part <slot>`), và chạy `partIssues(skill, part, "parts." + part.part)` cho mọi part hiện có.
   - Cập nhật & bổ sung unit tests trong `packages/api/src/library-contracts.test.ts` (Reading/Listening 1 part ở slot đầu hoặc slot giữa như `p2`, 0 part, duplicate part, wrong-skill part, 1 part đạt + 1 part lỗi).

2. **Server Route Tests (`apps/server`)** — Owner: Worker 2
   - Kiểm tra `apps/server/src/routes/admin-library.ts` (đã gọi `validateTestReady`).
   - Cập nhật & bổ sung test trong `apps/server/src/routes/admin-library.test.ts`:
     - `PATCH /api/admin/library/tests/:id` (`status: "ready"`) khi 0 part → `400 NOT_READY` với `path: "parts"`.
     - `PATCH /api/admin/library/tests/:id` (`status: "ready"`) khi chỉ có 1 part hợp lệ (Reading `p1`, Reading chỉ `p2`, Listening `s1`) → `200` + `status === "ready"`.
     - `PATCH /api/admin/library/tests/:id` khi có 1 part hợp lệ + 1 part lỗi → `400 NOT_READY`.

3. **Admin UI (`apps/admin`)** — Owner: Worker 3
   - `apps/admin/src/components/library/part-issues.ts`: thêm mapping `/at least one part is required/i` → `"Cần ít nhất 1 part có nội dung để xuất bản bộ đề."` và `/duplicate part/i` → `"Part bị trùng lặp trong bộ đề."` (giữ `/missing part/i` cho tương thích).
   - `apps/admin/src/components/library/publish-bar.tsx`: cập nhật dòng mô tả điều kiện xuất bản (tối thiểu 1 part và mỗi part đã tạo đạt điều kiện, không còn ghi "đủ part theo cấu trúc đề").
   - `apps/admin/src/components/library/publish-bar.test.tsx`: bổ sung test cho `formatIssue({ path: "parts", message: "at least one part is required" }, "reading")` và kiểm tra copy mới ở `PublishBar`.
   - Kiểm tra `test-outline-model.test.ts`, `test-preview-model.test.ts`, `answers-overview.test.ts` khi chỉ có 1 part (vd chỉ `p2`).

## Done means

- Tất cả unit/route/component tests liên quan pass.
- `pnpm check-types` và `pnpm exec biome check .` pass.
- Isolated code review sạch không còn blocker.
- PR mở vào `develop`, CI xanh, merge `--merge`, issue cập nhật `shipped` kèm POT.
