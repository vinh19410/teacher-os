---
feature: parent-reports
type: reverse-usecase
uc: UC-03
status: draft
updated: "2026-11-12"
---

# UC-03 — Tạo báo cáo từ hồ sơ học viên

a. **Mục tiêu:** Giáo viên đang xem hồ sơ một học viên soạn ngay báo cáo tuần CHO
   ĐÚNG học viên đó mà không phải chọn lại từ danh sách. 🟡 (tiện lợi điểm vào thứ 2;
   cùng nghiệp vụ với UC-02 — OQ-01)
b. **Actor:** Giáo viên (web, đã đăng nhập).
c. **Tiền điều kiện:** Cụm bật; đang mở hồ sơ học viên.
d. **Luồng chính (truy vấn F3):**
   1. Trên hồ sơ học viên, bấm nút "Tạo báo cáo" (FR-14).
   2. Modal "Tạo báo cáo tuần" mở với trường "Học viên" ĐÃ CHỌN SẴN học viên đang
      xem (FR-08, FR-14).
   3. Các bước soạn/gửi/nháp như UC-02 (d-e).
e. **Luồng thay thế:**
   - 1a. Cờ tắt → nút KHÔNG render và modal cũng không được gắn vào trang — không có
     cách nào mở từ hồ sơ (FR-14).
f. **Hậu điều kiện:** Như UC-02; báo cáo gắn học viên đang xem.
g. **Quy tắc liên quan:** FR-08, FR-09, FR-10, FR-11, FR-14; BR-01, BR-03, BR-04.
h. **Truy vết:** apps/web/src/routes/_auth/students/$studentId.tsx:28, 138, 218-222,
382-389; apps/web/src/components/modals/create-report-modal.tsx:7-19 (defaultStudentId);
apps/web/src/routes/_auth/students/$studentId.reports.test.tsx:19-47.
