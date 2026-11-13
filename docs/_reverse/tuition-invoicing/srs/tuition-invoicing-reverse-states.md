# Vòng đời trạng thái hóa đơn — tuition-invoicing

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## Trạng thái ghi thật của máy chủ

Máy chủ chỉ ghi hai giá trị: tạo mặc định `unpaid`, đánh dấu/tính lại có thể sang `paid`. `paid` là điểm kết thúc — mọi đường tính lại đều giữ `paid` ✅ [S10] apps/server/src/lib/payments/recompute-invoice.ts:29-32. Giá trị `overdue` trong dữ liệu KHÔNG có writer nào (NS-02); UI suy ra từ hạn so với hôm nay theo giờ Việt Nam ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:186-202. Giá trị lạ (dữ liệu cũ) được ép về chưa-thu khi hiển thị ✅ [S61] apps/web/src/lib/repos/invoices.test.ts:128-149.

```mermaid
stateDiagram-v2
    [*] --> unpaid: Tạo hóa đơn (mặc định)
    unpaid --> unpaid: Phiếu thu một phần hoặc gán tiền chưa đủ (sổ tăng, trạng thái giữ)
    unpaid --> paid: Đánh dấu đã thu thủ công
    unpaid --> paid: Sổ đạt đủ (tổng khớp so sánh bằng số tiền)
    paid --> paid: Gửi lại đánh dấu (replay, chỉ ghi đè phương thức)
    paid --> paid: Tiền bù vào hóa đơn còn thiếu (chỉ tăng số sổ)
    paid --> [*]
    note right of unpaid
        Quá hạn là suy diễn hiển thị: UI so hạn
        với hôm nay giờ Việt Nam, không có writer.
        Giá trị lạ trên dữ liệu cũ được ép về chưa thu.
    end note
    note right of paid
        paid là điểm kết thúc: mọi đường tính lại
        giữ paid. Với KPI, hóa đơn paid tính đã thu
        trọn amount dù sổ có thể thấp hơn.
    end note
```

## Hai lớp "đã đủ" (kết quả của state machine)

| Lớp | Định nghĩa | Ai đọc | Ai ghi |
|---|---|---|---|
| Trạng thái | cột trạng thái = `paid` | KPI web (tiền đã thu = trọn số tiền), badge, sổ nợ | mark-paid thủ công + đường tính lại khi sổ đủ ✅ [S10] apps/server/src/lib/payments/recompute-invoice.ts:29-32 |
| Sổ | tổng giao dịch khớp so sánh bằng số tiền | điều kiện nhận thêm tiền (chặn khi đủ theo sổ), ô "Còn lại" chi tiết | mỗi lần tiền vào/gán/phiếu thu ✅ [S12] apps/server/src/lib/payments/record-manual-payment.ts:97-196 |

Hệ quả: hóa đơn `paid` nhưng sổ còn thiếu vẫn nhận tiền bù qua gán/phiếu thu — số sổ tăng nhưng KPI không đổi (đã thu trọn theo trạng thái) 🟡 [S4] apps/server/src/routes/payment-transactions.ts:108-110, [S18] apps/web/src/lib/tuition-from-kernel.ts:20-32 → CF-1/OQ-09.
