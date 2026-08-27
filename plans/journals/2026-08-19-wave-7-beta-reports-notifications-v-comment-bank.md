---
title: "Wave 7 beta — reports, notifications và comment bank"
date: 2026-08-19
summary: "Hoàn tất persistence org-scoped, retry idempotent và toàn bộ quality gate cho Wave 7."
---

# Wave 7 beta — reports, notifications và comment bank

## Bối cảnh

Wave 7 chuyển `report`, `notif` và `comment_bank` từ dữ liệu cục bộ sang D1 theo phạm vi tổ chức. Yêu cầu giữ create/send report và mark-read notification ở trạng thái no-op; parent plan tiếp tục `in-progress` vì Phase 9 chưa làm.

## Đã triển khai

- Thêm 3 bảng persist org-scoped, migration, index và quan hệ report–student cùng tổ chức.
- Kernel snapshot và các list route hydrate qua DTO tường minh; web adapter giữ identity server đến UI.
- Grade modal lưu điểm trước, rồi append feedback vào comment bank. Nếu comment lỗi sau khi điểm đã commit, retry chỉ gửi comment, không replay grade.
- Create/send report và notif mark-read vẫn không có write path đúng phạm vi beta.

## Sự cố và quyết định

Review phát hiện tình huống D1 đã commit nhưng client mất POST ACK có thể tạo comment trùng khi retry. Fix bằng `operationId` ổn định cho mỗi lần mở modal, unique `(orgId, operationId)` ở D1, và bind operation vào payload đã normalize. Replay cùng payload hội tụ về cùng row/id; reuse key với payload khác trả `409`; cùng key ở tenant khác vẫn độc lập.

## Xác minh

- Web: 109/109 test xanh.
- Server: 51/51 test xanh.
- CI contract: 1/1 xanh.
- Typecheck cưỡng bức không cache: 5/5 package xanh.
- Build web/server xanh; review local approve 9.4/10, không còn Critical/Important.

## Theo dõi

- Không chặn beta: GradeModal mới có source contract và behavior tests ở bus/server, chưa có DOM component harness.
- Không chặn beta: enum report status/notif dot hiện mới compile-time; cần runtime/DB enforcement trước khi mở public writer/import.
- Phase 8 hoàn tất; parent plan vẫn `in-progress` để thực hiện Phase 9.

AgentWiki publish skipped.

## Unresolved questions

None.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
