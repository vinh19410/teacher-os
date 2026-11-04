# Phase 2: Tích hợp Server & Tự động khớp hồ sơ học viên

## Goal
Xác minh và đảm bảo rằng phiên đăng nhập khởi tạo từ Email OTP tương thích hoàn toàn với lớp guard và bridge của `apps/server`: `createStudentGuard` nhận diện `emailVerified === true`, phân biệt đúng giữa học viên đã có hồ sơ trong bảng `student` (200 OK), học viên mới cần auto-provision vào org đầu tiên (200 OK), và học viên có lời mời tham gia tổ chức đang chờ chấp nhận (403 `NOT_LINKED` kèm chỉ dẫn chuông thông báo).

## Files to Create or Modify
- `apps/server/src/routes/student-auth-otp.test.ts` (Tạo mới: Integration test kiểm tra các luồng hồ sơ sau khi đăng nhập bằng OTP)
- `apps/server/src/routes/student.ts` (Kiểm tra/điều chỉnh nếu có điểm chưa tương thích)

## Tasks & Steps

### Task 2.1: Viết test tích hợp đăng nhập OTP và truy cập API học viên
- **Goal**: Kiểm chứng từ đầu đến cuối luồng API cho cả 3 trường hợp học viên:
  1. **Trường hợp A (Hồ sơ học viên đã được tạo trước)**: Giáo viên tạo trước học viên với email `hocvien@example.com` trong bảng `student`. Học viên đăng nhập qua OTP -> gọi `GET /api/student/me` trả về 200 OK với đúng thông tin hồ sơ.
  2. **Trường hợp B (Học viên mới tinh)**: Chưa có bản ghi `student` và không có lời mời pending -> `provisionStudentForUser` tự động tạo bản ghi học viên ở organization sớm nhất và trả về 200 OK.
  3. **Trường hợp C (Học viên có lời mời tổ chức pending)**: Bản ghi `studentInvitation` đang ở trạng thái pending -> `createStudentGuard` trả về 403 `NOT_LINKED` theo đúng thiết kế để UI hướng dẫn học viên bấm chuông thông báo chấp nhận lời mời.
- **Target files and symbols**: `apps/server/src/routes/student-auth-otp.test.ts`.
- **Steps**:
  1. Tạo file test `student-auth-otp.test.ts` sử dụng `buildApp` tương tự như `student-invitation.test.ts` hoặc `auth-role-roundtrip.test.ts`.
  2. Test lần lượt 3 trường hợp A, B, C.
  3. Khẳng định `emailVerified` luôn là `true` với tài khoản tạo qua OTP, không bao giờ gặp lỗi 403 `EMAIL_UNVERIFIED`.
- **Success criteria**: Test chạy và pass hoàn toàn, xác nhận luồng khớp hồ sơ học viên hoạt động chuẩn xác theo logic của hệ thống.
- **Verify**: `pnpm --filter server exec vitest run src/routes/student-auth-otp.test.ts` exits 0.

### Task 2.2: Rà soát và tinh chỉnh các endpoint liên quan đến auth học viên
- **Goal**: Đảm bảo các route trong `apps/server` xử lý đúng trường hợp user tạo qua OTP (không có mật khẩu).
- **Target files and symbols**: `apps/server/src/routes/student.ts`.
- **Steps**:
  1. Kiểm tra xem có middleware hay handler nào giả định user luôn có account provider là `credential` với password hay không.
  2. Xác nhận rằng `better-auth` lưu account provider là `email-otp` hoặc không ghi đè credential account.
- **Success criteria**: Không có hồi quy ở bất kỳ route học viên nào.
- **Verify**: `pnpm --filter server test` exits 0.

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
