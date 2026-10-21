---
title: "Teacher class detail design v2 fidelity (#391)"
date: 2026-10-21
summary: "Gộp tab Buổi học+Bài tập thành Sessions & practice (mặc định), tách tab Giáo trình; header 2 action; 4 stat card; card buổi học data-testid=session-row + thanh điểm danh 3 phân đoạn qua sessionAttendanceTally (occurrenceSidStates: absent=data thật, bỏ late); accordion bài đã giao giữ #assigned-list/article.assign-item, ?tab=assignments legacy tự mở hết; xoá ClassScheduleTable (clean cutover); descope SyllabusTree theo #221; dọn 6 token chết; buttonVariants tách khỏi Button không đổi hành vi. Verify: unit 1546/1546, e2e full 173/0/1, design:compare 6/6 + verdict khối-theo-khối, review fanout 0C/1I/4M đã fix hết, kongming 4 checkpoint. PR #398 squash-merge vào develop (e9f6460). Bài học: dấu … của read tool lọt vào CHANGELOG (kongming pre-push bắt được); CI không chạy PR vào develop — bằng chứng local là gate duy nhất."
---

# Teacher class detail design v2 fidelity (#391)

Gộp tab Buổi học+Bài tập thành Sessions & practice (mặc định), tách tab Giáo trình; header 2 action; 4 stat card; card buổi học data-testid=session-row + thanh điểm danh 3 phân đoạn qua sessionAttendanceTally (occurrenceSidStates: absent=data thật, bỏ late); accordion bài đã giao giữ #assigned-list/article.assign-item, ?tab=assignments legacy tự mở hết; xoá ClassScheduleTable (clean cutover); descope SyllabusTree theo #221; dọn 6 token chết; buttonVariants tách khỏi Button không đổi hành vi. Verify: unit 1546/1546, e2e full 173/0/1, design:compare 6/6 + verdict khối-theo-khối, review fanout 0C/1I/4M đã fix hết, kongming 4 checkpoint. PR #398 squash-merge vào develop (e9f6460). Bài học: dấu … của read tool lọt vào CHANGELOG (kongming pre-push bắt được); CI không chạy PR vào develop — bằng chứng local là gate duy nhất.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
