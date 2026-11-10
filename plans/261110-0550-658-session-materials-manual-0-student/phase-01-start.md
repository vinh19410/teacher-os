---
phase: 1
title: "Regression test + fix resolveSession + move-session"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Regression test + fix resolveSession + move-session

## Goal

`resolveSession` trong `apps/server/src/routes/materials.ts` chấp nhận buổi tồn
tại khi có dòng `lesson` **hoặc** `class_session` cùng `(orgId, classId, date)`,
sau khi một regression test TDD chứng minh bug 404 hiện tại.

## Files to Create / Modify

- Modify: `apps/server/src/routes/materials.test.ts` (thêm 2 test, không sửa test cũ)
- Modify: `apps/server/src/routes/materials.ts` (hàm `resolveSession` ~:391 + import)
- Modify: `apps/server/src/routes/kernel.ts` (chỉ block move trong route occurrence
  edit ~:2207-2268: nới `bucketMoved` + đổi thứ tự câu `update(classSession)`
  trong batch — không đụng phần khác của kernel)

Chạy lệnh từ root worktree. KHÔNG sửa file nào khác.

## Tasks & Steps

### Task 1.0 — Chụp baseline gates (trước khi sửa bất cứ gì)

- Goal: biết trước trạng thái xanh/đỏ của 3 gate ở commit gốc, để phân biệt
  lỗi do diff này với nợ có sẵn khi Task 1.3 chạy.
- Steps:
  1. Chạy lần lượt: `pnpm check`; `pnpm check-types`; `pnpm --filter server test`.
  2. Ghi lại exit code từng lệnh vào journal/ghi chú session.
- Success criteria: có record exit code của cả 3 lệnh TRƯỚC khi sửa file.
- Verify: so sánh — nếu cả 3 exit 0 thì baseline sạch; nếu lệnh nào exit ≠ 0,
  ghi lại output đúng nguyên văn (dùng ở Failure Protocol của Task 1.3).
- Verify type: pure measurement, không sửa file — verification needed vì kết
  quả là điều kiện tiên quyết cho Task 1.3 adjudication.

### Task 1.1 — Regression test đỏ (TDD red)

- Goal: test mới fail với đúng assertion 404 hiện tại, chứng minh bug.
- Target files: `apps/server/src/routes/materials.test.ts` — thêm test cuối cùng
  trong describe `material bank and session materials` (sau test
  "a link left behind by a deleted session…", trước comment block
  `material delete guard + curriculumMaterials (#655)` ~:1143).
- Steps:
  1. Trong test mới, chèn 2 dòng fixture bằng `db.insert` (đúng pattern beforeAll
     hiện có, nhưng tạo ngay trong test để cô lập):
     - `schema.classTable`: `{ ...classBase, id: "class-manual", name: "Manual 0 HV" }`
       với `classBase` giống object trong `beforeAll` (orgId "org-1", level "6.5",
       type "ielts", skills '["reading"]', mode "Online",
       schedule '{"days":[1],"start":"18:00","end":"20:00"}', sessionsTotal 4,
       sessionsDone 0, status "active", startDate "2026-11-01", notes ""). Lớp này
       KHÔNG có enrollment nào.
     - `schema.classSession`: `{ id: "cs-manual", orgId: "org-1", classId: "class-manual", date: "2026-11-15", time: "18:00", dur: 120, topic: "Buổi manual", zoom: "" }`
       — đây đúng là trạng thái kernel tạo cho lớp manual 0 học viên
       (`kernel.ts` ~:2505: luôn insert `class_session`, chỉ insert `lesson` cho
       enrollment active).
  2. Tạo 1 link trong ngân hàng bằng helper `createLink("Tài liệu buổi manual")`
     (đã có sẵn, trả 201).
  3. Negative control (chống over-widening — red-team): GET list và POST attach
     trên `class-manual` với ngày `2026-11-16` (KHÔNG có `lesson` lẫn
     `class_session`) → expect 404 với body chứa `SESSION_NOT_FOUND`. Resolve
     không được "coi lớp thuộc org là buổi tồn tại". Negative control này phải
     PASS ngay ở trạng thái đỏ (nó khoá hành vi 404 đúng, không thuộc bug).
  4. Gọi 4 route teacher trên `/api/classes/class-manual/sessions/2026-11-15/materials`:
     - GET list → expect 200, parse JSON, expect `items` rỗng **và**
       `curriculumMaterials` rỗng (buổi manual không có dòng `lesson` nên phần
       suy #655 phải là `[]`);
     - POST attach `{ materialId }` của link (helper `json`) → expect 201;
     - GET list lại → expect 200 và `items` chứa đúng materialId vừa attach;
     - PUT upload (helper `upload`) → expect 201.
  5. Bất biến câu chuyện #658 (red-team): GV gắn tài liệu TRƯỚC khi có học viên
     → học viên đầu tiên thấy tài liệu sau activation. Mô phỏng output của
     activation cho ca này bằng `db.insert` (đặt id tường minh như pattern
     `enr-cur`/`l-cur-*` ở materials.test.ts:907-925): `schema.enrollment`
     `{ id: "enr-manual", orgId: "org-1", classId: "class-manual", studentId: "stu-1", status: "active" }`
     + `schema.lesson` `{ id: "l-manual", enrollmentId: "enr-manual", classId:
     "class-manual", date: "2026-11-15", orgId: "org-1", day/time/dur giống
     lessonBase trong beforeAll }` — đúng shape activation sinh từ
     `classSession` (`apps/server/src/routes/enrollment-activation.ts:395-412`,
     `date: cs.date`). Rồi GET student route (pattern test "students: enrolled
     student reads…" materials.test.ts:816, header `x-test-user: student-1`)
     → expect 200 và payload chứa materialId của link đã attach ở bước 4.
  6. DELETE detach (helper `del`) materialId của link → expect 200; DELETE lần
     nữa → expect 404 (`NOT_ATTACHED`).
  7. Đặt tên test: `test("lớp manual 0 học viên: buổi chỉ có class_session — GET/attach/upload/detach không 404 (#658)", ...)` — student-visibility là
     assertion trong cùng test này, KHÔNG tách test riêng (một kịch bản nghiệp
     vụ, dễ theo dõi đúng thứ tự đời thực).
  8. Test này PHẢI đứng SAU test move (Task 1.1b) và là test cuối cùng của
     describe `material bank and session materials` (vị trí sau "a link left
     behind…" là đúng): nó ghi danh stu-1 vào class-manual — state dùng chung,
     không chuyển test khác xuống sau nó.
- Success criteria: chạy file test, test mới FAIL tại assertion đầu tiên (GET
  list bước 4 nhận 404 thay vì 200) — đúng 3 route teacher (GET/POST/PUT) đang
  404 `SESSION_NOT_FOUND`; các assertion trước đó (negative control) đã pass.
  Lưu ý: vitest dừng test ở assertion fail đầu tiên nên các bước sau (attach,
  upload, student, detach) CHƯA chạy ở trạng thái đỏ — không dùng chúng làm
  bằng chứng gì ở pha này.
- Verify: `pnpm --filter server exec vitest run src/routes/materials.test.ts`
  thoát khác 0 với output chứa `#658` và `expected 404 to be` (vitest in
  received-first: `expect(res.status).toBe(200)` nhận 404 → `expected 404 to be
  200`), các test cũ vẫn pass. Đây là trạng thái đỏ CẦN THIẾT: test pass ngay
  từ đầu là sai (không tái hiện bug); assertion fail thuộc negative control
  (bước 4) cũng là sai — negative control phải pass ngay từ đầu.

### Task 1.1b — Regression test move-session (TDD red, kèm kernel fix Task 1.2b)

- Goal: test chứng minh dời buổi manual 0 học viên hiện KÉO tài liệu theo
  (sau Task 1.2b); ở trạng thái đỏ test này fail vì attach 404 (và nếu chỉ fix
  resolveSession mà quên kernel, test sẽ fail ở assertion "GET ngày đích có
  tài liệu" — bắt đúng bug mồ côi).
- Target files: `apps/server/src/routes/materials.test.ts` — chèn NGAY TRƯỚC
  test #658 (Task 1.1), trong cùng describe; fixture độc lập, không đụng stu-1.
- Steps:
  1. Fixture: `db.insert(schema.classTable)` `{ ...classBase, id: "class-manual-2", name: "Manual Move" }` (không enrollment) và
     `db.insert(schema.classSession)` `{ id: "cs-manual-2", orgId: "org-1", classId: "class-manual-2", date: "2026-11-20", time: "18:00", dur: 120, topic: "Buổi dời", zoom: "" }`.
  2. `createLink("Tài liệu buổi dời")` → POST attach vào
     `/api/classes/class-manual-2/sessions/2026-11-20/materials` → expect 201.
  3. Dời buổi (đúng pattern test "moving a session date carries its materials
     along" materials.test.ts:1082): POST `/api/classes/class-manual-2/sessions/2026-11-20/edit`
     body `{ moveDate: "2026-11-21" }` → expect 200.
  4. GET `.../2026-11-21/materials` → expect 200, `items` chứa link đã attach;
     GET `.../2026-11-20/materials` → expect 404 (`SESSION_NOT_FOUND`).
  5. Chứng minh `lesson_material` dời theo buổi, không 409 sai: DELETE
     `/api/materials/<linkId>` khi còn gắn ở buổi mới → 409 `MATERIAL_IN_USE`
     là ĐÚNG (đang dùng thật); chuỗi assert: gỡ link khỏi ngày cũ
     (`DELETE .../2026-11-20/materials/<linkId>`) → expect 404 (row không còn
     ở chỗ cũ); gỡ khỏi ngày mới → 200; xoá ngân hàng → 200.
  6. Đặt tên: `test("lớp manual 0 học viên: dời buổi kéo tài liệu theo (#658)", ...)`.
- Success criteria: trạng thái đỏ (chỉ sau Task 1.1, trước Task 1.2): test fail
  ở bước 2 (attach 404). Sau Task 1.2 + 1.2b: test pass toàn bộ.
- Verify: sau toàn bộ fix, `pnpm --filter server exec vitest run src/routes/materials.test.ts`
  thoát 0 và hai test `#658` đều pass (count trong output tăng đúng số test mới).

### Task 1.2 — Fix `resolveSession` (TDD green)

- Goal: chế độ mặc định của `resolveSession` coi buổi tồn tại khi có `lesson`
  HOẶC `class_session`; `requireLesson: false` giữ nguyên.
- Target files: `apps/server/src/routes/materials.ts`.
- Steps:
  1. Thêm import: `import { classSession } from "@teacher-os/db/schema/class-session";`
     (alphabetical đúng biome: cạnh `import { classTable } ...` hiện có ở :21).
  2. Trong `resolveSession` (~:391), giữ nguyên đoạn `requireLesson === false`.
     Sau query `lesson` mà KHÔNG thấy dòng nào, thêm query thứ hai trên
     `classSession` với điều kiện `and(eq(classSession.orgId, orgId), eq(classSession.classId, classId), eq(classSession.date, date))`
     — thấy → `return { ok: true, classId, date }`; không thấy → giữ 404
     `SESSION_NOT_FOUND` hiện có.
  3. Cập nhật doc comment hàm thành: "Lớp thuộc org + ngày là một buổi có thật
     (có dòng `lesson` hoặc `class_session` — #658: buổi manual lớp 0 học viên
     chỉ có `class_session`)."
- Success criteria: test mới Task 1.1 pass; toàn bộ test cũ trong file pass
  (buổi có `lesson` không đổi hành vi).
- Verify: `pnpm --filter server exec vitest run src/routes/materials.test.ts`
  thoát 0, output chứa `Test Files  1 passed` và `Tests` với count = tổng số
  test file (không test nào skip/fail).

### Task 1.2b — Fix move-session kéo `lesson_material` theo (kernel)

- Goal: dời buổi chỉ có `class_session` phải dời cả `lesson_material` cùng
  batch; hành vi dời buổi có `lesson` giữ nguyên.
- Target files: `apps/server/src/routes/kernel.ts` — CHỈ block move trong route
  occurrence edit (~:2207-2268), hai điểm:
  1. Nới điều kiện `bucketMoved` (~:2222): mệnh đề thứ hai từ
     `exists (select 1 from lesson ... date = <đích>)` thành
     `exists (select 1 from lesson where ... date = <đích>) OR exists (select 1 from class_session where ... date = <đích>)`
     (drizzle: bọc hai `sql` bằng `or(...)` từ drizzle-orm, giữ mệnh đề
     `not exists ... date = <gốc>` không đổi).
  2. Đổi thứ tự trong `statements`: chuyển câu `update(classSession)` lên NGAY
     SAU `occurrenceUpdate` (vị trí [1]). Phần tử [0] PHẢI vẫn là
     `occurrenceUpdate` — `updatedRows` lấy từ kết quả phần tử đầu
     (`const [updatedRows] = await db.batch(statements)`). Lý do đổi thứ tự:
     `bucketMoved` là subquery đánh giá lúc chạy từng câu trong batch; câu
     `lessonMaterial` phải thấy `class_session` đã ở đích mới thoả điều kiện.
  Tính không đổi cho lớp có `lesson`: pre-check đích đã 409 khi đích còn
  bucket; sau khi `occurrenceUpdate` chạy, đích có `lesson` → mệnh đề OR mới là
  no-op, `bucketMoved` vẫn đúng như cũ. Các câu `holidaySessionShift`,
  delete/update `lessonMaterial` giữ nguyên vị trí logic (delete đích → update
  gốc→đích).
- Success criteria: test Task 1.1b pass; test cũ "moving a session date carries
  its materials along" (materials.test.ts:1080) + manual-sessions.test.ts pass.
- Verify: `pnpm --filter server exec vitest run src/routes/materials.test.ts src/manual-sessions.test.ts`
  thoát 0.

### Task 1.3 — Gates toàn repo

- Goal: mọi gate local sạch trước khi review/ship.
- Steps:
  1. `pnpm check` — biome check chỉ ĐỌC, exit ≠ 0 khi có lỗi lint/format
     (`package.json:23`). Nếu exit ≠ 0 vì lỗi của chính diff này: chỉ sửa
     trong phạm vi 2 file scope —
     `pnpm exec biome check --write apps/server/src/routes/materials.ts apps/server/src/routes/materials.test.ts`
     — rồi chạy lại `pnpm check`. CẤM chạy `--write` toàn repo (biến thể
     `check:fix`) vì sẽ chạm file ngoài scope.
  2. `pnpm check-types`.
  3. `pnpm --filter server test` (toàn bộ test server).
- Adjudication với baseline (Task 1.0): gate exit ≠ 0 nhưng lỗi tái hiện y
  nguyên ở baseline và KHÔNG thuộc 2 file scope → ghi nhận là nợ có sẵn,
  báo cáo trong PR, KHÔNG dừng phase; lỗi ở 2 file scope hoặc lỗi mới xuất
  hiện so với baseline → xử lý trong scope, nếu không xử lý được mới kích
  hoạt Failure Protocol.
- Success criteria: ba lệnh thoát 0; HOẶC mọi exit ≠ 0 đã được adjudication
  theo quy tắc baseline ở trên (nợ có sẵn, ngoài scope).
- Verify: so sánh exit code từng lệnh với baseline; khi exit 0, `pnpm --filter
  server test` output chứa `Test Files` với tổng passed, 0 failed.

## Verification

- [x] Task 1.0 Verify: exit code 3 gate đã được ghi lại trước khi sửa file.
- [x] Task 1.1 Verify: test đỏ với assertion `expected 404 to be` trên test #658; negative control pass.
- [x] Task 1.1b Verify: ở trạng đỏ test move fail ở attach (bước 2); sau fix pass.
- [x] Task 1.2 Verify: `pnpm --filter server exec vitest run src/routes/materials.test.ts` exit 0.
- [x] Task 1.2b Verify: `pnpm --filter server exec vitest run src/routes/materials.test.ts src/manual-sessions.test.ts` exit 0.
- [x] Task 1.3 Verify: `pnpm check` && `pnpm check-types` && `pnpm --filter server test` đều exit 0 (hoặc đã adjudication theo baseline).

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

Baseline exception (Task 1.0): a Task 1.3 gate failure that matches the recorded
baseline — same failing test name(s), or the same error code plus `file:line`
from biome/tsc — and touches no file in this phase's scope is pre-existing
debt; report it in the PR description and continue; it is not a Verify failure
of this phase. (Never compare raw vitest output byte-for-byte: timings and test
order differ between runs.)
