---
title: "Plan 260923-0417: enroll-existing bỏ input gói, derive từ lớp (D1)"
date: 2026-09-23
summary: "Lập plan issue #251: tab 'Học viên có sẵn' chỉ còn search + danh sách; server enroll derive sessionPackage từ lớp theo pattern D1 thay vì nhận total/price/mode từ input."
---

# Plan 260923-0417: enroll-existing bỏ input gói, derive từ lớp (D1)

## What happened
- Fast-mode plan cho yêu cầu: tab "Học viên có sẵn" của AddStudentModal bỏ 3 input "Số buổi gói"/"Đơn giá (VND)"/"Hình thức", chỉ còn danh sách học viên có search (search đã có sẵn tại add-student-modal.tsx:272-278).
- Scout (Explore agent) + verify trực tiếp: enroll-existing là nhánh DUY NHẤT còn nhận package fields từ input (kernel.ts:644-657) trong khi nhánh create-học-viên-có-lớp đã derive từ lớp (comment D1, kernel.ts:550-561).
- Phát hiện then chốt: chỉ bỏ UI mà vẫn POST default (10/400000/Online) sẽ tạo sessionPackage SAI so với lớp → phải align enroll theo D1, schema còn `{studentId}`.

## Decision
- enrollStudentSchema (packages/api/src/contracts.ts:25-31) gọn còn `studentId`; zod non-strict strip key lạ nên client cũ vẫn hợp lệ trong chuyển tiếp.
- Thứ tự phase: server trước (Phase 1), web sau (Phase 2) — client cũ gửi thừa fields vẫn pass.
- 4 điểm server test pin hành vi cũ phải viết lại: kernel.test.ts:3503 (divergence pin), :3878 (happy path), :3980 (total 0 → 400, mất nghĩa), :4892 (cap test).

## Next steps
- Cook: `/ak:cook plans/260923-0417-enroll-existing-drop-package-inputs/plan.md`
- E2E: viết lại test D4 (student-package-validation.spec.ts:106-160); enroll-existing-student.spec.ts dự kiến không đổi.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
