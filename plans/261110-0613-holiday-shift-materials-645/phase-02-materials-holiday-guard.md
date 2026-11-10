---
phase: 2
title: "Server — chặn mutating routes vào buổi holiday"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Server — chặn mutating routes vào buổi holiday

## Goal

POST attach, PUT upload-file và DELETE detach vào buổi `lesson.status = 'holiday'` trả 409 nghiệp vụ `SESSION_HOLIDAY`; GET list materials vẫn 200 (modal đang mở trên buổi vừa bị apply shift không vỡ khi render); buổi `cancelled` giữ nguyên hành vi.

## Files to Create / Modify

- Modify: `apps/server/src/routes/materials.ts` — hàm `resolveSession` (:391), routes POST `/classes/:classId/sessions/:date/materials` (:845), PUT `.../materials/files` (:884), DELETE `.../materials/:materialId` (:928).
- Modify: `packages/api/src/material-contracts.ts` — thêm `"SESSION_HOLIDAY"` vào `MATERIAL_ERROR_CODES` (:232-241) (RT-Security F3: `materialError` yêu cầu `code: MaterialErrorCode` derive từ union này).
- Modify: `apps/web/src/lib/repos/materials.ts` — BẮT BUỘC thêm case `SESSION_HOLIDAY` vào switch `materialErrorMessage` (:137-190, hiện `default: break` + fallback theo status): RT-Assumption F2 — web test hiện có (`apps/web/src/lib/repos/materials.test.ts:79-90`) assert từng code trong union có message riêng và khác fallback, thiếu case là test web đỏ; message gợi ý: "Buổi này là buổi nghỉ lễ đã dời lịch — không gắn/gỡ tài liệu được".
- Modify: `apps/server/src/routes/materials.test.ts` — thêm test attach/upload/detach vào holiday.

## Tasks & Steps

### Task 2.1 — Test đỏ: mutating routes chặn buổi holiday (TDD red)

- Goal: test chứng minh hiện tại attach/upload/detach vào buổi holiday vẫn thành công (200/201) — phải trở thành 409 `SESSION_HOLIDAY`.
- Target files: `apps/server/src/routes/materials.test.ts` (trong `describe("material bank and session materials")`).
- Steps:
  1. Setup: tạo lesson với `status: "holiday"` cho một (orgId, classId, date) có sẵn fixture (xem cách test hiện tại tạo lesson/class — dùng helper/pattern trong file). Chú ý DELETE detach dùng `resolveSession` với `requireLesson: false` nên không cần dòng lesson — nhưng để test đúng footgun thật, dùng buổi holiday có dòng lesson.
  2. Test attach (POST): tạo `material` trong ngân hàng, POST `/classes/:classId/sessions/:date/materials` — assert `res.status === 409` và body `code === "SESSION_HOLIDAY"` (hoặc `error === "SESSION_HOLIDAY"` theo shape response của `materialError`).
  3. Test upload (PUT `.../materials/files`): route là PUT raw-bytes (header `X-File-Name`), KHÔNG multipart — helper `upload()` đã có sẵn trong file test (`materials.test.ts:778, 812` dùng cho đúng route này). Bắt buộc test `upload(...)` vào buổi holiday → 409 `SESSION_HOLIDAY` (RT-Security F4: không chấp nhận hedge "bỏ test upload").
  4. Test detach (DELETE): gắn sẵn `lessonMaterial` vào buổi holiday rồi DELETE — assert 409 `SESSION_HOLIDAY`.
  5. Test GET list: GET `/classes/:classId/sessions/:date/materials` trên cùng buổi holiday — assert 200 và trả `items` (kể cả rỗng) — khóa requirement "GET không chặn".
  6. Chạy test — phải FAIL (đỏ).
- Success criteria: test 409 mới fail vì hiện tại trả 201/200; test GET list có thể đã pass (không phải red target).
- Verify: lệnh test materials exit khác 0 với assertion failure ở assert 409 — đỏ là kỳ vọng.

### Task 2.2 — Implement guard opt-in trong `resolveSession`

- Goal: kiểm status `holiday` chỉ khi route mutating yêu cầu — không chặn GET.
- Target files: `apps/server/src/routes/materials.ts`, hàm `resolveSession` (:391) và 3 route mutating.
- Steps:
  1. Mở rộng options của `resolveSession`: `options: { requireLesson?: boolean; rejectHoliday?: boolean } = {}`.
  2. Guard holiday dùng bucket-semantics khớp web (kongming plan-gate B: web coi buổi là holiday khi MỌI dòng đều holiday — `class-sessions.ts:461-476`; `session-curriculum-materials.ts:64,70` và planner cùng nghĩa; RT-Security F2 đúng vấn đề nhưng EXISTS-any sai nghĩa — ngày trộn sẽ hiện nút UI mà server 409): khi `rejectHoliday === true`, chặn khi `EXISTS (lesson holiday tại date) AND NOT EXISTS (lesson non-holiday tại date)` — tức cả bucket đều holiday, không dùng status của dòng đầu `limit(1)`. SELECT 2 mệnh đề exists trong 1 query. CÓ → trả `{ ok: false, response: materialError(c, 409, "SESSION_HOLIDAY") }`.
  2b. Test ngày trộn (kongming B): bucket có 1 dòng `holiday` + 1 dòng non-holiday → attach trả 201 (không 409) — neo semantics bucket khớp web.
  3. Đăng ký code lỗi: thêm `"SESSION_HOLIDAY"` vào `MATERIAL_ERROR_CODES` trong `packages/api/src/material-contracts.ts:224-240` (union `MaterialErrorCode` derive từ nó — thiếu là `check-types` fail).
  4. POST attach (:845) và PUT files (:884): đổi call thành `resolveSession(c, db, ctx.orgId, { rejectHoliday: true })`.
  5. DELETE detach (:928): đổi thành `resolveSession(c, db, ctx.orgId, { requireLesson: false, rejectHoliday: true })` — vẫn cho gỡ liên kết mồ côi trên buổi KHÔNG còn dòng lesson, nhưng chặn buổi holiday.
  6. GET list (:820): KHÔNG đổi call — giữ `resolveSession(c, db, ctx.orgId)` mặc định.
  7. `cancelled` không thêm nhánh — hành vi giữ nguyên.
  8. Comment tiếng Việt: nêu lý do không chặn trong GET (modal đang mở trên buổi vừa bị apply shift phải render được) và lý do bucket-semantics (khớp `allHoliday` của web — ngày trộn vẫn attach được).
- Success criteria: 3 route mutating chặn holiday bằng opt-in flag; GET list không đổi; test Task 2.1 xanh.
- Verify: lệnh test materials exit 0, toàn bộ `materials.test.ts` pass.

### Task 2.3 — Khép cửa sổ TOCTOU bằng guard INSERT-CASE (RT-Failure F4, kongming plan-gate A)

- Goal: apply shift chen giữa check và insert không còn tạo được liên kết mồ côi MỚI vào buổi holiday (window lớn nhất: PUT upload stream lên R2 nhiều giây; hậu quả — link không detach được vì Task 2.2 chặn, không xóa được khỏi ngân hàng vì `MATERIAL_IN_USE` `materials.ts:269-271`).
- Target files: `apps/server/src/routes/materials.ts` — POST attach (:845) và PUT files batch (:884-924).
- Mechanism (kongming A — ĐỪNG dùng INSERT…SELECT, `.onConflictDoNothing()` :868 làm 0-dòng mơ hồ giữa holiday/ALREADY_ATTACHED/FK-missing, và nhánh catch `MATERIAL_NOT_FOUND` :870-874 sẽ chết): áp mẫu guard INSERT-CASE của `shiftStatements` (`holidays.ts:318-327`) lên cột NOT NULL `lessonMaterial.date` — lỗi NOT NULL KHÔNG bị `ON CONFLICT DO NOTHING` nuốt → batch fail → rollback sạch; `ALREADY_ATTACHED` và đường FK giữ nguyên.
- Steps:
  1. Định nghĩa biểu thức guard dùng chung trong file (SQL): `CASE WHEN EXISTS (SELECT 1 FROM lesson WHERE org_id/class_id/date khớp AND status = 'holiday') AND NOT EXISTS (SELECT 1 FROM lesson WHERE org_id/class_id/date khớp AND status != 'holiday') THEN NULL ELSE ${date} END` — bucket-semantics giống Task 2.2.2.
  2. POST attach: `.values({ ..., date: sql`<guard CASE>` })` thay cho `date` hằng. Trong `catch` (:870-874), trước nhánh `MATERIAL_NOT_FOUND`: re-check holiday status của (classId, date) — nếu cả bucket holiday → trả 409 `SESSION_HOLIDAY` (thua race); không thì giữ logic cũ.
  3. PUT files: trong batch (:906), `lessonMaterial` insert dùng cùng `date: sql`<guard CASE>` (không cần statement UPDATE `material.title` thêm). Trong `catch` (:914-920): re-check holiday — nếu cả bucket holiday → trả 409 `SESSION_HOLIDAY` thay vì 500 "upload failed"; không thì giữ logic cũ.
  4. Không thêm automated test cho race window (không có seam chạy concurrent request trong vitest hiện có) — điều kiện guard neo bằng review + SQL đúng; ghi vào PR description.
  5. Comment tiếng Việt nêu rõ: guard CASE chặn race giữa `resolveSession` check và insert, rollback nguyên tử; re-check trong catch để map lỗi NOT NULL race → 409 nghiệp vụ.
- Success criteria: `pnpm check-types` exit 0; các test Task 2.1 vẫn xanh; guard SQL có trong diff; test `ALREADY_ATTACHED` (:716) và `MATERIAL_NOT_FOUND` vẫn xanh.
- Verify: lệnh test materials exit 0; review SQL trong diff khớp mẫu guard CASE `shiftStatements`.

## Verification

- Lệnh test `materials.test.ts` exit 0 với test mới: attach 409, detach 409, GET list 200, upload 409.
- `pnpm --filter web test materials` exit 0 (mapping `SESSION_HOLIDAY` có message riêng — RT-Assumption F2).
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
