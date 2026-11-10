---
phase: 1
title: "Activation non-I6 kéo lesson_material theo shift có sẵn"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Activation non-I6 kéo `lesson_material` theo shift có sẵn (TDD)

## Goal

`activateEnrollment` nhánh non-I6 (shift row có sẵn trong DB) move `lesson_material` từ `originalDate` sang `makeupDate` trong cùng batch nguyên tử — heal path 1 (re-activation sau xóa enrollment) và mọi material gắn trước activation — mà không yank khi `parsedSchedule` null.

## Files to Create / Modify

- Modify: `apps/server/src/routes/enrollment-activation.ts` (hàm `activateEnrollment`; phần lắp ráp `statements` khai báo tại `:543`, sau loop `for (const shift of newShifts)` `:549-621`, bên trong vòng retry)
- Modify: `apps/server/src/routes/holidays.test.ts` — module helpers có sẵn: `seedMaterial` `:61`, `lessonMaterialsAt` `:87`, `deleteHolidayReq` `:1256`, hằng `F1/F3/F9/SCHEDULE_A` `:47-50`; describe `#659` `:705-916` với `seedManualClassWith8Sessions` `:711`, `seedOrgShiftHoliday` `:737`, pin test non-I6 `:847-889`

## Failure Protocol

Nếu bất kỳ bước Verify nào không đạt pass condition: DỪNG phase này. Không tự sửa thử, không retry mù, không suy luận vòng quanh. Spawn subagent `kongming` với: phase + task id, các bước đã chạy, lệnh chạy đúng và output đầy đủ, pass condition không đạt. Áp dụng hướng dẫn rồi chạy lại Verify. Nếu không spawn được `kongming`, DỪNG và báo nguyên evidence cho user. Không tiếp tục bằng tự suy luận.

## Tasks & Steps

### Task 1.1 — RED: 7 test mới + viết lại pin test trong describe `#662` (holidays.test.ts)

- Goal: chứng minh hành vi hiện tại để lại material ở ngày gốc khi activation non-I6 áp shift; pin sẵn chống-yank.
- Target files: `apps/server/src/routes/holidays.test.ts` — thêm describe `#662: activation non-I6 kéo lesson_material theo shift có sẵn` NGAY SAU describe `#659` (kết thúc `:916`, describe kế `:918`). Khai báo `const F10 = addDaysISO(F1, 63);` trong describe (F10 KHÔNG phải hằng dùng chung — mỗi describe tự khai, mẫu `:706`).
- Steps:
  1. **T1 (path-1 core):** seed `seedManualClassWith8Sessions("cls-662", "csm-662")` + `seedMaterial("mat-662", "cls-662", F3)` + `seedOrgShiftHoliday("hol-662", F3, 1000)` + INSERT thẳng `schema.holidaySessionShift` `{classId: "cls-662", holidayId: "hol-662", originalDate: F3, makeupDate: F9, createdAt: new Date(1000)}` (FK cần holiday row — mẫu INSERT pin test `:859-867`) + enrollment `invited` "enr-662". Gọi `activateEnrollment(db, "org-1", "enr-662")`. Assert: `lessonMaterialsAt(F9)` = `["mat-662"]`, `lessonMaterialsAt(F3)` rỗng; lesson `F3` status `holiday`, `F9` status `upcoming`.
  2. **T2 (chuỗi 2 shift non-I6):** như T1 nhưng 2 shift row `F3→F9` (createdAt 1000) và `F9→F10` (createdAt 2000, 2 holiday row riêng để thỏa FK). Assert material đất `F10`, `F3` và `F9` rỗng — bẫy sai thứ tự createdAt.
  3. **T3 (non-I6 với existingClassLessons > 0):** như T1 + INSERT sẵn 1 `lesson` `upcoming` khác (enrollment "enr-other", date F4, cùng class) trước activation. Assert move vẫn chạy (phân biệt với điều kiện I6 đếm existing lessons).
  4. **T4 (gate parsedSchedule null — chống yank, GREEN NGAY từ đầu):** seed manual class với `schedule: "[]"` (parseStoredSchedule trả null — `packages/api/src/skeleton.ts:50-70`; cột `schedule` không có CHECK — seed DB trực tiếp được, `packages/db/src/schema/class.ts:24`) + 1 `class_session` tại F3 + shift row + material tại F3. Assert SAU activation: material VẪN ở F3, lesson F3 status `upcoming` (không holiday). Test này pin điều kiện gate — không tính vào red matrix.
  5. **T5 (undo round-trip, CÓ intermediate assertion):** như T1. Sau activation, assert trung gian TRƯỚC undo: `lessonMaterialsAt(F9)` = `["mat-662"]` (dòng này là thứ fail ở pha đỏ — mẫu `:818-822`). Rồi `deleteHolidayReq(app, "hol-662")` → assert material về `F3`, `F9` rỗng.
  6. **T6 (regression lớp auto-schedule):** lớp nhóm `SCHEDULE_A` (mẫu test nhóm có sẵn trong file) + shift row `F3→F9` + material legacy seed DB trực tiếp tại F3 + enrollment `invited`. Assert material về `F9` sau activation.
  7. **T7 (shift + cancel composition):** như T1 + INSERT `schema.holidaySessionCancel` `{classId, holidayId: hol-662, date: F9}` (cancel unique `(classId,date)` không xung đột shift unique `(classId,makeupDate)`). Assert material ĐẤT `F9` (vị trí cuối rõ ràng — makeup trúng cancel vẫn là đích move; lesson tại F9 status `cancelled`). Comment: convention này là chủ ý — if someone "sửa" loop bỏ qua makeup-cancelled, test bẫy.
  8. **Viết lại pin test non-I6 của describe #659** (`:847-889`, có chủ ý — reversal semantics, xem plan decision 2): đổi tên thành "non-I6 (shift có sẵn): activation kéo lesson_material theo shift (#662)"; flip 2 assert cuối thành `lessonMaterialsAt(F3)` rỗng + `lessonMaterialsAt(F9)` = `["mat-659p"]`; viết lại comment lý do ("sau activation D không còn buổi thật — `classSessionRows` không filter date, mọi generated row tại D bị `applyShiftsToRows` dịch; move khớp ý đồ teacher — #662").
  9. Verify RED: chạy lệnh dưới — T1, T2, T3, T5 (fail ở assert trung gian), T6, T7 + pin viết lại phải FAIL; T4 PASS.
- Success criteria: `pnpm --filter server exec vitest run src/routes/holidays.test.ts -t "#662"` — exit non-zero, output có đúng 7 test failed (T1, T2, T3, T5, T6, T7, pin rewritten) và 1 passed (T4). Toàn bộ pass là failure (chưa đỏ).
- Verify: lệnh trên; so sánh danh sách failed với danh sách bắt buộc.

### Task 1.2 — GREEN: thêm loop move non-I6 trong phần lắp ráp statements

- Goal: material theo shift row có sẵn trong cùng batch, có gate, đúng vị trí scope.
- Target files: `apps/server/src/routes/enrollment-activation.ts`.
- Steps:
  1. Trong phần lắp ráp `statements` (khai báo `:543`), thêm loop **thứ ba** NGAY SAU loop `for (const shift of newShifts)` (kết thúc `:621`, trước loop `for (const cancel of newCancels)`): `for (const shift of shifts)` push cặp statement giống hệt loop `newShifts` (`:584-621`): DELETE `lessonMaterial` trùng materialId ở `shift.makeupDate` (subquery materialId ở `shift.originalDate`, cả hai filter `orgId`) rồi UPDATE `set({date: shift.makeupDate})` where org+class+`originalDate`. Giữ thứ tự per-shift tuần tự (delete trước update mỗi shift). Loop này PHẢI nằm trong vòng retry (statements dựng lại mỗi attempt) — KHÔNG hoist ra ngoài, KHÔNG push một lần duy nhất.
  2. KHÔNG gộp `shifts + newShifts` thành một loop (loại trừ nhau — plan decision 1); KHÔNG đụng loop `newCancels`; KHÔNG move `class_session`; KHÔNG thêm EXISTS gate session (plan decision 8).
  3. Comment code: tham chiếu pattern `shiftStatements` #645 + lý do an toàn non-I6 (sau activation D không còn buổi thật: `classSessionRows` `:371-380` không filter date, mọi generated row tại D bị `applyShiftsToRows` `:47-68` dịch) + cảnh báo gate `parsedSchedule` (schedule legacy → lesson thật ở D, loop không chạy vì shifts chỉ áp trong block đó) + ghi nhận orphan-transport legacy được chấp nhận (decision 8).
  4. Verify GREEN: toàn bộ describe `#662` (8 test) pass; mọi describe khác trong file không đổi màu.
- Success criteria: 8/8 test `#662` GREEN, không test cũ nào khác đỏ.
- Verify: `pnpm --filter server exec vitest run src/routes/holidays.test.ts` — exit 0, 0 failed.

## Verification

- `pnpm --filter server exec vitest run src/routes/holidays.test.ts` — exit 0, 0 failed.
- `pnpm --filter server exec vitest run src/routes/materials.test.ts` — exit 0 (Phase 2 sẽ thêm test ở đây; Phase 1 không được làm đỏ).
