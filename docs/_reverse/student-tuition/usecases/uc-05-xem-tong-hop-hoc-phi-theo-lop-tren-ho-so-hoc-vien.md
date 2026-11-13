---
feature: student-tuition
type: reverse-usecase
uc: UC-05
status: draft
author: vinh19410
updated: "2026-11-12"
---

# UC-05 — Xem tổng hợp học phí theo lớp trên hồ sơ học viên

a. **Mục tiêu:** Giáo viên giải thích được từng con số học phí của một học viên: tổng đã
   thiết lập, đã đóng, còn lại — tách theo lớp, và hiểu tại sao một lớp bị loại khỏi tổng
   (chưa kích hoạt, chưa thiết lập phí, hóa đơn ngoài lớp).
b. **Actor:** Giáo viên (web SPA) — phân hệ B (OQ-01).
c. **Tiền điều kiện:** Học viên tồn tại (không thì notFound E-12); dữ liệu lớp +
   enrollment + hóa đơn của học viên đã tải ở trang hồ sơ.
d. **Luồng chính (truy vết F5):**
   1. Chọn tab "Học phí" (FR-27).
   2. Kernel tính: chỉ lớp active + có phí được counted (FR-29); paid tính trọn khi
      status paid, còn lại clamp (FR-30); hóa đơn ngoài lớp vào unlinkedPaid (BR-09).
   3. 3 thẻ "Tổng học phí (VND)"/"Đã đóng (VND)"/"Còn lại (VND)", thẻ Còn lại nổi bật khi
      còn nợ (FR-28).
   4. Bảng theo lớp giải thích từng dòng: "Đã đóng đủ" / "Dư Xđ" / "Chưa kích hoạt —
      chưa tính" / số; nhãn "Đã mời" cho lớp chưa active (FR-31, FR-32).
   5. Ghi chú "Ngoài ra đã thu X từ hóa đơn không gắn lớp." khi có (FR-33).
e. **Luồng thay thế:**
   - 2a. Không có enrollment → "Chưa tham gia lớp học nào." (FR-33).
   - 2b. Có lớp nhưng không lớp nào counted → 3 thẻ "—" + dòng hướng dẫn "Chưa lớp nào
     được thiết lập học phí. Thiết lập ở trang lớp." (FR-33).
   - 3a. Học viên không tồn tại → "Không tìm thấy học viên" (E-12).
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần, tính tại client từ kernel snapshot).
g. **Quy tắc liên quan:** FR-27..FR-33; BR-07..BR-11.
h. **Truy vết:** apps/web/src/routes/_auth/students/$studentId.tsx:227-234,
   apps/web/src/routes/_auth/students/$studentId.tsx:326-365;
   apps/web/src/components/tuition/student-tuition-summary.tsx:1-118;
   apps/web/src/lib/tuition-from-kernel.ts:28-48, apps/web/src/lib/tuition-from-kernel.ts:194-205,
   apps/web/src/lib/tuition-from-kernel.ts:329-399;
   apps/e2e/specs/student-tuition-summary.spec.ts:89-218.
