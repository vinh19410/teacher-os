# UC-02 — Lưu điểm danh cả ca

a. **Mục tiêu:** Chốt kết quả điểm danh một ca (mọi học viên) trong một request; trạng thái gói buổi học cập nhật theo ánh xạ D2. 🟡 (mục tiêu nghiệp vụ — INF-1/INF-4)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** Ca đang mở ở màn `/attendance` hoặc trang lớp; ngày ca ≤ hôm nay (VN); ca không legacy.
d. **Luồng chính (truy vết F2):**
   1. GV chọn 1 trong 4 trạng thái cho từng học viên, nhập ghi chú ≤255 (FR-09, FR-11).
   2. Bấm `Lưu điểm danh ca học`; client gửi PUT đủ entries (note trim) (FR-12).
   3. Server kiểm: auth/date (400), lớp/scope (404), tương lai (422 `future-session`), roster bucket loại cancelled/holiday (FR-05, FR-13).
   4. Batch UPDATE với ánh xạ D2: present/late/unexcused → `completed`, excused → `absent` (FR-10, BR-01).
   5. Guard roster-count: lệch → 409 `roster-changed`, DB không đổi (FR-14).
   6. 200 `{updated, recorded: true}` → toast `Đã lưu điểm danh` (lần đầu) / `Đã cập nhật điểm danh` (sửa), thu gọn thẻ, refetch.
e. **Luồng thay thế:**
   - 2a. Còn học viên chưa chọn → xem UC-03 (modal hoặc alert, không PUT) (E-25).
   - 4a. id lạ → 422 `unknown-lesson`; thiếu → 422 `incomplete-roster` kèm `missing[]` (E-08, E-09) → toast `Danh sách lớp vừa thay đổi, đã tải lại.` + refetch.
   - 4b. Lỗi khác → banner `Không thể lưu điểm danh. Vui lòng thử lại.` (E-11).
f. **Hậu điều kiện:** `lesson.attendance/attendance_note` cập nhật; `lesson.status` theo D2; bộ đếm dashboard giảm.
g. **Quy tắc liên quan:** FR-06, FR-09..FR-14; BR-01, BR-02, BR-03, BR-10.
h. **Truy vết:** apps/server/src/routes/kernel.ts:2909-3040; packages/api/src/contracts.ts:1365-1382, packages/api/src/contracts.ts:1350-1358; apps/server/src/routes/daily-attendance.test.ts:585-921; packages/api/src/attendance.test.ts:17-114; apps/web/src/routes/_auth/attendance.tsx:162-306.
