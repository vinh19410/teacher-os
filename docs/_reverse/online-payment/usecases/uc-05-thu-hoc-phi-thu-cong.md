---
type: reverse-usecase
feature: online-payment
uc: UC-05
status: draft
updated: 2026-11-12
---
# UC-05 — Thu học phí thủ công (tiền mặt / kênh khác)

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Giáo viên ghi nhận phiếu thu trực tiếp (một phần hoặc đủ) khi học viên trả bằng tiền mặt hoặc kênh ngoài hệ thống |
| (b) Actor chính | Giáo viên (vai trò tài chính) |
| (c) Tiền điều kiện | Đăng nhập vai trò tài chính; hóa đơn thuộc tổ chức; phiếu chưa đủ tiền |
| (d) Hậu điều kiện | Sổ có dòng nhà cung cấp thủ công; hóa đơn cập nhật số đã nhận; ghi đúp do gửi lại bị triệt tiêu |

**(e) Luồng chính**

1. Giáo viên mở tab thu tiền trong modal, nhập số tiền + phương thức + ghi chú; dialog cấp mã yêu cầu ngẫu nhiên. — ✅ [S8] `packages/api/src/contracts.ts:1530-1538`; [S13] `apps/web/src/components/modals/record-payment-modal.tsx:51-58,82`
2. POST phiếu; tra hóa đơn theo mã + tổ chức (mã lạ và mã không tồn tại không phân biệt). — ✅ [S11] `apps/server/src/routes/kernel.ts:3140-3160`
3. Ghi sổ với guard trong câu ghi: phiếu chưa đủ và số tiền không vượt số còn nợ; chống trùng bằng mã yêu cầu. — ✅ [S4] `apps/server/src/lib/payments/record-manual-payment.ts:97-148`
4. Tính lại hóa đơn kèm nhãn phương thức hiển thị. — ✅ [S4] `:143-148`
5. Trả 201 { id, paidAmount, remaining, status }. — ✅ [S11] `apps/server/src/routes/kernel.ts:3162-3175`

**(f) Luồng thay thế/đặc biệt**

- f1: Gửi lại cùng mã yêu cầu → 200 replayed với số liệu hiện tại, không cộng đúp. — ✅ [S11] `apps/server/src/routes/kernel.ts:3173-3179`; test `apps/server/src/lib/payments/manual-payment.test.ts:224-234`
- f2: Mã yêu cầu trùng nhưng nội dung khác → 409 `client-request-id-conflict`. — ✅ [S11] `apps/server/src/routes/kernel.ts:3180-3181`
- f3: Phiếu đã đủ → 422 `invoice-settled`. — ✅ [S11] `apps/server/src/routes/kernel.ts:3182-3183`
- f4: Vượt số còn nợ → 422 `amount-exceeds-debt` kèm số còn lại. — ✅ [S11] `apps/server/src/routes/kernel.ts:3184-3191`
- f5: Sau ghi, giao dịch ngân hàng khớp mã cùng phiếu vẫn cộng thêm (không trừ phiếu thủ công) — khác UC-02 về vượt nợ, xem OQ-3. — ✅ [S4] `apps/server/src/lib/payments/recompute-invoice.ts:19-38`

**(g) Dữ liệu chính**

- Vào: mã hóa đơn, mã yêu cầu (uuid), số tiền nguyên dương, phương thức (chuyển khoản/tiền mặt/khác), ghi chú ≤ 255 ký tự. — ✅ [S8] `packages/api/src/contracts.ts:1530-1538`
- Ra: mã phiếu, số đã nhận, còn lại, trạng thái. — ✅ [S11] `apps/server/src/routes/kernel.ts:3162-3175`

**(h) Truy vết test**

- `apps/server/src/lib/payments/manual-payment.test.ts:170-390` (tạo/replay/conflict/settled/exceeds/partial/số âm/số 0). — ✅
- `apps/server/src/lib/payments/manual-payment.test.ts:170-390` (HTTP hợp đồng 201/200/409/422/404/400 qua `app.request`: 201 :172, replay 200 :224, 409 :235, 422 :248/:282, 404 org lạ :345, 400 body lỗi :352). — ✅
