# Phase 4: Test, docs và cổng đăng prod

## Requirements
- Cập nhật test mô tả cấu trúc cũ mà không bỏ các bất biến đã chốt (#559, #560, #562, #536).
- Cập nhật docs mô tả `apps/profile`.
- Chặn đăng prod đến khi nội dung được xác nhận.

## Files
- Sửa: `apps/profile/tests/index.test.mjs`, `apps/e2e/specs/profile-lead-intake.spec.ts`, `apps/e2e/specs/profile-placement-test.spec.ts` (nếu selector đổi)
- Sửa: `docs/codebase-summary.md` (mục `apps/profile`), `CHANGELOG.md` nếu repo quy ước

## Steps
1. Sửa test: form có đúng 2 input required (name, phone) cộng honeypot; select landing có đúng 4 options (3 mã mới + undecided); kiểm tra 8 khối theo id, đúng 1 CTA chính trong hero, anchor `#lam-test-mien-phi` và `#dang-ky-tu-van` còn tồn tại, không còn `copyAllLinksBtn`/`cefrDetailPanel` trên trang chủ.
2. Sửa test drift `apps/server/src/lead-catalog-drift.test.ts`: cập nhật kiểm tra `select[name=course]` trên landing phù hợp với tập rút gọn 4 khóa; kiểm tra `lead-gate.js` có đủ 15 khóa đúng danh mục.
3. Thêm test chống placeholder: kiểm tra trang chủ không chứa ký tự `[ ... ]` hoặc `TODO`.
4. Sửa e2e `profile-lead-intake`: bỏ các bước điền ô đã xóa, thêm ca submit bằng khóa mới.
5. Chạy toàn bộ gate: `pnpm --filter profile test`, test api/server liên quan, `pnpm check-types`, `pnpm exec biome check .`, rồi e2e với port override trong `AGENTS.md`.
6. Lập checklist xác nhận nội dung với cô Mỹ: học phí 3 khóa, chính sách chưa đạt mục tiêu, điều kiện cam kết đầu ra, 500+ và 8+ năm. Ghi kết quả vào PR.
7. Chỉ ship lên staging khi chưa đủ xác nhận; ship prod khi đủ.

## Validation
Mọi lệnh ở bước 3 xanh. PR kèm screenshot 3 viewport và kết quả `pnpm design:compare` nếu áp dụng.

## Risk / Rollback
Sửa test dễ làm lỏng bất biến; mỗi assert bị bỏ phải có lý do ghi trong PR.
