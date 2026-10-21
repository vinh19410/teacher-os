---
title: "Phase 5: Web kiểu, hook và command bus"
status: todo
---

# Phase 5: Web kiểu, hook và command bus

## Goal

Web phân biệt Template và Giáo trình của lớp ở tầng dữ liệu: kiểu riêng, hook riêng, action module và lesson mang `target`, command bus gọi route mới. Chỉ `lib/repos/syllabus.ts` còn đọc `classId` để phân loại.

## Context

- Design: D7 trong [design-decisions.md](./reports/design-decisions.md). Phase 4 đã có route mới; alias cũ vẫn chạy nên web cũ không gãy khi deploy theo từng bước.
- Snapshot giữ shape phẳng (`KernelSyllabusRow` có `classId` và `sourceTemplateId`); không đổi contract snapshot.
- Quan hệ lớp ↔ giáo trình phía web phải đọc theo `syllabus.classId === cls.id` (nguồn sự thật), không theo `cls.syllabusId`. Hiện có ba chỗ đọc con trỏ: `apps/web/src/routes/_auth/classes/$classId.tsx:151`, `apps/web/src/routes/_auth/classes/index.tsx:78`, `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx:197-215` (truyền `syllabusId={cls.syllabusId}` cho bốn modal).
- Phase này giữ UI nhìn y hệt cũ; phần UI mới nằm ở phase 6. Mỗi task kết thúc bằng web test xanh để repo luôn build được.

## Files

- Modify: `apps/web/src/lib/mock-data.ts` (kiểu `Syllabus`, ~dòng 200-215)
- Modify: `apps/web/src/lib/repos/syllabus.ts`, `apps/web/src/lib/repos/syllabus.test.ts`
- Modify: `apps/web/src/lib/repos/use-syllabus.ts`
- Modify: `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/repos/kernel-command.test.ts`, `apps/web/src/lib/repos/kernel.test.ts`
- Modify: `apps/web/src/lib/data-provider.tsx` (`classesForSyllabus`, ~dòng 151)
- Modify (mechanical, đổi prop `syllabusId` thành `target`): `apps/web/src/components/modals/add-module-modal.tsx`, `edit-module-modal.tsx`, `add-lesson-modal.tsx`, `edit-lesson-modal.tsx`, `apps/web/src/components/syllabus/syllabus-mutations.tsx`, `apps/web/src/components/class-detail/class-sessions-manage-modal.tsx`, `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx`, `apps/web/src/components/modals/import-syllabus-modal.tsx`, `apps/web/src/components/syllabus/delete-syllabus-button.tsx`, `apps/web/src/components/modals/add-syllabus-modal.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx`, `apps/web/src/routes/_auth/classes/index.tsx`
- Modify các file test đi kèm các file trên khi chúng assert path hoặc shape action cũ.

## Tasks

### Task 5.1: Kiểu và hàm tách

- **Goal:** một hàm duy nhất phân loại.
- **Target files:** `apps/web/src/lib/mock-data.ts`, `apps/web/src/lib/repos/syllabus.ts`.
- **Steps:**
  1. Trong `mock-data.ts` thêm: `export type SyllabusTemplate = Syllabus & { classId: null };` và `export type ClassCurriculum = Syllabus & { classId: string };`.
  2. Trong `repos/syllabus.ts` thêm và export `splitSyllabi(syllabi: Syllabus[])` trả `{ templates: SyllabusTemplate[]; curriculumByClassId: Map<string, ClassCurriculum>; templateUsage: Map<string, string[]> }`. `templates` là các phần tử `classId === null`; `curriculumByClassId` khoá theo `classId`; `templateUsage` khoá theo `sourceTemplateId` chứa danh sách `classId` của các bản copy. Đây là chỗ DUY NHẤT trong `apps/web/src` (ngoài test) được so sánh `classId`.
  3. Thêm test trong `repos/syllabus.test.ts`: dữ liệu gồm 2 template, 3 bản copy (2 từ template A, 1 từ template B), 1 bản copy mất `sourceTemplateId`; kiểm `templates.length === 2`, `curriculumByClassId.size === 3`, `templateUsage.get("A")` có 2 phần tử, bản copy mất nguồn không xuất hiện trong `templateUsage`.
- **Success criteria:** test mới xanh.
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos/syllabus.test.ts` exits 0 with `0 failed`.

### Task 5.2: Hook

- **Goal:** `useTemplates()` và `useClassCurriculum(classId)`.
- **Target files:** `apps/web/src/lib/repos/use-syllabus.ts`.
- **Steps:**
  1. Trong `useMemo` gọi `splitSyllabi(data.syllabi)` một lần.
  2. Export `useTemplates(): SyllabusTemplate[]`, `useClassCurriculum(classId: string): ClassCurriculum | null` (đọc `curriculumByClassId.get(classId) ?? null`), `useTemplateUsage(): Map<string, string[]>`.
  3. Giữ `useSyllabus()` tạm thời với `syllabi`, `templates`, `syllabusById` (để các component phase 6 chuyển dần). `templates` lấy từ `splitSyllabi`.
- **Success criteria:** hook có test nhỏ (render với provider test như `kernel-harness.tsx`).
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos` exits 0 with `0 failed`.

### Task 5.3: Đổi action sang `target` và command bus sang route mới

- **Goal:** mọi action module/lesson biết nó thuộc template hay lớp; path đúng contract mới.
- **Target files:** `apps/web/src/lib/data-actions.ts`, `apps/web/src/lib/repos/kernel.ts` (`case` ở dòng ~72-228).
- **Steps:**
  1. Trong `data-actions.ts` thêm `export type CurriculumTarget = { kind: "template"; syllabusId: string } | { kind: "class"; classId: string };`.
  2. Thay trường `syllabusId: string` bằng `target: CurriculumTarget` ở tám action: `add-module`, `edit-module`, `add-lesson`, `edit-lesson`, `delete-module`, `delete-lesson`, `reorder-modules`, `reorder-lessons`.
  3. Đổi tên action `import-syllabus` thành `import-curriculum` (giữ `classId`, `templateId`). `remove-curriculum`, `add-syllabus`, `replace-syllabus-content`, `delete-syllabus` giữ tên và shape.
  4. Trong `repos/kernel.ts` thêm hàm cục bộ `curriculumBase(target)` trả `/api/syllabus-templates/${target.syllabusId}` hoặc `/api/classes/${target.classId}/curriculum`; viết lại tám `case` module/lesson dùng `${curriculumBase(action.target)}/modules...` (giữ nguyên hậu tố: `/modules`, `/modules/${moduleId}`, `/modules/reorder`, `/modules/${moduleId}/remove`, `/modules/${moduleId}/lessons`, `/lessons/reorder`, `/lessons/${lessonId}`, `/lessons/${lessonId}/remove`).
  5. Các case còn lại: `add-syllabus` → `/api/syllabus-templates`; `replace-syllabus-content` → `/api/syllabus-templates/${syllabusId}/replace-content`; `delete-syllabus` → `/api/syllabus-templates/${syllabusId}/remove`; `import-curriculum` → `/api/classes/${classId}/curriculum/import`; `remove-curriculum` → `/api/classes/${classId}/curriculum/remove`. Giữ nguyên body và các nhánh xử lý phản hồi.
  6. Cập nhật `kernel-command.test.ts` và `kernel.test.ts` (web) theo path và shape mới.
- **Success criteria:** code ứng dụng web không còn path cũ `/api/syllabi`, `/import-syllabus`, `/remove-curriculum` và không còn tên action `"import-syllabus"` (tên action `remove-curriculum` vẫn tồn tại nên không nằm trong mẫu tìm).
- **Verify:** `rg -n '/api/syllabi|/import-syllabus|/remove-curriculum|"import-syllabus"' apps/web/src --glob '!*.test.*'` prints nothing and exits with code 1; `pnpm --filter web exec vitest run src/lib/repos/kernel-command.test.ts` exits 0.

### Task 5.4: Cập nhật người gọi (cơ học)

- **Goal:** code biên dịch và UI không đổi hành vi.
- **Target files:** danh sách "Modify (mechanical)" ở trên.
- **Steps:**
  1. Bốn modal module/lesson: thay prop `syllabusId: string` bằng `target: CurriculumTarget`; mọi `run({ type: ..., syllabusId, ... })` thành `run({ type: ..., target, ... })`.
  2. `useSyllabusMutations`: nhận `target: CurriculumTarget | null` cùng `syllabus`; truyền `target` vào các action reorder và delete. Giữ cờ `isClassCopy`. Khi `target === null` các hàm không làm gì.
  3. `$syllabusId.tsx`: mọi chỗ truyền `syllabusId={sy.id}` thành `target={{ kind: "template", syllabusId: sy.id }}`.
  4. `class-sessions-manage-modal.tsx`: truyền `target={{ kind: "class", classId: cls.id }}` thay cho `syllabusId={cls.syllabusId}`; lấy giáo trình bằng `useClassCurriculum(cls.id)` thay cho prop `syllabus` truyền từ trên xuống nếu có thể làm mà không đổi API công khai của component; nếu không, giữ prop nhưng nguồn của nó phải đến từ `useClassCurriculum` ở `$classId.tsx`.
  5. `$classId.tsx` dòng ~151 và `classes/index.tsx` dòng ~78: thay `syllabusById(cls.syllabusId)` và `data.syllabi.find((s) => s.id === c.syllabusId)` bằng `useClassCurriculum(cls.id)` (trong `index.tsx` là `curriculumByClassId` từ `splitSyllabi` hoặc hook tương đương, tránh gọi hook trong vòng lặp).
  6. `data-provider.tsx` `classesForSyllabus`: tính từ `templateUsage` (qua `splitSyllabi`) thay cho vòng lặp lồng nhau so sánh `classId` và `sourceTemplateId`.
  7. `import-syllabus-modal.tsx`: action `import-curriculum`.
- **Success criteria:** `pnpm --filter web check-types` exits 0; không còn truyền `cls.syllabusId` cho prop module/lesson.
- **Verify:** `pnpm --filter web check-types` exits 0; `rg -n "syllabusId=\{cls\.syllabusId\}|syllabusById\(cls\.syllabusId\)" apps/web/src` prints nothing (exit code 1).

### Task 5.5: Chạy toàn bộ

- **Steps:** `pnpm --filter web test`; `pnpm --filter web check-types`; `pnpm exec biome check apps packages`.
- **Success criteria:** xanh.
- **Verify:** `pnpm --filter web test` exits 0 with `0 failed`; `pnpm exec biome check apps packages` exits 0.

## Success Criteria

- [ ] Web gọi các route mới; không còn gọi alias cũ.
- [ ] `rg -n "classId\s*(===|!==)\s*null" apps/web/src --glob '!**/*.test.*' --glob '!**/repos/syllabus.ts' --glob '!**/vocab/**'` chỉ còn các dòng thuộc phase 6 (ghi lại danh sách còn lại vào phần ghi chú của phase 6).
- [ ] Không đọc `cls.syllabusId` để tìm giáo trình.
- [ ] Web test và check-types xanh.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
