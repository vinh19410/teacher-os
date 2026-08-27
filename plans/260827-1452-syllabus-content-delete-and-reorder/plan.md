---
title: "Xóa và đổi thứ tự buổi học/module trong syllabus content"
description: "Thêm khả năng xóa buổi học/module và di chuyển (đổi thứ tự) buổi học trong module, module trong syllabus: contracts + server endpoints, web kernel actions, UI trên cả syllabus detail editor và curriculum management section."
status: completed
priority: P1
effort: "2-3d"
tags: [syllabus, api, crud, reorder, ui]
created: 2026-08-27
blockedBy: []
blocks: []
branch: develop
issue: "99"
---

# Xóa và đổi thứ tự buổi học/module trong syllabus content

## Overview

Trong trình soạn thảo nội dung syllabus hiện tại (`apps/web/src/routes/_auth/syllabus/$syllabusId.tsx` và `apps/web/src/components/class-detail/curriculum-management-section.tsx`), người dùng chỉ có thể thêm/sửa module và buổi học — không thể xóa cũng như không thể thay đổi thứ tự.

Plan này bổ sung:

1. **Xóa** module và buổi học (endpoint server + nút Xóa kèm confirm modal).
2. **Đổi thứ tự**: di chuyển module lên/xuống trong syllabus, buổi học lên/xuống trong module (endpoint + nút mũi tên).

DB đã sẵn sàng (`syllabus_module.position`, `syllabus_lesson.position`, đọc theo `ORDER BY position, createdAt`) — **không cần migration mới**. Công việc nằm ở contracts, server endpoints, web data layer (kernel command bus) và UI.

### Quyết định thiết kế (Kongming advisory, đã review)

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | Reorder = **full sibling list payload** `{ moduleIds[] / lessonIds[] }`, mỗi POST giới hạn trong 1 parent | App không có optimistic update; bus serialize từng write + refetch full snapshot nên swap-per-click tốn N round-trip. Full list = 1 round-trip/1 thao tác, renumber dọn luôn tie-break `(position, createdAt)` |
| D2 | UX dùng **nút mũi tên ↑/↓**, KHÔNG cài drag-and-drop (@dnd-kit) ở phase này | Không có optimistic update → drop DnD sẽ "nảy về chỗ cũ" chờ refetch, cảm giác như bug. Nút mũi tên pending-disable tự nhiên, accessible, mobile-friendly, e2e rẻ. Action full-list vẫn tái sử dụng nguyên vẹn nếu sau này thêm @dnd-kit |
| D3 | Xóa module explicit **child-first batch delete** org-scoped, không dựa cascade FK | SQLite chỉ enforce FK khi `PRAGMA foreign_keys=ON` per-connection (runtime chưa thấy bật); convention repo (`remove-curriculum`) cũng delete child-first trong `db.batch` |
| D4 | Template và bản copy lớp đều được phép xóa/reorder (giống add-module hiện nay) | `sourceTemplateId` là logical FK set-null, import là deep-copy — sửa template không phá lớp đã import |


### Ràng buộc bảo mật/invariant

- Mọi mutation phải verify chuỗi sở hữu `lesson → module → syllabus → orgId`. Guard mẫu `findModule` (kernel.ts:176-193). Delete-lesson **không** copy join yếu edit-lesson (:908-919 chỉ bind `lesson.orgId`, không bind `syllabusModule.orgId`/`syllabus.orgId`) — dùng `findModule` + bind `lesson.id+moduleId+orgId`, DELETE/UPDATE WHERE lặp lại parent.
- Cross-org / syllabus không thuộc org / module không thuộc syllabus → **404** (findSyllabus/findModule trước). Không dùng 409 cho authz miss.
- Reorder payload phải khớp **đúng tập** sibling ids của **đúng parent** (cùng parent + cùng org, không thiếu/thừa/duplicate). Sai tập (stale snapshot) trả **409** với body `{ error: "set-mismatch" }`. Body malformed/duplicate id trong payload → **400**. WRITE WHERE lặp parent: modules `id + syllabusId + orgId`; lessons `id + moduleId + orgId`. Test bắt buộc: hai parent cùng cardinality, payload id của parent kia → 409 và victim không đổi position.
- 409 set-mismatch **không** được recyle toast duplicate-guard. `planDirectOutcome` hiện map mọi 409 thành "Dữ liệu đã được cập nhật trước đó" (`kernel-outcome.ts:11-15,31-37`; refetch thật ở `reportDirectOutcome:66-73`). Reorder/delete 409 phải refetch nhưng toast "Thứ tự đã đổi — đang tải lại, hãy thao tác lại". Check-in 409 giữ nguyên semantics cũ. Cập nhật `kernel-outcome.test.ts` + regex-lock `kernel-runtime.contract.test.ts:308-310` cùng commit.
- Body reorder canonical: `{ moduleIds }` / `{ lessonIds }` schema `.strict()` + `.max(MAX_IMPORT_NODES)` (500, cùng cap import `kernel.ts:195-196`) — trích nguyên văn trong phase-01. Sibling count > 500 → **422**, không chunk batch.
- Mount order Hono: `/modules/reorder` trước `/modules/:mid` VÀ `/modules/:mid/lessons/reorder` trước `.../:lid` (first-registered-wins).
- Không thêm unique index trên `position`. Comment migration `0009_syllabus_template_discriminator.sql:10-11` ("position là khóa duy nhất") là ước runtime `max+1`, **không** phải unique index — cấm migration mới trên `(syllabus_id, position)` / `(module_id, position)`.
- UI: mọi nút ↑↓/Xóa `disabled={busy || isPending(key) || edge}`. Một `useDirectKernelAction` per page; component extract **không** gọi hook. Bus dedup `JSON.stringify` chỉ gộp payload giống hệt (`repos/kernel.ts:402-405`).
- POST write-only: trả `{ ok: true }` / `{ id }`; snapshot mới qua GET `/api/kernel` sau 2xx. Không nhét snapshot vào POST body.
- CSRF: 4 route mới pin test Origin missing/foreign → 403, form content-type → 415. Không nới middleware `kernel.ts:114-116`. Curl smoke phải gửi `-H Origin: $CORS_ORIGIN`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Server endpoints xóa module/buổi học + reorder module/buổi học, org-guard đầy đủ, test vitest pass | P1 |
| 2 | Web kernel command bus hỗ trợ 4 action mới qua TS exhaustive switch | P1 |
| 3 | Syllabus detail editor có nút Xóa + confirm, mũi tên ↑/↓ cho module và buổi học | P1 |
| 4 | Curriculum management section (bản copy lớp) đạt parity cùng bộ action | P2 |
| 5 | Contract tests (source-lock) cập nhật cùng commit với source; e2e smoke coverage | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Contracts & server endpoints xóa/reorder](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Web kernel actions & data layer](./phase-02-web-kernel-actions-data-layer.md) | Pending |
| 3 | [Phase 3: Syllabus editor UI — nút Xóa và mũi tên](./phase-03-syllabus-editor-ui-delete-and-move-buttons.md) | Pending |
| 4 | [Phase 4: Curriculum parity + contract tests + e2e](./phase-04-curriculum-parity-contract-tests-e2e.md) | Pending |

Phụ thuộc tuyến tính: 1 → 2 → 3 → 4. Phase 1 chạy được độc lập; phase 2 cần contracts phase 1; phase 3 cần actions phase 2; phase 4 cần UI phase 3.

## Success Criteria

- [ ] `pnpm --filter server test` xanh (bao gồm test mới cho 4 endpoints: happy path + sai ownership chain + sai tập reorder payload)
- [ ] `pnpm --filter web test` xanh (contract/source-lock tests cập nhật cùng commit với source chúng khóa)
- [ ] `pnpm check-types` + build xanh (TS exhaustive switch ép mapping đủ 4 action mới)
- [ ] Trên `/syllabus/$id`: xóa được module (kèm lessons) và buổi học sau khi confirm; mũi tên đổi thứ tự ngay cả khi lên đầu/xuống cuối bị disabled
- [ ] Trên class detail (curriculum management): các hành động tương tự hoạt động như syllabus template
- [ ] E2E smoke: 1 spec Playwright click mũi tên + xóa một item, assert thứ tự mới từ snapshot
- [ ] Browser smoke thủ công tại viewport 360px và desktop (giao diện không vỡ layout)

## Red Team Review

### Session 1 — 2026-08-27 (pre-vibe)
Đã vá: canonical `{ moduleIds }`/`{ lessonIds }`; mount order cả hai cặp `/reorder`; set-mismatch 409; e2e Origin header; reducer default case.

### Session 2 — 2026-08-27 (ak:vibe --advice, 3 reviewers)
**Findings:** 15 unique after dedup (8 accepted, 7 rejected)
**Severity breakdown:** 2 Critical accepted as High-with-fix, 6 High accepted, 0 Critical left open

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | UPDATE WHERE org-only / cross-parent same-cardinality | Critical | Accept | Phase 1 |
| 2 | 409 set-mismatch recyle toast duplicate-guard | Critical | Accept | Phase 1–3 |
| 3 | Cross-org reorder 409 thay vì 404 | High | Accept | Phase 1 |
| 4 | Copy join edit-lesson yếu cho delete-lesson | High | Accept | Phase 1 |
| 5 | Child-first phải subquery như remove-curriculum; test orphan | High | Accept | Phase 1, 4 |
| 6 | CSRF Origin tests + curl smoke | High | Accept | Phase 1 |
| 7 | KernelAction `?` fields + "compiler bắt mọi consumer" sai | High | Accept | Phase 2 |
| 8 | Disable chỉ pending-key; extract hook thứ 2 | High | Accept | Phase 3–4 |
| 9 | E2E seed thiếu host :8000 + reload | High | Accept | Phase 4 |
| 10 | Uncapped reorder array / D1 batch | High | Accept | Phase 1 |
| 11 | Reducer OR-fork no-op | Medium | Accept | Phase 2 |
| 12 | Write-only POST vs "refetch snapshot trả về client" | Medium | Accept | Phase 1 |
| 13 | 0009 position "unique" vs cấm unique index | Medium | Accept | plan.md |
| 14 | Confirm template/class-copy thiếu cảnh báo tiến độ | Medium | Accept | Phase 3–4 |
| 15 | Concurrent last-write-wins cùng SET khác permutation | Critical | Reject | — |
| 16 | kernelCommand citation :37-142 sai | Medium | Reject | — |
| 17 | Cấm xóa template (đảo D4) | Medium | Reject | — |

**Reject 15:** single-operator org; không có If-Match infrastructure; last-write-wins cùng SET là tradeoff D1. Không thêm version token.
**Reject 16:** `kernelCommand` đóng tại `:142` (switch hết `edit-lesson`); reviewer đọc range elided.
**Reject 17:** D4 giữ nguyên — template được xóa/reorder; confirm chỉ bổ sung copy, không 409-reject.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-web-kernel-actions-data-layer.md, phase-03-syllabus-editor-ui-delete-and-move-buttons.md, phase-04-curriculum-parity-contract-tests-e2e.md
- Decision deltas checked: 14 accepted
- Reconciled stale references: heal-409 citation; join-chain copy ban; busy||isPending; POST `{ ok: true }`; e2e `:8000`+reload; KernelAction required fields
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-08-27
**Trigger:** `/ak:vibe --ship --beta --advice` autonomous gates (plan đã có D1–D4)
**Questions asked:** 0 — không có decision point mới đổi implementation ngoài findings red-team đã áp; D1–D4 giữ nguyên.

#### Verification Results
- **Tier:** Standard (4 phases, Fact Checker + Contract Verifier)
- **Claims checked:** 18
- **Verified:** 16 | **Failed:** 0 | **Unverified:** 2 (line-ref drift không đổi nghĩa: Sửa `$syllabusId.tsx:179/:214` vs plan ~:177/:213; confirm modal ends :287 vs :251-290)
- **Failed meaning-change citations (fixed in Session 2):** heal-409 range `:36-44` gồm nhánh không-409; refetch ở `reportDirectOutcome:66-73`

#### Confirmed Decisions
- D1–D4: giữ
- 409 set-mismatch: giữ status + refetch, **đổi toast/error body**
- Concurrent same-SET last-write-wins: chấp nhận

#### Action Items
- [x] Propagate Session 2 accepted findings into all phase files

#### Impact on Phases
- Phase 1: WHERE parent bind, 404 vs 409, Origin tests, child-first subquery, `{ ok: true }`, `.max(500)`, orphan test
- Phase 2: 4 required variants, reducer bắt buộc, 409 toast branch, consumer inventory
- Phase 3: `busy || isPending`, confirm copy template vs class-copy
- Phase 4: absolute `:8000` + reload; extract không sở hữu hook; e2e xóa module

## Boundary Reminder

Plan này CHỈ là kế hoạch — chưa code. Thực thi bằng `/ak:cook plans/260827-1452-syllabus-content-delete-and-reorder`.
