---
title: "Fix class detail curriculum duplicate render"
description: "Tab 'Giáo trình' trong class detail đang render cùng một cây modules→lessons hai lần liền nhau (SyllabusProgress read-only tree + editor tree). Gộp thành một cây duy nhất: giữ editor làm cây chính, cộng status dot/badge và module done/total count từ progress view, giữ summary tiến độ, xóa SyllabusProgress."
status: completed
priority: P2
effort: "0.5d"
issue: 81
branch: develop
tags: [web, ui, bugfix, syllabus]
blockedBy: []
blocks: []
created: 2026-08-26
---

# Fix class detail curriculum duplicate render

## Overview

Bug UI do PR #79/#80 (import template per-class curriculum, commit `5dd3acf`) thêm editor cây giáo trình vào tab "Giáo trình" của class detail mà không bỏ progress view cũ — cùng object `sy` (từ query `['kernel']`) bị render hai cây `modules→lessons` liền nhau: list 1 read-only với badge "Sắp tới" (từ `SyllabusProgress`), list 2 editor với nút "Sửa" / "+ Thêm buổi học". Screenshot xác nhận: "Unit 1" hiện 2 lần, "Family (Collocations)" / "Family (Listening)" hiện 2 lần.

**Hướng sửa (đã được kongming GO trong chế độ `--advice`):** giữ editor làm cây duy nhất, merge thông tin tiến độ vào nó (status dot + badge mỗi lesson row, `{done}/{total} buổi` mỗi module header), giữ summary card + progress bar phía trên, xóa `SyllabusProgress` (chỉ dùng ở đúng chỗ này). KHÔNG thêm collapse feature cho editor (ngoài scope).

## Scope Challenge

- Existing: editor tree có đủ CRUD (AddModule/EditModule/AddLesson/EditLesson modal); `EditLessonModal` đã cho sửa `status` (done/current/upcoming) nên status là dữ liệu thật, có giá trị hiển thị; template page `apps/web/src/routes/_auth/syllabus/$syllabusId.tsx:43-58` đã có sẵn pattern một-cây-editor + status viz — helpers `dotClass`/`statusBadge` đang bị nhân bản giữa file đó và `syllabus-progress.tsx`.
- Requested scope: bỏ phần hiển thị trùng/dư thừa module + buổi học trong class detail — delivered in full bằng cách gộp thành một cây, không mất thông tin tiến độ.
- Complexity: 3 file modify + 1 file create (shared helpers, ~20 dòng) + 1 file delete + 1 dòng comment e2e. 0 service/abstraction mới. 2 phase.
- Selected mode: **HOLD SCOPE**. Auto-detected **Fast** (bug fix cục bộ, nguyên nhân và design đã xác minh bằng code).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tab "Giáo trình" của class detail hiển thị MỘT cây modules→lessons duy nhất, không trùng lặp | P1 |
| 2 | Không mất thông tin: status từng buổi (dot + badge), mục tiêu buổi học (`objectives`), `%` tiến độ + done/total của syllabus vẫn hiển thị | P1 |
| 3 | Helpers status viz dùng chung (DRY) giữa class detail và template page | P2 |
| 4 | Gates local xanh: biome, tsc, unit tests, e2e `class-operations.spec.ts` | P1 |

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Single curriculum tree in class detail](./phase-01-start.md) | Pending |
| 2 | [E2E doc-contract update and verification gates](./phase-02-e2e-doc-contract-update-and-verification-gates.md) | Pending |

## Root Cause (evidence)

- `apps/web/src/routes/_auth/classes/$classId.tsx:175-259` — tab `syllabus`: line 178 render `<SyllabusProgress syllabus={sy} />` (cây read-only), lines 206-258 render lần hai cùng `sy.modules` dưới dạng editor.
- `apps/web/src/components/syllabus/syllabus-progress.tsx:63-108` — cây read-only có status dot (lines 87-89) + badge (line 100), module header `{mDone}/{m.lessons.length} buổi` (lines 76-78) — đúng thông tin cần giữ lại khi dedupe.
- Cả hai list cùng đọc một object từ `DataProvider` (`['kernel']` → `mapSyllabi`), không có dual-fetch — bug thuần render.

## Success Criteria

- [ ] Tab "Giáo trình": mỗi module title ("Unit 1"…) xuất hiện đúng MỘT lần; mỗi lesson ("Family (Collocations)"…) xuất hiện đúng MỘT lần.
- [ ] Mỗi lesson row trong editor có status dot + badge (Đã dạy / Đang học / Sắp tới) VÀ dòng `Mục tiêu: {l.objectives}`; module header hiển thị `{done}/{total} buổi`.
- [ ] Summary (tên syllabus, level/skills, `%`, `done/total` buổi, `{syllabus.totalLessons} buổi`) + progress bar vẫn hiển thị phía trên cây.
- [ ] `grep -r "SyllabusProgress" apps/` trả về 0 kết quả; file `syllabus-progress.tsx` đã xóa.
- [ ] `pnpm biome check`, type-check, unit tests, và e2e `class-operations.spec.ts` pass không đổi assert logic (chỉ update comment header line 15).

## Out of Scope

- Không thêm collapse/expand cho editor tree class detail (editor hiện không có; không có yêu cầu).
- Không đổi API/kernel contract, không đổi schema, không đổi logic import-syllabus.
- Không sửa trang template `/syllabus/$syllabusId` ngoài việc thay helpers local bằng import shared.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| E2E `class-operations.spec.ts` đếm exact "Sắp tới" (12/11) | Asserts là page-global `getByText` nhưng an toàn nhờ HAI lớp: (1) tab render độc lập theo state `tab` (default `roster`); (2) class fixture không import syllabus (`syllabusId === ""` → tab Giáo trình empty-state). Signal nếu fail: count gấp đôi → kiểm tra hai lớp này; spec mới tái dùng `openClassScheduleTab` cho class CÓ curriculum phải scope count. |
| Xóa `syllabus-progress.tsx` phá nơi khác | Đã grep: chỉ import tại `$classId.tsx:14`. Signal: tsc/build error sau khi xóa → restore và replan. |
| Comment header e2e (line 15) trở nên sai ("badges exist only on Lịch học tab") | Phase 2 update comment line 15 VÀ `helpers.ts:21-22` (cùng claim stale); counts giữ nguyên. Nhãn chuẩn: Lịch học = "Đã học"/"Sắp tới"; Giáo trình = "Đã dạy"/"Đang học"/"Sắp tới". |
| Mất per-module collapse khi xóa `SyllabusProgress` | Accepted regression theo issue #81 (collapse là ngoài scope, "KHÔNG thêm collapse feature cho editor"); template page vẫn giữ collapse. Ghi nhận có chủ đích, không phải bug. |
| Không có guard tự động cho bug duplicate-render | Không e2e nào mở tab "Giáo trình" (fixture class không có syllabus); verify bằng mắt là guard duy nhất trong scope này. Follow-up: e2e import-template assert `Unit 1` count = 1. |

## Open Questions

None.

## Validation Log

### Session — 2026-08-26 (ak-vibe reuse-mode gate)

### Verification Results
- **Tier:** Light (2 phases → Fact Checker)
- **Claims checked:** 10
- **Verified:** 10 | **Failed:** 0 | **Unverified:** 0

Verified against worktree `fix/class-detail-curriculum-duplicate-render` (base develop):
1. [Fact Checker] `$classId.tsx:14` import + `:178` `<SyllabusProgress syllabus={sy} />` — VERIFIED
2. [Fact Checker] `syllabus-progress.tsx` helpers `7-22`, summary `42-62`, module header `76-78`, dot `87-89`, badge `100` — VERIFIED
3. [Fact Checker] `syllabus-progress` import sites: chỉ `$classId.tsx` — VERIFIED (grep 3 hits, 1 là định nghĩa)
4. [Fact Checker] `$syllabusId.tsx:43-58` local `dotClass`/`statusBadge` (typed `SyllabusLesson["status"]`) — VERIFIED
5. [Fact Checker] `components/modals/edit-lesson-modal.tsx:31,40,61,98` sửa được `status` — VERIFIED (file nằm ở `modals/`, không phải `syllabus/`; plan chỉ dẫn làm evidence, không modify)
6. [Fact Checker] e2e `class-operations.spec.ts:15` comment "badges exist only on Lịch học tab" — VERIFIED
7. [Fact Checker] e2e asserts `:53` count 12, `:80` count 11 "Sắp tới" — VERIFIED
8. [Fact Checker] Tabs render độc lập theo state `tab` (default roster) — VERIFIED (`$classId.tsx:175` conditional render)
9. [Fact Checker] CI gates: `biome check .` + `pnpm test` (turbo → vitest) trong `ci.yml`; e2e workflow riêng `e2e.yml` — VERIFIED
10. [Fact Checker] `check-types` turbo task tồn tại (web: `vite build && tsc --noEmit`) — VERIFIED

Interview: 0 câu hỏi — không có claim FAILED, không còn decision point mở (kongming GO đã ghi trong issue #81).

## Red Team Review

### Session — 2026-08-26 (ak-vibe reuse-mode gate)
**Reviewers:** Security Adversary + Assumption Destroyer (Light tier → cả hai mang verification role Fact Checker)
**Findings:** 13 thô → 9 sau dedupe (9 accepted, 0 rejected)
**Severity breakdown:** 3 High, 6 Medium
**Evidence filter:** 9/9 findings có `file:line` citation — 0 auto-reject

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Mất `Mục tiêu: {l.objectives}` + `{syllabus.totalLessons} buổi` khi merge — mâu thuẫn Goal #2 "Không mất thông tin" | High | Accept | Phase 1 (Requirements/Architecture/Steps/Success), plan.md Goal #2 + Success |
| 2 | `helpers.ts:21-22` doc-contract comment stale tương tự line 15, Phase 2 bỏ sót | High | Accept | Phase 2 (Requirements/Related/Step 1), plan.md Risk |
| 3 | Không gate tự động nào phủ cây merge (e2e không mở tab Giáo trình; fixture class không syllabus) | High | Accept (document risk + follow-up; không thêm e2e mới — AC issue cấm đổi assert, scope churn tối thiểu) | plan.md Risk, Phase 1 Risk |
| 4 | Xóa `SyllabusProgress` = mất per-module collapse hiện có, plan không ghi nhận | Medium | Accept (document accepted regression theo quyết định issue #81) | plan.md Risk, Phase 1 Risk |
| 5 | Layout row mơ hồ (grid 4 cột vs flex); `$syllabusId.tsx:201-231` là reference chính xác đã giải quyết 2-auto + mobile wrap | Medium | Accept (chốt copy reference, cấm phát minh layout mới) | Phase 1 (Architecture/Step 3c/Risk) |
| 6 | Comment Phase 2 dùng nhãn sai: tab Giáo trình là "Đã dạy" không phải "Đã học" | Medium | Accept | Phase 2 (Requirements/Step 1) |
| 7 | Fallback `getByRole("tabpanel")` không khả thi (Tabs render plain buttons, không role) | Medium | Accept (đổi mitigation: scope theo container tab active / data-testid) | Phase 2 Risk |
| 8 | Lệnh gate Phase 2 không tương đương CI (`pnpm -r test` ≠ `pnpm test`; thiếu `check-types`/`build`) | Medium | Accept (dùng đúng `pnpm exec biome check .`, `pnpm test`, `pnpm check-types`, `pnpm build`) | Phase 2 (Requirements/Step 2/Success), Phase 1 Success |
| 9 | Assert e2e page-global; an toàn còn dựa lớp 2 (fixture không syllabus) — risk table bỏ sót | Medium | Accept | plan.md Risk, Phase 2 Risk |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-e2e-doc-contract-update-and-verification-gates.md
- Decision deltas checked: 9 (objectives/totalLessons giữ lại; layout pin $syllabusId.tsx:201-231; helpers.ts thêm vào Phase 2; nhãn badge chuẩn; CI-exact commands; collapse = accepted regression; fallback scoping khả thi; no-auto-guard documented; second safety layer)
- Reconciled stale references: 2 (success criteria Phase 1 + Phase 2 còn lệnh gate loose → thay bằng CI-exact)
- Unresolved contradictions: 0

<!-- slug: fix-class-detail-curriculum-duplicate-render -->
