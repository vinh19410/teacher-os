---
title: "Ship: Input tiền format VNĐ có dấu phân cách (issue #230)"
date: 2026-09-22
summary: "Issue 230: Tạo CurrencyInput nhóm hàng nghìn bằng dấu phẩy, parse/validate thống nhất ở 4 modal và Settings, không đổi contract DB/wire."
---

# Ship: Input tiền format VNĐ có dấu phân cách (issue #230)

## What happened
Triển khai toàn bộ input tiền/phí dùng `CurrencyInput` chung và util `format-currency.ts`. Khi người dùng gõ số tiền, các hàng nghìn tự động được nhóm bằng dấu phẩy (`1,000,000`). Dán chuỗi có định dạng hoặc chứa ký tự khác được tự động lọc.

Áp dụng thành công trên 5 vị trí:
1. Modal Sửa học phí lớp (`edit-class-fee-modal.tsx`)
2. Modal Tạo lớp mới (`add-class-modal.tsx`)
3. Modal Tạo hóa đơn (`add-invoice-modal.tsx`)
4. Modal Thêm học viên (`add-student-modal.tsx`)
5. Trang Cài đặt (`settings.tsx`)

Xóa bỏ hoàn toàn 3 bản copy của regex `AMOUNT_RE` (`/^\d{1,12}$/`).

## Decision
- Phân cách hàng nghìn bằng dấu phẩy (`,`), phù hợp với format nhập tiền phổ biến và yêu cầu issue.
- DB và wire contract giữ nguyên số nguyên VND (`.int().min(1)`).
- Input mode `numeric` kết hợp `type="text"` đảm bảo hiển thị ký tự dấu phẩy mà vẫn kích hoạt bàn phím số trên thiết bị di động.
- Dấu âm `-` bị loại bỏ ở tầng UI mask (input thành rỗng), trigger validation bắt buộc nhập số hợp lệ.

## Next steps
Tạo PR vào nhánh `develop`, chạy CI convergence và merge.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
