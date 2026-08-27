---
title: "Plan: syllabus delete + reorder modules/lessons"
date: 2026-08-27
summary: "Đã tạo plan plans/260827-1452-syllabus-content-delete-and-reorder (issue #99, label ready to review): xóa và đổi thứ tự buổi học/module trong syllabus. Nền tảng: DB đã có position, không cần migration. Thiết kế chốt qua kongming advisory: reorder full sibling-list payload ({moduleIds}/{lessonIds} strict), UX nút mũi tên thay vì @dnd-kit (app chưa có optimistic update), xóa module child-first batch org-scoped. Red-team code-reviewer phát hiện 1 BLOCKER (lệch body shape giữa phases) + 3 MAJOR (lessons/reorder bị shadow bởi :lid; set-mismatch nên trả 409 để riding heal-409; e2e seed cần Origin header tránh CSRF 403) — đã vá hết vào plan. 4 phase tuyến tính: server endpoints → web kernel actions → editor UI → curriculum parity+tests."
---

# Plan: syllabus delete + reorder modules/lessons

Đã tạo plan plans/260827-1452-syllabus-content-delete-and-reorder (issue #99, label ready to review): xóa và đổi thứ tự buổi học/module trong syllabus. Nền tảng: DB đã có position, không cần migration. Thiết kế chốt qua kongming advisory: reorder full sibling-list payload ({moduleIds}/{lessonIds} strict), UX nút mũi tên thay vì @dnd-kit (app chưa có optimistic update), xóa module child-first batch org-scoped. Red-team code-reviewer phát hiện 1 BLOCKER (lệch body shape giữa phases) + 3 MAJOR (lessons/reorder bị shadow bởi :lid; set-mismatch nên trả 409 để riding heal-409; e2e seed cần Origin header tránh CSRF 403) — đã vá hết vào plan. 4 phase tuyến tính: server endpoints → web kernel actions → editor UI → curriculum parity+tests.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
