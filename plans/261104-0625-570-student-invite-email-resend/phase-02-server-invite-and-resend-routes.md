---
title: "Phase 2: Route gửi/gửi lại lời mời đồng bộ, cooldown và cờ portalLinked"
status: todo
---

# Phase 2: Route gửi/gửi lại lời mời đồng bộ, cooldown và cờ portalLinked

<!-- Updated: Red Team & Validation Session 1 - remove eager deps spread in app.ts, SELECT-before-CAS with Drizzle Date operators, cancel-reinvite cooldown, ta role block, in-place notification_record update, helpers.ts E2E type -->

## Overview

Nâng cấp tầng API server (`apps/server`) theo TDD:
1. Bỏ `{ ...deps }` object spread khi gắn `kernelRoutes` trong `apps/server/src/app.ts` và bọc đọc `deps.mailer` trong helper `resolveMailer(deps)` (dùng ở cả `kernel.ts` và `emit.ts`) để getter `mailer` trong `index.ts` không bao giờ kích hoạt sớm làm sập Worker cold-start.
2. `POST /api/students/invite`: chặn role chỉ-đọc `ta` (`403`), loại trừ `demo-student:%`, chặn lách cooldown 60 giây qua vòng lặp hủy-mời-lại, bắt race unique index trả `409` có cấu trúc, gửi email đồng bộ (`timeoutMs: 5_000`, `idempotencyKey: "student_invite:" + id`), và xóa bù trừ dòng `pending` nếu gửi lỗi (trừ khi học viên đã kịp `accepted` giữa chừng).
3. Mở rộng `snapshot.ts` trả `portalLinked: row.onboardingCompletedAt != null` và làm giàu body `409` của `POST /api/students/invite` + `POST /api/students`.
4. Ở `POST /api/students`: khi `normalizedEmail !== ""`, gửi email lời mời đồng bộ best-effort (`timeoutMs: 5_000`) cho cả nhánh lớp `!activateNow` (qua `enqueueNotifications` + giao đồng bộ bản ghi vừa tạo) lẫn nhánh `!cls || activateNow` (qua `buildStudentPortalInviteEmail`), chỉ đóng dấu `lastInviteEmailAt = now` khi gửi thật thành công và trả `inviteEmailSent: boolean` trung thực.
5. Thêm hai route gửi lại đồng bộ (`POST /api/students/invitations/:id/resend` và `POST /api/students/:id/resend-invite`) với quy trình `resolveMailer()` → `SELECT` bản ghi cũ → CAS `UPDATE ... returning({ id })` bằng toán tử `Date` của Drizzle (tương thích D1 + libsql) → gửi đồng bộ với `Idempotency-Key` mới → hoàn tác mốc thời gian nếu gửi lỗi, và cập nhật tại chỗ dòng `notification_record` `class_enrolled:<enrollmentId>` (không tạo bản ghi trùng lặp).

## Files to Create / Modify

- Modify: `apps/server/src/app.ts` (thêm `inviteResendCooldownMs?: number` vào `AppDeps`; truyền trực tiếp `kernelRoutes(deps)` không dùng `{ ...deps }` spread)
- Modify: `apps/server/src/lib/notifications/emit.ts` (export và dùng `resolveMailer(deps)` bọc `try/catch` quanh `deps.mailer`)
- Modify: `apps/server/src/routes/snapshot.ts` (trả `portalLinked: row.onboardingCompletedAt != null` trong `students`)
- Modify: `apps/server/src/routes/kernel.ts` (`POST /students`, `POST /students/invite`, `DELETE /students/invitations/:id`, thêm `POST /students/invitations/:id/resend` và `POST /students/:id/resend-invite`)
- Modify: `apps/server/src/student-invitation.test.ts`
- Modify: `apps/server/src/student.test.ts`
- Modify: `apps/e2e/src/boot.ts` (thêm `idempotencyKey: input.idempotencyKey ?? null` vào `base` của `recordingMailer` và truyền `inviteResendCooldownMs: 0`)
- Modify: `apps/e2e/specs/helpers.ts` (thêm `idempotencyKey?: string | null` vào `VerificationEmailEntry`)

## Requirements

- [x] **Bảo vệ getter `deps.mailer` và phân quyền role `ta`:**
  - Trong `apps/server/src/app.ts`, truyền `kernelRoutes(deps)` trực tiếp (không `{ ...deps }` để không gọi sớm `get mailer()`).
  - Trong `apps/server/src/lib/notifications/emit.ts`, export `resolveMailer(deps: { mailer?: Mailer }): Mailer | undefined` bọc `try { return deps.mailer; } catch (err) { const msg = err instanceof Error ? err.message : String(err); console.error("[mail] mailer unavailable:", sanitizeDeliveryError(msg).rawError); return undefined; }` và dùng trong cả `notificationDepsFrom` lẫn `kernel.ts`.
  - Trên các route ghi lời mời (`POST /students/invite`, `DELETE /students/invitations/:id`, `POST /students/invitations/:id/resend`, `POST /students/:id/resend-invite`), kiểm tra nếu `ctx.role === "ta"` thì trả `403` `{ error: "Trợ giảng không có quyền quản lý lời mời học viên", code: "FORBIDDEN" }` (khi `ctx.role` là `undefined` trong test harness cũ hoặc `"teacher"`/`"owner"`/`"admin"`/`"class_teacher"` thì cho phép).
- [x] **`POST /api/students/invite`:**
  - Kiểm tra `existingStudent` trong `ctx.orgId` có `sql\`${student.id} NOT LIKE 'demo-student:%'\`` → nếu có, trả `409` `{ error: "Học viên này đã ở trong tổ chức của bạn", code: ALREADY_IN_ORG, existingStudentId: existingStudent.id, existingStudentName: existingStudent.name, portalLinked: existingStudent.onboardingCompletedAt != null }`.
  - Kiểm tra `existingInvite` (`status = 'pending'`) → nếu có, trả `409` `{ error: "Lời mời đang chờ học viên phản hồi", code: INVITATION_ALREADY_PENDING, invitationId: existingInvite.id, updatedAt: existingInvite.updatedAt }`.
  - Chống lách luật hủy-mời-lại: nếu `cooldownMs > 0`, kiểm tra dòng `student_invitation` gần nhất của `(ctx.orgId, normalizedEmail)` (mọi `status`) có `updatedAt > new Date(nowMs - cooldownMs)` → nếu có, trả `429 RESEND_COOLDOWN` kèm header `Retry-After` và `retryAfterSeconds`.
  - Kiểm tra `const mailer = resolveMailer(deps)` **trước** khi ghi DB: nếu `!mailer`, trả `503` `{ error: "Hệ thống gửi email chưa sẵn sàng. Vui lòng thử lại sau.", code: EMAIL_UNAVAILABLE }`.
  - Chèn `student_invitation` (`status = 'pending'`) trong `try/catch`: nếu đụng unique race, truy vấn lại `existingStudent` / `existingInvite` để trả `409` có cấu trúc thay vì `500`.
  - Gọi `await mailer.send({ ..., idempotencyKey: \`student_invite:${id}\`, timeoutMs: 5_000 })`. Nếu ném lỗi: log lỗi đã che qua `sanitizeDeliveryError`, chạy `const deleted = await db.delete(studentInvitation).where(and(eq(studentInvitation.id, id), eq(studentInvitation.status, "pending"))).returning({ id: studentInvitation.id })`. Nếu `deleted.length === 0` và dòng đã chuyển sang `'accepted'` (học viên vừa bấm chấp nhận giữa chừng), trả `201` dòng hiện tại; ngược lại trả `502` `{ error: "Không gửi được email lời mời. Vui lòng kiểm tra địa chỉ email hoặc thử lại sau.", code: EMAIL_SEND_FAILED }`.
- [x] **`POST /api/students/invitations/:id/resend`:**
  - Kiểm tra `const mailer = resolveMailer(deps)` trước tiên → thiếu thì trả `503 EMAIL_UNAVAILABLE`.
  - `SELECT` dòng `existing` theo `(id, ctx.orgId)`. Nếu không có hoặc `existing.status !== "pending"` → trả `404 INVITATION_NOT_FOUND`.
  - Tính `previousUpdatedAt = existing.updatedAt` (kiểu `Date`). Nếu `cooldownMs > 0` và `previousUpdatedAt.getTime() > nowMs - cooldownMs`, trả ngay `429 RESEND_COOLDOWN` kèm `Retry-After` và `retryAfterSeconds`.
  - Thực hiện CAS bằng toán tử Drizzle `Date` chuẩn D1:
    ```ts
    const claimed = await db
      .update(studentInvitation)
      .set({ updatedAt: now })
      .where(
        and(
          eq(studentInvitation.id, id),
          eq(studentInvitation.orgId, ctx.orgId),
          eq(studentInvitation.status, "pending"),
          eq(studentInvitation.updatedAt, previousUpdatedAt),
        ),
      )
      .returning({ id: studentInvitation.id });
    ```
    Nếu `claimed.length === 0`: truy vấn lại để phân biệt `404` (đã hủy/chấp nhận) hay `429` (request song song vừa gửi trước).
  - Gọi `await mailer.send({ ..., idempotencyKey: \`student_invite:${id}:resend:${crypto.randomUUID()}\`, timeoutMs: 5_000 })`.
  - Nếu `mailer.send` ném lỗi: hoàn tác `await db.update(studentInvitation).set({ updatedAt: previousUpdatedAt }).where(and(eq(studentInvitation.id, id), eq(studentInvitation.status, "pending"), eq(studentInvitation.updatedAt, now)))` và trả `502 EMAIL_SEND_FAILED`.
  - Thành công: trả `200` `{ ok: true, id, updatedAt: now }`.
- [x] **`POST /api/students/:id/resend-invite`:**
  - Đọc body qua `resendStudentInviteSchema` (chấp nhận `{}` hoặc `{ enrollmentId }`).
  - Kiểm tra `const mailer = resolveMailer(deps)` → thiếu trả `503 EMAIL_UNAVAILABLE`.
  - `SELECT` học viên theo `(id, ctx.orgId)` loại trừ `demo-student:%`. Không thấy → `404`; `email.trim() === ""` → `400`.
  - Tìm `invitedEnrollment` (`status = 'invited'`): nếu có `body.enrollmentId` thì tìm đúng `(body.enrollmentId, studentId, ctx.orgId, status = 'invited')` (không thấy → `404`); nếu không truyền `enrollmentId` thì lấy dòng `'invited'` mới nhất theo `desc(enrollment.createdAt), desc(enrollment.id)`.
  - Nếu `studentRow.onboardingCompletedAt != null` VÀ không có `invitedEnrollment` → trả `409` `{ error: "Học viên này đã tham gia cổng học viên", code: ALREADY_JOINED }`.
  - Kiểm tra cooldown trên `previousLastInviteAt = studentRow.lastInviteEmailAt`: nếu `cooldownMs > 0 && previousLastInviteAt && previousLastInviteAt.getTime() > nowMs - cooldownMs` → trả `429 RESEND_COOLDOWN` + `Retry-After` + `retryAfterSeconds`.
  - Thực hiện CAS trên `student.lastInviteEmailAt` với điều kiện `previousLastInviteAt ? eq(student.lastInviteEmailAt, previousLastInviteAt) : isNull(student.lastInviteEmailAt)` và `.returning({ id: student.id })` (`claimed.length === 0` → trả `429`).
  - Sinh `resendToken = crypto.randomUUID()`:
    - **Nếu có `invitedEnrollment`:** Đảm bảo tồn tại đúng 1 dòng `notification_record` có `idempotencyKey = \`class_enrolled:${invitedEnrollment.id}\`` (gọi `enqueueNotifications(db, ctx.orgId, [classEnrolledEvent(...)])` — nếu đã có sẽ tự bỏ qua không tạo dòng thứ hai, sau đó `SELECT` dòng đó). Gửi đồng bộ qua `mailer.send` với nội dung lời mời lớp, `timeoutMs: 5_000` và `idempotencyKey: \`class_enrolled:${invitedEnrollment.id}:resend:${resendToken}\``. Thành công → cập nhật dòng `notification_record` đó `status = sql\`CASE WHEN ${notificationRecord.readAt} IS NULL THEN 'sent' ELSE 'read' END\``, `sentAt = now`, `lastError = null`; thất bại → cập nhật dòng đó `status = 'failed'`, `lastError = sanitizeDeliveryError(msg).failedError`, hoàn tác `student.lastInviteEmailAt` về `previousLastInviteAt` (`WHERE id = :id AND last_invite_email_at = :now`) và trả `502 EMAIL_SEND_FAILED`.
    - **Nếu không có `invitedEnrollment`:** Lấy tên lớp `active` mới nhất (nếu có) để đưa vào `buildStudentPortalInviteEmail`, gọi `await mailer.send` đồng bộ với `timeoutMs: 5_000` và `idempotencyKey: \`student_portal_invite:${studentRow.id}:resend:${resendToken}\``; nếu lỗi thì hoàn tác `student.lastInviteEmailAt` về `previousLastInviteAt` và trả `502 EMAIL_SEND_FAILED`.
  - Thành công: trả `200` `{ ok: true, id: studentRow.id, updatedAt: now }`.
- [x] **`POST /api/students`:**
  - Ở cả hai điểm trả `409 ALREADY_IN_ORG`, trả thêm `existingStudentId: row.id` và `portalLinked: row.onboardingCompletedAt != null`.
  - Khi `normalizedEmail === ""`: giữ nguyên hành vi cũ (không gửi email lời mời; nếu `cls && enrollmentId && !input.activateNow` vẫn gọi `notify(classEnrolledEvent)` để tạo thông báo `in_app`).
  - Khi `normalizedEmail !== ""`:
    - Nhánh `cls && enrollmentId && !input.activateNow`: gọi `enqueueNotifications` tạo bản ghi `class_enrolled:${enrollmentId}`; nếu `resolveMailer(deps)` có sẵn thì gửi đồng bộ 1 lượt (`timeoutMs: 5_000`, `idempotencyKey: createdRecordId`) và cập nhật bản ghi `sent` hoặc `failed`; nếu gửi thành công thì set `student.lastInviteEmailAt = now` và `inviteEmailSent = true`, ngược lại **không** set `lastInviteEmailAt` và trả `inviteEmailSent = false`.
    - Nhánh `!cls || input.activateNow`: nếu `resolveMailer(deps)` có sẵn, gọi best-effort `mailer.send` (`buildStudentPortalInviteEmail`, `timeoutMs: 5_000`, `idempotencyKey: \`student_portal_invite:${studentId}:initial\``); chỉ set `student.lastInviteEmailAt = now` và `inviteEmailSent = true` khi gửi thành công, ngược lại `inviteEmailSent = false` (vẫn trả `201`).

## Implementation Steps (Handover Tasks)

### Task 2.1 — Viết bộ test Đỏ cho route mời, xóa bù trừ, getter mailer, role `ta`, cooldown và gửi lại
- **Goal:** Có bộ test thất bại bằng `AssertionError` ở tầng server bao phủ toàn bộ yêu cầu nghiệp vụ, bảo mật và biên lỗi của Phase 2.
- **Target files and symbols:** `apps/server/src/student-invitation.test.ts`, `apps/server/src/student.test.ts`.
- **Steps:**
  1. Trong `apps/server/src/student-invitation.test.ts`, tiêm `mailer` giả lập ghi nhận các thư gửi đi (ném lỗi với địa chỉ `@bounce.test`) và `studentOrigin: "http://localhost:8003"`.
  2. Thêm các test case mới vào `student-invitation.test.ts`:
     - `POST /api/students/invite` gửi 1 email với `fromName: "Alpha Academy qua Teacher OS"`, `replyTo: "teacher.alpha@test.local"`, link `http://localhost:8003` và `idempotencyKey` bắt đầu bằng `"student_invite:"`.
     - Khi `mailer.send` ném lỗi (`fail@bounce.test`): trả `502 INVITATION_EMAIL_FAILED`, không lộ chuỗi lỗi thô, và xóa dòng `pending` để lần gọi lại sau khi sửa chạy thành công.
     - Khi `buildApp` nhận `get mailer() { throw new Error("missing key"); }`: `buildApp` **không** throw lúc khởi tạo, và `POST /api/students/invite` trả `503 INVITATION_EMAIL_UNAVAILABLE`.
     - Vòng lặp `POST /api/students/invite` → `DELETE /api/students/invitations/:id` → `POST /api/students/invite` cùng email trong vòng 60s trả `429 INVITATION_RESEND_COOLDOWN` kèm `Retry-After`.
     - Session có `role` thành viên tổ chức là `"ta"` bị chặn `403` trên `/api/students/invite` và các route resend.
     - `POST /api/students/invitations/:id/resend`: gọi ngay trong 60s trả `429` + `Retry-After`; sau khi lùi `updatedAt` quá 60s trả `200` với `idempotencyKey` mới; nếu lần resend ném lỗi mailer thì trả `502` và hoàn tác `updatedAt` về mốc cũ để gọi lại ngay thành công.
     - `POST /api/students/:id/resend-invite`: gửi thành công cho học viên chưa onboarding (`portalLinked: false`), cập nhật tại chỗ đúng **1** dòng `notification_record` (không nhân bản thành 2 dòng) khi có `enrollment` `'invited'`, áp dụng cooldown 60s + hoàn tác khi lỗi, và trả `409 STUDENT_ALREADY_JOINED` khi đã hoàn tất onboarding và không có `enrollment` `'invited'`.
  3. Trong `apps/server/src/student.test.ts`: truyền `mailer: createLogMailer()` cho `buildApp`, thêm kiểm tra `GET /api/students` trả `portalLinked: false` trước onboarding / `true` sau onboarding, và kiểm tra `POST /api/students` có email trả `inviteEmailSent: true` (hoặc `false` khi `@bounce.test` mà không khóa cooldown 60s).
- **Success criteria:** Bộ test chạy được tới assertion (không văng lỗi cú pháp) và thoát mã khác `0` do các hành vi mới chưa có trong `kernel.ts` / `app.ts`.
- **Verify:** `pnpm --filter server exec vitest run src/student-invitation.test.ts src/student.test.ts` thoát mã khác `0`.

### Task 2.2 — Triển khai `app.ts`, `emit.ts`, `snapshot.ts`, `kernel.ts`, `boot.ts` và `helpers.ts`
- **Goal:** Toàn bộ route mời / gửi lại / tạo học viên, `portalLinked` và E2E mail logger vượt qua 100% test của `apps/server` và typecheck của `apps/e2e`.
- **Target files and symbols:**
  - `apps/server/src/app.ts` (`AppDeps.inviteResendCooldownMs`, `buildApp`)
  - `apps/server/src/lib/notifications/emit.ts` (`resolveMailer`, `notificationDepsFrom`)
  - `apps/server/src/routes/snapshot.ts` (`loadSnapshot`)
  - `apps/server/src/routes/kernel.ts` (`kernelRoutes`)
  - `apps/e2e/src/boot.ts` (`recordingMailer`, `buildApp`)
  - `apps/e2e/specs/helpers.ts` (`VerificationEmailEntry`)
- **Steps:**
  1. Sửa `apps/server/src/app.ts`: thêm `inviteResendCooldownMs?: number` vào `AppDeps` và đổi `kernelRoutes({ ...deps, aiRetryDelaysMs: deps.aiRetryDelaysMs })` thành `kernelRoutes(deps)`.
  2. Sửa `apps/server/src/lib/notifications/emit.ts`: thêm và export `resolveMailer(deps)`.
  3. Sửa `apps/server/src/routes/snapshot.ts`: thêm `portalLinked: row.onboardingCompletedAt != null` vào map `students`.
  4. Sửa `apps/server/src/routes/kernel.ts`: triển khai đầy đủ `POST /students`, `POST /students/invite`, `DELETE /students/invitations/:id`, `POST /students/invitations/:id/resend` và `POST /students/:id/resend-invite` theo đúng mục Requirements.
  5. Sửa `apps/e2e/src/boot.ts` (đưa `idempotencyKey: input.idempotencyKey ?? null` vào `base` và truyền `inviteResendCooldownMs: 0`) cùng `apps/e2e/specs/helpers.ts` (thêm `idempotencyKey?: string | null` vào `VerificationEmailEntry`).
- **Success criteria:** Toàn bộ test suite của `apps/server` và kiểm tra kiểu của `apps/e2e` pass 100%.
- **Verify:** `pnpm --filter server test && pnpm --filter e2e check-types` thoát mã `0`.

## Todo

- [x] Task 2.1: Viết bộ test Đỏ cho route mời, xóa bù trừ, getter mailer, role `ta`, cooldown và gửi lại
- [x] Task 2.2: Triển khai `app.ts`, `emit.ts`, `snapshot.ts`, `kernel.ts`, `boot.ts` và `helpers.ts`

## Success Criteria

Toàn bộ suite `pnpm --filter server test` và `pnpm --filter e2e check-types` xanh hoàn toàn; mọi đường mời/gửi lại đều có `Idempotency-Key` riêng, CAS cooldown `Date` an toàn trên D1, không sập cold-start và không nhân bản bản ghi hộp thư học viên.

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
