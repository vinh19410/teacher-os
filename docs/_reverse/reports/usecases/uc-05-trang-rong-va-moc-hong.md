---
feature: reports
type: reverse-usecase
uc: UC-05
status: draft
updated: "2026-11-12"
---

# UC-05 — Trang rỗng hoặc dữ liệu mốc phát hành hỏng

a. **Mục tiêu:** Với tổ chức trống hoặc dữ liệu cũ hỏng mốc, biểu đồ phải nói
   cho người dùng biết ĐÚNG điều gì đang xảy ra — không bao giờ im lặng với
   chỉ số tài chính (nguyên tắc #343). ✅
   apps/web/src/lib/tuition-from-kernel.ts:108-110; 🟡 sau khi báo, không có
   đường nào sửa mốc hỏng — mất khỏi biểu đồ vĩnh viễn (OQ-04).
b. **Actor:** Giáo viên có quyền tài chính (UC-01.b).
c. **Tiền điều kiện:** Đang ở trang Doanh thu; dữ liệu thuộc một trong hai
   tình huống: (i) cửa sổ kỳ không có hóa đơn hợp lệ nào, (ii) có hóa đơn
   nhưng mốc phát hành 0/không đọc được (snapshot cũ do lệch phiên triển
   khai).
d. **Luồng chính (F3):**
   1. Bộ xếp kỳ đếm số hóa đơn mốc hỏng vào `dropped`; hóa đơn hợp lệ nhưng
      quá cũ ngoài cửa sổ bị loại CÓ CHỦ Ý và KHÔNG tính dropped. ✅
      tuition-from-kernel.ts:107-110, 162-167, 175-178; test :666-676.
   2. Nếu mọi bucket đều 0/0 → khối biểu đồ thay bằng ô rỗng cao tối thiểu,
      testid `revenue-chart-empty`, câu "Chưa có hóa đơn nào trong {cửa sổ}."
      (FR-10). ✅ revenue-chart.tsx:173-184.
   3. Nếu có dropped → câu thêm giải thích "N hóa đơn không đọc được ngày phát
      hành nên không thể xếp kỳ." ngay trong ô rỗng. ✅ :180-182.
   4. Nếu vẫn còn bucket khác 0 → vẽ cột bình thường, đồng thời báo dropped
      bằng 2 kênh nữa: console.warn "[revenue] bỏ qua N hóa đơn không đọc được
      ngày phát hành — không nằm trong biểu đồ doanh thu." và câu tả ảnh
      "...bỏ qua N hóa đơn không đọc được ngày". ✅ :132-142; chú thích dưới
      biểu đồ "(N hóa đơn bỏ qua do thiếu ngày)" :248-252 (E-04).
e. **Luồng thay thế:**
   - 2a. Tổ chức CHƯA có hóa đơn nào từ trước tới nay → vẫn mở được trang và
     biểu đồ ở trạng thái rỗng (FR-10, E-03); bảng hóa đơn hiển thị lời mời
     tạo hóa đơn (E-06 — màn thuộc tuition-invoicing).
   - 4a. Người dùng cần con số chính xác của các hóa đơn bị bỏ qua → chỉ có
     dòng chú thích số lượng, không liệt kê hóa đơn; không có màn sửa mốc
     (OQ-04). 🔵 (code chỉ đọc-loại-đếm :162-167 + negative-search #1, #6
     cho thấy không có endpoint công cụ dữ liệu).
f. **Hậu điều kiện:** Không đổi dữ liệu; lần nạp sau (sau ghi) xếp lại từ đầu.
g. **Quy tắc liên quan:** FR-07, FR-10; BR-03 (cùng luật với mọi bề mặt);
   E-03, E-04, E-06.
h. **Truy vết:** apps/web/src/lib/tuition-from-kernel.ts:107-110, 162-178;
   apps/web/src/lib/repos/invoices.ts:30-33;
   apps/web/src/components/tuition/revenue-chart.tsx:129-142, 173-184,
   248-252; apps/web/src/lib/tuition-from-kernel.test.ts:666-676;
   apps/e2e/specs/tuition-revenue-chart.spec.ts:198-209.
