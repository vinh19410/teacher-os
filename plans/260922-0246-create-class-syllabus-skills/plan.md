---
title: "Hiển thị kỹ năng của syllabus trong modal tạo lớp"
description: "Dropdown 'Template giáo trình' trong modal 'Tạo lớp mới' hiển thị thêm số kỹ năng và tên các kỹ năng của từng syllabus để người dùng chọn giáo trình phù hợp."
status: pending
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
| 1 | [UI — hiển thị kỹ năng của syllabus trong modal tạo lớp](./phase-01-start.md) | Pending |
| 2 | [Tests — component test và e2e guards](./phase-02-tests-and-e2e-guards.md) | Pending |

## Design Decisions

- **Giữ native `<select>`** (pattern chung của app, `field.tsx:101-112`), không build custom listbox. Native option không style được nên tên skills không đưa vào option text (tránh truncate cross-platform); count kỹ năng đưa vào label option, chi tiết skills hiển thị ở hàng Tag bên dưới dropdown, cập nhật real-time theo selection.
- **Empty skills**: syllabus chưa khai báo kỹ năng → text `text-muted-fg` "Syllabus chưa khai báo kỹ năng" (pattern conditional render như syllabus gallery).
- **Contract-safe**: giữ nguyên `<Field label="Template giáo trình">`, `templateId,` trong payload và `setTemplateId("")` vì `kernel-runtime.contract.test.ts:150-155` regex assert trực tiếp trên source modal.
- **E2E guard**: `selectOption({ label: "E2E Template Copy Guard" })` ở 2 specs là exact match → phải đổi sang `selectOption({ value })` khi label đổi (chi tiết phase 2).

## Non-Goals

- Custom listbox/combobox hiển thị Tag trong menu dropdown mở.
- Đổi backend, schema, hoặc snapshot API.
- Hiển thị thêm `totalLessons` hay thông tin khác ngoài kỹ năng.

## Success Criteria

- [ ] Mỗi option syllabus hiển thị `Tên · N kỹ năng`.
- [ ] Chọn syllabus → hàng Tag tên kỹ năng hiện ngay dưới dropdown; syllabus rỗng kỹ năng → thông báo tương ứng; "— Lớp trống —" → không có hàng thông tin.
- [ ] `pnpm --filter web test` (bao gồm contract test) và `pnpm check` pass.
- [ ] 2 e2e specs `syllabus-detail-import-overwrite` và `syllabus-test-session-mark` pass với selection theo value.

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
  - E2E exact-label: `syllabus-detail-import-overwrite.spec.ts:98-99`, `syllabus-test-session-mark.spec.ts:146-147`; grep toàn bộ `apps/e2e/specs` không còn chỗ nào khác dùng dropdown này.
  - Không tồn tại `add-class-modal.test.tsx`; pattern `field.test.tsx` có sẵn; scripts `test` (vitest run) và `check` (biome check --write .) xác nhận qua package.json.
  - Modal dùng `useKernelFormSubmit` tại dòng 58 — điểm mock thứ hai cho component test.

### Decisions (auto-validated, không có blocking question)

- Option label chỉ chứa count (`Tên · N kỹ năng`), tên kỹ năng hiển thị ở hàng Tag dưới dropdown — an toàn cross-platform với native `<select>`; alternative (đưa đầy đủ tên vào option text / custom listbox) ghi ở Non-Goals.
- E2E chuyển sang `selectOption({ value })` thay vì giữ label matching.
