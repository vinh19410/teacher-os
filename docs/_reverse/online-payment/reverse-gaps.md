---
type: reverse-gaps
feature: online-payment
status: draft
updated: 2026-11-12
---
# online-payment — Gaps & Open Questions

> Quy ước nhãn: xem legend ở `online-payment-reverse-spec.md` Mục 0. Toàn bộ nhãn dưới đây tuân theo luật đó.

## 1. Open Questions

* [ ] OQ-1: Không có job định kỳ nào tự động đối soát (negative search: `apps/server/src/index.ts:177` chỉ export app, không có scheduled handler). Nếu hub gửi IPN thất bại (4xx/5xx không bao giờ được thử lại) và giáo viên không bấm đối soát, tiền có thật nhưng hóa đơn vẫn chưa khớp vô thời hạn. Cần cron định kỳ hay chấp nhận mô hình "giáo viên chủ động"? — *(liên quan: FR-op-017, NFR-op-001 · cần: PO/dev)*
* [ ] OQ-2: Cooldown đối soát 60 giây là hằng số cứng ở máy chủ (`apps/server/src/routes/bank-link.ts:277-283`); trong tổ chức nhiều giáo viên tài chính, một người bấm khiến người khác bị 429. Ai được bấm, có cần per-user cooldown hay thông báo chờ? — *(liên quan: NFR-op-007, FR-op-022 · cần: PO/dev)*
* [ ] OQ-3: Giao dịch ngân hàng khớp mã được ghi nhận toàn bộ số tiền kể cả vượt số còn nợ; bất biến này có test cố ý đang fail để ghi nhận (`apps/server/src/lib/payments/ledger-invariants.test.ts:336-342`, nhãn `test.fails`), trong khi phiếu thủ công bị chặn vượt (`apps/server/src/routes/kernel.ts:3140-3193`). Chênh lệch vượt được hoàn bằng tay ngoài hệ thống? By-design hay bug cần sửa? — *(liên quan: BR-op-003/004 · cần: PO/BA quyết)*
* [ ] OQ-4: Raw payload chỉ giữ khi giao dịch chưa khớp, xóa khi đã khớp để giới hạn PII (`packages/db/src/schema/payment-transaction.ts:11-24`); nhưng hàng chờ giao dịch lạ có thể tồn tại vô hạn nếu không ai xử lý — raw chứa nội dung chuyển khoản gốc của người lạ. Ngưỡng tồn kho/giới hạn thời gian chấp nhận được? — *(liên quan: NFR-op-011 · cần: PO/dev)*
* [ ] OQ-5: Mô hình "một tổ chức một tài khoản" bị chặn cứng ở máy chủ (`apps/server/src/routes/bank-link.ts:172-187`). Có nhu cầu thật về nhiều tài khoản nhận tiền (chi nhánh, đồng sở hữu) hay giữ nguyên đơn giản hóa? — *(liên quan: BR-op-001 · cần: PO)*
* [ ] OQ-6: Mọi vai trò tài chính bằng quyền nhau: rotate link, đối soát, gán/bỏ qua, thu thủ công (`packages/auth/src/role.ts:74-87`). Có cần phân cấp (chỉ chủ sở hữu được rotate/hủy liên kết)? — *(liên quan: FR-op-011/016/022 · cần: PO)*
* [ ] OQ-7: Trang thanh toán poll 5 giây mỗi tab mở (`apps/web/src/lib/repos/payments.ts:13-31`); mỗi poll là một truy vấn D1 qua 3 bảng. Ngưỡng bao nhiêu link hoạt động đồng thời trước khi cần cache/tính lại theo sự kiện? — *(liên quan: NFR-op-010 · cần: dev)*
* [ ] OQ-8: Link thanh toán được chia sẻ qua nhóm chat ngoài tầm kiểm soát; ai giữ được link xem được tên, số còn nợ và QR (đã che ghi chú + hạn: `apps/server/src/routes/public-pay.ts:45-51`). Chấp nhận rò rỉ cho người ngoài nhóm, hay cần cơ chế thu hồi ngoài rotate (hạn thời gian, khóa sau khi đủ)? — *(liên quan: BR-op-011/012, NFR-op-005/006 · cần: PO)*
* [ ] OQ-9: Sandbox của hub ghim URL IPN đầu tiên từng đăng ký (`apps/server/src/routes/bank-hub-webhooks.ts:19-27`); khi chuyển dev→prod hoặc đổi môi trường, cần quy trình gì để đảm bảo URL IPN sản xuất là URL đầu tiên được đăng ký? — *(liên quan: BR-op-015 · cần: dev/ops)*
* [ ] OQ-10: Tiền vào không kèm mã đến qua IPN bị bỏ hẳn (`apps/server/src/lib/payments/ingest-transaction.ts:32-39`), chỉ qua đối soát mới vào hàng chờ. Người gửi không ghi mã sẽ không bao giờ được ghi nhận nếu giáo viên không bấm đối soát — có nên lưu luôn vào hàng chờ từ IPN? — *(liên quan: BR-op-006, FR-op-009/017 · cần: PO/dev)*

## 2. Gaps (nguồn thiếu hẳn)

| Mục spec | Thiếu gì | Hệ quả nếu không bổ sung | Cần ai bổ sung |
|----------|----------|--------------------------|----------------|
| FR-op-017 | Job tự động đối soát (hiện chỉ có nút tay) | Tiền về nhưng hóa đơn chưa khớp cho tới khi có người bấm; phụ huynh đã chuyển xong vẫn thấy trang "chưa đủ" suốt 15 phút poll rồi phải bấm làm mới | PO/dev (quyết + implement) |
| BR-op-003 | Quyết định + test bất biến về vượt nợ từ ngân hàng | `test.fails` (`apps/server/src/lib/payments/ledger-invariants.test.ts:336-342`) trôi mãi; sửa bất biến sau này có thể đổi hành vi tiền thật | PO/BA (quyết), dev (test) |
| FR-op-018 | Giới hạn tồn kho hàng chờ / phân trang UI | Queue hiển thị tối đa 50 dòng mới nhất (`apps/server/src/routes/payment-transactions.ts:47-61`); giao dịch cũ hơn 50 bị chìm, không UI nào tìm lại được | dev |
| Error matrix | Wording zod chi tiết không bao giờ xuống wire — mọi body sai schema trả "invalid body" chung (`apps/server/src/routes/bank-hub-webhooks.ts:53-57`, `apps/server/src/routes/bank-link.ts:86`) | Người dùng không biết sai trường nào; chấp nhận được vì payload do hub (không phải người) tạo | PO/dev (chỉ ghi nhận) |
| NFR | Độ trễ ack webhook chưa được đo (không có test perf); nhận xét thiết kế nói hub chỉ thử lại khi lỗi mạng | Không biết ngưỡng chịu tải thực của Worker trước D1 batch | dev |
| Boundary | Tài liệu ranh giới với `invoices` (phát hành hóa đơn) và `student-portal` (QR portal) chưa tồn tại (các feature reverse cùng batch) | Trùng lặp hoặc hụt yêu cầu khi ghép SRS | BA (bộ này) |

## 3. Conflicts (nguồn mâu thuẫn)

| Điểm | Nguồn A nói | Nguồn B nói | Ghi chú (ngày/độ tin cậy) |
|------|-------------|-------------|---------------------------|
| Ghi nhận vượt nợ | Phiếu thủ công bị chặn vượt và phiếu đủ bị chặn thêm (`apps/server/src/routes/kernel.ts:3140-3193`; guard `apps/server/src/lib/payments/record-manual-payment.ts:132-139`) | Giao dịch ngân hàng khớp mã được ghi toàn bộ bất chấp số còn nợ (hành vi `apps/server/src/lib/payments/recompute-invoice.ts:19-38` + test `apps/server/src/lib/payments/ledger-invariants.test.ts:336-342` cố ý fail) | 2026-11, cả hai high-confidence — ghi ✅ theo code từng đường, mở OQ-3 chờ PO quyết nhất quán hóa |
| URL IPN ở sandbox | Cấu hình cho phép đặt URL webhook tùy ý | Hub ghim URL đầu tiên từng đăng ký, đổi không có hiệu lực (`apps/server/src/routes/bank-hub-webhooks.ts:19-27`, quan sát 2026-10-07) | Không phải xung đột code — hệ thống đã đối phó bằng dispatch-theo-header ở mọi path; ghi BR-op-015 ✅ |
| Nguồn chân lý trạng thái hóa đơn | `invoice.status` lưu DB | `apps/server/src/lib/payments/recompute-invoice.ts:29-32` tính lại từ sổ mỗi lần ghi và có quyền ghi đè (sticky paid) | Đã thống nhất trong code: sổ là nguồn, status là bản dựng lại — ghi ở states doc |
| Định danh người gửi trên hàng chờ | Hợp đồng DTO che nội dung khi lý do là tổ chức khác (`packages/api/src/contracts.ts:3042-3057`) | Sổ DB vẫn giữ raw payload đầy đủ của giao dịch lạ (`packages/db/src/schema/payment-transaction.ts:19-24`) | Thiết kế có chủ đích (che ở mặt hiển thị, giữ để điều tra/đối soát) — liên quan OQ-4 |

## 4. Inferred assumptions (suy đoán cần verify)

* Hub cam kết tính duy nhất của mã giao dịch bên ngoài, nên unique index hai cột là đủ chống trùng; nếu hub phát lại cùng giao dịch với mã khác (không thấy bằng chứng), chống trùng vỡ. — *(nguồn: `packages/db/src/schema/payment-transaction.ts:53-56` + `apps/server/src/lib/payments/ingest-transaction.ts:133`)*
* Mỗi tổ chức chỉ cần một tài khoản nhận tiền tại một thời điểm; tài khoản cũ chỉ có giá trị trong 7 ngày đối soát. — *(nguồn: `apps/server/src/routes/bank-link.ts:172-187,285-304`)*
* Poll 5 giây là đủ nhanh cho phụ huynh (tiền chuyển xong thấy xác nhận trong ~5s); nếu cần tức thời hơn phải thêm kênh đẩy. — *(nguồn: `apps/web/src/lib/repos/payments.ts:13-15`)*
* Giá trị nhãn "Chuyển khoản" là mặc định gợi ý phương thức khi ghi từ ngân hàng; phiếu thủ công ghi đè bằng nhãn riêng. — *(nguồn: `apps/server/src/lib/payments/recompute-invoice.ts:33-35` + `apps/server/src/routes/kernel.ts:3224-3264`)*
* Sandbox pin IPN URL đầu tiên là đặc tính của môi trường thử nghiệm thôi; môi trường thật cho phép đổi URL. — *(nguồn: `apps/server/src/routes/bank-hub-webhooks.ts:19-27`; chưa có bằng chứng hai chiều → cần verify với nhà cung cấp)*
