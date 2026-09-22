---
title: "Plan auto-fill tổng số buổi lớp theo syllabus (#235)"
date: 2026-09-22
summary: "Plan 2 phase cho feature auto-fill 'Tổng số buổi' trong modal tạo lớp theo syllabus chọn, tính cả buổi thi midterm/final"
---

# Plan auto-fill tổng số buổi lớp theo syllabus (#235)

## What happened
Tạo plan `plans/260922-1107-class-modal-auto-sessions/` (issue #235) — feature kế thừa PR #234 (auto-skills, đã merge vào develop `edbc9af`). Khi chọn template giáo trình trong modal "Tạo lớp mới", ô "Tổng số buổi" sẽ tự điền bằng tổng số lesson qua mọi `modules[]` của syllabus, tính cả buổi thi (`kind: "midterm" | "final"`).

Điểm kỹ thuật chính:
- Mở rộng handler `changeTemplateId` sẵn có (`add-class-modal.tsx:145-152`) thay vì tạo handler mới; thêm pure helper `sessionsFromTemplate(Syllabus["modules"])` export để unit-test (apps/web không có jsdom).
- Đếm từ cây `modules`, KHÔNG dùng `totalLessons` — field này stale-prone (default 0 ở create schema, server chỉ sync khi replace content, `kernel.ts:1634`).
- Template 0 buổi / "— Lớp trống —" → giữ số buổi nhập tay; template khác → ghi đè (nhất quán behavior skills của PR #234).
- Syllabus > 52 buổi: điền số thật, không clamp — validation submit sẵn có (cap 1..52) sẽ báo lỗi, clamp im lặng che giấu mismatch.

## Decision
- Local develop đứng sau 2 commit (PR #234 merged trên remote) — đã stash thay đổi local của plan cũ (chỉ flip status `pending → completed`, trùng với remote), ff-merge về `edbc9af`, drop stash.
- `--github`: tạo issue #235 trước để lấy số issue đưa vào frontmatter/branch/changelog theo convention repo (label `ready to ship beta` như issue #232, không dùng `ready to review` mặc định của skill).
- Skip hydrate tasks: plan 2 phases, quá nhỏ (task-management.md: hydrate từ 3 phases trở lên).
- Tier verification: Light, in-session (21/21 claims verified sau khi sửa 1 citation lệch `field.tsx:41`).

## Next steps
- Cook: `/ak:cook /Users/vinhtran/Documents/project/personal/teacher-os/plans/260922-1107-class-modal-auto-sessions/plan.md` trên nhánh `vinh19410/feat/class-modal-auto-sessions`.
- e2e guard chính: assert `toHaveValue("5")` trong `syllabus-test-session-mark.spec.ts` (template v4 = 5 buổi, 2 buổi thi) — bằng chứng "tính cả buổi thi".

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
