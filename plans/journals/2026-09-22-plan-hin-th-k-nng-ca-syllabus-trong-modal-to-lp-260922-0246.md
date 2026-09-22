---
title: "Plan: hiển thị kỹ năng của syllabus trong modal tạo lớp (260922-0246)"
date: 2026-09-22
summary: "ak-plan --github fast mode: thêm count kỹ năng vào option label + hàng Tag skills trong AddClassModal; issue #229"
---

# Plan: hiển thị kỹ năng của syllabus trong modal tạo lớp (260922-0246)

## What happened
Tạo plan `plans/260922-0246-create-class-syllabus-skills` (2 phases, ~4h) qua `ak plan create` + `add-phase`. Yêu cầu: dropdown "Template giáo trình" trong modal "Tạo lớp mới" phải cho biết mỗi syllabus có mấy kỹ năng và kỹ năng nào.

Điều tra chính (scout + verify trực tiếp):
- Dữ liệu đã có sẵn: `useSyllabus().templates` trả `Syllabus` với `skills: string[]` (snapshot server parse JSON column) → không cần đổi backend.
- Dropdown là native `<select>` (`components/ui/field.tsx`), option chỉ render `{s.name}` tại `add-class-modal.tsx:212-224`.
- 2 ràng buộc break-change: contract test `kernel-runtime.contract.test.ts:150-155` regex assert trên source modal; 2 e2e specs chọn template bằng `selectOption({ label })` exact match.

## Decision
- Giữ native select (KISS, pattern chung app): option label thêm count `Tên · N kỹ năng`; tên kỹ năng hiển thị ở hàng Tag (`components/ui/tag.tsx`) ngay dưới dropdown, derived `selectedTemplate = templates.find(...)` — không thêm state. Custom listbox ghi ở Non-Goals.
- E2E chuyển sang `selectOption({ value })` thay vì giữ label matching.
- 10/10 claims verified (Light tier), 0 failed — log tại `## Validation Log` trong plan.md.

## Next steps
- Review issue #229 (label `ready to review`), sau đó `/ak:cook plans/260922-0246-create-class-syllabus-skills/plan.md` trên branch `vinh19410/feat/class-modal-syllabus-skills`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
