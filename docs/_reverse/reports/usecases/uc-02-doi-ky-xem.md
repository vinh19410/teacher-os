---
feature: reports
type: reverse-usecase
uc: UC-02
status: draft
updated: "2026-11-12"
---

# UC-02 — Đổi kỳ xem (Tháng/Quý/Năm)

a. **Mục tiêu:** Chuyển cửa sổ biểu đồ giữa Tháng (12 kỳ) / Quý (8 kỳ) /
   Năm (5 kỳ) mà không mất ngữ cảnh trang; kỳ chọn share được qua địa chỉ. ✅
   apps/web/src/components/tuition/revenue-chart.tsx:146-170; 🟡 nguồn hệ số
   12/8/5 không truy vết được nghiệp vụ (OQ-08).
b. **Actor:** Giáo viên có quyền tài chính (UC-01.b).
c. **Tiền điều kiện:** Đang ở trang Doanh thu với dữ liệu đã nạp (UC-01).
d. **Luồng chính (F2):**
   1. Bấm một trong 3 nút Tháng/Quý/Năm trong nhóm có nhãn "Kỳ doanh thu"
      (FR-08); nút đang chọn đánh dấu bật cho trình đọc màn
      (revenue-chart.tsx:156).
   2. Địa chỉ đổi thành `?ky=quarter|year|month` bằng THAY THẾ lịch sử — bấm
      liên tục không dồn bước (index.tsx:84-88; BR-06).
   3. Bộ xếp kỳ tính lại ngay; nhãn trục đổi họ (T…/Q…/năm) (FR-05).
   4. Nhãn ảnh biểu đồ đọc lại cửa sổ mới ("Biểu đồ doanh thu 8 quý gần
      nhất, ...") (FR-09).
   e2e xác nhận trọn chuỗi: bấm Quý → URL `?ky=quarter`, nhãn trục Q…, nhãn
   tháng biến mất; bấm Tháng → `?ky=month`. ✅
   apps/e2e/specs/tuition-revenue-chart.spec.ts:179-195.
e. **Luồng thay thế:**
   - 2a. Địa chỉ chứa giá trị lạ (dán link hỏng, chỉnh tay) → chuẩn về Tháng,
     trang chạy bình thường, không crash không điều hướng (E-02). ✅
     apps/e2e/specs/tuition-revenue-chart.spec.ts:198-209.
f. **Hậu điều kiện:** Kỳ mới nằm trong địa chỉ — copy link, làm mới trình
   duyệt đều giữ kỳ; quay lại từ trang khác cũng vậy (BR-06). Không có gì ghi
   xuống máy chủ.
g. **Quy tắc liên quan:** FR-05, FR-08, FR-09; BR-04, BR-06; E-02; NFR-07.
h. **Truy vết:** apps/web/src/components/tuition/revenue-chart.tsx:25-29,
   146-170; apps/web/src/routes/_auth/tuition/index.tsx:40-53, 64, 84-88;
   apps/web/src/lib/tuition-from-kernel.ts:95-97, 112-184.
