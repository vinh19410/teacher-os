---
type: reverse-usecase
feature: online-payment
uc: UC-02
status: draft
updated: 2026-11-12
---
# UC-02 — Nhận và tự khớp giao dịch ngân hàng qua webhook

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Hệ thống nhận thông báo giao dịch từ hub, tự khớp theo mã học phí, ghi sổ và cập nhật hóa đơn không cần giáo viên làm gì |
| (b) Actor chính | Hệ thống SePay Bank Hub. Phụ: giáo viên (chỉ nhận kết quả) |
| (c) Tiền điều kiện | Webhook đã đăng ký; khóa webhook cấu hình đúng; tổ chức đã liên kết tài khoản (hoặc có trong danh sách tài khoản cũ) |
| (d) Hậu điều kiện | Mỗi giao dịch hợp lệ tồn tại đúng một dòng trong sổ; hóa đơn có số đã nhận mới; nếu không khớp thì nằm ở hàng chờ kèm lý do |

**(e) Luồng chính**

1. Hub giao payload tới URL đã ghim (một URL dùng chung cho cả hai họ sự kiện). — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:19-27,105-106`
2. Dispatcher so khóa theo header (vòng đời so với IPN); sai → 401. — ✅ [S1] `:39-46`
3. Payload IPN được kiểm 5 trường bắt buộc; thiếu → 400 + log kèm mã giao dịch. — ✅ [S1] `:70-77`
4. Lọc: chỉ tiền vào, số tiền nguyên dương; không đạt → bỏ qua, vẫn ack. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:58-59`
5. Xác định tổ chức: tra bảng liên kết theo tài khoản nhận; thiếu thì hỏi API hub rồi tra lại theo đại diện. — ✅ [S4] `:69-87`
6. Trích mã học phí từ nội dung; tra hóa đơn cùng tổ chức theo mã. — ✅ [S4] `:61-64,92-98`
7. Ghi sổ trong một statement (trạng thái + lý do + raw), chống trùng bằng ràng buộc duy nhất; tính lại hóa đơn trong cùng batch. — ✅ [S4] `:103-138`; [S4] `apps/server/src/lib/payments/recompute-invoice.ts:19-38`
8. Ack 200 cho hub trong mọi kết quả đã liệt kê. — ✅ [S1] `:100`

**(f) Luồng thay thế/đặc biệt**

- f1: Giao dịch trùng (đã có trong sổ) → no-op, ack 200. — ✅ [S4] `:133`; test [S1] `apps/server/src/routes/bank-hub-webhooks.test.ts:156-170`
- f2: Mã của tổ chức khác → hàng chờ lý do tổ chức khác, nội dung bị che ở DTO. — ✅ [S4] `:123-130`; [S6] `apps/server/src/routes/payment-transactions.ts:62-75`
- f3: Phiếu đã đủ → hàng chờ lý do phiếu đã đủ; hóa đơn không mở lại. — ✅ [S1] `apps/server/src/bank-hub-ipn.test.ts:264-279`
- f4: API hub lỗi khi xác định tổ chức → ack 200 + log; đối soát bù sau. — ✅ [S1] `:95-99`; test `apps/server/src/bank-hub-ipn.test.ts:349-376`
- f5: Mã viết thường vẫn khớp (e2e 300k completes). — ✅ [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:298-314`
- f6: Sự kiện vòng đời không thuộc nhóm tài khoản → ack rỗng, không đổi dữ liệu. — ✅ [S1] `:59-61`; test `apps/server/src/routes/bank-hub-webhooks.test.ts:172-181`
- f7: Thanh toán một phần → hóa đơn "Thu một phần" tới khi đủ. — ✅ [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:274-296`

**(g) Dữ liệu chính**

- Vào: mã giao dịch, loại (tiền vào/ra), số tiền, tài khoản nhận, nội dung, mã thanh toán (nếu hub gửi kèm), mã tham chiếu, thời điểm, raw gốc. — ✅ [S1] `:79-94`
- Ra: dòng sổ (khớp/chưa khớp + lý do), hóa đơn cập nhật số đã nhận + trạng thái + gợi ý "Chuyển khoản". — ✅ [S4] `apps/server/src/lib/payments/recompute-invoice.ts:19-38`

**(h) Truy vết test**

- `apps/server/src/bank-hub-ipn.test.ts:209-419` (một phần/đủ, replay, muộn, 4 lý do, ack lỗi org, viết thường, 401, drift 400, 503). — ✅
- `apps/server/src/routes/bank-hub-webhooks.test.ts:131-198` (IPN qua path vòng đời, replay, lifecycle qua path IPN, sai khóa 401). — ✅
- Bất biến sổ: `apps/server/src/lib/payments/ledger-invariants.test.ts:73-342` (kèm 1 test.fails cố ý về vượt nợ — OQ-3). — ✅
- E2E đầu-cuối: `apps/e2e/specs/tuition-bank-transfer.spec.ts:274-336`. — ✅
