---
phase: 1
title: "Server — shift dời tài liệu + undo dời ngược"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Server — shift dời tài liệu + undo dời ngược

## Goal

Apply holiday shift di chuyển toàn bộ `lesson_material` từ `originalDate` sang `makeupDate` (nguyên tử trong batch guard hiện có); DELETE holiday dời ngược toàn bộ về `originalDate` với rule trùng materialId giữ bản ngày gốc.

## Files to Create / Modify

- Modify: `apps/server/src/routes/holidays.ts` — hàm `shiftStatements` (:312) và undo block DELETE holiday (:827-840).
- Modify: `apps/server/src/routes/holidays.test.ts` — thêm test apply/undo mới, cập nhật test cũ "DELETE kỳ nghỉ shift: liên kết tài liệu đã gắn vào buổi bù bị dọn cùng buổi bù" (~:1190).

## Tasks & Steps

### Task 1.1 — Test đỏ: apply dời `lesson_material` (TDD red)

- Goal: test chứng minh hành vi hiện tại sai (tài liệu kẹt ở originalDate) để làm mỏ neo regression.
- Target files: `apps/server/src/routes/holidays.test.ts` (trong `describe("POST /api/holidays (apply)")` hoặc describe mới kề theo pattern sẵn có).
- Steps:
  1. Tham khảo setup của test "DELETE kỳ nghỉ shift…" (:1190): dùng helper `previewHash` + `apply(app, { ...draft(), planHash })`, sau apply query `schema.lesson` lấy classId/orgId của buổi bù tại `F9`.
  2. Trước khi apply, insert `schema.material` + `schema.lessonMaterial` vào ngày gốc của shift (dùng `date` = originalDate của shift trong `draft()`, chính là ngày gốc có dòng lesson).
  3. Apply holiday với 1 shift. Assert: `lesson_material` WHERE date = originalDate có độ dài 0; WHERE date = makeupDate có độ dài 1 với cùng `materialId` (cột `position` giữ nguyên).
  4. Chạy test — phải FAIL vì hiện tại tài liệu không dời (đỏ).
- Success criteria: test chạy ra assertion failure đúng ở bước assert apply (không phải lỗi setup).
- Verify: `pnpm --filter server test holidays.test.ts` (hoặc lệnh test tương ứng trong `apps/server/package.json`) thoát khác 0 với assertion failure ở assert apply — test đỏ là trạng thái kỳ vọng, passing ở bước này là thất bại của TDD.

### Task 1.2 — Test đỏ: undo dời ngược + rule trùng materialId (TDD red)

- Goal: test khóa contract undo mới: mọi `lesson_material` ở makeupDate quay về originalDate; materialId trùng bản ngày gốc → giữ bản ngày gốc, mất bản ngày bù.
- Target files: `apps/server/src/routes/holidays.test.ts`.
- Steps:
  1. Scenario A (dời ngược): apply holiday với shift có tài liệu ở ngày gốc (Task 1.1), attach thêm 1 tài liệu khác vào `makeupDate` sau apply, rồi `deleteHolidayReq(app, holidayId)`. Assert sau undo: originalDate có đủ 2 tài liệu, makeupDate = 0.
  2. Scenario B (RT-Failure F3: rule trùng materialId KHÔNG quan sát được ở trạng thái đỏ — delete-all và cleanup+move-back cho kết quả giống nhau trên originalDate khi trùng; chỉ có ý nghĩa sau khi Task 1.3 đã implement) → chuyển thành test xanh trong Task 1.4, KHÔNG đưa vào red phase.
  2b. Scenario C (cleanup-orphan chạy TRƯỚC move — không PK-violate, kongming: thêm mồ côi KHÔNG trùng): TRƯỚC apply, insert 2 mồ côi ở `makeupDate` — `materialId = M` (sẽ trùng với tài liệu M ở originalDate) và `materialId = X` (không trùng, mô phỏng mồ côi cũ). Apply. Assert: cả 2 mồ côi ở makeupDate bị xoá (DELETE-all, đúng pattern moveDate — mồ côi X không được kéo vào buổi bù), dòng M đã dời từ originalDate sang makeupDate. Trạng thái đỏ (apply không move): M kẹt ở originalDate, X còn sống ở makeupDate → assertion fail.
  3. Cập nhật test cũ :1190 "DELETE kỳ nghỉ shift: liên kết tài liệu đã gắn vào buổi bù bị dọn cùng buổi bù": đổi assertion — sau DELETE holiday, `lessonMaterial` ở makeupDate = 0 nhưng dòng tài liệu quay về originalDate (=1) và `schema.material` vẫn còn. Đổi tên test theo hành vi mới (ví dụ "…dời ngược về buổi gốc").
  4. Chạy test — phải FAIL (đỏ).
- Success criteria: các test mới + test cũ sửa chạy ra assertion failure đúng ở assert undo.
- Verify: cùng lệnh Task 1.1, exit khác 0 với assertion failure — đỏ là kỳ vọng.

### Task 1.3 — Implement apply: 2 statement vào `shiftStatements`

- Goal: trong cùng batch guard, dọn mồ côi trùng materialId ở makeupDate rồi dời toàn bộ `lesson_material` originalDate → makeupDate.
- Target files: `apps/server/src/routes/holidays.ts`, hàm `shiftStatements` (:312-370), mảng trả về.
- Steps:
  1. Thêm statement 1 (cleanup-orphan, đặt TRƯỚC statement move — thứ tự chạy theo thứ tự mảng): `DELETE FROM lesson_material WHERE orgId = orgId AND classId = shift.classId AND date = shift.makeupDate` — xoá TOÀN BỘ dòng ở makeupDate, KHÔNG subquery (kongming plan-gate: pattern `moveDate` thật `kernel.ts:2246-2255` xoá cả ngày đích; guard apply đảm bảo makeupDate có 0 dòng lesson nên mọi dòng ở đó đều mồ côi — bao gồm cả mồ côi không trùng, tránh kéo mồ côi cũ vào buổi bù hiển thị cho học sinh).
  2. Thêm statement 2 (move, pattern `bucketMoved` của `kernel.ts:2229-2265`):
     ```ts
     db.update(lessonMaterial).set({ date: shift.makeupDate }).where(and(
       eq(lessonMaterial.orgId, orgId),
       eq(lessonMaterial.classId, shift.classId),
       eq(lessonMaterial.date, shift.originalDate),
     ))
     ```
     Không cần điều kiện `bucketMoved` thêm: guard CASE ở INSERT đầu batch đã làm cả batch fail khi trạng thái lệch (lưu ý nói đúng — kongming: shift guard chỉ kiểm `count(upcoming) = N`, không có zero-check non-upcoming như cancel guard :383, nhưng planner đã lọc ngày trộn khi lập preview `holiday-plan.ts:176-188` nên khe hở chỉ còn race hiếm).
  3. Comment tiếng Việt theo hiện trạng, nêu rõ pattern `moveDate` (DELETE-all ngày đích + move) và không cần `bucketMoved`.
- Success criteria: `shiftStatements` trả về 5 statement; test Task 1.1 xanh.
- Verify: lệnh test Task 1.1 exit 0 và test apply mới pass.

### Task 1.4 — Implement undo: move-back thay delete-all

- Goal: xóa holiday không mất tài liệu — dời ngược toàn bộ `lesson_material` từ makeupDate về originalDate, trùng materialId giữ bản ngày gốc.
- Target files: `apps/server/src/routes/holidays.ts`, undo block :827-840 (trong vòng `for (const { shift } of shiftCounts)`).
- Steps:
  1. Thay statement `db.delete(lessonMaterial).where(... eq(lessonMaterial.date, shift.makeupDate))` hiện tại bằng 2 statement theo đúng thứ tự:
     - DELETE cleanup-trùng: `lessonMaterial` ở `makeupDate`, scope `orgId = ctx.orgId` (bắt buộc — invariant mọi statement `lesson_material` trong file, RT-Security F5), điều kiện `materialId IN (SELECT materialId FROM lesson_material WHERE orgId = ctx.orgId AND classId = shift.classId AND date = originalDate)` (dòng trùng bị xóa → bản ngày gốc được giữ).
     - UPDATE move-back: `SET date = originalDate WHERE orgId = ctx.orgId AND classId = shift.classId AND date = makeupDate` (không điều kiện thêm — guard UPDATE `organizationHoliday.name` CASE ở đầu batch làm cả batch rollback khi lệch).
  2. Giữ nguyên các statement lesson (DELETE makeup lesson, UPDATE originalDate holiday→upcoming) sau 2 statement trên — thứ tự tài liệu không phụ thuộc lesson (không FK), nhưng giữ ổn định để review dễ.
  3. Cập nhật comment tiếng Việt tại chỗ xóa cũ (comment "Buổi bù bị xoá thì tài liệu đã gắn vào ngày đó cũng phải đi theo…" hiện mô tả delete-all — viết lại theo move-back + rule trùng).
  4. Test xanh Scenario B (rule trùng — RT-Security F1 + RT-Failure F3): apply holiday VỚI tài liệu ở ngày gốc (Task 1.3 đã dời M sang makeupDate), sau apply insert TRỰC TIẾP dòng M vào `originalDate` (mô phỏng M xuất hiện lại ở ngày gốc — collision tồn đọng). Undo. Assert: originalDate giữ đúng 1 dòng materialId M, makeupDate = 0 (cleanup-trùng xóa bản makeup, move-back không PK-violate). Test này chỉ chạy sau khi Task 1.3 + 1.4 hoàn tất — ở trạng thái đỏ setup sẽ PK-violate, đúng như ghi chú Task 1.2.2.
- Success criteria: undo block không còn `DELETE lessonMaterial WHERE date = makeupDate` đơn lẻ; test Task 1.2 (A + C + test cũ sửa) xanh; test xanh Scenario B (bước 4) xanh.
- Verify: lệnh test Task 1.1 exit 0, toàn bộ `holidays.test.ts` pass (không test nào fail ngoài những test đã sửa chủ đích).

## Verification

- `pnpm --filter server test holidays.test.ts` (hoặc `pnpm --filter @teacher-os/server test src/routes/holidays.test.ts` — tra tên package trong `apps/server/package.json`) exit 0, bao gồm test mới apply/undo + test cũ đã sửa.
- `pnpm check-types` exit 0.

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
