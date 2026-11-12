---
feature: parent-reports
type: reverse-usecase
uc: UC-01
status: draft
updated: "2026-11-12"
---

# UC-01 — Xem trang Báo cáo phụ huynh

a. **Mục tiêu:** Giáo viên nhìn một trang biết đã gửi những báo cáo tuần nào cho phụ
   huynh, bao nhiêu báo cáo đã gửi/được đọc, và tin nhắn nào đã đi ra — để biết còn
   báo cáo tuần nào chưa soạn. 🟡 (mục tiêu nghiệp vụ suy từ bố cục trang; xem OQ-01)
b. **Actor:** Giáo viên (web, đã đăng nhập).
c. **Tiền điều kiện:** Cụm parent-reports ĐANG BẬT (hiện tắt — vào /reports sẽ bị
   chuyển hướng về Tổng quan, FR-02).
d. **Luồng chính (truy vấn F2):**
   1. Mở mục "Báo cáo" (nhóm "Kinh doanh") trên điều hướng hoặc gõ địa chỉ /reports
      (FR-01).
   2. Trang hiện tiêu đề "Báo cáo phụ huynh" và kicker: tổng số báo cáo (hoặc "Chưa
      có báo cáo nào") + nhãn "Zalo OA: Chưa kết nối" (FR-03).
   3. Ba thẻ chỉ số: "Tổng báo cáo", "Đã gửi", "Phụ huynh đã đọc" (FR-04).
   4. Mục "Báo cáo đã gửi" hiển thị bảng 6 cột: Học viên, Chu kỳ, Số buổi, Trạng
      thái, Gửi lúc, Phụ huynh xem (FR-05).
   5. Mục "Nhật ký gửi tin nhắn" liệt kê các báo cáo đã gửi, mới nhất trước (FR-06).
e. **Luồng thay thế:**
   - 2a. Chưa có báo cáo nào → kicker "Chưa có báo cáo nào", bảng thay bằng "Chưa có
     báo cáo nào được gửi.", nhật ký thay bằng "Chưa có nhật ký gửi tin nhắn." (E-15).
   - 1a. Cờ tắt → không còn mục điều hướng; vào thẳng địa chỉ → về Tổng quan (E-16).
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần).
g. **Quy tắc liên quan:** FR-03..FR-06; BR-02, BR-05, BR-07.
h. **Truy vết:** apps/web/src/routes/_auth/reports.tsx:35-191;
apps/web/src/lib/repos/reports.ts:4-14; apps/server/src/routes/reporting/loaders.ts:9-30;
apps/web/src/routes/_auth/reports.test.tsx:63-165.
