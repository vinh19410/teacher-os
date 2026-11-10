---
title: "Fix #659: activation holiday shift kéo lesson_material theo buổi bù"
description: "Activation nhánh I6 tự sinh shift cho lớp manual nhưng bỏ qua lesson_material — thêm cleanup-trùng + move material vào cùng batch nguyên tử."
status: completed
priority: P1
effort: 2h
issue: 659
branch: vinh19410/fix/holiday-shift-activation-materials-659
tags: [bugfix, backend, database]
blockedBy: []
blocks: []
created: 2026-11-10
---

# Fix #659: activation holiday shift kéo lesson_material theo buổi bù

## Overview

Lớp manual 0 học viên chỉ có `class_session` + `lesson_material` (bucket theo `(classId, date)`); chưa có dòng `lesson`. Holiday apply qua route không sinh shift cho lớp này (guard đếm lesson), nên khi học viên đầu tiên activate, nhánh I6 của `activateEnrollment` tự sinh shift D→D′ (planner trên rows sinh từ `class_session`), biến buổi gốc thành `holiday` và thêm buổi bù `upcoming` ở D′ — nhưng batch không có câu nào đụng `lesson_material`, tài liệu kẹt ở D: học viên thấy buổi bù D′ trống tài liệu, teacher vẫn attach tiếp vào D được (carve-out `class_session` của `isHolidayBucket`, #658).

Fix: trong nhánh I6, khi push statement insert `holiday_session_shift` cho từng newShift, push thêm cặp statement dọn-trùng + move `lesson_material` D→D′ (pattern `shiftStatements` #645 đã merge ở PR #661), cùng batch nguyên tử. KHÔNG move `class_session`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Activation I6 kéo `lesson_material` từ ngày gốc sang ngày bù (cleanup-trùng + move, nguyên tử) | P1 |
| 2 | Regression tests: AC core (kịch bản issue), undo round-trip, cleanup-trùng, boundary-pin non-I6 | P1 |
| 3 | Không đổi hành vi non-I6 (shift có sẵn) — semantics #658 giữ nguyên | P1 |

## Quyết định thiết kế (đã counsel kongming — GO)

1. **Move chỉ `lesson_material`, không move `class_session`.** "Đồng bộ class_session" trong issue đọc là "đồng bộ trạng thái". Lý do: (a) `applyShiftsToRows` tái áp shift từ DB ở mỗi activation sau (non-I6, `enrollment-activation.ts:451`) — move `class_session` làm shift row D→D′ thành rác và 2 học viên có pattern lesson lệch nhau; (b) phá đối xứng undo — undo route (`holidays.ts:838-910`, gồm guard CASE-not-null trên `organization_holiday.name` ở `:841-859` và move-back material ở `:868-898`) chỉ đụng lesson/lesson_material, không restore `class_session`; (c) invariant hiện hành: holiday không đụng `class_session`, chỉ teacher occurrence-move (`kernel.ts` moveDate) đổi nó.
2. **Thứ tự per-shift là load-bearing:** DELETE-trùng materialId ở makeupDate **trước** UPDATE move, push tuần tự trong loop `for (const shift of newShifts)` (không gom hết DELETE rồi hết UPDATE) — shift chuỗi (makeup kỳ trước trúng kỳ sau) cần thấy ghi của câu trước trong cùng transaction; test 5 describe #659 bẫy đúng case gom-sai. Sai thứ tự → PK conflict `(classId, date, materialId)` → rollbackable → 3 retry cùng lỗi → activation 500.
3. **Material statements nằm trong cùng `statements` array trước `db.batch`** — atomicity kế thừa guard CASE NOT NULL của lesson insert. Không chạy move sau batch success.
4. **Non-I6 giữ nguyên** (không move material khi shifts có sẵn) — move sẽ yank dữ liệu teacher gắn hợp lệ, vi phạm #658.
5. **Cancellation (I6) không move material** — nhất quán non-goal #645 (cancel không có buổi bù).

## Non-goals (follow-up issues riêng, không nằm trong PR này)

- Lỗ hổng tồn dư: re-activation sau xóa enrollment / attach-sau-shift ở lớp manual (carve-out `class_session` của `isHolidayBucket`) — domain #645/#658.
- Legacy mồ côi từ activation chạy trước fix — không backfill; kèm query báo cáo one-off.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD — test đỏ + fix nhánh I6](./phase-01-fix.md) | Pending |
| 2 | [Phase 2: Gates + follow-up issues + projection](./phase-02-gates.md) | Pending |

## Success Criteria

- [ ] Pha đỏ: test 1, 2, 3, 5 fail (`Tests  36 passed, 4 failed`) — test 2 fail tại assertion trung gian trước undo; test 4 pass ngay (non-I6).
- [ ] 5 test mới xanh sau fix trong `holidays.test.ts` (`Tests  40 passed`); suite holidays + materials không đổi màu.
- [ ] `pnpm check`, `pnpm check-types`, full server suite pass.
- [ ] 2 follow-up issues đã tạo với label `ai-handle` + quan hệ blocked-by đúng.

## Validation Log

### Verification Results
- Claims checked: 19 (Fact Checker inline của planner + 2 reviewer Light tier)
- Verified: 15 | Failed: 4 (đã sửa plan) | Unverified: 1 (baseline số test server suite — bỏ số cứng, dùng "không failed")

#### Failures (đã sửa)
1. [Assume-F1] Makeup date của test I6 lớp manual 1 buổi = F3+7, không phải F9 (planner quét từ `maxTeachingDate+1` theo thứ) — sửa: seed đủ 8 `class_session` cho mọi test đi qua planner I6.
2. [Sec-F1 + Assume-F2] Red matrix "4 failed" bất khả thi; test 2 vacuous — sửa: assertion trung gian trước undo; matrix đúng = test 1, 2, 3, 5 fail / test 4 pass.
3. [Assume-F6] Symbol `cancelStatements` không tồn tại (thật: loop `for (const cancel of newCancels)`); seed test 3 mâu thuẫn — sửa cả hai.
4. [Assume-F5] `pnpm check` là read-only (`package.json:23`), AGENTS.md stale — sửa Task 2.1.

## Red Team Review

### Session — 2026-11-10
**Findings:** 9 (6 accepted [2 modified], 3 rejected)
**Severity breakdown:** 2 Critical, 3 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Red matrix bất khả thi — test 2 không thể fail trước fix | Critical | Accept | Phase 1 Task 1.2 |
| 2 | Makeup date test sai — planner không chọn F9 cho lớp 1 buổi | Critical | Accept | Phase 1 Task 1.2 |
| 3 | Test 2 vacuous — thiếu assertion trung gian trước undo | High | Accept | Phase 1 Task 1.2 |
| 4 | Thứ tự per-shift "load-bearing" không có test qua I6 (I3 là non-I6) | High | Accept (thêm test 5 chuỗi, dup tại đích cuối F10) | Phase 1 Task 1.2 |
| 5 | DELETE cleanup "clobber" bản teacher tại ngày bù có `class_session` | High | Reject gate NOT-EXISTS (gây PK conflict → rollback → 500); Accept modified: ghi chú hành vi "bản move thắng" trong comment code — nhất quán scenario C #645 đã merge | Phase 1 Task 1.3 |
| 6 | Test 4 seed shift FK `holidayId` không có holiday row | Medium | Accept | Phase 1 Task 1.2 |
| 7 | Trích dẫn undo route sai (`:846-886` → `:838-910` + guard name) | Medium | Accept | plan.md Quyết định #1 |
| 8 | Query audit issue B tự loại đúng population (filter `NOT EXISTS class_session`) | Medium | Accept (query mới có cột `has_class_session`) | Phase 2 Task 2.2 |
| 9 | Route-level test ownership student accept | Medium | Reject — ownership guard có test riêng của student routes; org-scoping của 2 statement mới structurally safe (filter `orgId` + `classId`); ngoài scope regression của fix | — |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-fix.md, phase-02-gates.md (viết lại sau adjudication).
- Decision deltas checked: 6 (5 tests thay 4; red matrix 36/4; makeup = F9 qua seed 8 buổi; query audit mới; `pnpm check` read-only; trích dẫn undo `:838-910`).
- Reconciled stale references: 2 ("4 test mới" → "5 test mới" ở Success Criteria và Task 2.3; số test verify 39 → 40).
- Unresolved contradictions: 0.

<!-- slug: 659-activation-holiday-shift-materials -->
