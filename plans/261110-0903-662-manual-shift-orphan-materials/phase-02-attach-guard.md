---
phase: 2
title: "Chặn attach/upload vào bucket đã-shift (detach giữ 200)"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Chặn attach/upload vào bucket "all-holiday + class_session + shift row" (TDD)

## Goal

POST attach và PUT upload vào bucket thỏa cả 3 điều kiện (lesson `holiday` tồn tại, không lesson khác, có `class_session` cùng ngày, có `holiday_session_shift.originalDate` = ngày đó) → 409 `SESSION_HOLIDAY` kể cả race; detach và bucket rỗng (0 lesson) giữ nguyên hành vi — không tighten `isHolidayBucket`, không sửa `resolveSession`.

## Files to Create / Modify

- Modify: `apps/server/src/routes/materials.ts` (predicate mới cạnh `isHolidayBucket` `:397-425`; `holidayBucketDateGuard` `:437-449`; route POST attach `:928-` và PUT upload `:978-`; 2 race fallback `:957`, `:1012`)
- Modify: `apps/server/src/routes/materials.test.ts` (describe `#662` mới; harness sẵn có: `createLink` `:311`, `createFolder` `:321`, `seedBankMaterial` `:1194`, `upload` `:286`, `json(sessionPath(...))` `:1195`, auth `x-test-user` `:249-252`). **Không có `seedMaterial` trong file này** — helper đó chỉ có ở holidays.test.ts.

## Failure Protocol

Nếu bất kỳ bước Verify nào không đạt pass condition: DỪNG phase này. Không tự sửa thử, không retry mù, không suy luận vòng quanh. Spawn subagent `kongming` với: phase + task id, các bước đã chạy, lệnh chạy đúng và output đầy đủ, pass condition không đạt. Áp dụng hướng dẫn rồi chạy lại Verify. Nếu không spawn được `kongming`, DỪNG và báo nguyên evidence cho user. Không tiếp tục bằng tự suy luận.

## Tasks & Steps

### Task 2.1 — RED: test attach/upload/detach/matrix trong materials.test.ts

- Goal: chứng minh path 2 đang cho attach vào ngày đã shift; khóa rủi ro vô tình khóa detach/bucket-rỗng.
- Target files: `apps/server/src/routes/materials.test.ts` — describe `#662: chặn attach vào ngày đã shift (path 2)`.
- Steps:
  1. Viết seed builder MỚI trong describe (không tái dụng seed lớp-manual nào có sẵn — file này chưa có): `seedShiftedManualBucket(classId, {holidayLesson, classSession, shiftRow})` tạo: class manual (`schedulingMode: "manual"`, schedule JSON hợp lệ), `class_session` tại F3 khi `classSession`, enrollment active + `lesson` status `holiday` tại F3 khi `holidayLesson` (enrollment cần làm FK của lesson), shift row `F3→F9` + holiday row FK khi `shiftRow`, `seedBankMaterial("mat-...")` trong ngân hàng, và **link `lesson_material` tại F3** (INSERT thẳng) — link cần cho T10 detach (không có link detach trả 404 `NOT_ATTACHED`, không phải 200). Mỗi test dùng classId riêng để matrix độc lập.
  2. **T8 (attach path-2):** seed đủ 3 điều kiện → POST attach qua app tại F3 → expect `409` + body error code `SESSION_HOLIDAY` (đọc shape `materialError` để assert đúng field).
  3. **T9 (upload path-2):** seed đủ 3 điều kiện → PUT upload file tại F3 (mẫu request `upload` `:286`) → expect `409 SESSION_HOLIDAY`.
  4. **T10 (pin detach — GREEN ngay):** seed đủ 3 điều kiện + link tại F3 → DELETE detach → expect `200` (khóa: predicate KHÔNG áp detach; legacy path-2 phải gỡ được).
  5. **T11 (pin bucket rỗng — GREEN ngay):** seed với `holidayLesson: false` (0 lesson; giữ class_session + shift row) → POST attach → expect `201` (khóa cửa sổ path-1 + #660).
  6. **T12 (matrix 2³ — expect exact status MỖI cell):** parametrize 8 tổ hợp `{lessonHoliday, classSession, shiftRow}` × POST attach:
     - `409`: `(1,0,0)`, `(1,0,1)` — hiện có qua `isHolidayBucket` (all-holiday không cs); `(1,1,1)` — MỚI qua predicate.
     - `201`: `(1,1,0)`, `(0,1,0)`, `(0,1,1)`.
     - `404` `SESSION_NOT_FOUND`: `(0,0,0)`, `(0,0,1)` — bucket không có lesson lẫn class_session (hiện có, `materials.ts:496-513`).
     Ghi comment: 5/8 cell là hành vi hiện có (pin chống regression); chỉ cell `(1,1,1)` là hành vi mới.
  7. Verify RED: T8, T9, T12 (cell `(1,1,1)`) FAIL (hiện attach/upload 201); T10, T11 PASS; 7 cell còn lại của T12 PASS ngay.
- Success criteria: chạy file test — đúng 3 FAIL (T8, T9, T12) / 2 PASS (T10, T11).
- Verify: `pnpm --filter server exec vitest run src/routes/materials.test.ts -t "#662"` — exit non-zero với đúng T8, T9, T12 failed; T10, T11 passed. Toàn bộ pass là failure (chưa đỏ).

### Task 2.2 — GREEN: predicate riêng + guard CASE OR-branch + 2 fallback

- Goal: attach/upload vào bucket 3-điều-kiện bị chặn server-side kể cả race; detach và bucket rỗng không đổi.
- Target files: `apps/server/src/routes/materials.ts`.
- Steps:
  1. Thêm `async function isShiftedHolidayBucket(db, orgId, classId, date)` NGAY CẠNH `isHolidayBucket`: `EXISTS(lesson holiday tại date, filter orgId+classId)` ∧ `NOT EXISTS(lesson status != 'holiday' tại date)` ∧ `EXISTS(class_session tại date)` ∧ `EXISTS(holiday_session_shift WHERE orgId = ... AND classId = ... AND original_date = date)`. Comment cross-reference: bucket-semantics giờ nằm ở **6 bề mặt** — `isHolidayBucket` (`:397`), predicate mới, `holidayBucketDateGuard` (`:438`, 2 call site), nhánh `rejectHoliday` của `resolveSession` (`:470-474`), web twin `isHolidayBucket` tại `apps/web/src/lib/class-sessions.ts:375-377` (không carve-out, không shift-aware — chỉ update comment nhắc, không đổi hành vi web) — drift ở đây là bug lặng; citation #658/#662.
  2. Route POST attach: ngay SAU block `resolveSession` thành công (~`:931`), thêm `if (await isShiftedHolidayBucket(db, ctx.orgId, classId, date)) return materialError(c, 409, "SESSION_HOLIDAY");`. **KHÔNG đặt check này trong `resolveSession`** — detach dùng chung nó (`:1035-1038`).
  3. Route PUT upload: thêm cùng check cùng vị trí (~`:981`).
  4. `holidayBucketDateGuard` (~`:437-449`): đổi WHEN thành **OR-branch** `CASE WHEN (điều kiện hiện có) OR (EXISTS holiday AND NOT EXISTS non-holiday AND EXISTS class_session AND EXISTS shift orgId+classId+original_date=date) THEN NULL ELSE date END` — giữ orgId trong mọi subquery (đồng bộ anh em `:443-448`). AND-append vào conjunction hiện có là dead code cho bucket mục tiêu (điều kiện hiện có yêu cầu `NOT EXISTS class_session`) và tắt guard #645 cho trạng thái all-holiday∧¬cs∧có-shift. Cập nhật JSDoc hàm theo semantics mới.
  5. **2 race fallback** (catch attach `:957`, catch upload `:1012`): đổi `isHolidayBucket(...)` → `(await isHolidayBucket(...)) || (await isShiftedHolidayBucket(...))` — guard CASE giờ có thể fail vì OR-branch mới trong khi `isHolidayBucket` trả false; giữ fallback không thì lỗi rơi xuống 404 material/folder gây nhiễu.
  6. KHÔNG sửa: `isHolidayBucket`, `resolveSession`, route DELETE (detach), kernel (`holidayBucketLocked`/`bucketMoved`).
- Success criteria: T8, T9, T12 GREEN; T10, T11 vẫn GREEN; toàn bộ materials.test.ts + holidays.test.ts xanh.
- Verify: `pnpm --filter server exec vitest run src/routes/materials.test.ts src/routes/holidays.test.ts` — exit 0, 0 failed.

## Verification

- `pnpm --filter server exec vitest run src/routes/` — exit 0 (toàn bộ routes suite, không failed).
