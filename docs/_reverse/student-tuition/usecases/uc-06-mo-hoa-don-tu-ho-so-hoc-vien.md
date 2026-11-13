---
feature: student-tuition
type: reverse-usecase
uc: UC-06
status: draft
author: vinh19410
updated: "2026-11-12"
---

# UC-06 — Mở hóa đơn từ hồ sơ học viên

a. **Mục tiêu:** Từ dòng hóa đơn trong hồ sơ, giáo viên mở đúng trang chi tiết hóa đơn phía
   giáo viên (cùng app web) để soi QR/nội dung — một nguồn sự thật duy nhất cho khoản thu.
b. **Actor:** Giáo viên (web SPA) — phân hệ B.
c. **Tiền điều kiện:** Đang ở tab Học phí của một học viên có ít nhất một hóa đơn; trang đích
   là chi tiết hóa đơn phía giáo viên trong cùng app web (guard tài chính — cross-ref
   tuition-invoicing).
d. **Luồng chính (truy vết F6):**
   1. Bấm (hoặc Enter) trên dòng hóa đơn trong bảng 5 cột → navigate `/tuition/$invoiceId`
      với search rỗng (#345).
   2. Nếu phiên là học viên: vào chi tiết phiếu — tiếp tục như UC-02.
e. **Luồng thay thế:**
   - 2a. Người dùng không đủ quyền tài chính → trang chi tiết render rỗng do guard tài chính
     (useFinanceRouteGuard — cross-ref tuition-invoicing).
f. **Hậu điều kiện:** Không đổi dữ liệu; vẫn trong cùng app web (rời ngữ cảnh hồ sơ, sang
   trang chi tiết hóa đơn).
g. **Quy tắc liên quan:** FR-33; BR-01.
h. **Truy vết:** apps/web/src/routes/_auth/students/$studentId.tsx:338-350;
   apps/web/src/routes/_auth/tuition/$invoiceId.tsx:35,93-137;
   apps/web/src/lib/format-invoice.ts:8-30.
