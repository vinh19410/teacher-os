---
title: "Hiển thị kỹ năng của syllabus trong modal tạo lớp"
description: "Dropdown 'Template giáo trình' trong modal 'Tạo lớp mới' hiển thị thêm số kỹ năng và tên các kỹ năng của từng syllabus để người dùng chọn giáo trình phù hợp."
status: completed
priority: P2
effort: 4h
issue: 229
branch: vinh19410/feat/class-modal-syllabus-skills
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-09-22
---

# Hiển thị kỹ năng của syllabus trong modal tạo lớp

## Overview

Trong modal "Tạo lớp mới" (`add-class-modal.tsx`), dropdown "Template giáo trình" hiện chỉ hiển thị tên syllabus. Plan này thêm: (1) số kỹ năng của từng syllabus ngay trên option label (`"IELTS Foundation · 4 kỹ năng"`), và (2) hàng chi tiết kỹ năng dạng `Tag` ngay dưới dropdown cho template đang chọn. Dữ liệu `skills: string[]` đã có sẵn trong snapshot phía web nên **không đổi backend/API/schema**.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Người dùng thấy được mỗi syllabus có mấy kỹ năng ngay khi mở dropdown | P1 |
| 2 | Người dùng thấy tên các kỹ năng của syllabus đang chọn (dạng Tag) mà không cần rời modal | P1 |
| 3 | Không vỡ contract test regex và e2e specs đang chọn option theo label | P1 |

## Phases

| Phase | Name | Status |
| ----- | ---- | ------ |
| 1 | [UI — hiển thị kỹ năng của syllabus trong modal tạo lớp](./phase-01-start.md) | Done |
| 2 | [Tests — component test và e2e guards](./phase-02-tests-and-e2e-guards.md) | Done |

## Design Decisions

- **Giữ native `<select>`** (pattern chung của app, `field.tsx:101-112`), không build custom listbox. Native option không style được nên tên skills không đưa vào option text (tránh truncate cross-platform); count kỹ năng đưa vào label option, chi tiết skills hiển thị ở hàng Tag là sibling sau `</Field>` (Field chỉ gắn nhãn khi có một child). Có nhãn "Kỹ năng giáo trình" để không lẫn với chip kỹ năng của lớp. Không copy skill giáo trình vào payload `skills`.
- **Empty skills**: syllabus chưa khai báo kỹ năng → text `text-muted-fg` "Syllabus chưa khai báo kỹ năng" (pattern conditional render như syllabus gallery).
- **Contract-safe**: giữ nguyên `<Field label="Template giáo trình">`, `templateId,` trong payload và `setTemplateId("")` vì `kernel-runtime.contract.test.ts:150-155` regex assert trực tiếp trên source modal.
- **E2E guard**: exact label ở 2 specs là hai chuỗi khác nhau (`E2E Template Copy Guard`, `E2E Buổi Thi Guard`) → `selectOption({ value })` với id template lấy từ URL `/syllabus/:id`, không dùng id bản copy.

## Non-Goals

- Custom listbox/combobox hiển thị Tag trong menu dropdown mở.
- Đổi backend, schema, hoặc snapshot API.
- Hiển thị thêm `totalLessons` hay thông tin khác ngoài kỹ năng.

## Success Criteria

- [x] Mỗi option syllabus hiển thị `Tên · N kỹ năng`.
- [x] Chọn syllabus → hàng Tag tên kỹ năng (kèm nhãn "Kỹ năng giáo trình") hiện ngay dưới dropdown mà label vẫn trỏ tới select; syllabus rỗng kỹ năng → thông báo tương ứng; "— Lớp trống —" → không có hàng thông tin. Payload `skills` của lớp không lấy từ giáo trình.
- [x] `pnpm --filter web test` (bao gồm contract test) và `pnpm check` pass.
- [x] 2 e2e specs `syllabus-detail-import-overwrite` và `syllabus-test-session-mark` pass với selection theo value.

## Dependencies

- Không có cross-plan dependency. Chỉ đụng frontend web app.

## Validation Log

### Verification Results (2026-09-22, Light tier — 2 phases)

- Claims checked: 10
- Verified: 10 | Failed: 0 | Unverified: 0
- Tier: Light
- Evidence:
  - `add-class-modal.tsx:42` = `const { templates } = useSyllabus();`; dropdown chỉ render `{s.name}` tại dòng 212-224 (đọc trực tiếp).
  - `Syllabus.skills: string[]` tại `mock-data.ts:190`; Tag component `({ children }: { children: string })` tại `components/ui/tag.tsx`; token `text-muted-fg` đang dùng trong app.
  - Contract test regex `kernel-runtime.contract.test.ts:150-155` (đọc trực tiếp): `<Field label="Template giáo trình">`, `templateId,\s*schedule:`, `setTemplateId("")`.
  - E2E exact-label: overwrite dùng `"E2E Template Copy Guard"` (`syllabus-detail-import-overwrite.spec.ts:99`); buổi thi dùng `"E2E Buổi Thi Guard"` (`syllabus-test-session-mark.spec.ts:147`). Validation log bản đầu ghi nhầm cùng một chuỗi — đã sửa ở red-team.
  - Không tồn tại `add-class-modal.test.tsx`; pattern `field.test.tsx` có sẵn; scripts `test` (vitest run) và `check` (biome check --write .) xác nhận qua package.json.
  - Modal dùng `useKernelFormSubmit` tại dòng 58 — điểm mock thứ hai cho component test.

### Decisions (auto-validated, không có blocking question)

- Option label chỉ chứa count (`Tên · N kỹ năng`), tên kỹ năng hiển thị ở hàng Tag dưới dropdown — an toàn cross-platform với native `<select>`; alternative (đưa đầy đủ tên vào option text / custom listbox) ghi ở Non-Goals.
- E2E chuyển sang `selectOption({ value })` với id template từ URL, thay vì giữ label matching.

## Red Team Review

### Session — 2026-09-22
**Findings:** 7 deduped (6 accepted, 1 rejected)
**Severity breakdown:** 3 Critical, 2 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Hint là child thứ hai của Field làm rơi `htmlFor` | Critical | Accept | Phase 1 |
| 2 | `skills.length` trong requirement dễ đọc nhầm state chip của lớp | Critical | Accept | Phase 1 |
| 3 | Id có sẵn trong spec là bản copy, không phải option value; hai label e2e khác nhau | Critical | Accept | Phase 2 |
| 4 | Không có Testing Library; phải render picker thật cho 4 trạng thái | High | Accept | Phase 2 |
| 5 | Cổng e2e không reuse server đang chiếm 8000/8001 | Medium | Accept | Phase 2 |
| 6 | Tag dễ lẫn chip kỹ năng lớp | Medium | Accept | Phase 1 (nhãn "Kỹ năng giáo trình", không copy vào payload) |
| 7 | Ẩn câu "chưa khai báo" với template Giao tiếp | Medium | Reject | Issue yêu cầu câu đó cho mọi syllabus rỗng kỹ năng; Giao tiếp hợp lệ với `skills: []` |

### Whole-Plan Consistency Sweep
- Decision delta: hint ngoài Field; count/hint đọc `selectedTemplate.skills`; e2e value = URL id; test bằng `renderToStaticMarkup`; nhãn "Kỹ năng giáo trình".
- Đã sửa overview decisions, success criteria, phase 1 requirements/steps/risk, phase 2 requirements/steps/risk, và dòng validation log ghi nhầm label e2e.
- Không còn mâu thuẫn mở. Contract regex và non-goal backend giữ nguyên.
