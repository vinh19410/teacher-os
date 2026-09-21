---
title: "Cho phép xóa syllabus template"
description: "Thêm endpoint hard-delete template giáo trình (an toàn cho các lớp đã import nhờ kiến trúc deep-copy) cùng nút xóa có confirm trên web."
status: completed
priority: P2
effort: "5h"
branch: vinh19410/feat/syllabus-template-delete
tags: [feature, backend, frontend, api]
created: 2026-09-21
issue: 211
---

# Cho phép xóa syllabus template

## Overview

Yêu cầu "xóa syllabus template nhưng không ảnh hưởng các lớp đã chọn" được thỏa mãn tự nhiên bởi kiến trúc deep-copy hiện có: khi một lớp nhận giáo trình, server copy toàn bộ cây template thành row `syllabus` mới của riêng lớp đó (helper `buildImportBatch`, `apps/server/src/routes/kernel.ts:239-303`) và `class.syllabusId` trỏ vào bản copy — không bao giờ trỏ vào template. Vì vậy template có thể bị hard-delete mà các lớp đã import hoàn toàn độc lập; lớp mới đơn giản không thấy template nữa sau khi snapshot refresh. Không cần soft-delete, không cần migration.

Điểm cần xử lý chủ động duy nhất: `syllabus.sourceTemplateId` là logical FK only (SQLite không thể ALTER TABLE ADD FK — `packages/db/src/schema/syllabus.ts:35-43`), nên batch xóa phải tự UPDATE detach provenance cho các bản copy; và `class.syllabusId` là real FK NO ACTION (`packages/db/src/schema/class.ts:23`), nên mọi pointer thẳng vào template (legacy anomaly) phải được null trước khi delete.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Giáo viên xóa được một syllabus template: endpoint `POST /api/syllabi/:id/remove` + nút "Xóa" kèm confirm modal trên trang danh sách syllabus | P2 |
| 2 | Các lớp đã chọn template trước đó KHÔNG bị ảnh hưởng khi template bị xóa — bản copy giáo trình của mỗi lớp giữ nguyên cây, tiến độ và pointer | P2 |
| 3 | Lớp mới không thể chọn template đã xóa — template biến khỏi danh sách chọn (add-class modal + import modal), và API import với templateId đã xóa trả 404 | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1 — Server endpoint xóa template](./phase-01-server-delete-endpoint.md) | Done |
| 2 | [Phase 2 — Web action và UI nút xóa](./phase-02-web-delete-action-ui.md) | Done |
| 3 | [Phase 3 — Verification toàn diện](./phase-03-end-to-end-verification.md) | Done |

## Kiến trúc & Quyết định

**Hard delete, không soft-delete.** Bản copy của lớp (`classId = <lớp>`, `sourceTemplateId = <template gốc>`) là cây dữ liệu độc lập hoàn toàn với template lúc runtime — được tạo bởi `buildImportBatch` (`apps/server/src/routes/kernel.ts:239-303`) qua `POST /api/classes/:id/import-syllabus` (kernel.ts:842-895) và create-class với `templateId` (kernel.ts:763-839). Không có đường runtime nào từ lớp đọc template sau khi import. Soft-delete sẽ thêm cột + migration + filter khắp nơi mà không mang lại gì cho 3 yêu cầu của user.

**Quyết định chốt:**

1. **Endpoint `POST /api/syllabi/:id/remove`**, đặt cuối nhóm route syllabi trong kernel.ts (sau `/syllabi/:id/modules/:mid/lessons/:lid/remove`, kernel.ts:1949). Body rỗng `z.object({}).strict()` — CSRF-safe convention như `removeCurriculumSchema` (`packages/api/src/contracts.ts:110`).
2. **Guard mirror import handler**: row có `classId !== null` (bản copy của lớp) trả 404 `"syllabus not found"` — che tồn tại, consistent với guard template của import handler (kernel.ts:859-862). Bản copy của lớp chỉ được xóa qua `remove-curriculum` phía lớp.
3. **Một atomic `db.batch` 5 statement, mọi statement org-scoped**, theo thứ tự: (a) null các `class.syllabusId` trỏ thẳng template (anomaly legacy — thường 0 row, vô hại); (b) null `sourceTemplateId` của các bản copy (logical FK không tự set null trong DB thật); (c) delete lessons qua subquery modules; (d) delete modules; (e) delete syllabus. Mirror pattern `remove-curriculum` (kernel.ts:941-976) và convention "delete explicit child-first qua subquery — không dựa FK cascade" (kernel.ts:1565-1567).
4. **Không migration, không sửa add-class-modal.** Danh sách template phía web là filter `classId === null` trên snapshot (`apps/web/src/lib/repos/use-syllabus.ts:24`); sau khi xóa và snapshot refresh, template tự biến khỏi mọi danh sách chọn (`apps/web/src/components/modals/add-class-modal.tsx:201-213` tiêu thụ cùng nguồn này).
5. **UI: nút "Xóa" trên card ở trang list** (`apps/web/src/routes/_auth/syllabus/index.tsx`), component mới `delete-syllabus-button.tsx` với confirm modal nêu rõ 2 vế semantics: các lớp đã dùng không bị ảnh hưởng / lớp mới không chọn được nữa / không thể hoàn tác.

## Success Criteria

- [ ] `POST /api/syllabi/:id/remove` xóa template + toàn bộ cây modules/lessons của nó trong 1 atomic batch, trả `{ ok: true }` 200
- [ ] Sau khi xóa: bản copy của mọi lớp đã import còn nguyên cây module/lesson, `class.syllabusId` của lớp vẫn trỏ vào copy, `sourceTemplateId` của copy thành null (server test chứng minh)
- [ ] Sau khi xóa: import-syllabus với templateId đã xóa trả 404 — lớp mới không thể chọn (server test chứng minh)
- [ ] Gọi endpoint với id của bản copy thuộc lớp trả 404, copy không bị xóa
- [ ] Template thuộc org khác trả 404 (org isolation)
- [ ] Trang `/syllabus` có nút "Xóa" trên mỗi card template; confirm modal nêu đúng 2 vế semantics; xóa xong card biến mất sau snapshot refresh
- [ ] Nút xóa không trigger navigation sang trang detail (chặn cả click và Enter/Space keydown bubble lên card)
- [ ] `pnpm --filter server test`, `pnpm --filter web test`, `pnpm check-types`, `pnpm check`, `pnpm test` đều pass

## Dependencies

Không có — thuần thêm tính năng trên schema hiện có, không chặn/block plan khác. Phase 2 phụ thuộc Phase 1 (endpoint phải tồn tại trước khi web mapping test chạy thật), Phase 3 phụ thuộc cả hai.

## NOT in scope

- Soft-delete / cột `deletedAt` / migration schema — không cần cho yêu cầu này
- Nút xóa template trên trang detail (`/syllabus/$syllabusId`) — chỉ làm ở list page
- Sửa `add-class-modal` hay `ImportSyllabusModal` — danh sách tự обнов qua snapshot
- Xóa bản copy của lớp từ UI syllabus — đã có `remove-curriculum` phía class detail
- E2E Playwright bắt buộc — optional stretch ở Phase 3, chỉ chạy nếu môi trường dev server khả dụng

<!-- slug: syllabus-template-delete -->

## Validation Log

### Verification Results (2026-09-21)

- Claims checked: 12 (spot-check độc lập bởi orchestrator trên các claim mới nhất của planner)
- Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Standard (3 phases — Fact Checker + Contract Verifier)
- Bằng chứng: `ak plan validate` exit 0; matrix numbering thật của kernel.test.ts (matrix 5+10 @2728, matrix 11 @2878, matrix 14 @2908 → số mới 15/16 hợp lệ); `ui/modal.tsx:61-98` render inline không portal; `data-store-reducer.ts:379` fixture-only default; `use-direct-kernel-action.ts:7-52` interface `run/isPending/busy` đúng như phase 2 mô tả; `kernel-command.test.ts:10-26` mapping-test convention đúng; các file:line của Phase 1 được planner đọc trực tiếp khi viết và orchestrator cross-check với scout report.
- User interview: skipped — phiên autonomous không có decision point còn mở; hard-delete vs soft-delete và các quyết định còn lại được chốt bằng bằng chứng kiến trúc + convention repo, rationale ghi trong "Kiến trúc & Quyết định".

### Whole-Plan Consistency Sweep (2026-09-21)

- Đọc lại toàn bộ 4 file: frontmatter, phases table, tên file link, số matrix test, danh sách files tạo/sửa, verification commands nhất quán giữa `plan.md` ↔ 3 phase files. Không còn mâu thuẫn chưa xử lý.
