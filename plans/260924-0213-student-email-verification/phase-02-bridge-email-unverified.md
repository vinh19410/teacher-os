---
phase: 2
title: "Bridge requireStudent — 0 row + chưa verify trả EMAIL_UNVERIFIED"
status: todo
priority: P1
effort: 1h
dependencies: []
---

# Phase 2: Bridge requireStudent — 0 row + chưa verify trả EMAIL_UNVERIFIED

## Goal

Học viên vừa đăng ký (có session nhưng `emailVerified === false`, chưa có hồ sơ) thấy đúng màn hình "Email chưa được xác thực" thay vì banner sai ngữ nghĩa "Tài khoản chưa được liên kết". Đây là điều kiện cần cho Phase 3 (UI chờ xác thực) vì soft mode vẫn cấp session sau sign-up.

## Files to Create / Modify

- Modify: `apps/server/src/routes/student.ts` (khối `if (rows.length === 0)` trong `requireStudent`, dòng 68-97)
- Modify: `apps/server/src/student.test.ts` (đổi kỳ vọng test dòng 333-343; thêm case mới)

Không đổi: `packages/api/src/contracts.ts` (tái dùng `STUDENT_ERROR_CODES.EMAIL_UNVERIFIED` đã có tại dòng 911-917); `apps/server/src/student-provisioning.ts` (gate `emailVerified === true` giữ nguyên — unverified KHÔNG bao giờ được provision).

## Tasks & Steps

### Task 2.1 — Đổi error code trong nhánh "vẫn 0 row sau provisioning"
- Goal: session chưa verify + chưa có hồ sơ → HTTP 403 với code `STUDENT_EMAIL_UNVERIFIED`; session đã verify + chưa có hồ sơ → giữ nguyên `STUDENT_NOT_LINKED`.
- Target files: `apps/server/src/routes/student.ts`, function `requireStudent`, khối hiện tại:
  ```ts
  if (rows.length === 0) {
      if (session.emailVerified === true) { /* provision + query lại */ }
      if (rows.length === 0) {
          return c.json({ error: STUDENT_ERROR_CODES.NOT_LINKED, code: STUDENT_ERROR_CODES.NOT_LINKED }, 403); // dòng 88-96
      }
  }
  ```
- Steps:
  1. Sửa return tại dòng 88-96 thành:
     ```ts
     if (rows.length === 0) {
         const code =
             session.emailVerified === true
                 ? STUDENT_ERROR_CODES.NOT_LINKED
                 : STUDENT_ERROR_CODES.EMAIL_UNVERIFIED;
         return c.json({ error: code, code }, 403);
     }
     ```
  2. KHÔNG đụng các check còn lại: provision gate `emailVerified === true` (dòng 69), check `EMAIL_UNVERIFIED` cho trường hợp có row (dòng 99-107), check `AMBIGUOUS` (dòng 109-117). Sau đổi, ngữ nghĩa tổng: **chưa verify ⇒ luôn EMAIL_UNVERIFIED bất kể số row**.
- Success criteria: unverified 0-row nhận `EMAIL_UNVERIFIED`; verified 0-row (kể cả provisioning fail) vẫn `NOT_LINKED`.
- Verify: xem Task 2.2.

### Task 2.2 — Cập nhật + bổ sung test
- Goal: test phản ánh đúng contract mới, không test nào fail.
- Target files: `apps/server/src/student.test.ts`.
- Steps:
  1. Tìm test hiện tại dòng 333-343 ("unverified user with 0 rows does not provision student and returns 403" — fake session `unverified`, expect `NOT_LINKED`). Đổi kỳ vọng sang `STUDENT_EMAIL_UNVERIFIED` (cả `error` lẫn `code`), **giữ nguyên assertion DB count = 0** (không được provision).
  2. Thêm 1 case: `unverified` session + 0 row → assert response body.code === `STUDENT_EMAIL_UNVERIFIED` và DB count student = 0 (tách thành test riêng nếu bước 1 đã gộp assertion này).
  3. Kiểm tra lại 2 test giữ nguyên hành vi vẫn pass: provision-fail case (dòng 351-361 — `vi.spyOn(provisionStudentForUser).mockRejectedValueOnce` với session verified → NOT_LINKED) và row-exists-unverified case (dòng 393-400 → EMAIL_UNVERIFIED).
- Success criteria: `pnpm --filter server test` pass toàn bộ, gồm test đã đổi kỳ vọng.
- Verify: `pnpm --filter server test` → exit 0; và `pnpm --filter server exec vitest run src/student.test.ts` output có chứa `EMAIL_UNVERIFIED` trong tên/assertion của ít nhất 1 test case mới.

### Task 2.3 — Đối chiếu e2e hiện có không bị ảnh hưởng
- Goal: chắc chắn spec `student-portal-provisioning.spec.ts` không bị đổi hành vi này làm vỡ.
- Target files: không sửa gì — chỉ đọc.
- Steps:
  1. Đọc `apps/e2e/specs/student-portal-provisioning.spec.ts`: xác nhận nó chỉ signup teacher qua web app (`#su-*`) và assert DB count, không gọi `/api/student/*` → không đụng nhánh đã đổi.
- Success criteria: có nhận định bằng văn bản (comment trong PR/mô tả commit) rằng spec này không bị ảnh hưởng.
- Verify: `pnpm --filter e2e exec playwright test specs/student-portal-provisioning.spec.ts` → exit 0 (yêu cầu Phase 4 đã config xong môi trường e2e; nếu chạy ở thời điểm này chưa được thì ghi `no verification needed` và Phase 4 sẽ gate thay).

## Verification (cả phase)

- `pnpm --filter server test` → exit 0.
- `pnpm check-types` → exit 0.
- `pnpm check` → exit 0.

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
