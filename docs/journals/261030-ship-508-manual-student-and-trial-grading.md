# Journal — Ship #508: Tạo học viên thủ công, kích hoạt lớp tức thì & bài nộp mẫu dùng thử Chấm điểm

- **Date:** 2026-10-30
- **Issue:** #508
- **Branch:** `vinh19410/ai-handle-issue-508`
- **Plan:** `plans/261030-1111-manual-student-and-trial-grading/plan.md`

## Vấn đề
Giáo viên mới trải nghiệm Teacher OS hoặc dạy học viên chưa có tài khoản Student Portal bị chặn chuỗi thao tác cốt lõi (Thêm học viên vào lớp → Lập hóa đơn → Giao bài tập → Chấm điểm) vì `POST /api/students` đã bị xóa ở PR #257 và mọi thao tác sau đòi hỏi `enrollment.status === 'active'`.

## Giải pháp đã triển khai
1. **Tạo học viên thủ công & kích hoạt ngay (`POST /api/students`, mở rộng `POST /api/classes/:id/enroll`):**
   - Chỉ bắt buộc `name`; chuẩn hóa `lower(trim(email))`, kiểm trùng trong org (`409 STUDENT_ALREADY_IN_ORG`, loại trừ `demo-student:%`) kèm race-backstop re-query trong `catch`.
   - Tự đóng `student_invitation` `pending` trùng email trong cùng `db.batch` và tự liên kết khi học viên đăng nhập Student Portal bằng email đã xác thực (`createStudentGuard` khóa `emailVerified === true`).
   - Hỗ trợ `activateNow` gọi `activateEnrollment` để kích hoạt `active` ngay lập tức (sinh `session_package` + `lesson`), trả `500` nếu kích hoạt thất bại và chỉ phát `classEnrolledEvent` khi `!activateNow`.
2. **Bài nộp mẫu dùng thử trên `/grading` (`POST / DELETE /api/grading/demo-sample`):**
   - Sinh idempotent bộ bài nộp Writing Task 2 mẫu (`mode = 'practice'`, `ai_grading_draft` tĩnh `status = 'ai_drafted'`, `creditCost = 0`) với ID tất định `demo-*:${orgId}`.
   - Cô lập tại `loadSnapshot` (`notLike` trên `demo-student:%`, `demo-prompt:%`, `demo-test:%`), `computeReminders` (`notLike` trên `demo-attempt:%`), và bỏ qua `emitNotifications` khi chấm `demo-attempt:%`.

## Bài học kỹ thuật
- Trong `EnrollStudentModal`, mặc định `activateNow` theo từng chế độ (`true` khi tạo học viên mới, `false` khi chọn học viên có sẵn) vừa mở khóa luồng giáo viên mới 1 bước vừa giữ tương thích ngược 100% với bộ E2E mời-rồi-kích-hoạt hiện có.
- Khi kiểm thử `computeReminders` trên DB dùng chung trong `grading.test.ts`, cần đo độ lệch (`beforeCount` vs `afterCount`) sau khi lùi `submittedAt` của `demo-attempt` quá 24h kết hợp unit test cô lập trong `dashboard-reminders.test.ts`.
