# Phase 1: Xử lý nhóm mức Cao

Các issue: #570, #571, #572, #573.

## Thứ tự gợi ý

1. #573: kiểm tra số dòng `vocab_library_course` trên staging trước vì có thể chỉ cần seed. Production bị chặn bởi gate giấy phép trong `packages/db/scripts/README-seed-vocab-library.md`.
2. #571: bật `showExplanation` ở `apps/web`, thay đổi nhỏ và mở khóa một phần #579.
3. #570: đối chiếu `notification_record` trên staging, rồi bổ sung gửi email và gửi lại lời mời.
4. #572: đổi ô chọn ngày. Phần chọn giờ chạm contract `due` nên cần chốt phạm vi trước.

## Kiểm chứng

Làm theo mục "Hướng sửa" trong từng issue. Gate chung: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, E2E liên quan. PR đụng UI kiểm tra 3 viewport theo `REVIEW.md`.

## Rủi ro

- #570 gửi email thật tới học viên: test bằng hộp thư kiểm soát được và giới hạn tần suất gửi lại.
- #572 đổi kiểu dữ liệu `due` có thể ảnh hưởng dữ liệu đã giao, cần migration có sao lưu nếu thêm giờ.
