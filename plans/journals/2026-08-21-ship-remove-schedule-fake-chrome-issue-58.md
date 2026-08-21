---
title: "Ship remove schedule fake chrome (issue #58, PR #74)"
date: 2026-08-21
summary: "Gỡ toàn bộ fake chrome khỏi luồng classes/schedule (badge GCal hardcode, chip nav no-op, todayIdx=1, lead 'Tuần 19–25/08', dayDates giả) — 201/201 web test (+3), review 0 Critical/0 Important, source-contract test thay grep one-shot"
---

# Ship remove schedule fake chrome (issue #58, PR #74)

## What happened
- Branch `feat/58-remove-schedule-fake-chrome`, PR [#74](https://github.com/vinh19410/teacher-os/pull/74) (beta → develop), đóng issue #58.
- Gỡ sạch fake chrome khỏi luồng classes/schedule: badge "GCal · Đã bật" hardcode, chip nav no-op, `todayIdx=1`, lead "Tuần 19–25/08 · 11 buổi học" hardcode, ngày giả `dayDates+"/08"` trên schedule/lesson-modal/$classId; xóa export `dayDates`.
- Kết quả: 201/201 web test (+3 test mới), review 0 Critical/0 Important, follow-up #73 ("Thứ 8" ở student detail).

## Decision
Ba điểm khó thật sự, tất cả đều là bài học về grep gate và tooling:
- **Grep gate toàn `apps/web/src` không thể đạt 0**: red-team phát hiện "Tuần này" là chuỗi hợp lệ trong settings template, và dashboard có negative assertion cùng chuỗi → gate phải scope theo từng file, không quét toàn cây.
- **biome/tsc không bắt unused import** (`noUnusedImports` tắt): dead imports `Button`/`Card` đã pass mọi gate từ trước khi PR này tồn tại → dọn thủ công + checklist từng file đụng đến.
- **Hai quy ước day chung một codebase**: `lesson.day` 1-based vs schedule JSON 0-based → helper `lessonDayLabel` cần JSDoc cảnh báo off-by-one, ghim cho #56.

Giải pháp đáng nhớ nhất: **source-contract test** (`readSrc` + `not.toMatch`) theo convention đã có của dashboard — biến DOD "0 CTA no-op" từ grep one-shot thành enforcement sống trong suite; kèm comment tripwire chỉ rõ lock nào đang chờ #56 cập nhật.

## Bài học
Với PR removal, kẻ thù không phải logic mà là **dangling references và grep pattern quá rộng**. Contract test theo convention repo mạnh hơn grep one-shot vì nó sống cùng code và fail ngay khi fake chrome mọc lại.

## Next steps
- Theo dõi CI trên develop sau merge PR #74.
- #56 (lesson CRUD): cập nhật tripwire comment và JSDoc off-by-one khi đổi quy ước day.
- Follow-up #73: sửa nhãn "Thứ 8" ở student detail.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
