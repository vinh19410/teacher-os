---
title: "Popup buổi học /schedule hiện sai trạng thái điểm danh — lớp legacy không có ngày (#326)"
date: 2026-10-06
summary: "Popup chọn row theo UUID nhỏ nhất của cả khoá nên lớp legacy undated hiện trạng thái ngẫu nhiên; sửa bằng model occurrence dùng chung với tab chi tiết lớp, chặn điểm danh buổi tương lai ở UI + server (422 future-session), backfill xếp theo trạng thái. Red-team 3 reviewer: 16/18 finding được nhận; review local 0 Critical, 2 Important đã sửa. Gates: check, check-types, web 1278, server 599, e2e 136 passed."
---

# Popup buổi học /schedule hiện sai trạng thái điểm danh (#326)

Nguyên nhân: `distinctStudentsBySid` giữ row id nhỏ nhất của mỗi học viên trong cả khoá legacy (26 row) nên badge và nút Điểm danh/Hủy/Sửa phụ thuộc UUID; không endpoint check-in nào kiểm tra ngày; `buildBackfillPlan` bỏ qua trạng thái nên dry-run gắn row completed vào tương lai.

Cách sửa: `occurrenceSidStates` + `findClassOccurrence` (class-sessions.ts) đọc đúng buổi cho cả legacy (prefix + sequential head) và dated (bucket), lớp trộn undated + dated đọc riêng từng loại; server guard 422 `future-session` (cả `error` lẫn `reason` vì client đọc `error ?? reason`); backfill rank completed → cancelled → còn lại, SQL guard theo status, CLI fail-fast khi dump thiếu status.

Bài học từ red-team: giả định "e2e seed startDate = today" sai với `class-operations`; `lesson-modal.tsx` hoá ra không được mount nên finding đó bị loại sau khi grep; 3 suite server của #320 đã đỏ sẵn trên develop vì gọi route settings đã gỡ ở #324.

Chưa làm (ghi trong plan): row undated chưa có guard server; `moveDate` đưa buổi đã chốt sang tương lai; chạy backfill thật cho D1 local và prod/staging là thao tác operator.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
