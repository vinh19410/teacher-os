---
title: "Holiday shift dời lesson_material sang buổi bù (#645)"
description: "Apply holiday shift dời lesson_material từ originalDate sang makeupDate, undo dời ngược kèm rule trùng materialId; server chặn attach/detach/upload vào buổi holiday; web ẩn nút Tài liệu trên row holiday."
status: completed
priority: P1
effort: 3h
issue: 645
branch: vinh19410/fix/holiday-shift-materials-645
tags: [bugfix, backend, frontend, database]
blockedBy: []
blocks: []
created: 2026-11-10
---

# Holiday shift dời lesson_material sang buổi bù (#645)

## Overview

Holiday shift đổi *ngày* của buổi dạy nhưng `lesson_material` (PK `(classId, date, materialId)`) không đi theo: tài liệu kẹt ở buổi gốc `holiday` — vô hình ở UI học sinh (`class-lesson-list.tsx` ẩn buổi holiday; API student `student-materials.ts` vẫn phục vụ theo enrollment-active), buổi bù trống. `moveDate` đã giải đúng bài này (`kernel.ts:2224-2265`, pattern `bucketMoved`); holiday shift tái dùng pattern đó. Kèm footgun cùng vùng code: route attach/detach/upload không kiểm status nên giáo viên gắn được tài liệu vào buổi `holiday` vô hình, và nút "Tài liệu" trên web render trên mọi row.

Root cause đã xác minh trực tiếp trên code (2026-11-10, worktree `fix/holiday-shift-materials-645`):

1. `apps/server/src/routes/holidays.ts` `shiftStatements` (:312-370) — 3 statement không đụng `lessonMaterial` → tài liệu không theo buổi bù.
2. `apps/server/src/routes/holidays.ts` undo block (:827-840) — `DELETE lessonMaterial WHERE date = makeupDate` xóa sạch thay vì dời ngược.
3. `apps/server/src/routes/materials.ts` — POST attach (:845), PUT upload (:891), DELETE detach (:928) đều gọi `resolveSession` không kiểm `lesson.status` → gắn/gỡ được tài liệu vào buổi `holiday`. GET list (:820) không kiểm — phải giữ nguyên để modal đang mở không vỡ khi render.
4. `apps/web/src/components/class-detail/class-sessions-section.tsx` (:346) — nút "Tài liệu" chỉ gate bởi `supportsMaterials`, render cả trên row `holiday`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Apply holiday shift dời `lesson_material` từ originalDate sang makeupDate (trong cùng batch guard) | P1 |
| 2 | Xóa holiday dời ngược toàn bộ `lesson_material` về originalDate; trùng materialId giữ bản ngày gốc | P1 |
| 3 | Server trả 4xx nghiệp vụ khi attach/detach/upload vào buổi `holiday`; GET list giữ nguyên | P1 |
| 4 | Web ẩn nút "Tài liệu" trên session row `holiday` | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Server — shift dời tài liệu + undo dời ngược](./phase-01-server-shift-materials.md) | Pending |
| 2 | [Phase 2: Server — chặn mutating routes vào buổi holiday](./phase-02-materials-holiday-guard.md) | Pending |
| 3 | [Phase 3: Web — ẩn nút Tài liệu + gates](./phase-03-web-hide-button.md) | Pending |

## Success Criteria

- [ ] Test `holidays.test.ts`: sau apply, `lesson_material` ở originalDate = 0 và ở makeupDate = đủ; sau undo, ngược lại, gồm rule trùng materialId (giữ bản ngày gốc).
- [ ] Test `materials.test.ts`: attach/upload/detach vào buổi holiday trả 409 `SESSION_HOLIDAY`; GET list vẫn 200.
- [ ] Web: nút "Tài liệu" không render trên row holiday (các status khác giữ nguyên).
- [ ] `pnpm check`, `pnpm check-types` và test liên quan pass.

## Constraints

- Mọi mutation nằm trong `db.batch` guard CASE hiện có (nguyên tử, D1 rollback sạch khi guard lệch — INSERT `originalDate`/`name` NOT NULL nhận NULL làm cả batch fail).
- Không đổi `MAX_APPLY_STATEMENTS` (500); note trade-off: apply/shift tăng ~3 → ~5 statement, cap shifts/apply giảm ~166 → ~100; UNDO/shift tăng 3 → 4 (1 DELETE thay bằng cleanup-DELETE + move-back-UPDATE), cap shifts/undo giảm ~164 → ~123 (cùng trần `MAX_APPLY_STATEMENTS`, RT-Assumption F6).
- Pattern theo `moveDate` (`kernel.ts:2224-2265`), không tạo convention mới.
- Không đụng `cancelStatements`, `syllabus_lesson_material`, `session-curriculum-materials.ts`, `moveDate`.
- Buổi `cancelled` giữ nguyên hành vi.

## Non-goals

- Không thêm cột/bảng tracking "tài liệu dời bởi shift" — move-back-all đã chốt với user.
- Không thêm hiển thị/đếm tài liệu vào holiday preview.
- Không đổi `cancelled` (không có buổi bù để dời tới).
- Không đổi `moveDate`.

## Risks

- **Undo move-back-all** di cư cả tài liệu gắn mới vào buổi bù về buổi gốc khi xóa holiday — hành vi đã chốt với user trong issue #645 (trade-off được chấp nhận).
- **Undo cap giảm** (RT-Failure F1): undo dùng chung `MAX_APPLY_STATEMENTS = 500` (`holidays.ts:41`, check :919) — 4 statement/shift mới → cap shifts/undo ~164 → ~123. Holiday legacy đã apply với 124–164 shift trở nên KHÔNG hoàn tác được qua API sau deploy (422 `TOO_LARGE`; một khi `fromDate` qua ngày, D3 trả `HOLIDAY_STARTED` → kẹt vĩnh viễn, dữ liệu vẫn nguyên — 422 by-design I5). Constraint không đổi cap đã chốt với user; nếu tổ chức thật có holiday >123 shift: undo trước deploy hoặc làm issue riêng nâng cap/tối ưu statement sau.
- **Detach bị chặn trên holiday**: tài liệu legacy đã dính vào buổi holiday (footgun live trước fix) trở nên không gỡ được qua API detach, và API student vẫn đọc được (UI student ẩn buổi holiday) — RT-Security F6. Đã chốt với user trong issue: chấp nhận trade-off; dọn legacy bằng script một lần **ngoài scope PR này** — nếu dữ liệu legacy xuất hiện thật, làm issue riêng kèm script dọn `lesson_material` tại ngày có lesson `status='holiday'`.
- **TOCTOU race attach/upload** (RT-Failure F4): check `rejectHoliday` trong `resolveSession` là SELECT đọc riêng, không trong batch — apply shift chen ngang (đặc biệt PUT upload stream R2 nhiều giây) có thể tạo liên kết mồ côi MỚI không detach được. Task 2.3 khép cửa sổ bằng guard INSERT-CASE trên cột NOT NULL `date` (POST + PUT, helper `holidayBucketDateGuard`) + re-check 409 trong catch — theo pattern guard CASE sẵn có của repo.

## Red Team Review

### Session — 2026-11-10
**Findings:** 10 unique (5 accepted, 5 rejected-as-duplicate-or-already-applied)
**Severity breakdown:** 0 Critical, 3 High (RT-Security F1, RT-Assumption F2, RT-Failure F1), 7 Medium
**Reviewers:** 3 subagent (Security Adversary/Fact Checker, Failure Mode Analyst/Contract Verifier, Assumption Destroyer/Fact Checker), Standard tier

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Task 1.2 Scenario B phantom test — collision không quan sát được ở trạng thái đỏ | High | Accept | Phase 1 Task 1.2.2 + Task 1.4.4 (green-only) |
| 2 | `SESSION_HOLIDAY` thiếu trong `MATERIAL_ERROR_CODES` union kín → check-types fail | High | Accept | Phase 2 Files + Task 2.2.3 (RT-Security F3 + RT-Assumption F1 + RT-Failure F2 trùng) |
| 3 | Web `materialErrorMessage` thiếu case → web test :79-90 đỏ không gate nào thấy | High | Accept | Phase 2 Files + Verification gate `pnpm --filter web test materials` |
| 4 | Undo cap 4/shift — holiday legacy 124–164 shift kẹt không hoàn tác sau deploy | High | Accept (risk note; nâng cap đã bị chốt loại trừ) | plan.md Risks |
| 5 | Mixed-status day bypass guard `limit(1)` | Medium | Accept (EXISTS-semantics) | Phase 2 Task 2.2.2 |
| 6 | PUT upload test hedge sai premise (raw-byte PUT, helper có sẵn) | Medium | Accept | Phase 2 Task 2.1.3 (RT-Security F4 + RT-Assumption F5 + RT-Failure F5 trùng) |
| 7 | Undo sketch thiếu orgId scoping | Medium | Accept | Phase 1 Task 1.4.1 |
| 8 | Web component test cho nút Tài liệu đã tồn tại — bắt buộc case holiday | Medium | Accept | Phase 3 Task 3.0 |
| 9 | `pnpm check` là read-only, tự-sửa là `check:fix` | Medium | Accept | Phase 3 Task 3.2 |
| 10 | TOCTOU PUT upload tự tạo mồ côi mới không gỡ được | Medium | Accept (guard CASE + INSERT-SELECT, không automated test — không có seam concurrent) | Phase 2 Task 2.3 |

Rejected findings: không có finding bị loại vì thiếu evidence; 4 báo cáo trùng lặp giữa reviewers được dedupe (ghi ở cột #).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03 (sau khi apply findings).
- Decision deltas: thêm file sửa (`material-contracts.ts`, web `materials.ts`, web test), EXISTS-semantics guard, Scenario B chuyển green-only, gates thêm web test, `check:fix`, TOCTOU Task 2.3.
- Reconciled stale references: phase-02 Files (PUT :891 → :884), plan.md Overview (vô hình UI-only), plan.md Constraints (undo cap), phase-03 Verify (bỏ claim "không có unit test").
- Unresolved contradictions: 0.

### Advisory receipt — kongming plan-gate (2026-11-10)
**GO có điều kiện** — 3 sửa chữ đã apply trước implement:
- **A (Task 2.3 rewrite):** bỏ INSERT…SELECT — dùng guard INSERT-CASE trên NOT NULL `lessonMaterial.date` (mẫu `shiftStatements` :318-327); `.onConflictDoNothing()` làm 0-dòng mơ hồ; re-check holiday trong catch map race NOT NULL → 409 (PUT tránh 500 "upload failed").
- **B (Task 2.2.2):** guard đổi sang bucket-semantics `EXISTS holiday AND NOT EXISTS non-holiday` khớp web `allHoliday` (`class-sessions.ts:461-476`); thêm test ngày trộn attach 201.
- **C:** test command quoting `'$classId.sessions'`.
- **Task 1.3:** cleanup-orphan = DELETE-all makeupDate (không subquery) — pattern moveDate thật `kernel.ts:2246-2255`; guard makeupDate 0 dòng lesson → mọi dòng ở đó là mồ côi; Scenario C thêm mồ côi không trùng X.
- **Stop conditions khi implement:** UNIQUE/PK violation trong test xanh (dễ ngỡ 409 MAKEUP_TOUCHED hợp lệ qua `isRollbackableConstraintError`); test holiday/materials khác plan-nêu bị đỏ; `check-types` đòi `as any`/ép kiểu `BatchItem`.

<!-- slug: holiday-shift-materials-645 -->
