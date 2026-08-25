---
title: "Phase 5: Web UI template gallery and class editor"
status: todo
priority: P1
effort: "1d"
dependencies: [4]
---

# Phase 5: Web UI template gallery and class editor

> Context: [reports/design-decisions.md](./reports/design-decisions.md) (D5 web changes, D6 non-goals), [reports/scout-report.md](./reports/scout-report.md) (§5 UI consumers + line evidence, §6 web tests), [reports/research-report.md](./reports/research-report.md) (§5 edge case "class with no template").

## Overview

Đổi hai bề mặt UI theo vai trò mới: trang `/syllabus` thành **template gallery** (list template + badge "đang dùng N lớp"; detail = template editor); tab **Giáo trình** của class detail thành full editor trên bản copy (reuse add/edit module/lesson modal sẵn có) + ImportSyllabusModal (rework AssignSyllabusModal, chỉ list template) + "Gỡ giáo trình" (confirm → `remove-curriculum`). AddClassModal đổi select sang template. Các consumer còn lại (classes/index pointer column, syllabus-progress, add/edit module/lesson modals, AddSyllabusModal) **không đổi** — verification-only (D5).

## Requirements

- [x] `routes/_auth/syllabus/index.tsx` (:22-47, 73-120): list từ `useSyllabus().templates` (thay `syllabi`); mỗi card/row hiện badge "đang dùng N lớp" qua `classesForSyllabus(sy.id).length`; giữ filter chip "Tất cả"/theo skill; AddSyllabusModal giữ nguyên (tạo template); navigate on server id giữ (:149 runtime contract).
- [x] `routes/_auth/syllabus/$syllabusId.tsx` (:61-86, 167-220): giữ tree render + edit module/lesson modal (template editor); **xoá** AssignSyllabusModal và mọi logic "tìm lớp đang gán" pointer cũ — cụ thể inline filter `data.classes.filter((c) => c.syllabusId === sy.id)` :86 chuyển sang provenance-join `sourceTemplateId` (red-team M: đây là site dữ liệu thật, selector `classesForSyllabus` 0 caller); thêm hiển thị "đang dùng N lớp" (provenance count). Tương tự `syllabus/index.tsx:50` (:22-47, 73-120).
- [x] `routes/_auth/classes/$classId.tsx` — **toàn bộ các mối tham chiếu assign, không chỉ tab** (red-team N): import AssignSyllabusModal :9; state `assignOpen` :52; **nút header "Đổi syllabus" :97-100 — disposition: XOÁ nút khi lớp đã có curriculum (semantics "Đổi"/replace không tồn tại v1 — D6; giữ nút "Nhập từ template" chỉ ở empty state tab Giáo trình)**; modal mount :250-255 (props default bỏ theo modal rework). Tab Giáo trình (:48-59, 105-116, 167-181): nếu `cls.syllabusId` có copy → render SyllabusProgress + full editor (reuse modals keyed by syllabusId của copy) + nút "Gỡ giáo trình" mở confirm dialog → dispatch `remove-curriculum`; nếu chưa có → empty state + nút "Nhập từ template" mở ImportSyllabusModal.
- [x] `modals/assign-syllabus-modal.tsx` → rename `import-syllabus-modal.tsx` (:21-39, 66-73): list chỉ `templates` (không list copy); dispatch `import-syllabus {classId, templateId}`; đã có curriculum thì không mở (guard ở caller) — server vẫn 409 nếu race.
- [x] `modals/add-class-modal.tsx` (:47, 121-122, 191-204): dropdown chọn từ `templates`; payload `templateId` (rỗng = lớp trống).
- [x] Verification-only (không edit): `routes/_auth/classes/index.tsx` (:47-56 pointer column vẫn resolve), `components/syllabus/syllabus-progress.tsx` (:24-72), `modals/add-module-modal.tsx`, `edit-module-modal.tsx`, `add-lesson-modal.tsx`, `edit-lesson-modal.tsx` (keyed by syllabusId — dùng được cho cả template lẫn copy), `modals/add-syllabus-modal.tsx` (tạo template).
- [x] Cập nhật contract tests: `syllabus-peel.contract.test.ts` (đọc templates qua useSyllabus/mapSyllabi), `classes-peel.contract.test.ts:60` (import modal repo-read/bus-write), `kernel-runtime.contract.test.ts:149` (navigate on refreshed server id — giữ) **và mảng `KERNEL_WRITE_MODALS` :18-27 đổi filename `assign-syllabus-modal.tsx` → `import-syllabus-modal.tsx` (bỏ sót = readSrc ENOENT cả describe đỏ — red-team N)**.

## Architecture

Tái dụng tối đa: template editor và class editor dùng chung tree render + module/lesson modals hiện có — khác biệt chỉ là syllabusId được truyền vào (template id vs copy id). Import modal là bản rework của assign modal (đổi nguồn list + action). Empty state "chưa có giáo trình" theo research §5: lớp trống là state hợp lệ, mời import. Không thêm route mới.

## Related Code Files

- `apps/web/src/routes/_auth/syllabus/index.tsx`, `$syllabusId.tsx` — gallery + template editor.
- `apps/web/src/routes/_auth/classes/$classId.tsx` — tab Giáo trình full editor.
- `apps/web/src/components/modals/assign-syllabus-modal.tsx` → `import-syllabus-modal.tsx` (verify path thực: scout bảng §5; nếu modals nằm `components/modals/` thì theo cấu trúc repo).
- `apps/web/src/components/modals/add-class-modal.tsx` — template select.
- Verification-only: `routes/_auth/classes/index.tsx`, `components/syllabus/syllabus-progress.tsx`, `modals/{add,edit}-module-modal.tsx`, `modals/{add,edit}-lesson-modal.tsx`, `modals/add-syllabus-modal.tsx`.

## Implementation Steps

1. Rework `assign-syllabus-modal.tsx` → `import-syllabus-modal.tsx`: props giữ `classId`; list `templates`; dispatch `import-syllabus`; xoá option "— Chưa gán —" (unassign tách sang nút Gỡ).
2. `classes/$classId.tsx`: xoá nút header "Đổi syllabus" + state/modal assign cũ (:9, :52, :97-100, :250-255); tab Giáo trình hai nhánh (có copy → editor + progress + Gỡ; chưa → empty state + import). Confirm dialog cho Gỡ (message nêu rõ xóa tiến độ cây copy).
3. `syllabus/index.tsx`: nguồn list `templates` + badge đang dùng.
4. `syllabus/$syllabusId.tsx`: xoá assign modal + logic lớp-gán cũ; thêm count đang dùng.
5. `add-class-modal.tsx`: select templates, payload `templateId`.
6. Cập nhật 3 contract test files theo Requirements.
7. Browser quick check (dev server): gallery render, import flow cơ bản — smoke đầy đủ để phase 6.

## File Inventory

| File | Action | Size | Test impact |
|------|--------|------|-------------|
| `apps/web/src/routes/_auth/syllabus/index.tsx` | modify | M | `syllabus-peel.contract.test.ts` |
| `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx` | modify | L | peel + runtime contract |
| `apps/web/src/routes/_auth/classes/$classId.tsx` | modify | L | `classes-peel.contract.test.ts:60` |
| `apps/web/src/components/modals/assign-syllabus-modal.tsx` → `import-syllabus-modal.tsx` | rename + modify | M | `classes-peel.contract.test.ts:60` |
| `apps/web/src/components/modals/add-class-modal.tsx` | modify | S | — |
| `apps/web/src/routes/_auth/classes/index.tsx` | verify-only | — | đọc qua smoke phase 6 |
| `apps/web/src/components/syllabus/syllabus-progress.tsx` | verify-only | — | render trên copy — smoke |
| `apps/web/src/components/modals/add-module-modal.tsx`, `edit-module-modal.tsx`, `add-lesson-modal.tsx`, `edit-lesson-modal.tsx` | verify-only | — | dùng cho cả template + copy — smoke |
| `apps/web/src/components/modals/add-syllabus-modal.tsx` | verify-only | — | tạo template — smoke |
| `apps/web/test/**/syllabus-peel.contract.test.ts`, `classes-peel.contract.test.ts`, `kernel-runtime.contract.test.ts` | modify | M | matrix dưới |

## Test Scenario Matrix

| # | Scenario | Priority |
|---|----------|----------|
| 1 | `/syllabus` chỉ render template (copy của lớp không xuất hiện), badge "đang dùng N" đúng count | Critical |
| 2 | Template detail edit lesson → snapshot chỉ đổi template; copy các lớp không đổi | Critical |
| 3 | Class chưa có curriculum: import modal chỉ list template; chọn + confirm → cây hiện tab Giáo trình, SyllabusProgress toàn `upcoming` | Critical |
| 4 | Class đã có curriculum: edit lesson trên copy → template không đổi (isolation) | Critical |
| 5 | Import lần 2 ( ép mở modal/nếu UI chặn thì gọi trực tiếp) → 409 hiện message "Lớp đã có giáo trình", cây giữ nguyên | High |
| 6 | "Gỡ giáo trình" → confirm → cây biến mất, empty state; SyllabusProgress không crash | Critical |
| 7 | AddClassModal chọn template → lớp mới có sẵn cây; không chọn → lớp trống | High |
| 8 | `/classes` bảng cột syllabus vẫn hiện đúng tên (pointer → copy) | High |
| 9 | Scheduled lesson (tab khác) không bị đụng — check-in/cancel flow cũ (scout §7, kernel-runtime:248-251) | High |

## Success Criteria

- [x] `pnpm test` pass (3 contract test files cập nhật, không regression peel/runtime).
- [x] `pnpm check-types` pass; grep `apps/web/src` không còn `AssignSyllabusModal`/`assign-syllabus`.
- [x] Quick browser pass (dev server): scenario 1, 3, 4 cơ bản — smoke chính thức ở phase 6.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Tab Giáo trình phình to khi nhét cả editor + progress | Tách component nhỏ trong file theo pattern tab hiện có; không tạo abstraction mới (D6) |
| Xoá "— Chưa gán —" làm mất đường unassign | Thay bằng Gỡ giáo trình (confirm) — D2 giữ semantics xóa cây; scenario 6 khóa |
| `$syllabusId` route nhận copy id (URL cũ) | Copy vẫn đọc được qua syllabusById (đường read chung) — render như editor; KHÔNG thêm redirect (D6 không editing copy từ gallery — chỉ không list; URL trực tiếp chấp nhận) |
| Badge count re-render mỗi snapshot | `classesForSyllabus` derive selector — chấp nhận (đã có pattern filter ở data-provider) |
| Rename modal vỡ import path | Grep mọi import `assign-syllabus-modal` cập nhật cùng commit |

## Dependency Map

- **Input:** Phase 4 (`templates`, action import/remove, `classesForSyllabus` mới).
- **Output → Phase 6:** UI xong đủ để browser smoke kịch bản end-to-end + rehearsal.
