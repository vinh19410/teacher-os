# Bằng chứng nghịch đảo — tuition-invoicing

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## 1. Endpoints (method · đường · hành vi · lỗi · nguồn)

| Method | Đường | Hành vi | Lỗi | Nguồn |
|---|---|---|---|---|
| GET | /api/invoices | Danh sách hóa đơn org (snapshot) | — | ✅ [S7] apps/server/src/routes/kernel.ts:1635-1639, [S8] apps/server/src/routes/snapshot.ts:61-93 (mount: [S64] apps/server/src/app.ts:478) |
| POST | /api/invoices | Tạo hóa đơn từ đăng ký; sinh mã + token; phát sự kiện | 401/403; 400 "invalid body"; 404 "enrollment not found"; 409 "Học viên chưa đồng ý tham gia lớp" | ✅ [S7] apps/server/src/routes/kernel.ts:3043-3111 |
| POST | /api/invoices/:id/mark-paid | Đánh dấu đủ thủ công; replay an toàn (ghi đè method) | 401/403; 404 | ✅ [S7] apps/server/src/routes/kernel.ts:3113-3133 |
| POST | /api/invoices/:id/payments | Phiếu thu thủ công từng phần | 400; 404; 409 client-request-id-conflict; 422 invoice-settled / amount-exceeds-debt | ✅ [S7] apps/server/src/routes/kernel.ts:3140-3193 |
| POST | /api/invoices/:id/rotate-pay-token | Xoay token công khai | 404 | ✅ [S7] apps/server/src/routes/kernel.ts:3196-3209 |
| GET | /api/invoices/:id/payment | Dữ liệu QR + trạng thái khả dụng | 404 | ✅ [S7] apps/server/src/routes/kernel.ts:3212-3220 |
| GET | /api/invoices/:id/transactions | Lịch sử giao dịch khớp của hóa đơn | 401/403; 404 | ✅ [S7] apps/server/src/routes/kernel.ts:3224-3264 |
| GET | /api/students/:id/billing-timeline | 200+200 sự kiện dòng thời gian | 401/403; 404 "student not found" | ✅ [S7] apps/server/src/routes/kernel.ts:3270-3387 |
| POST | /api/debt-reminders | Nhắc học phí hàng loạt | 400; 401/403 | ✅ [S7] apps/server/src/routes/kernel.ts:3393-3488 |
| GET | /api/payment-transactions | Hàng đợi chưa khớp (tối đa 50), redact nội dung lạ | 401/403 | ✅ [S4] apps/server/src/routes/payment-transactions.ts:47-61 |
| POST | /api/payment-transactions/:id/assign | Gán vào phiếu + tính lại sổ | 404; 409 INVOICE_ALREADY_PAID | ✅ [S4] apps/server/src/routes/payment-transactions.ts:78-130 |
| POST | /api/payment-transactions/:id/ignore | Bỏ qua các dòng chưa khớp của org | 404 | ✅ [S4] apps/server/src/routes/payment-transactions.ts:132-149 |
| POST | /api/bank-link/reconcile | Đối soát tài khoản → nạp sổ | 401/403; cooldown | ✅ [S37] apps/server/src/routes/bank-link.ts:255-281 (mount: [S7] apps/server/src/routes/kernel.ts:3499) |
| POST | /webhooks/sepay/bankhub/ipn và /events | Hai họ payload tiền vào + vòng đời tài khoản | 401 header; 413 | ✅ [S36] apps/server/src/routes/bank-hub-webhooks.ts:34-36, 105-106 (mount: [S64] apps/server/src/app.ts:411), [S75] apps/server/src/routes/bank-hub-webhooks.test.ts:1-199 |
| GET | /public/pay/:token | Dữ liệu công khai cho phụ huynh | 404 chung | ✅ [S16] apps/server/src/routes/public-pay.ts:21-56 (mount: [S64] apps/server/src/app.ts:423) |
| GET | /api/student/me/invoices (+ payment) | Cổng học viên xem học phí — feature riêng chạm biên | 401 | ✅ [S38] apps/server/src/routes/student.ts:927-976 |

## 2. Validation & hợp đồng

- Tạo hóa đơn: số tiền nguyên ≥1; hạn khớp định dạng ngày ISO; ghi chú ≤500; body nghiêm ngặt (không nhận trường lạ); ghi chú luôn đi kèm khi ghi ✅ [S13] packages/api/src/contracts.ts:1564-1572, [S31] apps/web/src/lib/repos/kernel.ts:71-81.
- Phiếu thu: khóa chống trùng dạng uuid; số tiền nguyên ≥1; ghi chú ≤255; phương thức trong 3 giá trị ✅ [S13] packages/api/src/contracts.ts:1521-1538.
- Nhắc học phí: mảng tối đa 100 học viên, không trùng ✅ [S13] packages/api/src/contracts.ts:4087-4098.
- Ngày trên wire là chuỗi ISO; mốc thời gian là chuỗi ISO từ mili-giây ✅ [S35] packages/api/src/skeleton.ts:75-96, [S8] apps/server/src/routes/snapshot.ts:87-93.
- Hạn "hôm nay" múi giờ Việt Nam tính ở web: [S63] packages/api/src/vietnam-date.ts:27-29 và [S45] apps/web/src/lib/week-grid.ts:29-31.

## 3. Kho thông điệp lỗi (nguyên văn tại chỗ ném/bắt)

| Wording | Bề mặt | Nguồn |
|---|---|---|
| "enrollment not found" | 404 khi tạo | ✅ [S7] apps/server/src/routes/kernel.ts:3063-3067 |
| "Học viên chưa đồng ý tham gia lớp" | 409 khi tạo | ✅ [S7] apps/server/src/routes/kernel.ts:3068-3072 |
| "invalid body" | 400 hạn không hợp lệ khi tạo | ✅ [S7] apps/server/src/routes/kernel.ts:3086-3088 |
| "invoice not found" | 404 các nhánh hóa đơn | ✅ [S7] apps/server/src/routes/kernel.ts:3130, 3152, 3207, 3217, 3233 |
| "finance-forbidden" | 403 role không quyền tài chính | ✅ [S29] apps/server/src/lib/require-finance-role.ts:10-26 |
| "invoice-settled" | 422 phiếu thu vào hóa đơn đủ theo sổ | ✅ [S7] apps/server/src/routes/kernel.ts:3182-3183 |
| "amount-exceeds-debt" + `remaining` | 422 thu vượt số còn thiếu | ✅ [S7] apps/server/src/routes/kernel.ts:3184-3191 |
| "client-request-id-conflict" | 409 trùng khóa phiếu thu khác số tiền | ✅ [S7] apps/server/src/routes/kernel.ts:3180-3181 |
| "INVOICE_ALREADY_PAID" | 409 gán vào hóa đơn đủ theo sổ | ✅ [S4] apps/server/src/routes/payment-transactions.ts:108-115 |
| "reconcile cooldown" + "RECONCILE_COOLDOWN" | bấm đối soát liên tục | ✅ [S37] apps/server/src/routes/bank-link.ts:275-281 |
| "Vui lòng nhập số tiền." / "Số tiền phải là số nguyên dương, tối đa 12 chữ số." / "Vui lòng chọn học viên." / "Vui lòng chọn ngày đến hạn hợp lệ." / "Ghi chú tối đa 500 ký tự." | modal tạo hóa đơn | ✅ [S22] apps/web/src/components/modals/add-invoice-modal.tsx:73-114 |
| "Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ" | modal phiếu thu (client) | ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:21-22 |
| "Hóa đơn đã được ghi nhận đủ trước đó — không lưu thêm phiếu thu." / "Số tiền vượt số dư còn nợ của khoản đang chọn — đã cập nhật số nợ mới." / "Mã phiếu thu đã được dùng cho nội dung khác — đã tạo mã mới, vui lòng kiểm tra lại." | modal phiếu thu (máy chủ) | ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:150-191 |
| "Không lưu được — dữ liệu chưa được ghi lên máy chủ." / "Không xác định được kết quả — có thể đã lưu. Đang tải lại để kiểm tra…" | toast sau ghi | ✅ [S34] apps/web/src/lib/kernel-outcome.ts:70-85 |
| "Bạn không có quyền xem Sổ công nợ" | gate web + chuyển hướng | ✅ [S27] apps/web/src/lib/use-finance-route-guard.ts:12-30 |

## 4. Quy tắc nghiệp vụ — bằng chứng gốc

- **Tiền đã thu theo trạng thái**: trạng thái đủ tính trọn số tiền kể cả khi sổ rỗng; ngược lại lấy min(sổ, số tiền) — một hàm dùng chung cho KPI, biểu đồ, chi tiết, sổ nợ; comment ghi rõ "status chứ không phải ledger quyết định" ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:20-32.
- **Sổ là nguồn thật của số đã thu ghi trên dòng hóa đơn**: giá trị = tổng giao dịch khớp, tính lại mỗi lần tiền vào/gán/phiếu thu, không cộng dồn ✅ [S10] apps/server/src/lib/payments/recompute-invoice.ts:16-24.
- **Tính lại giữ nguyên điểm đủ**: đường cập nhật không hạ trạng thái đã-đủ xuống; thêm gợi ý phương thức mặc định "Chuyển khoản" khi chưa có ✅ [S10] apps/server/src/lib/payments/recompute-invoice.ts:26-38.
- **Một đường ghi duy nhất cho tiền vào**: thông báo ngân hàng và quét đối soát cùng gọi bộ ghép; phân biệt chỉ ở tùy chọn lưu-dòng-không-mã (quét lưu, IPN không) ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:32-51.
- **Chống trùng là khóa duy nhất (nhà cung cấp + mã giao dịch nhà cung cấp)**; phiếu thu dùng khóa phiên làm mã giao dịch ✅ [S9] packages/db/src/schema/payment-transaction.ts:14-18, 53-56.
- **Gán/bỏ qua chỉ tác động dòng chưa khớp của đúng org**; gán chặn khi hóa đơn đã đủ theo sổ (409) nhưng vẫn cho tiền bù khi còn thiếu ✅ [S4] apps/server/src/routes/payment-transactions.ts:78-130.
- **Nhắc học phí đơn vị = hóa đơn còn nợ**, không phải học viên; chống trùng theo ngày Việt Nam ✅ [S30] apps/server/src/lib/notifications/templates.ts:40-54, [S7] apps/server/src/routes/kernel.ts:3410-3448.
- **Trạng thái công nợ 4 mức**: quá hạn > đến hạn sớm (≤7 ngày) > đến hạn > đã đủ; so chuỗi ngày ISO không parse Date ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:480-497.
- **"Quá hạn" là suy diễn hiển thị**: máy chủ không có đường ghi giá trị này (NS-02); web suy ra từ hạn so với hôm nay ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:186-202.

## 5. Thực thể & chỉ mục (schema gốc)

- Hóa đơn: 15 cột; hai khóa ngoài thật xóa-đổ-domino (tổ chức, học viên); tham chiếu đăng ký là văn bản thuần có chủ ý; mã + token là cột rỗng-được-phép với chỉ mục duy nhất riêng ✅ [S5] packages/db/src/schema/invoice.ts:25-60.
- Sổ giao dịch: 17 cột; payload gốc chỉ giữ khi chưa khớp (đã khớp → rỗng để gọn dữ liệu cá nhân); phương thức + người lập chỉ dành cho phiếu thu ✅ [S9] packages/db/src/schema/payment-transaction.ts:25-62.
- Liên kết ngân hàng: 1 dòng/org; khóa chính là id tổ chức; vòng đời none → linked → inactive/unlinked; giữ lịch sử tài khoản cũ ✅ [S69] packages/db/src/schema/org-bank-link.ts:11-46.
- Migration tạo bảng + bổ sung cột: [S41] packages/db/src/migrations/0004_gray_cloak.sql:1-16, [S42] packages/db/src/migrations/0013_perfect_madame_hydra.sql:1-4, [S43] packages/db/src/migrations/0034_familiar_jamie_braddock.sql:21-47.

## 6. Hop ngoài feature (chạm biên)

- **Cổng học viên** xem học phí đọc endpoint có sẵn ở máy chủ — feature `student-tuition` phục vụ UI; ở đây chỉ ghi nhận là hàng xóm ✅ [S38] apps/server/src/routes/student.ts:927-976.
- **packages/ui** — QR panel dùng chung 3 bề mặt (trang chi tiết, modal thu, trang công khai) ✅ [S39] packages/ui/src/components/payments/payment-qr-panel.tsx:29-80.
- **Bank Hub trung gian** giữa ngân hàng và hệ thống; tài khoản xác định tổ chức ✅ [S36] apps/server/src/routes/bank-hub-webhooks.ts:13-16, [S11] apps/server/src/lib/payments/ingest-transaction.ts:67-87.
