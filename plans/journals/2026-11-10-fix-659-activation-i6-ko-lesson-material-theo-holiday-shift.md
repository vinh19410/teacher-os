---
title: "Fix #659: activation I6 kéo lesson_material theo holiday shift lớp manual"
date: 2026-11-10
---

# Fix #659: activation I6 kéo lesson_material theo holiday shift lớp manual

Root cause: activation nhánh I6 (lớp manual chưa từng có shift/cancel/lesson) sinh shift D→D′ qua planner rồi biến buổi gốc thành holiday + thêm buổi bù upcoming, nhưng batch không có statement nào đụng lesson_material — tài liệu kẹt bucket ngày gốc: học viên thấy buổi bù trống, teacher attach tiếp được qua carve-out class_session của isHolidayBucket (#658). Fix: trong loop for (const shift of newShifts), push cặp statement DELETE-trùng-materialId-@makeupDate + UPDATE move D→D′ (pattern shiftStatements #645 của PR #661), cùng batch nguyên tử (guard CASE lesson insert rollback cả batch), per-shift tuần tự — chained shift cần thấy ghi câu trước. Non-I6 giữ nguyên (semantics #658); không đụng class_session (tái-áp shift + đối xứng undo + invariant holiday không đổi class_session — kongming GO checkpoint #1). TDD: red-team 2 reviewer hostile 9 findings — 6 accepted (makeup-date planner quét từ maxTeachingDate+1 → test seed 8 class_session; red matrix 36/4 đúng; assertion trung gian undo; thêm test 5 chuỗi 2 kỳ nghỉ sinh bởi planner I6 với dup tại đích cuối F10 bẫy gom-sai PK conflict; FK seed; query audit has_class_session) / 3 rejected (gate NOT EXISTS gây PK conflict 500; route-level test ngoài scope). Pha đỏ 36 passed/4 failed đúng kỳ vọng → fix → 40/40 holidays + 28/28 materials; full server suite 1370 passed + 1 expected fail; pnpm check/check-types sạch. Code review: 2 reviewer fresh-context APPROVE (0 Critical/0 Important/3 Minor). Follow-up: #662 (lỗ hổng tồn dư re-activation/attach-sau-shift, blocked-by 659), #663 (audit legacy). Kongming checkpoint #2/#3 fail external blocker (Cursor usage pricing) — thay bằng receipts red-team + review theo điều khoản vibe; ghi trong report.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
