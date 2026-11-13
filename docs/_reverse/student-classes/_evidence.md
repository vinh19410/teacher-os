---
type: reverse-evidence
feature: student-classes
status: draft
updated: "2026-11-12"
---

# student-classes — Bằng chứng (evidence)

## 1. Endpoints

### 1.1 Chi tiết lớp — GET `/api/student/classes/:classId`

| Mục | Bằng chứng |
|-----|------------|
| Bề mặt server | apps/server/src/routes/student.ts:1043-1107 (guard :1048-1063; truy vấn buổi theo ghi danh :1069-1094; trả về kèm ngày khai giảng :1098-1106) |
| Helper dùng chung | apps/server/src/routes/student-class.ts:31-42 (cột), :57-75 (giáo viên), :77-117 (Buổi tới), :119-139 (chuyển đổi), :236-278 (sắp buổi legacy) |
| Hợp đồng | packages/api/src/contracts.ts:2215-2220 (chi tiết lớp), :2187-2199 (buổi), :2106-2111 (Buổi tới), :2113-2119 (giáo viên), :2121-2142 (lớp + khối tự cứu :2137-2140) |
| Test server | apps/server/src/student.test.ts:793-838 (payload), :840-856 (404), :858-907 (legacy), :1658-1731 (#395); apps/server/src/routes/student-class.test.ts:17-46 |
| Test E2E | apps/e2e/specs/student-class-detail.spec.ts:120-217 |

### 1.2 Bạn cùng lớp — GET `/api/student/classes/:classId/classmates`

| Mục | Bằng chứng |
|-----|------------|
| Bề mặt server | apps/server/src/routes/student-classmates.ts:31-82 (guard :42-57, 404 :57; roster :59-70; ánh xạ :72-78) |
| Hợp đồng | packages/api/src/contracts.ts:2222-2232 (khóa 4 trường + bình luận riêng tư) |
| Test server | apps/server/src/routes/student-classmates.test.ts:174-232 |
| Test E2E | apps/e2e/specs/student-classmates.spec.ts:106-136 |

### 1.3 Danh sách lớp (trong tổng quan cổng) — GET `/api/student`

| Mục | Bằng chứng |
|-----|------------|
| Bề mặt server | apps/server/src/routes/student.ts:978-1041 (không lọc trạng thái :983-991; giáo viên nạp 1 lần :990) |
| Client | apps/student/src/routes/_auth/classes/index.tsx:14-22; apps/student/src/components/overview/class-card.tsx:33, :55-68, :99-123, :207-215, :244-265 |
| Test server | apps/server/src/student.test.ts:767-791 |

### 1.4 Ranh giới — kích hoạt ghi danh (POST `/api/student/enrollments/:id/accept`)

Thuộc feature `enrollment-lifecycle`; nêu ở đây chỉ để đóng vòng danh sách lớp. apps/server/src/routes/student.ts:1300-1324; nút client apps/student/src/components/overview/class-card.tsx:99-123; hook apps/student/src/lib/repos/student.ts:819+.

### 1.5 Hạ tầng chắn chung

- Chắn phiên/vai trò cấp nhóm route: apps/server/src/routes/student.ts:500-545 (401 :502-504; chặn giáo viên :506-516; chưa xác thực :529-537); gắn route :718-720.
- Guard học viên (tự dựng trên trạng thái hồ sơ): apps/server/src/routes/student.ts:124-210.
- Gắn sub-app vào API chính: apps/server/src/app.ts:433-437 (bình luận dùng chung guard); cho qua khỏi bootstrap chung :206-218.
- Chắn phiên SPA: apps/student/src/routes/_auth/route.tsx:4-13; cổng trang: apps/student/src/components/layout/student-page-gate.tsx:27-50.

## 2. Validation

| Luật | Bằng chứng |
|------|------------|
| Guard chi tiết lớp: ghi danh ĐÃ KÍCH HOẠT của chính học viên + đúng tổ chức | apps/server/src/routes/student.ts:1048-1063; test :840-856 |
| Guard roster: luật như trên, mọi nhánh đều 404 | apps/server/src/routes/student-classmates.ts:42-57; test apps/server/src/routes/student-classmates.test.ts:207-226 |
| Chặn giáo viên ở lớp giữa cổng | apps/server/src/routes/student.ts:506-516; test apps/server/src/role-gates.test.ts:190-235 |
| Auto-provision trước khi đi tiếp (auto-provision attempt, mơ hồ → mã riêng) | apps/server/src/routes/student.ts:148-175, :191-199 |
| Phân giải tổ chức từ tiêu đề/tham số | apps/server/src/routes/student.ts:177-189 |
| Phân tích hợp đồng phía client (thất bại → trang lỗi chung) | apps/student/src/lib/repos/student.ts:187-218 (:217) |
| Khối tự cứu dữ liệu thiếu (deploy-skew) | packages/api/src/contracts.ts:2137-2140 |
| Điểm IELTS: hình dạng 4 tiêu chí, sai → rỗng (Speaking) | apps/server/src/routes/student-class.ts:213-215; packages/api/src/contracts.ts:2144-2152 |
| Bài tập tới hạn: không ngày mở hoặc ngày mở <= bây giờ | apps/server/src/lib/assignment-visibility.ts:8-16 |
| Thời gian hỏng (nan) → coi như chưa kết thúc (server) / không kết thúc (client) | apps/server/src/routes/student-class.ts:110-112; apps/student/src/components/class/class-lesson-list.tsx:57-67 |

## 3. Errors

| Mã / HTTP | Nơi phát | Chuỗi hiển thị nguyên văn (R2) | Test |
|-----------|----------|-------------------------------|------|
| 401 UNAUTHORIZED | apps/server/src/routes/student.ts:127-129, :502-504 | SPA chuyển hướng đăng nhập (apps/student/src/routes/_auth/route.tsx:4-13) | apps/server/src/student.test.ts:909-914; apps/server/src/routes/student-classmates.test.ts:223-226 |
| 403 STUDENT_EMAIL_UNVERIFIED | apps/server/src/routes/student.ts:130-138, :529-537 | "Email chưa được xác thực" (apps/student/src/components/overview/student-error-view.tsx:109-114) | apps/server/src/role-gates.test.ts:219-235 |
| 403 STUDENT_NOT_LINKED | apps/server/src/routes/student.ts:191-199 | "Tài khoản chưa được liên kết" (:105-108); trang lớp → onboarding (apps/student/src/routes/_auth/classes/$classId.tsx:29-40) | — |
| 403 STUDENT_AMBIGUOUS | không có nơi phát: mã khai ở hợp đồng (contracts.ts:1969) và có màn lỗi client (student-error-view.tsx:115-118) nhưng KHÔNG route server nào trả mã — auto-provision fail/collision nuốt lỗi (student-provisioning.ts:77-83, fail-open) và trả STUDENT_NOT_LINKED (student.ts:166-174) | màn lỗi mơ hồ (apps/student/src/components/overview/student-error-view.tsx:115-118) | — |
| 403 ACCOUNT_TEACHER_ROLE | apps/server/src/routes/student.ts:506-516 | màn lỗi giáo viên (:99-104) | apps/server/src/role-gates.test.ts:190-217 |
| 404 "class not found" | apps/server/src/routes/student.ts:1063; apps/server/src/routes/student-classmates.ts:57 | "Không tìm thấy lớp" + "Lớp này không tồn tại, bạn chưa tham gia, hoặc thuộc tổ chức khác." + "Về trang chủ" (apps/student/src/components/class/class-detail-view.tsx:365-379); roster: "Không tải được danh sách lớp" + "Vui lòng thử lại sau ít phút." (classmates-tab.tsx:43-51) | apps/server/src/student.test.ts:840-856; student-classmates.test.ts:207-226; E2E student-class-detail.spec.ts:209-217 |

Mã lỗi khai báo: packages/api/src/contracts.ts:1967-1971 (STUDENT_ERROR_CODES), :1979-1998 (ACCOUNT_ERROR_CODES).

## 4. Chuỗi hiển thị nguyên văn (nguồn wording — R2)

| Bối cảnh | Chuỗi nguyên văn | Nguồn |
|----------|------------------|-------|
| Danh sách lớp trống | "Bạn chưa tham gia lớp học nào" | apps/student/src/routes/_auth/classes/index.tsx:69-74 |
| Card chờ kích hoạt | "Chờ kích hoạt" / "Tham gia lớp" / "Đang xử lý…" | apps/student/src/components/overview/class-card.tsx:207-215, :99-123 |
| Nhãn trạng thái lớp | "Đang học" / "Đã kết thúc" / "Tạm dừng" / "Đã lưu trữ" | apps/student/src/components/class/class-detail-view.tsx:59-64 |
| Tab trang lớp | "Hành trình học" / "Bài tập" / "Giáo trình" / "Bạn cùng lớp" | apps/student/src/components/class/class-detail-view.tsx:50-55 |
| Banner bài | "Bạn còn {todo.length} bài chưa làm trong {className}" / "Giáo viên đang chờ bài của bạn. Cùng hoàn thành nhé." / "Làm ngay" | apps/student/src/components/class/class-detail-view.tsx:146, :149, :157 |
| Nút liên hệ | "Nhắn giáo viên" | apps/student/src/components/class/class-detail-view.tsx:279 |
| Thẻ giáo viên rỗng | "Chưa có thông tin giáo viên." | apps/student/src/components/class/class-info-card.tsx:150-154 |
| Dòng Buổi tới | "Buổi tới: …" | apps/student/src/components/class/class-info-card.tsx:166-188 |
| Trạng thái buổi | "Đã học" / "Sắp tới" / "Vắng" / "Đã huỷ" / "Nghỉ lễ — Đã dời lịch" / "Đã kết thúc" / "Buổi tới" | apps/student/src/components/class/class-lesson-list.tsx:13-49, :197-203 |
| Hành trình trống | "Chưa có buổi học" / "Giáo viên chưa xếp lịch buổi học cho lớp này." | apps/student/src/components/class/class-lesson-list.tsx:98-106 |
| Bài tập trống | "Chưa có bài tập nào" / "Giáo viên chưa giao bài tập nào cho bạn." | apps/student/src/components/class/class-assignment-table.tsx:31-39 |
| Nhãn bài tập | "Điểm: …" / "Điểm: … · Nộp trễ" / "Đã chấm" / "Đã chấm · Nộp trễ" / "Đã nộp" / "Đã nộp — Đang chờ giáo viên chấm" / "Đã nộp · Trễ hạn" / "Đã nộp trễ — Đang chờ giáo viên chấm" / "Quá hạn" / "Sắp đến hạn" / "Chưa nộp" (11 nhãn) | apps/student/src/lib/assignment-status.ts:146-147, :161, :205, :217, :227-256 |
| Roster các trạng thái | "Đang tải danh sách lớp…" / "Không tải được danh sách lớp" / "Vui lòng thử lại sau ít phút." / "Lớp chưa có học viên nào" / "Khi có bạn mới ghi danh, danh sách sẽ hiện tại đây." / "(bạn)" | apps/student/src/components/class/classmates-tab.tsx:35-62, :6-25 |
| Không tìm thấy lớp | "Không tìm thấy lớp" / "Lớp này không tồn tại, bạn chưa tham gia, hoặc thuộc tổ chức khác." / "Về trang chủ" | apps/student/src/components/class/class-detail-view.tsx:365-379 |
| Lỗi cổng học viên | "Không thể truy cập cổng học viên" (mặc định) + 4 biến thể lỗi | apps/student/src/components/overview/student-error-view.tsx:82-118 |
| Lịch tuần chuẩn | "T2 & T5 · 18:30–20:00" (dựng từ mã lịch) | packages/api/src/format-schedule.ts:49-55 |

## 5. Nguồn test tổng hợp (R1)

- Vitest (đều ACTIVE, không skip/todo/only/fails): apps/server/src/routes/student-class.test.ts:17-46; apps/server/src/routes/student-classmates.test.ts:174-232; apps/server/src/student.test.ts:767-914, :1487-1732; apps/server/src/role-gates.test.ts:190-235; apps/student/src/components/class/class-lesson-list.test.tsx:29-83; apps/student/src/components/class/classmates-tab.test.tsx:25-74.
- Playwright: apps/e2e/specs/student-class-detail.spec.ts:120-257, :320-324; apps/e2e/specs/student-classmates.spec.ts:106-136.
