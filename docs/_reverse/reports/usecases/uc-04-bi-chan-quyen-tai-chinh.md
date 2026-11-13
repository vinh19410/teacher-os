---
feature: reports
type: reverse-usecase
uc: UC-04
status: draft
updated: "2026-11-12"
---

# UC-04 — Bị chặn vì thiếu quyền tài chính

a. **Mục tiêu:** Trợ giảng / giáo viên phụ trách (vai ngoài danh sách tài
   chính) KHÔNG xem được báo cáo doanh thu — và quan trọng hơn: KHÔNG nhận được
   dữ liệu tiền nào từ máy chủ. Chặn ở DỮ LIỆU là ranh giới chính, giao diện
   chỉ là thiện chí (BR-05). ✅ apps/server/src/routes/snapshot.ts:348;
   🟡 câu chặn nêu "Sổ công nợ" dù cũng chặn trang Doanh thu (OQ-09).
b. **Actor:** Trợ giảng ("ta") / giáo viên phụ trách ("class_teacher") / vai
   lạ hoặc rỗng. ✅ packages/auth/src/role.ts:70-77, 85-87.
c. **Tiền điều kiện:** Đã đăng nhập web giáo viên với vai ngoài danh sách.
d. **Luồng chính (F1):**
   1. Thanh điều hướng không có mục "Doanh thu"; bảng chọn lệnh cũng không
      (FR-02). ✅ sidebar.tsx:128-145; search-index.ts:179-193.
   2. Vào thẳng địa chỉ /tuition → cổng client bắn toast một lần với câu cố
      định "Bạn không có quyền xem Sổ công nợ" và đưa về Tổng quan; trang dừng
      render (E-01). ✅ use-finance-route-guard.ts:6, 16-29; index.tsx:90;
      test index.test.tsx:152-178.
   3. Nền tảng của bước 2: bản chụp máy chủ đã được dựng KHÔNG có hóa đơn —
      mảng rỗng thay vì danh sách thật (BR-05). ✅ snapshot.ts:348.
e. **Luồng thay thế:**
   - 2a. Nếu cổng client bị bỏ qua (bị vá/meo), tầng dữ liệu vẫn không có số
     nào để lộ — trang rỗng thay vì số thật. 🔵 (mảng rỗng ở :348 + mọi số
     derive từ `data.invoices` ở index.tsx:66-82).
f. **Hậu điều kiện:** Không có trạng thái lưu lại; lần sau vào vẫn bị chặn như
   thường. Không ghi log chặn trong phạm vi code đọc.
g. **Quy tắc liên quan:** FR-02; BR-05; E-01; NFR-02 (không áp dụng — màn đích
   không render).
h. **Truy vết:** packages/auth/src/role.ts:70-87;
   apps/web/src/lib/use-finance-route-guard.ts:6-31;
   apps/web/src/components/layout/sidebar.tsx:109, 128-145;
   apps/web/src/components/command-search/search-index.ts:179-193;
   apps/server/src/routes/snapshot.ts:348;
   apps/web/src/routes/_auth/tuition/index.test.tsx:152-178;
   apps/web/src/components/layout/sidebar.test.tsx:76-90.
