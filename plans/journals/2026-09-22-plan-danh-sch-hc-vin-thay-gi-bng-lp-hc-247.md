---
title: "Plan: danh sách học viên thay gói bằng lớp học (#247)"
date: 2026-09-22
summary: "ak-plan fast mode: 3 cột Gói/Còn lại/Đơn giá ở /students thay bằng cột Lớp học qua helper classesByStudent dùng chung với detail; E2E re-home coverage derive gói sang Học phí; issue #247"
---

# Plan: danh sách học viên thay gói bằng lớp học (#247)

## What happened

- Chạy `ak-plan --github` cho yêu cầu "màn danh sách học viên cũng thay gói thành lớp học" — follow-up trực tiếp của PR #245 (tab Hồ sơ đã đổi card Gói học → card Lớp học; Out of Scope của #245 ghi rõ list còn nguyên).
- Auto-detect chọn **fast mode** (scope nhỏ, có pattern #245, không unknowns kiến trúc). Scope challenge: HOLD.
- Scout xác nhận: `students/index.tsx` render 3 cột derive từ `s.pkg` (Gói/Còn lại/Đơn giá); join `enrollments`×`classes` chỉ tồn tại inline ở `$studentId.tsx:78-82`; chỉ 2 spec E2E assert gói trên hàng list (`student-package-validation.spec.ts:104,212-213`, `student-package-without-class.spec.ts:30-31`).
- Plan scaffold qua CLI: `plans/260922-0935-student-list-class-instead-of-package/` (2 phases), validate pass, reindex OK.
- Tạo GitHub issue #247 với label `ready to review`.

## Decision

- **Thay trọn bộ 3 cột gói bằng 1 cột "Lớp học"** — giữ lại "Còn lại"/"Đơn giá" mà mất "Gói" thì vô nghĩa; #245 cũng thay toàn bộ card gói. Ghi open question trên issue nếu muốn giữ "Còn lại".
- **Helper pure `classesByStudent` trong `repos/enrollments.ts`** dùng chung list + detail (tránh nhân bản join), kèm unit test mới `enrollments.test.ts`.
- **Cell text thuần, không Link** — row đã onClick → detail; giữ contract `student-row-detail.spec.ts`.
- **Coverage derive gói (#240 D1) re-home sang trang Học phí** (tuition vẫn derive `pkg`), thay cho assertion cũ trên list.
- Rủi ro strict-mode đã ghi: nav "Lớp học" vs header cột mới — `.first()` vẫn trúng sidebar theo DOM order, phase-02 có mitigation scoped click.

## Next steps

- Review issue #247 → chạy `/ak:cook plans/260922-0935-student-list-class-instead-of-package/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
