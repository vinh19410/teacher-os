---
title: "Plan: tự động chọn kỹ năng của lớp theo syllabus trong modal tạo lớp (260922-0338)"
date: 2026-09-22
summary: "ak-plan --github fast mode: chọn template giáo trình trong AddClassModal tự bật chips kỹ năng theo syllabus; issue #232"
---

# Plan: tự động chọn kỹ năng của lớp theo syllabus trong modal tạo lớp (260922-0338)

## What happened
Tạo plan `plans/260922-0338-class-modal-auto-skills` (2 phases, ~3h) qua `ak plan create`. Yêu cầu: chips "Kỹ năng *" trong modal "Tạo lớp mới" tự động define theo kỹ năng của syllabus đang chọn ở dropdown "Template giáo trình" — kế thừa plan 260922-0246 (chỉ hiển thị Tag thông tin).

Điều tra chính (scout + verify trực tiếp, tier Light):
- Cả `classCreateSchema` và `syllabusCreateSchema` dùng cùng enum `IELTS_SKILLS` (contracts.ts:51-57, 152-164) → mọi kỹ năng syllabus hợp lệ làm kỹ năng lớp, không đổi schema.
- Contract test `kernel-runtime.contract.test.ts:150-155` regex assert `/templateId,\s*schedule:/` trực tiếp trên source modal → payload shape bất biến.
- `apps/web` chỉ có vitest + `renderToStaticMarkup` (không jsdom/testing-library) → không test được event change; phải tách pure helper.
- 2 e2e specs click chip "Writing" TRƯỚC selectOption; helper `createSyllabusTemplate` tạo template skills=["Writing"] → auto-fill ghi đè cùng giá trị, specs vẫn xanh.

## Decision
- Auto-fill trong handler `changeTemplateId` thay `onTemplateId={setTemplateId}` (:262); pure helper `skillsFromTemplate = IELTS_SKILLS.filter(...)` — thứ tự canonical, dedupe, phòng thủ giá trị lạ, unit-test được.
- Template có skills → GHI ĐÈ selection tay; "— Lớp trống —" / syllabus 0 kỹ năng → giữ nguyên selection tay.
- Thay thế có chủ đích non-goal của plan 260922-0246 ("Không copy skill giáo trình vào payload skills").
- E2E `syllabus-detail-import-overwrite` chuyển từ click-tay sang assert chip `aria-pressed="true"` sau selectOption → thành guard cho auto-fill.
- 12/12 claims verified, 0 failed; whole-plan sweep sửa 1 mâu thuẫn chữ nghĩa "payload không đổi" → "shape payload không đổi".

## Next steps
- Review issue #232 (label `ready to review`), sau đó `/ak:cook plans/260922-0338-class-modal-auto-skills/plan.md` trên branch `vinh19410/feat/class-modal-auto-skills`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
