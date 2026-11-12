# UC-01 — Xem danh sách điểm danh theo ngày

a. **Mục tiêu:** Giáo viên xem mọi ca học trong một ngày, biết ca nào chưa/đã điểm danh, số học viên và trạng thái từng người, để quyết định ca cần điểm danh tiếp. 🟡 (mục tiêu nghiệp vụ — INF-1)
b. **Actor:** Giáo viên (teacher app). Student/admin bị chặn 403 trước khi vào route.
c. **Tiền điều kiện:** Đã đăng nhập session teacher; org đã bootstrap.
d. **Luồng chính (truy vết F1):**
   1. Mở `/attendance`; URL mặc định `date = hôm nay (VN)`, `status = all` (FR-01, FR-02).
   2. Client gọi GET daily (F1): server gom ca theo bucket, loại buổi cancelled/holiday (FR-03, FR-05).
   3. Ca hiển thị kèm badge `Chưa điểm danh` / `Đã điểm danh (p/t có mặt)` và chip counts (FR-07).
   4. Dữ liệu cũ hiển thị theo quy ước BR-03 (FR-08); lớp legacy chỉ xem (FR-04, BR-12).
   5. Vào từ dashboard: thẻ "Ca học hôm nay chưa điểm danh" dẫn `/attendance?date={hôm nay}&status=pending`, ca pending đầu tự mở (FR-29, F4 bước auto-expand).
e. **Luồng thay thế:**
   - 2a. `?date=` sai định dạng → 400 `invalid-date` → banner `Ngày không đúng định dạng.` (E-03).
   - 3a. Ngày không có ca → empty-state `Không có ca học nào trong ngày này.`; ngày có dữ liệu nhưng hết ca điểm danh được → `Đã điểm danh xong mọi ca trong ngày`.
   - 3b. Lỗi tải → `Không thể tải danh sách ca học trong ngày.` + `Thử lại` (E-12).
f. **Hậu điều kiện:** Không thay đổi dữ liệu (GET thuần); ca pending đầu mở sẵn khi `status=pending`.
g. **Quy tắc liên quan:** FR-01..FR-08, FR-29; BR-02, BR-03, BR-12.
h. **Truy vết:** apps/web/src/routes/_auth/attendance.tsx:56-69, apps/web/src/routes/_auth/attendance.tsx:308-413; apps/server/src/routes/daily-attendance.ts:80-330; apps/server/src/routes/daily-attendance.test.ts:94-583; apps/web/src/routes/_auth/attendance.test.tsx:95-302.
