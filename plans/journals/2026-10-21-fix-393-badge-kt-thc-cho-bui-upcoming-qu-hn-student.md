---
title: "Fix #393: badge Đã kết thúc cho buổi upcoming quá hạn (student)"
date: 2026-10-21
---

# Fix #393: badge Đã kết thúc cho buổi upcoming quá hạn (student)

Root cause: lesson giữ status=upcoming mãi khi không ai check-in; ClassLessonList chỉ render theo status nên buổi quá hạn vẫn "Sắp tới".
Fix: isLessonEnded (upcoming + date + time + dur, +07:00, NaN→false, boundary <=), findNextLessonId nhận now bắt buộc và bỏ buổi ended; badge ended + icon Clock nền muted; đồng bộ ClassInfoCard; route tạo 1 now duy nhất, todayISO=vietnamTodayISO(now).
Tests: student 351/351; server 715/715 (riêng lẻ — song song với Playwright stack gây timeout contention); e2e spec student-class-detail thêm buổi -2 ngày assert Đã kết thúc; full e2e 164 pass (invoice fail transient, rerun 9/9).
Bài học: chạy suite server KHÔNG song song với e2e stack; vite dev có thể serve module cũ ở boot đầu sau edit (capture lần 1) — kiểm chứng bằng curl module khi debug UI.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
