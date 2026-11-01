---
phase: 3
title: "E2E, test hồi quy & tài liệu"
status: pending
priority: P2
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: E2E, hồi quy & tài liệu

## Goal

Cập nhật e2e hiện có theo hành vi mới (gate + lead), thêm kịch bản cho gate, và đồng bộ tài liệu/copy còn nói "không cần điền thông tin".

## Files to Create / Modify

- Modify: `apps/e2e/specs/profile-placement-test.spec.ts`
- Modify: `apps/e2e/specs/profile-lead-intake.spec.ts` (chỉ nếu dùng chung helper dọn `ip_hash`)
- Modify: `apps/profile/public/index.html` (copy CTA/FAQ nhắc "không cần điền thông tin" nếu có — kiểm tra bằng `grep -n "không cần\|điền thông tin"`)
- Modify (nếu tồn tại mục mô tả luồng): tài liệu trong `docs/` nhắc `/kiem-tra-dau-vao/` hoặc `public/leads` (xác định bằng `grep -rn "kiem-tra-dau-vao" docs README.md`)

## Tasks & Steps

1. **Sửa e2e hiện có** ("xem kết quả không tạo lead…"): sau bước CTA thêm bước điền form (tên/email/SĐT duy nhất bằng `uniquePhone`), chờ vào Phần 1; đổi khẳng định "không tạo lead" thành: sau gửi form có đúng +1 lead (`source = placement-test`, `placement` rỗng), sau nộp bài **vẫn +1 lead** với `placement` khớp tóm tắt; bước "Đăng ký theo kết quả này" vẫn điền sẵn form trang chủ và lưu `lead.placement` đúng (hợp nhất dòng theo dedupe).
2. **Kịch bản gate** (spec mới trong cùng file, mỗi test dọn `ip_hash` như các test cũ để không chạm trần 3/10 phút):
   - Thiếu/sai từng trường bắt buộc ⇒ có lỗi, không vào Phần 1, không có dòng lead.
   - Chỉ điền 3 trường bắt buộc ⇒ vào Phần 1; các trường tuỳ chọn trống không gây lỗi.
   - Reload ở Phần 1 ⇒ không phải nhập lại; reload ở kết quả ⇒ `submit_count` không tăng.
   - "Đổi thông tin" ⇒ xoá `lead` khỏi `localStorage` và quay về form.
   - API 500 ở bước gửi ⇒ vẫn ở form, có Thử lại + link Zalo, không vào Phần 1 (dùng `page.route` như `profile-lead-intake.spec.ts` AC-003).
   - 3 viewport không tràn ngang + điều hướng bàn phím cho form (gộp vào test viewport sẵn có).
3. **Copy/tài liệu**: cập nhật mọi chỗ còn khẳng định "không cần điền thông tin cá nhân"; ghi nhận luồng mới (nguồn lead `placement-test`, email bắt buộc ở nguồn này) vào tài liệu sở hữu luồng lead nếu có; không tạo file docs mới nếu không có chỗ phù hợp.
4. Chạy toàn bộ gate: lint, types, test các gói, e2e profile với cổng override (`E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105`). Trước khi gộp vào `develop`, chạy full suite Playwright (theo quy ước dự án).

## Verification

- `pnpm exec biome check .`
- `pnpm check-types`
- `pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter profile test`
- `pnpm --filter e2e e2e` (kèm biến cổng override ở trên), đảm bảo các cổng 8100/8101/8103/8104/8105 trống trước khi chạy và dừng tiến trình do mình khởi động sau khi xong.

## Risk / Rollback

- E2E dùng chung bucket IP `unknown`: mỗi test tạo lead mới phải dọn `ip_hash` hoặc đặt `CF-Connecting-IP` riêng, nếu không test sau bị 429.
- Rollback: revert commit; không có thay đổi dữ liệu/hạ tầng.
