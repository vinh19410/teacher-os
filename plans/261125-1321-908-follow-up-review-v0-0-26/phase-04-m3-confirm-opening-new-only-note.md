---
phase: 4
title: "Phase 4: M3 — Confirm-Opening new_only Note Persistence"
status: completed
priority: P2
effort: 1h
dependencies: []
---

# Phase 4: M3 — Confirm-Opening `new_only` Note Persistence

## Goal

Đồng bộ hóa `class.openingNote` trong DB với `input.note` khi `POST /api/classes/:id/confirm-opening` chạy chế độ `new_only` và có học viên mới (`targets.length > 0`) thông qua CAS update khóa cả `openingAnnouncementVersion` lẫn `openingNote` (không xóa trắng `openingNote` nếu caller bỏ qua field `note`), đảm bảo bất biến `DB.openingNote === response.openingNote === email.teacherNote` mà vẫn giữ nguyên `openingAnnouncementVersion`, `openingConfirmedAt` và hành vi no-op khi `targets.length === 0`.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (`classConfirmOpeningSchema.note` chuyển sang `.optional()` để phân biệt omit `note` với gửi chuỗi rỗng `""`)
- Modify: `packages/api/src/class-opening-email.test.ts` (cập nhật assertion lines 357-382 theo `note?: string`)
- Modify: `apps/server/src/routes/kernel.ts` (`POST /classes/:id/confirm-opening`, lines 2535-2820)
- Modify: `apps/server/src/confirm-opening.test.ts`

## Tests Before (TDD Red Phase)

### Task 4.1 — Cập nhật & bổ sung failing tests trong `apps/server/src/confirm-opening.test.ts`
<!-- Updated: Red Team Session 1 - add omitted-note preservation test and real mid-flight CAS miss race test (mutating DB between findClass and UPDATE) instead of early-guard phantom test -->
- **Goal:** Khóa rõ hợp đồng `new_only`: persist `openingNote` khi truyền `note` mới và `targets.length > 0`, giữ nguyên `cls.openingNote` khi omit `note` hoặc `targets.length === 0`, và thực thi thật nhánh CAS miss `!updatedNoteRow` khi lớp bị thay đổi đồng thời giữa `findClass` và `UPDATE`.
- **Target files and symbols:** `apps/server/src/confirm-opening.test.ts` (`handles CAS conflicts, new_only idempotent send, and all-student update broadcast`, cộng test mới cho omitted `note` và mid-flight CAS conflict).
- **Steps:**
  1. Tại dòng 693 của `apps/server/src/confirm-opening.test.ts`, đổi assertion `expect(newOnlyBody.openingNote).toBe("Lần đầu khai giảng")` thành `expect(newOnlyBody.openingNote).toBe("Chào mừng học viên mới")`, bổ sung assertion:
     - `expect(t.sentMails[0]?.html).toContain("Chào mừng học viên mới");`
     - Đọc lại DB (`schema.classTable`) xác nhận `openingNote === "Chào mừng học viên mới"`, đồng thời `openingAnnouncementVersion === 1` và `openingConfirmedAt === "2026-05-01T08:00:00.000Z"`.
  2. Giữ nguyên test `new_only with 0 new students -> 200, 0 queued, leaves class untouched` (dòng 944-977) để bảo vệ invariant không ghi đè `openingNote` khi `targets.length === 0`.
  3. Thêm test case `"new_only preserves existing openingNote when note is omitted, and rejects mid-flight CAS conflict without sending emails"`:
     - Phần A (omitted `note`): chốt `initial` với `note: "Ghi chú gốc"`, thêm học viên mới `s2`, gọi `new_only` với `{ mode: "new_only", expectedVersion: 1 }` (**không truyền `note`**) -> assert `200`, `body.openingNote === "Ghi chú gốc"`, email gửi `s2` chứa `"Ghi chú gốc"`, DB `openingNote === "Ghi chú gốc"` (không bị xóa trắng!).
     - Phần B (mid-flight CAS race thật): thêm học viên mới `s3`, dùng DB wrapper (hoặc intercept `db.update` lần đầu để sửa `class.openingNote` thành `"Ghi chú từ tab khác"` ngay trước khi `UPDATE` thực thi — mô phỏng chính xác 2 tab `new_only` đồng thời) -> gọi `new_only` với `note: "Ghi chú xung đột"` -> assert `409` với `code: CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT`, `t.sentMails` có độ dài `0`, và DB giữ nguyên `"Ghi chú từ tab khác"`.
- **Success criteria:** Test chạy và thất bại đúng tại assertion `newOnlyBody.openingNote` và nhánh CAS conflict mới.
- **Verify:** `pnpm --filter server exec vitest run src/confirm-opening.test.ts` exits non-zero with assertion failure; passing test is a failure.

## Tasks & Steps

### Task 4.2 — Phân biệt omitted `note` và persist `openingNote` qua CAS trong `packages/api/src/contracts.ts` & `apps/server/src/routes/kernel.ts`
<!-- Updated: Red Team Session 1 - make note optional in classConfirmOpeningSchema so omitted note in new_only preserves cls.openingNote; add eq(classTable.openingNote, cls.openingNote) to CAS WHERE clause -->
- **Goal:** Tránh xóa trắng `openingNote` khi caller bỏ qua `note` ở `new_only`, cập nhật `class.openingNote` bằng CAS (khóa `status`, `openingAnnouncementVersion`, `openingNote`) chỉ khi `input.mode === "new_only" && targets.length > 0 && effectiveNote !== cls.openingNote`, và dùng `persistedNote` cho cả email lẫn response.
- **Target files and symbols:**
  - `packages/api/src/contracts.ts` (`classConfirmOpeningSchema`)
  - `apps/server/src/routes/kernel.ts` (handler `kernel.post("/classes/:id/confirm-opening", ...)` tại dòng 2535-2820)
- **Steps:**
  1. Trong `packages/api/src/contracts.ts:289-293`, đổi `.default("")` của `classConfirmOpeningSchema.shape.note` thành `.optional()`.
  2. Trong `apps/server/src/routes/kernel.ts`:
     - Cập nhật doc comment ở dòng 2535-2541 nêu rõ: chế độ `new_only` giữ nguyên `startDate`, `openingConfirmedAt`, `openingAnnouncementVersion`; nếu caller truyền `note` mới và có học viên mới (`targets.length > 0`) thì cập nhật `openingNote` bằng CAS (khóa `status`, `openingAnnouncementVersion`, `openingNote`) trước khi gửi email.
     - Tính `const effectiveNote = input.note !== undefined ? input.note : input.mode === "new_only" ? cls.openingNote : "";`.
     - Trong nhánh `else` (`initial` / `all`, dòng 2647), dùng `openingNote: effectiveNote`.
     - Giữ nguyên bước lọc `targets` và early-return khi `input.mode === "new_only" && targets.length === 0` (dòng 2740-2760).
     - Ngay sau nhánh `if (input.mode === "new_only" && targets.length === 0)`, thêm nhánh CAS update khi `input.mode === "new_only" && effectiveNote !== cls.openingNote`:
       ```ts
       if (input.mode === "new_only" && effectiveNote !== cls.openingNote) {
       	const updatedNoteRows = await db
       		.update(classTable)
       		.set({ openingNote: effectiveNote })
       		.where(
       			and(
       				eq(classTable.id, classId),
       				eq(classTable.orgId, ctx.orgId),
       				eq(classTable.status, "active"),
       				eq(classTable.openingAnnouncementVersion, currentVersion),
       				eq(classTable.openingNote, cls.openingNote),
       			),
       		)
       		.returning({ openingNote: classTable.openingNote });
       	const updatedNoteRow = updatedNoteRows[0];
       	if (!updatedNoteRow) {
       		const stillExists = await findClass(db, classId, ctx.orgId);
       		if (!stillExists) {
       			return c.json({ error: "class not found" }, 404);
       		}
       		if (stillExists.status !== "active") {
       			return classPausedResponse(c);
       		}
       		return c.json(
       			{
       				error:
       					"Trạng thái chốt khai giảng của lớp vừa thay đổi, vui lòng tải lại.",
       				code: CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT,
       			},
       			409,
       		);
       	}
       	persistedNote = updatedNoteRow.openingNote;
       }
       ```
     - Tại lời gọi `classOpeningConfirmedEvents` (dòng 2779), đổi `teacherNote: input.note` thành `teacherNote: persistedNote` để bảo đảm tuyệt đối email và DB luôn dùng chung một nguồn sự thật `persistedNote`.
- **Success criteria:** Toàn bộ test `confirm-opening.test.ts` và `@teacher-os/api` contracts test pass; DB, response và HTML email trong `new_only` đồng nhất 100%.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm --filter server exec vitest run src/confirm-opening.test.ts` exits 0 with 0 failures.

## Tests After & Regression Gate

- `pnpm --filter @teacher-os/api test` exits 0.
- `pnpm --filter server exec vitest run src/confirm-opening.test.ts` exits 0.
- `pnpm --filter web exec vitest run src/components/modals/confirm-opening-modal.test.tsx` exits 0.

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
