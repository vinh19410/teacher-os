---
title: "Fix #662: đóng 2 đường mồ côi lesson_material còn lại của lớp manual (non-I6 move + chặn attach ngày đã shift)"
description: "Activation non-I6 kéo lesson_material theo shift row có sẵn (gate parsedSchedule); chặn attach/upload vào bucket all-holiday + class_session đã shift; sửa copy web SESSION_HOLIDAY."
status: completed
priority: P1
effort: 4h
issue: 662
branch: vinh19410/fix/manual-orphan-materials-662
tags: [bugfix, backend, database, frontend]
blockedBy: []
blocks: []
created: 2026-11-10
---

# Fix #662: đóng 2 đường mồ côi `lesson_material` còn lại của lớp manual

## Overview

#659 chỉ move `lesson_material` ở nhánh I6 của activation (lớp manual chưa từng có shift/cancel/lesson). Hai đường còn lại vẫn tạo mồ côi:

1. **Re-activation sau xóa enrollment** (path 1): xóa enrollment cascade mất `lesson` nhưng `holiday_session_shift` là class-scoped nên sống sót; teacher attach lại material vào ngày gốc D qua bucket rỗng (0 lesson → `isHolidayBucket` false, `materials.ts:397-425`); activation sau đi nhánh non-I6 (`shifts.length > 0`) → `applyShiftsToRows` dịch lesson sang D′ nhưng move material chỉ nằm trong loop `newShifts` (I6) → material kẹt D.
2. **Attach-sau-shift** (path 2): sau apply shift, ngày D còn lesson `holiday` (+ có thể `class_session`); carve-out `class_session` của `isHolidayBucket` (#658) cho attach → material vào ngày mà buổi thật duy nhất nằm ở D′.

Phân tích (đã counsel kongming — GO): sau activation non-I6, D không còn buổi thật nào (`classSessionRows` lấy mọi `class_session`, không filter date — `enrollment-activation.ts:371-380`; mọi generated row tại D bị `applyShiftsToRows` `:47-68` dịch) → move material theo shift row có sẵn khớp ý đồ teacher; case yank duy nhất còn lại là attach SAU activation — xử lý bằng guard attach. `holidayBucketLocked` của kernel (`kernel.ts:1766-1791`) độc lập với carve-out attach nên guard mới không phá move-occurrence edit.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Activation non-I6 kéo `lesson_material` theo shift row có sẵn (cùng batch nguyên tử, gate `parsedSchedule`) — heal path 1 | P1 |
| 2 | Chặn attach/upload vào bucket "all-holiday + class_session + shift row" bằng predicate riêng, KHÔNG đụng `isHolidayBucket`/`resolveSession` dùng chung (detach phải còn 200) — đóng path 2 | P1 |
| 3 | Web: sửa copy lỗi `SESSION_HOLIDAY` (bỏ "hoặc gỡ" — detach chủ ý còn 200 cho bucket mới) | P2 |

## Quyết định thiết kế (counsel kongming — GO 2026-11-10; red-team 2026-11-10)

1. **A — move non-I6 là loop thứ ba trên `shifts`, đặt trong phần lắp ráp `statements` NGAY SAU loop `for (const shift of newShifts)` (`enrollment-activation.ts:549-621`), bên trong vòng retry `attempt`.** `const statements` khai báo tại `:543` — ngoài block `if (parsedSchedule && rows.length > 0)` (`:445`) — nên loop move KHÔNG đứng trong block đó; điều kiện gate đạt được vì loop `newShifts`/`shifts` chỉ có nội dung khi `parsedSchedule` truthy (shifts chỉ được `applyShiftsToRows` trong block). KHÔNG gộp `shifts + newShifts` (loại trừ nhau: I6 có `shifts=[]`, non-I6 có `newShifts=[]` — điều kiện I6 `:478-482`). `shifts` đã order `createdAt, id` ASC (`:172-174`) khớp thứ tự `applyShiftsToRows`. Cùng 2 statement delete-collision + update, cùng batch nguyên tử (guard CASE đếm shift của lesson-insert bảo vệ cả batch).
2. **A đảo ngược pin test non-I6 của describe #659 có chủ ý.** Test "non-I6 (shift có sẵn): activation KHÔNG move lesson_material (semantics #658)" (`holidays.test.ts:847-889`) pin hành vi cũ — được viết lại (đổi tên + comment lý do mới) thành pin hành vi #662 (material DI CHUYỂN). Đây là reversal có chủ ý của semantic "teacher gắn vào shift có sẵn là dữ liệu thật": sau activation D không còn buổi thật, move mới là đúng ý.
3. **B — tái dụng error code `SESSION_HOLIDAY` (409)**; web map có sẵn (`apps/web/src/lib/repos/materials.ts:195-196`). Copy hiện nói "không gắn hoặc gỡ tài liệu được" — sai cho bucket mới (detach chủ ý 200) → sửa copy thành "không gắn tài liệu được" (Phase 3; không test nào pin message cũ — đã grep).
4. **B — KHÔNG tighten `isHolidayBucket` và KHÔNG sửa `resolveSession`**: check mới đặt trong **route body** POST attach (sau `resolveSession` ~`:931`) và PUT upload (~`:981`); detach (`:1035`) không đụng. Tighten chung sẽ 409 detach → material path-2 cũ thành mồ côi không thể dọn.
5. **B giữ đủ 3 điều kiện (có "shift row") + orgId đầy đủ**: predicate `isShiftedHolidayBucket` = EXISTS(lesson holiday) ∧ NOT EXISTS(lesson khác) ∧ EXISTS(class_session) ∧ EXISTS(shift `original_date = date`, filter orgId + classId). Bucket rỗng (0 lesson) KHÔNG bị chặn — cửa sổ path-1 hợp lệ + pin #660.
6. **Guard CASE là NHÁNH OR, không phải AND-append**: `CASE WHEN (điều kiện hiện có) OR (EXISTS holiday AND NOT EXISTS non-holiday AND EXISTS class_session AND EXISTS shift originalDate=date) THEN NULL ELSE date END`. AND-append vào conjunction hiện có là dead code cho bucket mục tiêu (điều kiện hiện có yêu cầu `NOT EXISTS class_session`) và tắt guard #645 cho trạng thái all-holiday ∧ không-cs ∧ có-shift. Hai race fallback (`:957`, `:1012`) đổi thành `isHolidayBucket(...) || isShiftedHolidayBucket(...)` — giờ reachable.
7. **C — badge "đã dời" cho bucket 0 lesson → follow-up issue riêng** (red-team: `ClassSessionsSection` không nhận shift data — props `class-sessions-section.tsx:53-100`; `sessionStatus` có 11 call sites / 6 files — `class-sessions.ts:461`; cần extension payload server + plumbing prop, không phải slice nhỏ). PR này chỉ sửa copy web (decision 3).
8. **Orphan transport legacy không thêm EXISTS gate**: link material tại D không còn lesson/class_session nào (cs đã bị xóa, link sót) sẽ được move sang D′ — chấp nhận có chủ ý (nhất quán pattern #659 `:584-621` không có gate), ghi comment + non-goal; population legacy nằm ngoài 2 path của #662.

## Non-goals

- Move `class_session` (quyết định #1 plan #659 giữ nguyên — shift row là nguồn truth).
- Move material cho **cancel** rows (`cancelStatements` cố ý không move; A chỉ loop shifts). T7 pin vị trí cuối khi makeup trúng cancel.
- Backfill legacy mồ côi từ trước fix (theo #659; query audit one-off nếu cần).
- Đổi `holidayBucketLocked` / `bucketMoved` của kernel; đổi `resolveSession` / `isHolidayBucket`.
- Badge "đã dời" web + extension payload shift cho class-detail → follow-up issue [#665](https://github.com/vinh19410/teacher-os/issues/665) (red-team finding; slice thật = server payload + prop plumbing + 11 call sites review).
- e2e full suite (mode beta — không bắt buộc theo AGENTS.md).
- Modal cảnh báo attach mới trên web (409 message của B đủ).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD — activation non-I6 kéo lesson_material theo shift có sẵn](./phase-01-non-i6-move.md) | Pending |
| 2 | [Phase 2: TDD — chặn attach/upload vào bucket đã-shift (detach giữ 200)](./phase-02-attach-guard.md) | Pending |
| 3 | [Phase 3: Web copy fix + gates cuối](./phase-03-web-copy-gates.md) | Pending |

## Success Criteria

- [x] Pha đỏ Phase 1: T1, T2, T3, T5, T6, T7 + pin-test viết lại FAIL; T4 GREEN ngay (evidence: `vitest run -t "#662"` → `7 failed | 1 passed`, mọi fail là assert material kẹt ngày gốc; T5 fail ở assert trung gian trước undo).
- [x] Sau fix Phase 1: 8 test describe `#662` (T1–T7 + pin viết lại) GREEN; còn lại describe #645/#658/#659 không đổi màu (evidence: `holidays.test.ts` 47/47 passed; `materials.test.ts` 28/28).
- [x] Pha đỏ Phase 2: T8, T9, T12 FAIL (cell (1,1,1) đang 201); T10, T11 GREEN ngay (evidence: `vitest -t "#662"` trên materials.test.ts → `3 failed | 2 passed`; fail đúng cell `{"holidayLesson":true,"classSession":true,"shiftRow":true}`).
- [x] Sau fix Phase 2: attach/upload bucket 3-điều-kiện → 409 `SESSION_HOLIDAY`; detach 200; bucket rỗng attach 201; matrix T12 đúng grid (evidence: materials + holidays `80/80 passed`; full routes suite `36 files, 526/526`).
- [ ] Phase 3: copy web mới hiển thị; `pnpm check`, `pnpm check-types`, full server + web suite pass.

## Advisory Log

- Checkpoint sau điều tra (`/ak-debug`): kongming GO cho A (2 sửa: bỏ gộp loop, thêm gate `parsedSchedule`), B (predicate riêng + fallback ×2), C in-scope slice badge. Rủi ro yank mới phát hiện: schedule legacy → move thiếu gate tạo mồ côi tại D′.
- Checkpoint sau plan gates: kongming spawn FAIL — Cursor `USAGE_PRICING_REQUIRED` (Opus 5.5 không còn weekly usage; không tự chế model ID thay thế). Advisory miss được ghi nhận (non-fatal per protocol); gates chính thức đã đạt: validate OK, red-team 3 reviewer (fresh context) + sweep 0 mâu thuẫn. Plan kế thừa counsel của checkpoint đầu.
- Red-team 3 reviewer (Security/Failure/Assumption, 2026-11-10): 12 findings sau dedup — 2 Critical (pin test #659; matrix T11 + guard CASE AND-append), 3 High, 7 Medium/Low. 10 Accept, 2 Accept-modified (C cắt badge → follow-up; copy fix thay vì đổi code). Chi tiết bảng dưới.

## Red Team Review

### Session — 2026-11-10 (3 reviewer: Security Adversary, Failure Mode Analyst, Assumption Destroyer)
**Findings:** 12 sau dedup (10 accepted [2 modified], 2 merged vào findings khác)
**Severity breakdown:** 2 Critical, 3 High, 7 Medium/Low

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Pin test #659 "non-I6 KHÔNG move" (`holidays.test.ts:847-889`) mâu thuẫn trực tiếp với fix — Success Criteria "không đổi màu" bất khả thi | Critical | Accept | Phase 1 Task 1.1 + plan Success Criteria |
| 2 | T11 matrix "7 tổ hợp 201" sai: (1,0,·) đã 409 qua `isHolidayBucket`, (0,0,·) đã 404 `SESSION_NOT_FOUND` | Critical | Accept | Phase 2 Task 2.1 (T12 grid) |
| 3 | Guard CASE AND-append = dead code cho bucket mục tiêu + tắt guard #645 cho all-holiday∧¬cs∧shift; phải OR-branch + orgId trong EXISTS shift | High | Accept | Phase 2 Task 2.2 step 4 |
| 4 | Check mới đặt trong route bodies, KHÔNG trong `resolveSession` (detach dùng chung) | Medium | Accept | Phase 2 Task 2.2 steps 2-3, 6 |
| 5 | Copy `SESSION_HOLIDAY` sai ("hoặc gỡ") trong khi detach chủ ý 200 | Medium | Accept (modified: sửa copy 1 dòng, giữ code) | Phase 3 Task 3.1 |
| 6 | Badge: `ClassSessionsSection` không nhận shift data; `sessionStatus` 11 call sites / 6 files; "không fetch API mới" sai | High | Accept (modified: cắt badge → follow-up issue) | plan.md decision 7 + Non-goals |
| 7 | T5 RED self-satisfying — thiếu intermediate assertion trước undo | Medium | Accept | Phase 1 Task 1.1 step 5 |
| 8 | Phase 2 seed spec: `seedMaterial` không tồn tại trong materials.test.ts (`seedBankMaterial` `:1194`); thiếu link `lesson_material` cho T10 detach | Medium | Accept | Phase 2 Task 2.1 step 1 |
| 9 | Third loop chỉ ra sai vị trí (`statements` tại `:543`, ngoài block `if`) — phải nằm sau loop `newShifts` trong retry loop | Medium | Accept | Phase 1 Task 1.2 step 1 + plan decision 1 |
| 10 | Orphan transport (link tại D không còn session) không có EXISTS gate | Medium | Accept (modified: comment + non-goal, không gate) | plan decision 8 |
| 11 | shift+cancel composition untested; makeup trúng cancel → material gắn bucket cancelled | Medium | Accept (modified: thêm T7 pin vị trí cuối) | Phase 1 Task 1.1 step 6 |
| 12 | Line-citation drift (`deleteHolidayReq` `:1256`; helper `:61/:87`; describe #659 kết thúc `:916`; `F10` khai báo local; "4 chỗ" → 6 bề mặt kể cả web twin `class-sessions.ts:375-377`) | Low | Accept | Toàn bộ plan files |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-non-i6-move.md, phase-02-attach-guard.md, phase-03-web-copy-gates.md (viết lại sau adjudication).
- Decision deltas checked: 8 (pin rewrite; matrix grid; OR-branch guard; route-body insert; copy fix; badge cut; T7 composition; third-loop placement).
- Reconciled stale references: 5 (Success Criteria rewrite; Non-goals thêm badge/orphan-gate; citations refresh; phase-03 retitle; decision 1 placement).
- Unresolved contradictions: 0.
