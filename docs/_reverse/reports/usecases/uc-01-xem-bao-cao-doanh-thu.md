---
feature: reports
type: reverse-usecase
uc: UC-01
status: draft
updated: "2026-11-12"
---

# UC-01 — Xem báo cáo doanh thu

a. **Mục tiêu:** Giáo viên có quyền tài chính mở trang "Doanh thu" để đọc tình
   hình thu học phí: bốn thẻ chỉ số (Đã thu, Còn phải thu, Số hóa đơn, Chưa
   khớp) và biểu đồ cột kép phát hành/đã thu theo cửa sổ kỳ. ✅
   apps/web/src/routes/_auth/tuition/index.tsx:109-144; 🟡 hai thẻ "Còn phải
   thu" và "Chưa khớp" cùng hướng khác đơn vị — đọc nhanh có gây nhầm (OQ-05).
b. **Actor:** Giáo viên / chủ trung tâm / quản trị (vai trong danh sách tài
   chính, Mục 2 spec). ✅ packages/auth/src/role.ts:75-87.
c. **Tiền điều kiện:** Đã đăng nhập web giáo viên; bản chụp dữ liệu org đã nạp
   (nếu chưa — see E-05). Không có điều kiện dữ liệu khác: tổ chức chưa có hóa
   đơn vẫn mở được trang (FR-10).
d. **Luồng chính (F1, F3):**
   1. Bấm mục "Doanh thu" nhóm "Kinh doanh" trên thanh điều hướng (FR-01).
   2. Route /tuition mở; không có `ky` → kỳ mặc định Tháng (FR-08).
   3. Cổng vai cho qua; máy chủ đã gửi đủ hóa đơn trong bản chụp (BR-05).
   4. Bốn KPI tính bằng bộ luật chung: đã thu, còn phải thu, số hóa đơn kèm
      "{N} đã thu đủ", chưa khớp (FR-03, FR-04).
   5. Chunk biểu đồ tải riêng; trong lúc chờ hiện ô chờ (FR-11).
   6. Biểu đồ vẽ cửa sổ 12 tháng gần nhất (kỳ rỗng vẫn chiếm slot), cột nền
      "Phát hành", cột đè "Đã thu" (FR-05, FR-06, BR-04).
   7. Hóa đơn mốc hỏng bị loại và báo qua 3 kênh (FR-07; chi tiết UC-05).
   8. Bảng hóa đơn phía dưới (ngoài góc đọc của feature — xem
      tuition-invoicing).
e. **Luồng thay thế:**
   - 3a. Vai thiếu quyền → không thấy mục; vào thẳng địa chỉ bị đưa về Tổng
     quan (UC-04, E-01).
   - 4a. Nạp bản chụp lỗi lần đầu → màn chặn lỗi toàn trang kèm thử lại, không
     bao giờ vào trang với số rỗng (E-05).
   - 6a. Cửa sổ không có hóa đơn → ô rỗng kèm câu "Chưa có hóa đơn nào trong
     {cửa sổ}." (E-03; UC-05).
f. **Hậu điều kiện:** Không có dữ liệu nào thay đổi — UC đọc-thuần (FR-14).
   Số trên trang chỉ đổi theo bản chụp mới (FR-13).
g. **Quy tắc liên quan:** FR-01, FR-03..FR-07, FR-11, FR-13, FR-14; BR-01,
   BR-02, BR-03, BR-07; E-03..E-07; NFR-01..05, NFR-08.
h. **Truy vết:** apps/web/src/routes/_auth/tuition/index.tsx:32-38, 60-90,
   94-144; apps/web/src/lib/tuition-from-kernel.ts:21-48, 102-184;
   apps/web/src/components/tuition/revenue-chart.tsx:129-142, 173-189,
   214-229; apps/server/src/routes/snapshot.ts:61-92, 348;
   apps/e2e/specs/tuition-revenue-chart.spec.ts:117-177.
