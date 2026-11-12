---
type: reverse-usecase
feature: online-payment
uc: UC-03
status: draft
updated: 2026-11-12
---
# UC-03 — Thanh toán qua link công khai

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Phụ huynh mở link bất định (không cần đăng nhập), xem QR và số còn nợ, chuyển khoản, và trang tự xác nhận khi đủ tiền |
| (b) Actor chính | Phụ huynh (chưa đăng nhập). Phụ: giáo viên (cấp/thu hồi link) |
| (c) Tiền điều kiện | Hóa đơn đã được cấp mã chuyển khoản + token link (mọi hóa đơn mới đều được cấp); tổ chức đã liên kết tài khoản để dựng QR |
| (d) Hậu điều kiện | Phụ huynh thấy trạng thái chính xác theo thời gian thực gần nhất (poll 5 giay); không có ghi dữ liệu nào từ phía phụ huynh |

**(e) Luồng chính**

1. Giáo viên copy link từ modal thu học phí ("Sao chép link thanh toán"). — ✅ [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:125-204`
2. Phụ huynh mở link; token dưới 10 ký tự → 404 chung ngay. — ✅ [S2] `apps/server/src/routes/public-pay.ts:23-25`
3. Tra hóa đơn theo token (join tổ chức + học viên); không thấy → 404 chung, không phân biệt nguyên nhân. — ✅ [S2] `:27-40`
4. Dựng hướng dẫn: số còn nợ, mã chuyển khoản, nội dung chuẩn, URL QR realtime. — ✅ [S10] `apps/server/src/lib/payment-instructions.ts:62-116`; [S9] `packages/api/src/lib/vietqr.ts:16-30`
5. Lược ghi chú giáo viên + hạn đóng tiền khỏi view; trả kèm tên tổ chức + tên học viên; không cache. — ✅ [S2] `:45-52`
6. Trang poll mỗi 5 giay, chỉ khi tab hiển thị, tối đa 15 phút; đủ tiền → chốt "Đã thanh toán đủ"; hết giờ → nút "Làm mới". — ✅ [S12] `apps/web/src/routes/pay.$token.tsx:51-112`

**(f) Luồng thay thế/đặc biệt**

- f1: Link đã thu hồi (rotate) → token cũ không còn trong DB → 404; wording "Link thanh toán không tồn tại hoặc đã bị thu hồi.". — ✅ [S12] `pay.$token.tsx:72-79`; [S11] `apps/server/src/routes/kernel.ts:3196-3209`
- f2: Chưa liên kết tài khoản → panel hiện hướng dẫn "Giáo viên chưa thiết lập nhận chuyển khoản". — ✅ [S13] `packages/ui/src/components/payments/payment-qr-panel.tsx:34-89`
- f3: Đã thanh toán đủ → trạng thái "Đã thanh toán đủ" thay vì QR. — ✅ [S13] `packages/ui/src/components/payments/payment-qr-panel.tsx:83-89`
- f4: Thanh toán một phần → "Đã nhận p / t" và QR dựng theo số còn nợ mới. — ✅ [S10] `apps/server/src/lib/payment-instructions.ts:67-83`
- f5: Xác nhận tiền về không cần F5: e2e mở /pay, đẩy IPN, trang tự đổi trạng thái. — ✅ [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:298-314`
- f6: Rotate có hộp thoại cảnh báo link cũ chết ngay. — ✅ [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:196-201`

**(g) Dữ liệu chính**

- Vào: token trên URL (duy nhất theo hóa đơn, 128-bit). — ✅ [S9] `packages/api/src/lib/payment-code.ts:36-43`
- Ra: view chỉ đọc (tổ chức, học viên, mã hóa đơn, còn nợ, mã chuyển khoản, nội dung, QR, trạng thái) — không có ghi chú/hạn. — ✅ [S8] `packages/api/src/contracts.ts:3025-3028`

**(h) Truy vết test**

- `apps/server/src/public-pay.test.ts:66-104` (đủ view, thiếu trường nhạy cảm, 404, no-store). — ✅
- E2E: `apps/e2e/specs/tuition-bank-transfer.spec.ts:176-220` (QR + public link), `:222-272` (portal học viên — ranh giới), `:298-314` (tự chốt đủ). — ✅
