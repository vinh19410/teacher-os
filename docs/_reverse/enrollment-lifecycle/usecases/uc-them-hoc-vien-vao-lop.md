# UC-1: Thêm học viên vào lớp (tạo invited)

> Reverse draft — truy vết: S3 `kernel.ts:463-694,1385-1443`; S8 `enroll-student-modal.tsx`; S15 e2e; S19 kernel.test.

## a. Mục tiêu & phạm vi

- Giáo viên đưa một học viên (đã có trong org, hoặc tạo mới tại chỗ) vào một lớp; hệ thống ghi nhận quan hệ "chờ xác nhận" (`invited`) mà CHƯA cấp gói học hay lịch buổi. ✅ [S19 `kernel.test.ts:7112-7134` — invited, 0 packages, 0 lessons]
- Phạm vi: cả hai chế độ của modal (chọn có sẵn / tạo mới) và tùy chọn kích hoạt ngay. 🔵 Nhánh "tạo mới" mâu thuẫn PDR:23 → OQ-1.

## b. Actor chính & stakeholder

- **Chính:** Giáo viên (teacher role). ✅ [S3 `kernel.ts:1385-1388`]
- **Stakeholder:** Học viên (nhận thông báo + email "Được mời vào lớp"); phụ huynh (nhận email). ✅ [S26 `templates.ts:69-76`]

## c. Tiền điều kiện

- Giáo viên đăng nhập teacher app, org đã bootstrap. ✅ [S3 `kernel.ts:1386-1387` — 401 nếu không có ctx]
- Lớp tồn tại trong org. ✅ [S3 `kernel.ts:1394-1397`]
- Học viên tồn tại trong org (chế độ có sẵn). ✅ [S3 `kernel.ts:1398-1406`]
- Cặp (lớp, học viên) chưa tồn tại enrollment nào (kể cả invited). ✅ [S3 `kernel.ts:1407-1418`; S8 `enroll-student-modal.tsx:63-71`]

## d. Trigger

- Bấm "+ Thêm học viên vào lớp" → chọn học viên + "Lưu", hoặc nhập form tạo mới + "Lưu". ✅ [S9 `$classId.tsx:410-417`; S8 `enroll-student-modal.tsx:107-192`]

## e. Kịch bản chính

1. GV mở modal; hệ thống liệt kê học viên chưa trong lớp. ✅ [S8 `enroll-student-modal.tsx:63-71`]
2. GV chọn học viên, (tùy chọn) tick "Kích hoạt trạng thái Đang học ngay". ✅ [S8 `enroll-student-modal.tsx:417-426`]
3. Web gửi POST `/api/classes/{id}/enroll` `{studentId, activateNow}`. ✅ [S10 `repos/kernel.ts` action `enroll-student`]
4. Server kiểm lớp 404 → học viên 404 → trùng 409 theo thứ tự. ✅ [S3 `kernel.ts:1394-1418`]
5. Server insert enrollment `status:"invited"`. ✅ [S3 `kernel.ts:1420-1427`]
6. Nếu `activateNow=true`: gọi `activateEnrollment` ngay; lỗi → 500. ✅ [S3 `kernel.ts:1428-1432`]
7. Nếu không kích hoạt ngay: phát `class_enrolled` + email lời mời đồng bộ. ✅ [S3 `kernel.ts:1433-1441`; S19 `kernel.test.ts:7485-7504`]
8. Trả 201 `{id}`; web toast "Đã thêm <tên> vào lớp"; roster hiện "Đã mời", KPI "1 chờ xác nhận". ✅ [S3 `kernel.ts:1442`; S15 `enroll-existing-student.spec.ts:250-263`]

## f. Luồng thay thế / mở rộng

- **f1 Tạo học viên mới:** POST `/api/students` với `classId`; batch tạo student + enrollment invited; email trùng → 409 + callout mời lại. ✅ [S3 `kernel.ts:499-573`; S8 `enroll-student-modal.tsx:139-192,220-237`]
- **f2 Kích hoạt ngay:** trả thêm `enrollmentId` + `activated:true`; portal invite email gửi best-effort. ✅ [S3 `kernel.ts:617-635`; S20 `student.test.ts:1785-1869`]
- **f3 Không nhập email:** bỏ qua email, vẫn tạo invited + notify in-app. ✅ [S3 `kernel.ts:636-651`]
- **f4 Email lời mời lỗi:** 201 + `inviteEmailSent:false`, toast warning, có nút gửi lại. ✅ [E-EL-016; S3 `kernel.ts:675-683`; S8 `enroll-student-modal.tsx:171-178`]
- **f5 Hết ứng viên:** picker empty state "Tất cả học viên đã được thêm vào lớp." ✅ [S8 `enroll-student-modal.tsx:300-304`; S15 `:291-299`]

## g. Business rules & ràng buộc

BR-EL-002 (luôn invited), BR-EL-004 (unique cặp lớp-học viên), BR-EL-012 (picker loại trừ enrolled+invited); org-scoped; ids do server cấp. ✅ [S1, S2, S3]

## h. Lỗi & phục hồi

E-EL-001 (404 class), E-EL-002 (404 student), E-EL-003 (409 trùng), E-EL-004 (500 activation khi activateNow), E-EL-013 (409 email trùng + callout), E-EL-016 (email lỗi không chặn). Recovery chi tiết ở spec Mục 6. ✅
