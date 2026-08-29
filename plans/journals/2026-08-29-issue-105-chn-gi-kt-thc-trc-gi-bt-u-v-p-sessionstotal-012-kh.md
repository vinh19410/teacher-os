---
title: "Issue #105: chặn giờ kết thúc trước giờ bắt đầu và ép sessionsTotal 0→12 khi tạo lớp"
date: 2026-08-29
summary: "QC P1 trên teacher-os: modal tạo lớp chấp nhận 21:00–08:00 và biến 'Tổng số buổi 0' thành 12 qua parseInt||12. Root cause 3 lớp: guard chỉ kiểm tra start===end, coercion falsy 0→12 ở client, contract server chấp nhận end<=start ('crosses midnight') và min(0). Quyết định thiết kế: siết contract lúc tạo lớp (end<=start bị từ chối, sessionsTotal min(1)) nhưng giữ parser legacy tolerant — dữ liệu cũ vẫn parse/hiển thị. Bài học red-team inline phát hiện 2 lỗi plan trước implement (400 không phải 422; test cũ assert end<start=201 phải đảo assertion thành chủ đích). Subagent spawning bị lỗi provider nên mọi checkpoint kongming/code-reviewer chạy inline. Ship beta PR #130."
---

# Issue #105: chặn giờ kết thúc trước giờ bắt đầu và ép sessionsTotal 0→12 khi tạo lớp

QC P1 trên teacher-os: modal tạo lớp chấp nhận 21:00–08:00 và biến 'Tổng số buổi 0' thành 12 qua parseInt||12. Root cause 3 lớp: guard chỉ kiểm tra start===end, coercion falsy 0→12 ở client, contract server chấp nhận end<=start ('crosses midnight') và min(0). Quyết định thiết kế: siết contract lúc tạo lớp (end<=start bị từ chối, sessionsTotal min(1)) nhưng giữ parser legacy tolerant — dữ liệu cũ vẫn parse/hiển thị. Bài học red-team inline phát hiện 2 lỗi plan trước implement (400 không phải 422; test cũ assert end<start=201 phải đảo assertion thành chủ đích). Subagent spawning bị lỗi provider nên mọi checkpoint kongming/code-reviewer chạy inline. Ship beta PR #130.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
