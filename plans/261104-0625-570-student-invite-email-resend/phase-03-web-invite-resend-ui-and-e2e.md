---
title: "Phase 3: Trạng thái Chờ xác nhận + Gửi lại lời mời trên Web UI và E2E"
status: todo
---

# Phase 3: Trạng thái Chờ xác nhận + Gửi lại lời mời trên Web UI và E2E

<!-- Updated: Red Team & Validation Session 1 - optional Student.portalLinked for deploy skew, forward inviteEmailSent in KernelCommandPayload, preserve kernel.test.ts definite-failure shape, jsdom pragmas, DataTable onKeyDown guard, avoid ClassRosterTab badge collision, scoped design:compare -->

## Overview

Hoàn thiện trải nghiệm giáo viên trên `apps/web` và chứng minh toàn trình bằng Playwright E2E + kiểm tra thị giác 3 viewport sáng/tối:
1. Mở rộng client repo (`invitations.ts`, `students.ts`, `mock-data.ts`, `kernel.ts`, `kernel-load-state.ts`, `use-kernel-form-submit.ts`) để bảo toàn `portalLinked?: boolean` (an toàn deploy skew: chỉ coi là chờ xác nhận khi `s.portalLinked === false`), truyền `inviteEmailSent` qua `createKernelCommandBus.runOne`, gắn thông tin trùng `409` lên `HttpError` (không phá cấu trúc `.toEqual` của `definite-failure` trong `kernel.test.ts`), và mở hai hook `useResendInvitation()` + `useResendStudentInvite()`.
2. Tạo component dùng chung `PendingInviteCallout` + `ResendInviteButton` tuân thủ `DESIGN.md` (`Badge variant="warn"`, `Button variant="secondary" size="sm"`, chặn nổi bọt cả `onClick` lẫn `onKeyDown` cho hàng `DataTable`, đếm ngược khi nhận `429 retryAfterSeconds`).
3. Tích hợp vào 7 bề mặt giao diện giáo viên (`InviteStudentModal`, `AddStudentModal`, `EnrollStudentModal`, `PendingInvitationsList`, `/students`, `/students/$studentId`, và nút `"Gửi lại lời mời"` trong cột thao tác của `ClassRosterTab` mà không sinh trùng nhãn `"chờ xác nhận"` vốn đã có trên header lớp) kèm test `jsdom`, Playwright E2E và chụp ảnh 3 viewport sáng/tối.

## Files to Create / Modify

- Modify: `apps/web/src/lib/mock-data.ts` (`Student.portalLinked?: boolean`)
- Modify: `apps/web/src/lib/repos/students.ts` (`mapStudents` gán `...(row.portalLinked !== undefined ? { portalLinked: row.portalLinked } : {})`)
- Modify: `apps/web/src/lib/kernel-load-state.ts` (`HttpError` thêm tùy chọn `code`, `existingStudentId`, `existingStudentName`, `portalLinked`)
- Modify: `apps/web/src/lib/repos/kernel.ts` (`KernelWriteEnvelope` + `KernelCommandPayload` + `createKernelCommandBus.runOne` truyền `inviteEmailSent`; `parseErrorReason` mở rộng đọc chi tiết lỗi vào `HttpError`)
- Modify: `apps/web/src/lib/use-kernel-form-submit.ts` (lộ thêm `failureError?: HttpError` để modal đọc `code`/`existingStudentId`/`portalLinked`)
- Modify: `apps/web/src/lib/repos/invitations.ts` (thêm `resendStudentInvitation`, `resendStudentProfileInvite`, `useResendInvitation`, `useResendStudentInvite`)
- Create: `apps/web/src/components/students/pending-invite-callout.tsx` (`PendingInviteCallout`, `ResendInviteButton`)
- Modify: `apps/web/src/components/modals/invite-student-modal.tsx`
- Modify: `apps/web/src/components/modals/add-student-modal.tsx`
- Modify: `apps/web/src/components/modals/enroll-student-modal.tsx`
- Modify: `apps/web/src/components/students/pending-invitations-list.tsx`
- Modify: `apps/web/src/routes/_auth/students/index.tsx`
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx`
- Modify: `apps/web/src/components/class-detail/class-roster-tab.tsx`
- Modify: `apps/web/src/lib/repos/invitations.test.ts`
- Modify: `apps/web/src/components/modals/invite-student-modal.test.tsx`
- Modify: `apps/web/src/components/students/pending-invitations-list.test.tsx`
- Modify: `apps/web/src/routes/_auth/students/index.test.tsx`
- Modify: `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`

## Requirements

- [x] **An toàn deploy skew & bảo toàn test hiện hữu:**
  - `Student.portalLinked?: boolean` là optional; chỉ hiển thị trạng thái `"Chờ xác nhận"` / nút `"Gửi lại lời mời"` cho học viên khi `Boolean(s.email) && s.portalLinked === false` (nếu `portalLinked` là `undefined` từ snapshot cũ hoặc test fixture cũ thì ẩn trạng thái chờ).
  - Trong `apps/web/src/lib/repos/kernel.ts`, chỉ gắn `inviteEmailSent` vào object trả về của `runOne` khi `envelope.inviteEmailSent !== undefined`, và giữ nguyên nhánh `definite-failure` trả `{ kind: "definite-failure", status: error.status, error }` (chi tiết `code`, `existingStudentId`, `existingStudentName`, `portalLinked` nằm trên instance `HttpError`) để `kernel.test.ts` pass tuyệt đối.
  - Sau khi `add-student` thành công ở `AddStudentModal` / `EnrollStudentModal` (hoặc khi `useResendInvitation` nhận `404`), gọi `queryClient.invalidateQueries({ queryKey: pendingInvitationsQueryKey })` để danh sách `"Lời mời đang chờ"` luôn đồng bộ.
- [x] **Quy chuẩn UI/A11y (`DESIGN.md` & `REVIEW.md`):**
  - Trong `AddStudentModal` và `EnrollStudentModal`, khi hiển thị `PendingInviteCallout` cho lỗi `409 STUDENT_ALREADY_IN_ORG` (`portalLinked === false`), **ẩn** thẻ `<p role="alert" className="text-danger">` mặc định của `useKernelFormSubmit` để không vi phạm quy tắc màu `--destructive` của `DESIGN.md`.
  - Trong `EnrollStudentModal`, lưu cả `{ message, inviteEmailSent }` trong `committedToastMessageRef` để nhánh `reconcileAndFinish` cũng hiển thị `toast.warning` trung thực nếu `inviteEmailSent === false`.
  - Trong `ClassRosterTab`, giữ nguyên `<Badge variant="warn">Đã mời</Badge>` hiện có cho `isInvited` (không thêm chữ `"Chờ xác nhận"` thứ hai gây đụng strict-mode với KPI `"1 chờ xác nhận"` trên `$classId.tsx:262`), và hiển thị nút `"Gửi lại lời mời"` trong cột `"Thao tác"` khi `Boolean(s.email) && (isInvited || s.portalLinked === false)`.
  - Trong `ResendInviteButton`, chặn sự kiện nổi bọt trên cả `onClick` (`e.stopPropagation()`) lẫn `onKeyDown` (`if (e.key === "Enter" || e.key === " ") e.stopPropagation()`) để hàng `DataTable` không ăn mất phím `Enter`/`Space` hoặc điều hướng nhầm.

## Implementation Steps (Handover Tasks)

### Task 3.1 — Viết test Đỏ (`jsdom`) cho repos và UI mời / gửi lại lời mời trên `apps/web`
- **Goal:** Có bộ unit/component test thất bại bằng `AssertionError` (không lỗi môi trường `document is not defined`) trước khi sửa code UI.
- **Target files and symbols:**
  - `apps/web/src/lib/repos/invitations.test.ts`
  - `apps/web/src/components/modals/invite-student-modal.test.tsx`
  - `apps/web/src/components/students/pending-invitations-list.test.tsx`
  - `apps/web/src/routes/_auth/students/index.test.tsx`
- **Steps:**
  1. Đọc toàn bộ 4 file test trên.
  2. Thêm `// @vitest-environment jsdom` ở dòng đầu tiên và `afterEach(cleanup)` cho cả `invite-student-modal.test.tsx` lẫn `pending-invitations-list.test.tsx`; cập nhật factory `vi.mock("@/lib/repos/invitations")` trong các file test để mock sẵn `useResendInvitation` và `useResendStudentInvite`.
  3. Bổ sung test trong `invitations.test.ts` cho `resendStudentInvitation` (`POST /api/students/invitations/:id/resend`, `Content-Type: application/json`, body `"{}"`), `resendStudentProfileInvite` (`POST /api/students/:id/resend-invite`), và đọc `invitationId`, `existingStudentId`, `portalLinked`, `retryAfterSeconds` khi lỗi `409`/`429`.
  4. Bổ sung test trong `invite-student-modal.test.tsx`:
     - Khi `mutateAsync` ném `INVITATION_EMAIL_FAILED` (`502`): `toast.success` **không** được gọi, modal vẫn mở và hiện thông báo lỗi.
     - Khi `mutateAsync` ném `INVITATION_ALREADY_PENDING` (`invitationId`) hoặc `STUDENT_ALREADY_IN_ORG` (`portalLinked: false`, `existingStudentId`): hiện `"Chờ xác nhận"` kèm nút `"Gửi lại lời mời"` thay vì lỗi đỏ; bấm `"Gửi lại lời mời"` gọi đúng hàm resend.
     - Khi `STUDENT_ALREADY_IN_ORG` có `portalLinked: true`: báo rõ học viên đã tham gia cổng học viên, không có nút gửi lại.
  5. Bổ sung test trong `pending-invitations-list.test.tsx` cho nút `"Gửi lại lời mời"` và trong `students/index.test.tsx` cho học viên có `email` + `portalLinked: false` hiện badge `"Chờ xác nhận"` kèm nút `"Gửi lại lời mời"`.
- **Success criteria:** Chạy vitest thất bại đúng vì `AssertionError` / thiếu export mới cần làm ở Task 3.2 (không có `ReferenceError: document is not defined`).
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos/invitations.test.ts src/components/modals/invite-student-modal.test.tsx src/components/students/pending-invitations-list.test.tsx src/routes/_auth/students/index.test.tsx` thoát mã khác `0` và output không chứa chuỗi `document is not defined`.

### Task 3.2 — Triển khai repos, `PendingInviteCallout` và các màn hình `apps/web`
- **Goal:** Toàn bộ repos và 7 bề mặt giao diện của `apps/web` hoạt động đúng hợp đồng và pass 100% unit/component test + typecheck toàn repo.
- **Target files and symbols:**
  - `apps/web/src/lib/mock-data.ts`, `apps/web/src/lib/repos/students.ts`
  - `apps/web/src/lib/kernel-load-state.ts`, `apps/web/src/lib/repos/kernel.ts`, `apps/web/src/lib/use-kernel-form-submit.ts`
  - `apps/web/src/lib/repos/invitations.ts`
  - `apps/web/src/components/students/pending-invite-callout.tsx`
  - `apps/web/src/components/modals/invite-student-modal.tsx`
  - `apps/web/src/components/modals/add-student-modal.tsx`
  - `apps/web/src/components/modals/enroll-student-modal.tsx`
  - `apps/web/src/components/students/pending-invitations-list.tsx`
  - `apps/web/src/routes/_auth/students/index.tsx`
  - `apps/web/src/routes/_auth/students/$studentId.tsx`
  - `apps/web/src/components/class-detail/class-roster-tab.tsx`
- **Steps:**
  1. Cập nhật `Student` (`portalLinked?: boolean`) trong `mock-data.ts` và `mapStudents` trong `repos/students.ts`.
  2. Cập nhật `HttpError` trong `kernel-load-state.ts`, `parseWriteEnvelope` / `parseErrorReason` / `KernelCommandPayload` / `createKernelCommandBus.runOne` trong `repos/kernel.ts`, và `useKernelFormSubmit` trong `use-kernel-form-submit.ts`.
  3. Cập nhật `repos/invitations.ts` với `resendStudentInvitation`, `resendStudentProfileInvite`, `useResendInvitation` (tự invalidate khi `404`), `useResendStudentInvite` (tự invalidate `kernelQueryKey`).
  4. Tạo `PendingInviteCallout` + `ResendInviteButton` trong `apps/web/src/components/students/pending-invite-callout.tsx` đúng token `DESIGN.md`, chặn nổi bọt cả `onClick` và `onKeyDown`, xử lý đếm ngược `retryAfterSeconds`.
  5. Tích hợp vào `InviteStudentModal`, `AddStudentModal`, `EnrollStudentModal`, `PendingInvitationsList`, `students/index.tsx`, `students/$studentId.tsx` và `ClassRosterTab` theo đúng mục Requirements.
- **Success criteria:** Toàn bộ test của `apps/web` và `pnpm check-types` toàn repo pass 100%.
- **Verify:** `pnpm --filter web test && pnpm check-types` thoát mã `0`.

### Task 3.3 — Kiểm chứng E2E Playwright, chụp ảnh 3 viewport sáng/tối và chạy scoped `design:compare` + full gates
- **Goal:** Chứng minh luồng thật đầu-cuối trên trình duyệt (gửi thư thật vào `.mail-log.jsonl`, chặn toast khi `@bounce.test` lỗi, trạng thái `"Chờ xác nhận"` + `"Gửi lại lời mời"` sinh khóa `idempotencyKey` mới) và pass toàn bộ gate bắt buộc.
- **Target files and symbols:**
  - `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts`
  - Ảnh chụp kiểm chứng trong `plans/261104-0625-570-student-invite-email-resend/screenshots/`
- **Steps:**
  1. Mở rộng `apps/e2e/specs/student-org-invitation-and-switcher.spec.ts` kiểm tra:
     - Mời `fail@bounce.test` → hiện lỗi gửi email trong modal, modal không đóng, không có toast `"Đã gửi lời mời"`, tab `"Lời mời đang chờ"` không có dòng ma.
     - Mời `studentEmail` hợp lệ → `.mail-log.jsonl` ghi nhận email lời mời đầu tiên có `idempotencyKey` bắt đầu bằng `student_invite:`; nhập lại `studentEmail` trong `InviteStudentModal` hiện trạng thái `"Chờ xác nhận"` + nút `"Gửi lại lời mời"`; bấm gửi lại (và bấm `"Gửi lại lời mời"` ở tab `"Lời mời đang chờ"`) → `.mail-log.jsonl` có thêm bản ghi mới với `idempotencyKey` khác nhau.
     - Tạo học viên thủ công có email chưa đăng ký cổng học viên → hiển thị badge `"Chờ xác nhận"` trên `/students` + bấm `"Gửi lại lời mời"` ghi nhận thư mới trong `.mail-log.jsonl`; nhập lại email đó trong `AddStudentModal` hoặc `InviteStudentModal` hiện `"Chờ xác nhận"` kèm nút `"Gửi lại lời mời"` thay vì lỗi cụt đường.
  2. Chạy Playwright E2E với cổng cô lập `8100/8101/8103`:
     `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e exec playwright test specs/student-org-invitation-and-switcher.spec.ts specs/manual-student-and-trial-grading.spec.ts specs/enroll-existing-student.spec.ts`
  3. Chụp screenshot thực tế 3 viewport (`1440×900`, `768×1024`, `375×812`) ở cả theme **light** và **dark** cho màn Học viên / Lời mời đang chờ / Modal Chờ xác nhận lưu vào `plans/261104-0625-570-student-invite-email-resend/screenshots/`, kiểm tra không tràn ngang (kể cả `320px`) và focus ring bàn phím rõ ràng; chạy `node scripts/design-compare/capture.mjs --screens t-students,t-student-detail,t-class-detail` (nếu script sinh thay đổi ảnh ngoài phạm vi trên các thư mục cũ thì kiểm tra `git status` để không commit nhầm rác ngoài scope).
  4. Chạy toàn bộ gate bắt buộc của repo: `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
- **Success criteria:** E2E spec pass, `capture.mjs --screens t-students,t-student-detail,t-class-detail` thoát `0`, ảnh 3 viewport light/dark rõ nét đúng chuẩn `DESIGN.md`, và toàn bộ `biome check`, `check-types`, `pnpm test` thoát `0`.
- **Verify:** `pnpm exec biome check . && pnpm check-types && pnpm test` thoát mã `0`, đồng thời lệnh Playwright E2E ở Bước 2 và lệnh `capture.mjs` ở Bước 3 thoát mã `0`.

## Todo

- [x] Task 3.1: Viết test Đỏ (`jsdom`) cho repos và UI mời / gửi lại lời mời trên `apps/web`
- [x] Task 3.2: Triển khai repos, `PendingInviteCallout` và các màn hình `apps/web`
- [x] Task 3.3: Kiểm chứng E2E Playwright, chụp ảnh 3 viewport sáng/tối và chạy scoped `design:compare` + full gates

## Success Criteria

Giáo viên thao tác ở bất kỳ bề mặt mời/thêm học viên nào cũng nhận phản hồi gửi thư trung thực, thấy rõ trạng thái `"Chờ xác nhận"` và bấm `"Gửi lại lời mời"` thành công; toàn bộ unit test, E2E, `design:compare` và kiểm tra thị giác 3 viewport sáng/tối đều đạt chuẩn.

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
