---
feature: reports
type: reverse-usecase
uc: UC-03
status: draft
updated: "2026-11-12"
---

# UC-03 — Giữ kỳ khi sang chi tiết hóa đơn và về

a. **Mục tiêu:** Khi đang xem biểu đồ ở một kỳ (ví dụ Quý) rồi mở chi tiết một
   hóa đơn, nút "← Doanh thu" phải trả về ĐÚNG kỳ đó — không rơi về mặc định
   làm mất ngữ cảnh phân tích. Hành vi đã chốt với người dùng (#345). ✅
   apps/web/src/routes/_auth/tuition/$invoiceId.tsx:33-34 (chú thích #345).
b. **Actor:** Giáo viên có quyền tài chính (UC-01.b).
c. **Tiền điều kiện:** Đang ở trang Doanh thu (mọi kỳ); bảng hóa đơn có ít nhất
   một dòng để mở.
d. **Luồng chính (F2):**
   1. Bấm dòng hóa đơn — link sang /tuition/$invoiceId MANG THEO `?ky=` hiện
      tại (FR-12). ✅ apps/web/src/routes/_auth/tuition/index.tsx:274-279
      (`search: { ky: search.ky }`).
   2. Trang chi tiết kiểm tham số kỳ bằng CÙNG bộ luật (chỉ nhận
      month/quarter/year) — không chấp nhận giá trị lạ. ✅
      apps/web/src/routes/_auth/tuition/$invoiceId.tsx:39-43.
   3. Bấm "← Doanh thu": quay về /tuition với `ky` đã giữ; không có `ky` thì
      về mặc định Tháng. ✅ :140 (`backSearch = { ky: ky ?? "month" }`),
      :145-155.
e. **Luồng thay thế:**
   - 2a. Ai đó dán địa chỉ chi tiết kèm `?ky=lạ` → tham số chuẩn về month như
     route chính (E-02 cùng luật hai route).
f. **Hậu điều kiện:** Kỳ xem liên tục giữa hai màn; lịch sử điều hướng không bị
   dồn thêm bước từ chính việc quay về.
g. **Quy tắc liên quan:** FR-12; BR-06.
h. **Truy vết:** apps/web/src/routes/_auth/tuition/index.tsx:274-279;
   apps/web/src/routes/_auth/tuition/$invoiceId.tsx:33-43, 140, 145-155.
   Màn chi tiết hóa đơn (nội dung, thu tiền) thuộc feature tuition-invoicing —
   spec này chỉ đặc tả hành vi GIỮ KỲ.
