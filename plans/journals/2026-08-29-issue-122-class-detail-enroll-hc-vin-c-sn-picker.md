---
title: "Issue #122: class detail enroll học viên có sẵn (picker)"
date: 2026-08-29
summary: "Picker enroll existing student: endpoint /classes/:id/enroll + modal 2 chế độ; TDD full green"
---

# Issue #122: class detail enroll học viên có sẵn (picker)

Bugfix P1 #122: modal "+ Thêm học viên" ở class detail chỉ tạo mới — giáo viên không enroll được học viên có sẵn, sĩ số KPI treo 0.

Fix: thêm POST /api/classes/:id/enroll (enrollment + gói active + sinh buổi trong 1 db.batch, mirror nhánh class của POST /students, 404 org-scoped + 409 trùng), KernelAction enroll-student + kernelCommand mapping + reducer fixture, và AddStudentModal 2 chế độ khi có classId (mặc định "Học viên có sẵn" khi còn học viên chưa enroll, kèm ô lọc; /students giữ nguyên form tạo mới).

TDD: 6 test server + 4 reducer + 1 mapping + e2e QC spec mới; suite 364 web + 180 server + 27 e2e GREEN; biome/check-types/build sạch.

Tricky bit: e2e step 8 tiết lộ heuristic default-mode — khi mọi học viên đã enroll, modal rơi về tạo mới (title "Thêm học viên mới") — assertion phải khớp thiết kế này. Kongming advisory checkpoints bị miss (provider subagent chưa cấu hình trên host ZCode).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
