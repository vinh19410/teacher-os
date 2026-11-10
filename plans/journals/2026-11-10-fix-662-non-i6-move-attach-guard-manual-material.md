---
title: fix-662-non-i6-move-attach-guard-manual-material
date: 2026-11-10
---

# fix-662-non-i6-move-attach-guard-manual-material

Đóng 2 đường mồ côi lesson_material còn lại của lớp manual (#662). Path 1 (re-activation sau xóa enrollment): activation non-I6 giờ move material theo shift row có sẵn trong cùng batch nguyên tử — helper `materialMoveStatements` dùng chung I6/non-I6, gate `scheduleShifted` chống yank khi `parsedSchedule` null (schedule legacy → lesson thật ở lại ngày gốc, không move). Path 2 (attach-sau-shift): chặn attach/upload vào bucket all-holiday + class_session + shift row bằng predicate riêng `isShiftedHolidayBucket` (detach chủ ý giữ 200 để legacy gỡ được; bucket rỗng giữ 201 theo #660) + guard CASE nhánh OR + 2 race fallback. Pin test non-I6 của #659 viết lại theo semantics mới — reversal #658 có chủ ý (sau activation ngày gốc không còn buổi thật). TDD: 12 test mới + 1 pin viết lại; RED 7/1 (holidays) và 3/2 (materials) đúng spec → xanh; routes suite 526/526; web repos 238/238; pnpm check/check-types/test sạch. Red-team plan: 12 findings (10 accept, 2 modified — badge cắt thành #665); 2 code-reviewer fresh-context APPROVE (0 Critical/0 Important). kongming GO checkpoint sau điều tra; checkpoint sau-plan-gates + ship fail do Cursor hết weekly usage cho Opus 5.5 (non-fatal, đã ghi Advisory Log).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
