---
title: "Plan class-tuition-fee: học phí lớp theo học viên (optional, sửa được)"
date: 2026-09-21
summary: "Lập plan 4 phase thêm học phí per-student cho lớp: cột tuition_fee nullable, endpoint POST /classes/:id/tuition-fee (pattern notes), AddClassModal field, modal sửa ở $classId; issue #227"
---

# Plan class-tuition-fee: học phí lớp theo học viên (optional, sửa được)

## What happened
Chạy /ak-plan --github cho feature "khi tạo lớp cho setup học phí (theo học viên, không phải tổng lớp), optional, sửa được sau khi tạo" trên teacher-os.

- Auto-detect → **fast mode**, HOLD SCOPE. Scout (Explore agent) xác nhận: `class` chưa có cột fee; server **không có class-edit endpoint** (chỉ `POST /classes/:id/notes` @ kernel.ts:981) — comment contracts.ts:71 cũng xác nhận. Tiền hiện có: `invoiceCreateSchema.amount` (int min 1) + client regex `/^\d{1,12}$/` (add-invoice-modal.tsx:12).
- Plan `plans/260921-0918-class-tuition-fee/` 4 phase: (1) contract + DB migration `tuition_fee` nullable, (2) server endpoints + kernel tests, (3) web types/mapper/actions/modal + edit-class-fee-modal, (4) e2e + full gates. Effort ~7h.
- Gates: `ak plan validate` PASS; Verification Pass tier Standard — **15/15 claims VERIFIED, 0 failed** (grep đối chiếu line numbers kernel.ts:781/981, snapshot.ts:114, data-actions.ts:218, mock-data.ts:145/240, classes.ts:24, migrations 0019…); Whole-Plan Consistency Sweep sạch.
- `--github`: issue #227 (vinh19410/teacher-os, label `ready to review`), frontmatter `issue: 227`.

## Decision
- Fee = **cột thật** `class.tuition_fee` (integer, nullable) thay vì derive — docs/code-standards.md persist-vs-derive carve-out: user sửa được ⇒ persist + docblock user-action.
- "Sửa sau khi tạo" giới hạn **riêng cho fee** (đúng yêu cầu): endpoint subresource `POST /classes/:id/tuition-fee` mirror pattern notes, KHÔNG làm PATCH /classes/:id tổng quát (out of scope có chủ đích).
- `null` = chưa thiết lập (khác 0đ); contract `.nullish()` ở create, `.strict()` nullable ở update; response shape mirror notes để command bus refetch snapshot.

## Next steps
- Chạy `/ak:cook plans/260921-0918-class-tuition-fee/plan.md` (làm theo phase 1→4).
- Tương lai (out of scope): endpoint sửa lớp tổng quát; default amount hóa đơn từ học phí lớp; tính "còn thiếu" theo fee thay vì invoice.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
