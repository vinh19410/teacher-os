---
title: Plan sửa popup /schedule hiện sai trạng thái điểm danh (lớp legacy)
date: 2026-10-05
summary: "Popup /schedule chọn row theo UUID nhỏ nhất trên lớp legacy undated nên hiện 'Hoàn thành' cho buổi chưa tới; lập plan 3 phase (issue #326)"
---

# Plan sửa popup /schedule hiện sai trạng thái điểm danh

## What happened
User nghi popup "Lớp Test 1 — Thứ Ba, 06/10" hardcode vì Học viên 2 đã "Hoàn thành" dù buổi chưa tới. Truy D1 local: lớp tạo trước #98 nên 52 row `date = NULL`; popup gộp 13 tuần Thứ Ba, `distinctStudentsBySid` (fix #204) giữ row UUID nhỏ nhất — UUID completed của Học viên 2 tình cờ nhỏ hơn upcoming. Không phải hardcode; trạng thái và target của nút thao tác đều ngẫu nhiên theo UUID.

## Decision
- Popup /schedule tái dùng model `class-sessions.ts` của tab chi tiết lớp (prefix legacy + v2 dated) thay vì dedupe theo sid.
- Chặn check-in buổi tương lai ở UI + server (422 `future-session`, không dùng 409 vì client map 409 thành "đã cập nhật trước đó").
- Sửa `buildBackfillPlan` xếp completed → cancelled → còn lại trước `(createdAt, seq)`; dry-run cũ gắn row completed của Học viên 2 vào 2026-11-03.

## Rủi ro đã thấy
- Prod/staging có thể đã chạy backfill cũ → completed có thể nằm ở ngày tương lai; plan chỉ thêm truy vấn phát hiện.
- Test server dùng ngày cố định 2026-08/09 → guard cần clock inject.

## Next steps
Commit + push plan lên `develop` để link trong #326 hoạt động, rồi `/ak:cook plans/261005-1637-schedule-session-modal-legacy-status/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
