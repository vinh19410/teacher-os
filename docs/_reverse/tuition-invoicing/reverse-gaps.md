# Khoảng trống, xung đột & suy đoán — tuition-invoicing

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## 1. Open Questions (OQ)

| OQ | Vấn đề | Bằng chứng | Tác động nếu sai | Đề xuất xác minh |
|---|---|---|---|---|
| OQ-01 | Cột loại và ngày lập của hóa đơn **không còn writer** (tạo không set; đã grep toàn mã máy chủ — không thấy sau khi tìm: chỉ có đọc tại timeline). Mọi hóa đơn mới mang giá trị mặc định rỗng → UI luôn hiện "Khác"/"—". | 🟡 [S7] apps/server/src/routes/kernel.ts:3090-3101 (insert không set), [S7] apps/server/src/routes/kernel.ts:3343 (`type.trim() || "Khác"`) | Người dùng không phân biệt loại khoản thu; dữ liệu chết | Hỏi PO: drop cột hay mở form chọn loại (priority: medium) |
| OQ-02 | Không có **sửa/xóa/hủy** hóa đơn: không endpoint PATCH/DELETE (đã grep `delete(` trên bảng — không thấy sau khi tìm). Nhập sai số tiền → phải tạo hóa đơn mới, hóa đơn cũ kẹt "chưa thu" vĩnh viễn nếu không đánh dấu đủ. | 🟡 [S7] apps/server/src/routes/kernel.ts:3042-3111 (chỉ POST/GET), NS-01 | Nợ ảo trên sổ công nợ | Xác nhận non-goal hay backlog (priority: high nếu người dùng thật đã gặp) |
| OQ-03 | Nhãn quá hạn **có nhánh đọc** giá trị quá hạn từ dữ liệu (recompute giữ nguyên; web suy luận trả quá hạn khi đúng chuỗi) nhưng **không writer nào ghi** giá trị này — dữ liệu cũ trước khi suy-luận-hiển thị? | 🟡 [S10] apps/server/src/lib/payments/recompute-invoice.ts:29-32 (giữ nguyên nếu quá hạn), [S18] apps/web/src/lib/tuition-from-kernel.ts:194-202, NS-02 | Nhánh chết làm rối vòng đời | Đối chiếu dữ liệu production (priority: low) |
| OQ-04 | Web gọi hàng đợi kèm `?status=unmatched` nhưng máy chủ **không đọc** tham số truy vấn nào (luôn trả chưa-khớp). | 🟡 [S21] apps/web/src/lib/repos/payments.ts:92-101, [S4] apps/server/src/routes/payment-transactions.ts:47-61 | Parameter lừa dối người đọc API | Dọn query hoặc implement (priority: low) |
| OQ-05 | Nhắc học phí **không kiểm** trạng thái đăng ký hoạt động: học viên rời lớp (đăng ký bị xóa) vẫn được nhắc nếu còn hóa đơn trỏ về đăng ký đó… miễn hóa đơn còn nợ; lọc lớp chỉ áp khi có chọn lớp. | 🟡 [S7] apps/server/src/routes/kernel.ts:3410-3448 | Nhắc sai đối tượng | Xác nhận business rule (priority: medium) |
| OQ-06 | Giới hạn hiển thị: hàng đợi 50, giao dịch theo phiếu 100, timeline 200/200 — **không phân trang**. | 🟡 [S4] apps/server/src/routes/payment-transactions.ts:61, [S7] apps/server/src/routes/kernel.ts:3245, 3299, 3324 | Giao dịch cũ unreachable trên UI | Đo nhu cầu thật (priority: low) |
| OQ-07 | Cooldown đối soát **1 phút cứng** tại máy chủ; web hardcode cùng con số trong thông điệp. | 🟡 [S37] apps/server/src/routes/bank-link.ts:275-281, [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:335-339 | Đổi server mà quên đổi chữ | Quyết định cấu hình hóa (priority: low) |
| OQ-08 | **Không có thông báo** "tiền đã được ghi nhận" cho học viên khi tự khớp/phiếu thu — chỉ có hai sự kiện tạo-hóa-đơn và nhắc-phí. | 🟡 [S30] apps/server/src/lib/notifications/templates.ts:36-146 (chỉ 2 builder), NS-08 | Trải nghiệm phụ huynh | Hỏi PO có cần sự kiện thứ ba (priority: medium) |
| OQ-09 | "Đã đủ" có **hai lớp**: đánh dấu đủ thủ công (sổ có thể 0) và đủ theo sổ; top-up chỉ chặn khi đủ theo sổ. UI chỉ có một ghi chú cho lớp thủ công. | 🟡 [S4] apps/server/src/routes/payment-transactions.ts:108-115, [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:116-124, 236-241 | Số tiền KPI lệch cảm nhận | Kiểm nhận định nghiệp vụ (priority: medium) |
| OQ-10 | KPI sổ công nợ ghi nhãn "**Tổng phải thu kỳ này**" nhưng tính trên **mọi** hóa đơn, không cửa sổ thời gian. | 🟡 [S3] apps/web/src/routes/_auth/debts/index.tsx:336-340, [S18] apps/web/src/lib/tuition-from-kernel.ts:654-656 | Nhãn gây hiểu nhầm | Đổi nhãn hay thêm cửa sổ? (priority: low) |
| OQ-11 | Khóa chống trùng sổ **duy nhất toàn cục** (không theo tổ chức): hai tổ chức dùng cùng nhà cung cấp và nhận cùng mã giao dịch → tổ chức ghi sau thành no-op. Thực tế mã giao dịch của provider có toàn cục không? | 🟡 [S9] packages/db/src/schema/payment-transaction.ts:53-56, [S11] apps/server/src/lib/payments/ingest-transaction.ts:100-133 | Mất dòng tiền im lặng | Xác minh ngữ nghĩa provider_txn_id của SePay (priority: high nếu trùng được) |
| OQ-12 | Xác định tổ chức từ **tài khoản nhận** có nhánh gọi API trung gian khi tài khoản đã relink; lỗi API → kết quả "api-error", caller ack (nhà cung cấp không retry 5xx), chờ sweep sau. Giáo viên không được báo. | 🟡 [S11] apps/server/src/lib/payments/ingest-transaction.ts:67-87, [S36] apps/server/src/routes/bank-hub-webhooks.ts:13-16 | Tiền vào chờ sweep, không cảnh báo | Thêm badge "chờ đối soát" trên UI? (priority: medium) |
| OQ-13 | Backfill muộn mã/token **thử tối đa 3 lần** khi va chạm mã trùng (~1e-12); sau 3 lần thất bại, trả row vẫn thiếu mã — im lặng. | 🟡 [S14] apps/server/src/lib/payment-instructions.ts:31-54 | Hóa đơn không có QR cho đến lần đọc sau | Chấp nhận (xác suất) hay thêm log (priority: low) |
| OQ-14 | Hộp phiếu thu mặc định chọn **khoản hạn sớm nhất** mỗi lần mở; không ghi nhớ lựa chọn trước. | 🟡 [S24] apps/web/src/components/modals/record-payment-modal.tsx:73-85, [S18] apps/web/src/lib/tuition-from-kernel.ts:622-637 | Tiện dụng | UX preference (priority: low) |
| OQ-15 | Trang công khai **ẩn hạn đóng** có chủ ý (an toàn share) — phụ huynh không biết hạn, chỉ thấy số tiền. | 🟡 [S16] apps/server/src/routes/public-pay.ts:10-17 | Áp lực đúng hạn giảm | Chấp nhận trade-off đã ghi trong code? (priority: low) |
| OQ-16 | Nút "Gán" **không đọc body lỗi** (409 đã-đủ / 404) — gọi xong chỉ invalidate; nếu bị chặn, người dùng chỉ thấy dòng quay lại hàng đợi mà không rõ lý do. | 🟡 [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:397-414 | Trải nghiệm gỡ lỗi kém | Đọc body + toast (priority: medium) |
| OQ-17 | Đánh dấu đủ từ bảng gửi nhãn phương thức rút gọn "CK" — khác với nhãn đầy đủ "Chuyển khoản" mà luồng phiếu thu dùng; hai quy ước nhãn song song trong cùng cột. | 🟡 [S1] apps/web/src/routes/_auth/tuition/index.tsx:329-338, [S13] packages/api/src/contracts.ts:1520-1528 | Dữ liệu phương thức không đồng nhất | Thống nhất một bộ nhãn (priority: low) |

## 2. Gap (khe hở chức năng theo code)

| GAP | Mô tả | Bằng chứng |
|---|---|---|
| GAP-1 | Không CRUD ngoài tạo: không sửa/xóa hóa đơn, không xuất file báo cáo doanh thu | NS-01, NS-05 |
| GAP-2 | Không thông báo khi tiền tự động được nhận (OQ-08) | [S30] apps/server/src/lib/notifications/templates.ts:36-146 |
| GAP-3 | Không phân trang/ch infinite scroll ở 4 bề mặt danh sách (OQ-06) | [S4] apps/server/src/routes/payment-transactions.ts:61, [S7] apps/server/src/routes/kernel.ts:3245 |
| GAP-4 | Hóa đơn hoàn toàn **thủ công**: không sinh theo buổi học/gói (so với feature gói buổi học riêng) | [S7] apps/server/src/routes/kernel.ts:3042-3111 |
| GAP-5 | Cổng học viên xem học phí là feature riêng (`student-tuition`); server-side đã có endpoint đọc sẵn cho cổng | [S38] apps/server/src/routes/student.ts:927-976 |

## 3. Conflict (mâu thuẫn phát hiện được)

| CF | Mâu thuẫn | Phân tích | Kết luận |
|---|---|---|---|
| CF-1 | KPI còn-phải-thu chỉ cộng các hóa đơn **chưa đánh dấu đủ** [S18] apps/web/src/lib/tuition-from-kernel.ts:43-46, trong khi máy chủ vẫn **chấp nhận tiền bù** vào hóa đơn đã đánh dấu đủ mà còn thiếu [S4] apps/server/src/routes/payment-transactions.ts:108-115 → tiền bù về sau không làm KPI đổi (đã thu đủ theo trạng thái). | Hai quy tắc dùng hai định nghĩa "đủ": trạng thái (hiển thị) và số sổ (chống-ghi-thêm). Code chủ đích (comment #320: "status chứ không phải ledger quyết định"). | Không phải bug: tài liệu hóa thành BR-01 + OQ-09 🟡 |
| CF-2 | Sách e2e nói nút "Đã nhận" "**records the payment once**" [S54] apps/web/src/routes/_auth/tuition/index.test.tsx:103 trong khi máy chủ chấp nhận **replay có chủ ý** ghi đè phương thức [S7] apps/server/src/routes/kernel.ts:3119-3124. | e2e đo hành vi UI (chặn thao tác kép trong phiên), máy chủ đo hợp đồng (replay an toàn). Hai tầng khác nhau. | Không mâu thuẫn thật — ghi chú ✅ |

## 4. Inferred (suy đoán có ≥2 chỗ code hậu thuẫn)

| INF | Suy đoán | Bằng chứng |
|---|---|---|
| INF-1 | Quy tắc "tiền đã thu" là **một quy ước chung** cho ít nhất 4 bề mặt (KPI doanh thu, biểu đồ, chi tiết hóa đơn, sổ công nợ) — cùng một hàm nguồn được gọi lại. | 🔵 [S18] apps/web/src/lib/tuition-from-kernel.ts:21-33, [S18] apps/web/src/lib/tuition-from-kernel.ts:39-40, [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:118, [S18] apps/web/src/lib/tuition-from-kernel.ts:595-598 |
| INF-2 | Chống-trùng là **tính chất nền của sổ**, không phải tính năng riêng: cùng một khóa duy nhất phục vụ 3 luồng (IPN gửi lại, sweep quét lại, phiếu thu thử lại). | 🔵 [S9] packages/db/src/schema/payment-transaction.ts:13-18, [S11] apps/server/src/lib/payments/ingest-transaction.ts:100-133, [S12] apps/server/src/lib/payments/record-manual-payment.ts:161-187 |
| INF-3 | "Quá hạn" được thiết kế là **trạng thái suy diễn**, không lưu — chọn tránh lệch múi giờ và tránh writer rải rác. | 🔵 [S18] apps/web/src/lib/tuition-from-kernel.ts:186-193, NS-02, [S45] apps/web/src/lib/week-grid.ts:9-13 |
| INF-4 | Vị trí "capability token" cho link công khai: token 128-bit là đủ an toàn để 404 chung không tiết lộ tồn tại. | 🔵 [S15] packages/api/src/lib/payment-code.ts:35-43, [S16] apps/server/src/routes/public-pay.ts:10-17 |
| INF-5 | Đường top-up (tiền bù vào hóa đơn đánh-dấu-đủ-còn-thiếu) là **thiết kế có chủ ý** của luồng gán — comment nêu rõ và test pin. | 🔵 [S4] apps/server/src/routes/payment-transactions.ts:108-110, [S11] apps/server/src/lib/payments/ingest-transaction.ts:117-122 |

## 5. Negative search (đã tìm — không thấy)

| NS | Pattern | Scope | Kết quả |
|---|---|---|---|
| NS-01 | `delete(invoice)` / DELETE endpoint hóa đơn | apps/server/src (không test) | 0 hit — không có xóa hóa đơn |
| NS-02 | Writer ghi giá trị quá hạn vào trạng thái hóa đơn (`set.*overdue`, insert values) | apps/server/src | 0 hit — không có writer; chỉ nhánh đọc |
| NS-03 | Writer set loại/ngày lập khi tạo (insert không chứa 2 cột) | apps/server/src/routes/kernel.ts:3090-3101 | Không set — NS của OQ-01 |
| NS-04 | Đọc tham số truy vấn trong route hàng đợi | apps/server/src/routes/payment-transactions.ts | 0 hit — tham số bị bỏ qua (OQ-04) |
| NS-05 | Xuất báo cáo/file doanh thu (export, csv, xlsx) | apps/server/src/routes, apps/web/src/routes/_auth/tuition* | 0 hit — không có tính năng xuất |
| NS-06 | Thông báo sự kiện "tiền đã nhận" (builder thứ ba liên quan hóa đơn) | apps/server/src/lib/notifications/templates.ts | Chỉ 2 builder liên quan: tạo-hóa-đơn, nhắc-phí (OQ-08) |
| NS-07 | Cron định kỳ nội bộ cho sweep đối soát ngoài webhook | apps/server/src (scheduled handler) | Sweep chạy theo nút tay + sau webhook; cron nền ngoài scope này 🟡 |
| NS-08 | i18n catalog (thư mục locales / file bản dịch) | toàn repo | Không có — wording là literal trong component (theo đề bài) |
