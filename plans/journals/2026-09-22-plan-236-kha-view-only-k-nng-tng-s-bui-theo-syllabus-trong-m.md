---
title: "Plan #236 — khóa view-only Kỹ năng + Tổng số buổi theo syllabus trong modal tạo lớp"
date: 2026-09-22
summary: "ak-plan fast mode: kế thừa #234/#235, điều kiện khóa = điều kiện auto-fill theo từng field; plan 260922-0418 blockedBy plan #235"
---

# Plan #236 — khóa view-only Kỹ năng + Tổng số buổi theo syllabus trong modal tạo lớp

## What happened
- Yêu cầu user: khi Kỹ năng và Tổng số buổi đã base theo syllabus thì form tạo lớp chỉ nên view-only 2 mục đó.
- Phát hiện plan `260922-1107-class-modal-auto-sessions` (issue #235, auto-fill số buổi) đang pending — requirement mới thay đổi design decision "vẫn sửa tay sau auto-fill" của nó thành view-only.
- Tạo plan mới `plans/260922-0418-class-modal-view-only-syllabus-fields/` (ak plan create + add-phase, validate exit 0), issue [#236](https://github.com/vinh19410/teacher-os/issues/236) label `ready to ship beta`.

## Decision
- Điều kiện khóa = điều kiện auto-fill, tính theo từng field: `skillsLocked` khi template có skills (khớp PR #234), `sessionsLocked` khi template có ≥1 buổi qua `sessionsFromTemplate` (khớp #235). "— Lớp trống —" / syllabus thiếu dữ liệu tương ứng → editable.
- Không theo dõi touched-state; dùng `disabled` (không readOnly) cho input; `ChipMulti` thêm prop `disabled` optional để không vỡ chỗ dùng khác.
- Edge syllabus >52 buổi: input vẫn khóa, submit báo lỗi cap hiện có — user đổi template/lớp trống để thoát (nhất quán non-goal #235).
- Plan mới blockedBy #235 thay vì gộp/supersede: repo tách 1 plan = 1 PR nhỏ; #235 chưa ai bắt đầu nhưng đã publish issue.

## Next steps
- `/ak:cook` plan `260922-1107-class-modal-auto-sessions` (issue #235) trước.
- Sau đó `/ak:cook` plan `260922-0418-class-modal-view-only-syllabus-fields` (issue #236).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
