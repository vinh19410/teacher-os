# UC-08 — Đối soát tài khoản ngân hàng

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính chủ động quét giao dịch tài khoản đã liên kết để nạp những giao dịch chưa chạy qua webhook vào sổ.
- Actor chính: Người tài chính. Actor phụ: Bank Hub (API trung gian).

**b. Kích hoạt & điều kiện trước**: nút "Đối soát" cạnh hàng đợi; org đã liên kết tài khoản (có id công ty).

**c. Luồng chính**:
1. Gửi yêu cầu quét.
2. Máy chủ kéo giao dịch từ tài khoản hiện hành **và** các tài khoản cũ trong lịch sử.
3. Nạp vào sổ qua cùng bộ ghép với webhook — nhưng cho phép lưu cả dòng không có mã (để khỏi mất dấu vết).
4. Tính lại các hóa đơn vừa khớp thêm; trả bộ đếm quét/khớp/chưa khớp.
5. Giao diện báo kết quả; dòng mới chưa khớp rơi vào hàng đợi.

**d. Luồng thay thế/ngoại lệ**:
- 1a. Gọi lại trong 60 giây → 429 "reconcile cooldown"; giao diện cảnh báo "Vừa đối soát, thử lại sau 1 phút." ✅ [S37] apps/server/src/routes/bank-link.ts:278-281, [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:335-339.
- 2a. Bank Hub trả 429 (giới hạn) → route trả 429 kèm Retry-After ✅ [S74] apps/server/src/bank-hub-reconcile.test.ts:230-236.
- 2b. Chưa liên kết công ty → trả bộ đếm 0 ✅ [S37] apps/server/src/routes/bank-link.ts:271-273.
- 1b. Quét lặp lại idempotent — không nhân đôi dòng ✅ [S74] apps/server/src/bank-hub-reconcile.test.ts:208-222.

**e. Hậu điều kiện**: sổ phản ánh đủ giao dịch tài khoản kể cả khi webhook lỡ; mọi dòng không-mã vẫn nằm đợi xử lý tay.

**f. Quy tắc nghiệp vụ**: BR-11 (đã đủ → lý do "đã đủ", vẫn vào sổ).

**g. Yêu cầu**: FR-05, FR-13; NFR-02, NFR-09.

**h. Truy vết**:
- Flow: F7. Error: E-015, E-028.
- Test: ✅ [S74] apps/server/src/bank-hub-reconcile.test.ts:173-236 (4 test: quét hiện-hành+cũ, lưu no_code; idempotent; cooldown 429; 429 lan truyền Retry-After); ✅ [S73] apps/server/src/bank-hub-ipn.test.ts:329-377 (tài khoản cũ sau relink vẫn nhận diện; lỗi API trung gian ack và chờ quét).
- Sources: [S37] apps/server/src/routes/bank-link.ts:255-281; [S11] apps/server/src/lib/payments/ingest-transaction.ts:32-39; [S69] packages/db/src/schema/org-bank-link.ts:11-16.
