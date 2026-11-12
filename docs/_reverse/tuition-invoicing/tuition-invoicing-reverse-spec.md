---
type: reverse-srs
feature: tuition-invoicing
status: draft
confidence_summary: "✅ 140 · 🔵 7 · 🟡 21 trong spec (đếm theo luật, loại dòng legend/meta); toàn bộ 20 file: ✅ 391 · 🔵 12 · 🟡 45; 17 OQ mở"
source_commit: "develop @ d6c0f6b5"
---

# Đặc tả nghịch (Reverse SRS) — Feature Hóa đơn học phí & Công nợ (tuition-invoicing)

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

## Mục 0 — Provenance (nguồn nghịch đảo)

### 0.1 Bảng truy vết nguồn

| S-id | Nguồn | Loại | Vai trong đặc tả |
|---|---|---|---|
| S1 | apps/web/src/routes/_auth/tuition/index.tsx | route web | Trang Doanh thu: KPI, gói học, bảng hóa đơn, hàng đợi giao dịch |
| S2 | apps/web/src/routes/_auth/tuition/$invoiceId.tsx | route web | Trang chi tiết hóa đơn: QR, link công khai, lịch sử giao dịch |
| S3 | apps/web/src/routes/_auth/debts/index.tsx | route web | Sổ công nợ: KPI, lọc/tìm, chọn học viên, nhắc học phí |
| S4 | apps/server/src/routes/payment-transactions.ts | route server | Hàng đợi giao dịch chưa khớp: liệt kê/gán/bỏ qua |
| S5 | packages/db/src/schema/invoice.ts | schema | Bảng hóa đơn: cột, khóa, chỉ mục duy nhất |
| S6 | apps/e2e/specs/create-invoice.spec.ts | e2e | R1 tạo hóa đơn hợp lệ/lỗi/trình chọn học viên |
| S7 | apps/server/src/routes/kernel.ts | route server | Tạo/mark-paid/phiếu thu/QR/rotate/giao dịch theo phiếu/timeline/nhắc phí + gate tài chính |
| S8 | apps/server/src/routes/snapshot.ts | loader | Chiếu hóa đơn vào snapshot; ẩn hóa đơn khi thiếu quyền tài chính |
| S9 | packages/db/src/schema/payment-transaction.ts | schema | Sổ giao dịch: cột, khóa duy nhất chống trùng |
| S10 | apps/server/src/lib/payments/recompute-invoice.ts | service | Tính lại số đã thu từ sổ + chốt trạng thái đủ |
| S11 | apps/server/src/lib/payments/ingest-transaction.ts | service | Đường ghi duy nhất tiền vào từ ngân hàng, phân loại chưa khớp |
| S12 | apps/server/src/lib/payments/record-manual-payment.ts | service | Phiếu thu thủ công: guard trong một câu ghi |
| S13 | packages/api/src/contracts.ts | contract | Schema yêu cầu/phản hồi, nhãn phương thức, dạng wire |
| S14 | apps/server/src/lib/payment-instructions.ts | service | Hướng dẫn chuyển khoản, QR, backfill muộn mã + token |
| S15 | packages/api/src/lib/payment-code.ts | util | Sinh mã chuyển khoản + token liên kết công khai |
| S16 | apps/server/src/routes/public-pay.ts | route server | Dữ liệu trang thanh toán công khai (ngoài /api) |
| S17 | apps/web/src/routes/pay.$token.tsx | route web | Trang thanh toán công khai cho phụ huynh |
| S18 | apps/web/src/lib/tuition-from-kernel.ts | helper | KPI doanh thu, trạng thái suy ra, sổ công nợ, doanh thu theo kỳ |
| S19 | apps/web/src/lib/format-invoice.ts | helper | Mã hóa đơn ngắn, nhãn trạng thái, nhãn "còn Xđ" |
| S20 | apps/web/src/lib/repos/invoices.ts | client | Ánh xạ snapshot → mô hình hóa đơn của web |
| S21 | apps/web/src/lib/repos/payments.ts | client | Tải/poll QR, giao dịch, timeline; gọi gán/bỏ qua/đối soát/nhắc |
| S22 | apps/web/src/components/modals/add-invoice-modal.tsx | UI | Modal tạo hóa đơn: validate theo trường |
| S23 | apps/web/src/components/modals/invoice-payment-modal.tsx | UI | Modal thu học phí + hàng đợi chưa khớp + copy/rotate link |
| S24 | apps/web/src/components/modals/record-payment-modal.tsx | UI | Modal phiếu thu từng phần + xử lý lỗi máy chủ |
| S25 | apps/web/src/components/debts/billing-timeline-drawer.tsx | UI | Ngăn kéo dòng thời gian công nợ |
| S26 | apps/web/src/components/tuition/invoice-status-cell.tsx | UI | Ô trạng thái hóa đơn dùng chung ba bề mặt |
| S27 | apps/web/src/lib/use-finance-route-guard.ts | guard | Chặn route tài chính phía web, điều hướng về trang chủ |
| S28 | packages/auth/src/role.ts | role gate | Danh sách vai được truy cập tài chính |
| S29 | apps/server/src/lib/require-finance-role.ts | guard | Chặn endpoint tài chính theo vai, giữ thứ tự 401→403 |
| S30 | apps/server/src/lib/notifications/templates.ts | service | Sự kiện "hóa đơn được tạo" và "nhắc học phí" |
| S31 | apps/web/src/lib/repos/kernel.ts | client | Ánh xạ lệnh web → endpoint máy chủ |
| S32 | apps/web/src/lib/data-store-reducer.ts | store | Cập nhật lạc quan khi đánh dấu đã thu |
| S33 | apps/web/src/lib/use-direct-kernel-action.ts | hook | Chặn thao tác kép, báo kết quả qua toast |
| S34 | apps/web/src/lib/kernel-outcome.ts | hook | Bảng quyết định toast theo kết quả ghi |
| S35 | packages/api/src/skeleton.ts | util | Kiểm ngày lịch thật (roundtrip) |
| S36 | apps/server/src/routes/bank-hub-webhooks.ts | route server | Cửa vào thông báo tiền về từ ngân hàng |
| S37 | apps/server/src/routes/bank-link.ts | route server | Đối soát thủ công + cooldown |
| S38 | apps/server/src/routes/student.ts | route server | Cổng học viên xem hóa đơn của chính mình (bước nháy liên ứng dụng) |
| S39 | packages/ui/src/components/payments/payment-qr-panel.tsx | UI dùng chung | Bảng QR + trường copy được cho 3 bề mặt |
| S40 | apps/web/src/components/tuition/revenue-chart.tsx | UI | Biểu đồ doanh thu + chọn kỳ |
| S41 | packages/db/src/migrations/0004_gray_cloak.sql | migration | Tạo bảng hóa đơn (phần cột ban đầu) |
| S42 | packages/db/src/migrations/0013_perfect_madame_hydra.sql | migration | Thêm hạn đóng + ghi chú vào hóa đơn |
| S43 | packages/db/src/migrations/0034_familiar_jamie_braddock.sql | migration | Tạo sổ giao dịch + thêm mã chuyển khoản/token/đã thu vào hóa đơn |
| S44 | apps/web/src/lib/mock-data.ts | model | Kiểu hóa đơn phía web + định dạng tiền |
| S45 | apps/web/src/lib/week-grid.ts | util | "Hôm nay" theo giờ Việt Nam + định dạng ngày/tháng |
| S46 | apps/server/src/invoice-payment.test.ts | test | R1 hướng dẫn chuyển khoản + rotate token + gate |
| S47 | apps/server/src/invoice-transactions.test.ts | test | R1 lịch sử giao dịch theo phiếu: quyền, 404, DTO |
| S48 | apps/server/src/payment-transactions.test.ts | test | R1 hàng đợi chưa khớp: che mã lạ, gán, bỏ qua |
| S49 | apps/server/src/lib/payments/manual-payment.test.ts | test | R1 phiếu thu: từng phần/idempotent/chặn vượt nợ |
| S50 | apps/server/src/lib/payments/ledger-invariants.test.ts | test | R1 bất biến sổ trên toàn không gian kịch bản hữu hạn |
| S51 | apps/server/src/routes/debt-reminders.test.ts | test | R1 nhắc học phí: lọc lớp, chống trùng ngày, quyền |
| S52 | apps/server/src/routes/billing-timeline.test.ts | test | R1 timeline: thứ tự, ẩn dữ liệu ngân hàng thô, quyền |
| S53 | apps/server/src/lib/require-finance-role.test.ts | test | R1 gate vai tài chính |
| S54 | apps/web/src/routes/_auth/tuition/index.test.tsx | test | R1 trang Doanh thu: KPI, ghi nhận, chặn vai |
| S55 | apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx | test | R1 chi tiết hóa đơn: render, heal dữ liệu, chặn vai |
| S56 | apps/web/src/routes/_auth/debts/index.test.tsx | test | R1 sổ công nợ: KPI, lọc URL, chọn, nhắc, chặn vai |
| S57 | apps/web/src/lib/tuition-from-kernel.test.ts | test | R1 mọi quy tắc tính số (64 test) |
| S58 | apps/web/src/components/modals/add-invoice-modal.test.tsx | test | R1 modal tạo: nhãn lựa chọn, bắt buộc số tiền, reset |
| S59 | apps/web/src/components/modals/record-payment-modal.test.tsx | test | R1 modal phiếu thu: tóm tắt, chọn khoản |
| S60 | apps/web/src/components/modals/invoice-payment-modal.test.tsx | test | R1 modal thu học phí + hàng đợi |
| S61 | apps/web/src/lib/repos/invoices.test.ts | test | R1 ánh xạ snapshot + ép trạng thái lạ về chưa thu |
| S62 | apps/web/src/lib/format-invoice.test.ts | test | R1 mã hóa đơn + nhãn "còn Xđ" |
| S63 | packages/api/src/vietnam-date.ts | util | "Hôm nay" theo giờ Việt Nam phía máy chủ |
| S64 | apps/server/src/app.ts | bootstrap | Gắn trang thanh toán công khai ngoài /api |
| S65 | apps/web/src/lib/data-actions.ts | client | Hợp đồng lệnh ghi phía web cho hóa đơn/phiếu thu |
| S66 | apps/web/src/lib/use-kernel-form-submit.ts | hook | Thông điệp lỗi lưu chung cho form |
| S67 | packages/db/src/schema/enrollment.ts | schema | Đăng ký học viên–lớp: trạng thái, khóa duy nhất |
| S68 | packages/db/src/schema/class.ts | schema | Lớp: học phí mỗi học viên |
| S69 | packages/db/src/schema/org-bank-link.ts | schema | Liên kết tài khoản ngân hàng của tổ chức |
| S70 | packages/db/src/schema/organization.ts | schema | Tổ chức |
| S71 | packages/db/src/schema/student.ts | schema | Học viên |
| S72 | apps/server/src/public-pay.test.ts | test | Trang thanh toán công khai |
| S73 | apps/server/src/bank-hub-ipn.test.ts | test | IPN / khớp giao dịch |
| S74 | apps/server/src/bank-hub-reconcile.test.ts | test | Đối soát |
| S75 | apps/server/src/routes/bank-hub-webhooks.test.ts | test | Webhook |

### 0.2 Liên kết bằng chứng

- Dẫn chiếu `path:line` theo chủ đề: `_evidence.md` (cùng thư mục feature).
- Luồng: `srs/tuition-invoicing-reverse-flows.md`; vòng đời hóa đơn: `srs/tuition-invoicing-reverse-states.md`; mô hình dữ liệu: `srs/tuition-invoicing-reverse-erd.md`; use case: `usecases/`.

### 0.3 Tài liệu tồn tại trước

Không có — `existing_doc = null` (mục này cố ý bỏ trống theo cấu hình trích xuất).

## Mục 1 — Scope

### 1.1 Trong phạm vi

- Hóa đơn học phí cấp **tổ chức**: một hóa đơn gắn với cặp học viên–lớp qua một đăng ký học cụ thể, mang số tiền nguyên dương (VND) và một hạn đóng dạng ngày lịch ✅ [S13] packages/api/src/contracts.ts:1564-1572, [S5] packages/db/src/schema/invoice.ts:25-49.
- Mỗi hóa đơn mới tự nhận một **mã nội dung chuyển khoản** (tiền tố "TOS" + 8 ký tự không trùng) và một **liên kết thanh toán công khai** bằng token 128-bit — sinh ngay lúc tạo, và được bổ sung muộn cho hóa đơn cũ khi lần đầu cần xem ✅ [S15] packages/api/src/lib/payment-code.ts:31-43, [S7] apps/server/src/routes/kernel.ts:3098-3100, [S14] apps/server/src/lib/payment-instructions.ts:21-55.
- **Thu tự động qua chuyển khoản**: giao dịch tiền vào từ ngân hàng (qua thông báo tức thời hoặc lượt quét đối soát) được ghi vào một sổ cái duy nhất và tự khớp vào hóa đơn theo mã nội dung chuyển khoản, sau đó tính lại số tiền đã thu của hóa đơn từ sổ ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:52-141, [S10] apps/server/src/lib/payments/recompute-invoice.ts:19-38.
- **Hàng đợi giao dịch chưa khớp** cho giáo viên: liệt kê, gán thủ công vào một hóa đơn còn nợ, hoặc bỏ qua; kèm nút đối soát thủ công với thời gian chờ một phút ✅ [S4] apps/server/src/routes/payment-transactions.ts:47-149, [S37] apps/server/src/routes/bank-link.ts:255-281.
- **Ghi nhận thủ công** trên giao diện: (a) đánh dấu một hóa đơn là đã thu đủ kèm phương thức hiển thị; (b) lập phiếu thu từng phần cho học viên còn nợ, ghi cùng một sổ cái với dòng tiền ngân hàng ✅ [S7] apps/server/src/routes/kernel.ts:3113-3133, [S12] apps/server/src/lib/payments/record-manual-payment.ts:97-196.
- **Trang Doanh thu**: bốn chỉ số (đã thu, còn phải thu, tổng số hóa đơn, số hóa đơn chưa khớp), biểu đồ doanh thu theo tháng/quý/năm, bảng gói học đang hoạt động và bảng hóa đơn ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:109-145, [S18] apps/web/src/lib/tuition-from-kernel.ts:35-48.
- **Trang chi tiết hóa đơn**: thông tin đầy đủ, ba ô số tiền/đã thu/còn lại, bảng QR thanh toán, quản lý liên kết công khai (sao chép, tạo link mới), lịch sử giao dịch đã khớp của hóa đơn ✅ [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:142-356, [S7] apps/server/src/routes/kernel.ts:3224-3264.
- **Sổ công nợ học viên**: gom nợ theo học viên, ba chỉ số tổng, bộ lọc trạng thái/lớp/từ khóa, chọn hàng loạt học viên còn nợ, phiếu thu, dòng thời gian hóa đơn–giao dịch, và gửi nhắc học phí hàng loạt qua kênh thông báo ✅ [S3] apps/web/src/routes/_auth/debts/index.tsx:301-612, [S18] apps/web/src/lib/tuition-from-kernel.ts:524-686, [S7] apps/server/src/routes/kernel.ts:3270-3488.
- **Trang thanh toán công khai** cho phụ huynh không cần đăng nhập, hoạt động bằng token trong đường dẫn ✅ [S16] apps/server/src/routes/public-pay.ts:18-56, [S17] apps/web/src/routes/pay.$token.tsx:14-116, [S64] apps/server/src/app.ts:423.
- **Phân quyền tài chính**: ba vai (quản trị/chủ trung tâm/giáo viên) được truy cập; vai hỗ trợ và giáo viên phụ trách bị chặn ở cả API lẫn giao diện ✅ [S28] packages/auth/src/role.ts:75-87, [S29] apps/server/src/lib/require-finance-role.ts:15-27, [S27] apps/web/src/lib/use-finance-route-guard.ts:10-31.
- **Thông báo tự động**: khi tạo hóa đơn và khi gửi nhắc học phí, hệ thống phát sự kiện thông báo cho học viên (email + trong ứng dụng) ✅ [S30] apps/server/src/lib/notifications/templates.ts:40-54, [S30] apps/server/src/lib/notifications/templates.ts:130-146, [S7] apps/server/src/routes/kernel.ts:3102-3109.

### 1.2 Ngoài phạm vi (non-goal, có dấu vết trong code)

- **Sửa hoặc xóa hóa đơn**: không tồn tại endpoint xóa (đã tìm `delete` trên bảng hóa đơn trong toàn mã máy chủ — không thấy sau khi tìm, xem `reverse-gaps.md` NS-01); hợp đồng tạo là chốt một chiều ✅ [S7] apps/server/src/routes/kernel.ts:3042-3111 → OQ-02.
- **Sinh hóa đơn định kỳ/tự động theo buổi học**: không có; hóa đơn chỉ được tạo bằng tay 🟡 [S7] apps/server/src/routes/kernel.ts:3043-3111 → OQ-02.
- **Hoàn tiền, thanh toán online qua cổng, hóa đơn thuế**: không có dấu vết trong mã.
- **Cổng học viên xem học phí**: là feature `student-tuition` riêng (theo kế hoạch trích xuất); bài này chỉ ghi nhận bước nháy liên ứng dụng ở các endpoint đọc của cổng ✅ [S38] apps/server/src/routes/student.ts:927-976.
- **Quản lý tài khoản ngân hàng nhận tiền** (liên kết/hủy liên kết): thuộc feature bank-link; bài này chỉ chạm tới khi mô tả điều kiện có QR và đối soát ✅ [S69] packages/db/src/schema/org-bank-link.ts:14-47.

## Mục 2 — Actors

| Actor | Vai | Bằng chứng |
|---|---|---|
| Người quản lý tài chính (chủ trung tâm / quản trị / giáo viên) | Dùng toàn bộ màn hình Doanh thu, Sổ công nợ, chi tiết hóa đơn; tạo hóa đơn, ghi nhận thu, gán giao dịch, gửi nhắc | Ba vai trong danh sách cho phép ✅ [S28] packages/auth/src/role.ts:75-87; mọi endpoint hóa đơn đòi quyền này ✅ [S7] apps/server/src/routes/kernel.ts:209-211 |
| Trợ giảng / giáo viên phụ trách lớp (không vai tài chính) | Bị chặn: API trả 403, giao diện điều hướng về trang chủ kèm thông báo | ✅ [S29] apps/server/src/lib/require-finance-role.ts:23-25, [S27] apps/web/src/lib/use-finance-route-guard.ts:18-26 |
| Phụ huynh/người nộp tiền (không đăng nhập) | Mở liên kết thanh toán công khai, quét QR, copy nội dung chuyển khoản | Token là "capability" 128-bit, không cần phiên ✅ [S16] apps/server/src/routes/public-pay.ts:10-17, [S17] apps/web/src/routes/pay.$token.tsx:14-20 |
| Học viên đã đăng nhập (cổng học viên) | Xem danh sách hóa đơn của chính mình và QR của từng hóa đơn | Endpoint đọc riêng cho học viên ✅ [S38] apps/server/src/routes/student.ts:732-733, [S38] apps/server/src/routes/student.ts:928-976 |
| Ngân hàng / nhà cung cấp trung gian (SePay Bank-Hub) | Gửi thông báo tiền về (IPN) và dữ liệu đối soát; hai họ payload trên cùng một URL, phân biệt bằng header xác thực | ✅ [S36] apps/server/src/routes/bank-hub-webhooks.ts:13-36 |
| Hệ thống (sweep đối soát) | Quét lại giao dịch của các tài khoản liên kết để bắt sự kiện lỡ, đưa tiền không có mã vào hàng đợi | Đường ghi duy nhất nhận cả hai luồng ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:32-39, [S37] apps/server/src/routes/bank-link.ts:255 |

## Mục 3 — Yêu cầu chức năng (FR)

### FR-01 — Tạo hóa đơn học phí

- Người dùng tạo hóa đơn bằng cách chọn một đăng ký học **đang hoạt động** của tổ chức mình; hệ thống tự suy ra học viên từ đăng ký đó — người dùng không chọn học viên trực tiếp ✅ [S7] apps/server/src/routes/kernel.ts:3054-3083, [S22] apps/web/src/components/modals/add-invoice-modal.tsx:48-50, [S6] apps/e2e/specs/create-invoice.spec.ts:219-248.
- Số tiền là số nguyên dương (VND), bắt buộc; hạn đóng bắt buộc, là một ngày có thật trên lịch (ngày 30/02 bị chặn cả client lẫn máy chủ); ghi chú tùy chọn tối đa 500 ký tự ✅ [S13] packages/api/src/contracts.ts:1564-1572, [S35] packages/api/src/skeleton.ts:84-96, [S7] apps/server/src/routes/kernel.ts:3085-3087.
- Máy chủ từ chối tạo khi: đăng ký không tồn tại hoặc thuộc tổ chức khác (404 chung, không phân biệt), hoặc đăng ký chưa được học viên chấp nhận tham gia lớp (409) ✅ [S7] apps/server/src/routes/kernel.ts:3066-3083.
- Lời mời học viên chưa kích hoạt không xuất hiện trong trình chọn của modal — modal chỉ liệt kê đăng ký đang hoạt động ✅ [S22] apps/web/src/components/modals/add-invoice-modal.tsx:48-50, [S6] apps/e2e/specs/create-invoice.spec.ts:219-248.
- Việc tạo **không chống lặp**: mỗi lần bấm tạo một hóa đơn mới (nhất quán với hành vi tạo tài liệu chương trình) ✅ [S7] apps/server/src/routes/kernel.ts:3042-3043, [S13] packages/api/src/contracts.ts:1561-1563.
- Khi tạo thành công, hóa đơn nhận ngay mã nội dung chuyển khoản và liên kết công khai, và hệ thống phát một thông báo "hóa đơn học phí được tạo" cho học viên kèm số tiền và hạn ✅ [S7] apps/server/src/routes/kernel.ts:3089-3109, [S30] apps/server/src/lib/notifications/templates.ts:130-146.
- Form phía web chặn gửi khi thiếu dữ liệu và hiện lỗi theo từng trường; số tiền âm/ký tự lạ bị mặt nạ xóa sạch trước cả khi gửi (không có yêu cầu nào được phát) ✅ [S22] apps/web/src/components/modals/add-invoice-modal.tsx:76-99, [S6] apps/e2e/specs/create-invoice.spec.ts:182-217.
- Form chỉ gửi đúng bốn trường của hợp đồng tạo; loại hóa đơn và phương thức là mặc định của máy chủ, không nằm trong form ✅ [S31] apps/web/src/lib/repos/kernel.ts:71-81, [S22] apps/web/src/components/modals/add-invoice-modal.tsx:14-18.

### FR-02 — Xem doanh thu: chỉ số tổng và danh sách hóa đơn

- Trang Doanh thu hiển thị bốn chỉ số tính từ toàn bộ hóa đơn của tổ chức: tổng đã thu, tổng còn phải thu (ô nổi màu khi còn tiền), tổng số hóa đơn kèm số đã thu đủ, số hóa đơn chưa khớp (chưa đủ tiền) ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:109-131, [S18] apps/web/src/lib/tuition-from-kernel.ts:35-48.
- Mọi con số trên trang suy ra từ dữ liệu máy chủ trong kho dữ liệu trình duyệt; sau khi ghi nhận thu, ứng dụng tải lại dữ liệu để các chỉ số tự cập nhật, không cộng trừ cục bộ ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:66-69, [S6] apps/e2e/specs/create-invoice.spec.ts:167-179.
- Bảng hóa đơn gồm: mã ngắn (thân thiện, vẫn truy được về mã gốc), học viên, loại, số tiền (hiển thị "đã thu / tổng" khi đang thu một phần), ngày lập, hạn đóng (ẩn khi đã thu đủ), trạng thái, và cột hành động ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:256-353, [S19] apps/web/src/lib/format-invoice.ts:7-15.
- Bấm vào dòng (hoặc Enter) mở trang chi tiết hóa đơn; các nút trong dòng chặn sự kiện nổi bọt để không kích hoạt điều hướng dòng ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:272-279, [S1] apps/web/src/routes/_auth/tuition/index.tsx:307-317.
- Kỳ doanh thu (tháng/quý/năm) sống trong đường dẫn dạng `?ky=`; giá trị lạ rơi về mặc định tháng, không gây lỗi hay điều hướng ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:40-53, [S1] apps/web/src/routes/_auth/tuition/index.tsx:84-88.

### FR-03 — Trạng thái hóa đơn: một chiều, "quá hạn" là suy diễn hiển thị

- Máy chủ chỉ ghi **hai** trạng thái lưu trữ: mặc định là chưa thu, và đã thu; không có nơi ghi nào chuyển hóa đơn sang quá hạn (đã tìm trong toàn mã máy chủ — không thấy sau khi tìm, NS-02) ✅ [S5] packages/db/src/schema/invoice.ts:37, [S10] apps/server/src/lib/payments/recompute-invoice.ts:28-36.
- Nhãn "Quá hạn" hiển thị được **suy ra** lúc đọc: hóa đơn chưa đủ tiền mà hạn đóng đã qua ngày hôm nay (theo giờ Việt Nam) → quá hạn; hạn trống hoặc không phải ngày hợp lệ giữ nguyên chưa thu; hạn đúng hôm nay chưa tính quá hạn ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:186-202.
- Khi đủ tiền, hóa đơn ở trạng thái đã thu là **điểm kết thúc**: mọi đường tính lại số đã thu đều giữ nguyên trạng thái đã thu, không bao giờ hạ về chưa thu ✅ [S10] apps/server/src/lib/payments/recompute-invoice.ts:28-36.
- "Đánh dấu đã thu" thủ công: ghi trạng thái đã thu và **ghi đè** phương thức hiển thị bằng giá trị người dùng gửi (thiết kế khóa tương thích, replay có chủ ý); mỗi ô hiển thị đang ghi chặn thao tác kép trên toàn trang ✅ [S7] apps/server/src/routes/kernel.ts:3119-3131, [S1] apps/web/src/routes/_auth/tuition/index.tsx:325-342, [S32] apps/web/src/lib/data-store-reducer.ts:77-87.
- Hóa đơn đang thu một phần hiển thị nhãn riêng "Thu một phần" kèm "còn Xđ"; đã thu đủ thì nhãn "còn Xđ" không bao giờ xuất hiện; cùng một ô trạng thái dùng chung cho bảng doanh thu, trang chi tiết và hồ sơ học viên để không lệch nhãn ✅ [S26] apps/web/src/components/tuition/invoice-status-cell.tsx:14-41, [S19] apps/web/src/lib/format-invoice.ts:47-56.
- Trạng thái lạ từ dữ liệu cũ (không nằm trong ba giá trị hiển thị) được ép về "chưa thu" khi nạp vào web, thiên về an toàn cho số còn phải thu ✅ [S20] apps/web/src/lib/repos/invoices.ts:5-14, [S18] apps/web/src/lib/tuition-from-kernel.ts:41-47.

### FR-04 — Thanh toán chuyển khoản: QR, nội dung và liên kết công khai

- Với mỗi hóa đơn còn phải thu và tổ chức đã liên kết tài khoản nhận, hệ thống dựng **QR chuyển khoản** từ tài khoản liên kết **hiện tại** và số tiền còn nợ **hiện tại**; không có thông tin QR nào được lưu vào dữ liệu ✅ [S14] apps/server/src/lib/payment-instructions.ts:57-116.
- Nội dung chuyển khoản (memo) nhúng mã hóa đơn; người nộp giữ nguyên nội dung để hệ thống tự nhận diện — bảng QR hiển thị cả các trường văn bản để copy, vì văn bản mới là thứ phụ huynh gõ lại ✅ [S39] packages/ui/src/components/payments/payment-qr-panel.tsx:29-47, [S14] apps/server/src/lib/payment-instructions.ts:96-115.
- Khi hóa đơn đã đủ tiền (kể cả đánh dấu thủ công với số sổ bằng 0), QR báo "đã thanh toán đủ" và không cho phép; khi tổ chức chưa liên kết tài khoản, panel giải thích rõ chưa thiết lập nhận chuyển khoản ✅ [S14] apps/server/src/lib/payment-instructions.ts:78-94, [S39] packages/ui/src/components/payments/payment-qr-panel.tsx:34-36.
- Liên kết thanh toán công khai hiển thị kèm trang chi tiết và modal; giáo viên sao chép được link kể cả khi hóa đơn đã đủ (trang công khai vẫn hiện trạng thái), nhưng chỉ được **tạo link mới** khi hóa đơn còn phải thu; việc tạo link mới làm link cũ vô hiệu, có hộp xác nhận và cảnh báo rõ phụ huynh giữ link cũ sẽ không mở được ✅ [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:118-204, [S7] apps/server/src/routes/kernel.ts:3195-3209.
- Mã nội dung và token được bổ sung muộn cho hóa đơn cũ ra đời trước khi có tính năng này, an toàn khi hai phiên cùng chạy (bản ghi thua cuộc cập nhật 0 dòng và đọc lại bản của người thắng); va chạm mã trùng hiếm gặp sẽ thử lại với mã mới ✅ [S14] apps/server/src/lib/payment-instructions.ts:14-55.
- Mã nội dung dùng bảng chữ không có ký tự dễ nhầm (không I/L/O/U) và hệ thống nhận diện mã trong nội dung chuyển khoản theo kiểu không phân biệt hoa/thường nhưng có biên từ — nội dung chứa thương hiệu trùng tiền tố không bị nhầm là mã ✅ [S15] packages/api/src/lib/payment-code.ts:1-14.

### FR-05 — Ghi nhận tiền vào sổ: tự khớp theo mã, chống trùng, tính lại từ sổ

- Mọi giao dịch tiền vào từ ngân hàng đi qua **một đường ghi duy nhất** (cả thông báo tức thời lẫn đối soát), thực hiện trong một lô nguyên tử: ghi sổ quyết định trạng thái khớp ngay trong câu ghi (không có cửa sổ đọc–ghi chênh lệch), rồi tính lại hóa đơn từ sổ ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:41-141, [S10] apps/server/src/lib/payments/recompute-invoice.ts:8-18.
- Chỉ nhận **tiền vào** có số nguyên dương; tiền ra và số không hợp lệ bị bỏ qua ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:58-59.
- Sổ cái chống trùng bằng cặp (nhà cung cấp, mã giao dịch của nhà cung cấp) là chỉ mục duy nhất toàn cục: thông báo gửi lại, quét lại, hoặc thử lại phiếu thu đều trở thành không-op ✅ [S9] packages/db/src/schema/payment-transaction.ts:53-56, [S11] apps/server/src/lib/payments/ingest-transaction.ts:100-133.
- Tiền tự khớp vào hóa đơn khi mã trong nội dung (hoặc trường mã của ngân hàng) khớp mã của hóa đơn **trong cùng tổ chức** — mã hợp lệ của tổ chức khác không bao giờ đụng vào hóa đơn của tổ chức này ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:89-98.
- Giao dịch không khớp được phân loại thành bốn lý do: không có mã; mã không tồn tại trong tổ chức; mã thuộc tổ chức khác; hóa đơn đã đủ tiền — và payload gốc của ngân hàng chỉ được giữ khi giao dịch chưa khớp, dòng đã khớp xóa payload để giới hạn dữ liệu nhạy cảm ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:117-131, [S9] packages/db/src/schema/payment-transaction.ts:19-23.
- Số tiền đã thu của hóa đơn **luôn được tính lại từ sổ** (tổng các dòng đã khớp), không bao giờ cộng dồn trực tiếp — nhờ vậy mọi luồng (replay, đối soát, gán tay) đều idempotent ✅ [S10] apps/server/src/lib/payments/recompute-invoice.ts:5-6, [S10] apps/server/src/lib/payments/recompute-invoice.ts:19-38.
- Hóa đơn đã đủ tiền không nhận thêm tiền tự động: dòng mới vào hàng đợi với lý do "đã đủ"; nhưng hóa đơn **đã đánh dấu đủ mà còn thiếu so với sổ** vẫn chấp nhận tiền bù (đường top-up) ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:117-130, [S4] apps/server/src/routes/payment-transactions.ts:108-115.
- Số tiền hóa đơn của tổ chức khác không bao giờ bị tính; tổ chức được xác định từ **tài khoản nhận** (kèm cầu truy vấn API trung gian khi tài khoản đã được liên kết lại), không từ nội dung chuyển khoản 🟡 [S11] apps/server/src/lib/payments/ingest-transaction.ts:67-87 → OQ-12.

### FR-06 — Hàng đợi giao dịch chưa khớp

- Giáo viên thấy tối đa **50 giao dịch chưa khớp mới nhất** của tổ chức, mới nhất trước ✅ [S4] apps/server/src/routes/payment-transactions.ts:47-76.
- Dòng lý do "mã thuộc tổ chức khác" bị **che nội dung và mã** (trả rỗng/null) — nội dung chuyển khoản của tổ chức khác là bí mật ✅ [S4] apps/server/src/routes/payment-transactions.ts:14-19, [S4] apps/server/src/routes/payment-transactions.ts:62-75, [S48] apps/server/src/payment-transactions.test.ts:137-156.
- Người dùng gán một giao dịch vào một hóa đơn trong danh sách hóa đơn còn nợ của trang (gồm cả hóa đơn đã đánh dấu đủ nhưng còn thiếu); gán thành công chuyển giao dịch sang "đã khớp" và tính lại hóa đơn trong cùng lô ✅ [S4] apps/server/src/routes/payment-transactions.ts:78-130, [S1] apps/web/src/routes/_auth/tuition/index.tsx:355-367.
- Gán vào hóa đơn đã đủ tiền bị từ chối 409 kèm mã máy; gán vào giao dịch đã được xử lý (không còn "chưa khớp") trả 404 như không tồn tại; bỏ qua chỉ đổi trạng thái những dòng vẫn chưa khớp của tổ chức mình ✅ [S4] apps/server/src/routes/payment-transactions.ts:95-115, [S4] apps/server/src/routes/payment-transactions.ts:132-149, [S48] apps/server/src/payment-transactions.test.ts:181-202.
- Nút đối soát gọi endpoint liên kết ngân hàng; trong thời gian chờ một phút, lần gọi tiếp theo nhận lỗi cooldown và giao diện báo "Vừa đối soát, thử lại sau 1 phút." ✅ [S37] apps/server/src/routes/bank-link.ts:255-281, [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:294-339.
- Sau khi đối soát xong, giao diện báo đúng cặp số khớp/chưa khớp từ máy chủ và làm mới dữ liệu 🔵 [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:329-334, [S13] packages/api/src/contracts.ts:3083-3087.

### FR-07 — Phiếu thu thủ công từng phần (trên Sổ công nợ)

- Người dùng lập phiếu thu cho **một hóa đơn còn nợ** của học viên: chọn khoản (nếu nhiều), nhập số tiền thực thu, chọn phương thức (chuyển khoản/tiền mặt/khác), ghi chú tùy chọn ≤ 255 ký tự; nút "thu toàn bộ" điền sẵn số còn nợ ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:193-320, [S13] packages/api/src/contracts.ts:1530-1538.
- Mỗi lần mở hộp thoại sinh **một mã chống lặp** dùng xuyên suốt phiên hộp thoại; gửi lại vì mạng lỗi trở thành replay của cùng một dòng sổ thay vì ghi đúp tiền ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:71-85, [S12] apps/server/src/lib/payments/record-manual-payment.ts:20-29, [S13] packages/api/src/contracts.ts:1509-1516.
- Phiếu thu ghi **một dòng sổ đã khớp** (nhà cung cấp "manual", ghi người lập) và tính lại hóa đơn trong cùng một lô — cùng nguồn sự thật với dòng tiền ngân hàng ✅ [S12] apps/server/src/lib/payments/record-manual-payment.ts:84-149.
- Máy chủ chặn trong chính câu ghi: phiếu vào hóa đơn đã đủ → 422 "đã tất toán"; số tiền vượt số dư còn nợ → 422 kèm số dư mới; hai phiếu đua nhau không bao giờ vượt nợ (phiếu thua không ghi dòng nào); mã chống lặp đã dùng cho nội dung khác → 409 ✅ [S12] apps/server/src/lib/payments/record-manual-payment.ts:84-96, [S7] apps/server/src/routes/kernel.ts:3162-3192, [S49] apps/server/src/lib/payments/manual-payment.test.ts:248-343.
- Khi máy chủ từ chối, hộp thoại **không đóng**: số liệu được làm mới từ máy chủ rồi báo lỗi nguyên văn tương ứng; với 409, hệ thống tự cấp mã chống lặp mới để lần lưu sau không kẹt vĩnh viễn ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:154-191.
- Khi kết quả chưa chắc chắn (mất phản hồi), hộp thoại giữ mở và đưa ra lối "kiểm tra lại" — một ghi có thể đã lưu không bao giờ được phát lại mù quáng ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:189-191, [S66] apps/web/src/lib/use-kernel-form-submit.ts:61-64.
- Hộp thoại dự báo trước "số dư còn nợ sau giao dịch này" và nhãn trạng thái sẽ chuyển sang ✅ [S24] apps/web/src/components/modals/record-payment-modal.tsx:103-106, [S24] apps/web/src/components/modals/record-payment-modal.tsx:291-293.

### FR-08 — Sổ công nợ học viên

- Sổ gom theo học viên có ít nhất một hóa đơn: phải đóng (tổng số tiền), đã thu (theo quy tắc tiền đã thu từng hóa đơn), còn nợ (kẹp không âm), hạn đóng sớm nhất trong các khoản còn nợ, và trạng thái nợ tổng hợp ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:524-686.
- Trạng thái nợ bốn mức, ưu tiên từ trên xuống trên các khoản còn nợ: có khoản quá hạn → quá hạn; có khoản đến hạn trong 7 ngày tới → sắp đến hạn; còn nợ khác → còn nợ; không còn khoản nào còn nợ → đã thu đủ ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:472-497.
- Bộ lọc: chip trạng thái (4 nhãn), lớp (hộp chọn), từ khóa tìm không dấu trên họ tên/email/SĐT; trạng thái và lớp sống trong URL; từ khóa debounce 300ms mới đẩy lên URL ✅ [S3] apps/web/src/routes/_auth/debts/index.tsx:40-64, [S3] apps/web/src/routes/_auth/debts/index.tsx:127-140, [S56] apps/web/src/routes/_auth/debts/index.test.tsx:257-295.
- Ba chỉ số tổng và bộ đếm chip tính trên tập **sau lọc lớp + tìm kiếm, trước chip trạng thái** — đổi chip không đổi KPI ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:517-523, [S56] apps/web/src/routes/_auth/debts/index.test.tsx:225-256.
- Chỉ học viên **còn nợ** mới được chọn bằng ô kiểm; dòng đã thu đủ có ô kiểm mờ; chọn tối đa phát sinh nút "Gửi nhắc học phí (n)"; nút chọn-tất-cả chọn toàn bộ dòng còn nợ đang hiển thị ✅ [S3] apps/web/src/routes/_auth/debts/index.tsx:224-259, [S3] apps/web/src/routes/_auth/debts/index.tsx:440-497.
- Khi lọc theo lớp, chỉ hóa đơn trỏ về đăng ký của lớp đó được tính; khi không lọc, học viên không có đăng ký khớp vẫn hiện tên các lớp đang active của họ 🔵 [S18] apps/web/src/lib/tuition-from-kernel.ts:543-548, [S18] apps/web/src/lib/tuition-from-kernel.ts:611-615.
- Hai trạng thái rỗng phân biệt: chưa có khoản thu nào (hướng dẫn bấm tạo) và không ai khớp bộ lọc (gợi ý xóa bộ lọc) ✅ [S3] apps/web/src/routes/_auth/debts/index.tsx:405-442.

### FR-09 — Dòng thời gian hóa đơn & giao dịch theo học viên

- Ngăn kéo trên Sổ công nợ hợp nhất hai loại sự kiện: phát hành hóa đơn và dòng tiền đã khớp (ngân hàng hoặc thủ công), sắp mới nhất trước; cùng mốc thời gian thì dòng tiền đứng trước ✅ [S7] apps/server/src/routes/kernel.ts:3266-3386, [S52] apps/server/src/routes/billing-timeline.test.ts:267-335.
- Giới hạn 200 sự kiện mỗi loại; hóa đơn hiển thị trạng thái hai mức đã thu/chưa thu (không có quá hạn trong timeline) ✅ [S7] apps/server/src/routes/kernel.ts:3284-3349.
- Dòng tiền ngân hàng **không** trả về nội dung chuyển khoản gốc, nhà cung cấp hay định danh nội bộ — chỉ nguồn hiển thị "QR Bank-Hub"; dòng thủ công trả nhãn phương thức và ghi chú của giáo viên ✅ [S7] apps/server/src/routes/kernel.ts:3351-3373, [S52] apps/server/src/routes/billing-timeline.test.ts:336-346.
- Mã hóa đơn trong timeline là mã ngắn cùng quy ước với bảng doanh thu ✅ [S7] apps/server/src/routes/kernel.ts:3327, [S19] apps/web/src/lib/format-invoice.ts:7-9.
- Ngăn kéo bám chuẩn tiếp cận: bẫy focus, đóng bằng Escape/backdrop, trả focus về nơi gọi; tải riêng theo học viên, lỗi có nút thử lại ✅ [S25] apps/web/src/components/debts/billing-timeline-drawer.tsx:108-144, [S25] apps/web/src/components/debts/billing-timeline-drawer.tsx:224-242.

### FR-10 — Gửi nhắc học phí hàng loạt

- Người dùng gửi nhắc cho các học viên đang chọn (chỉ gồm người còn nợ); máy chủ tìm **các hóa đơn còn nợ** của những học viên đó (chưa đủ và số sổ < số tiền), có thể thu hẹp theo lớp khi đang lọc lớp; đơn vị đếm là **hóa đơn**, không phải học viên ✅ [S7] apps/server/src/routes/kernel.ts:3389-3488, [S13] packages/api/src/contracts.ts:4083-4099.
- Tối đa 100 học viên mỗi lần gọi, không cho phép trùng định danh; vi phạm → 400 ✅ [S13] packages/api/src/contracts.ts:4087-4098, [S51] apps/server/src/routes/debt-reminders.test.ts:368-386.
- Số tiền nhắc là **số còn nợ thật** (số tiền trừ phần đã trừ an toàn), không phải toàn bộ số hóa đơn ✅ [S7] apps/server/src/routes/kernel.ts:3451-3461, [S51] apps/server/src/routes/debt-reminders.test.ts:310-335.
- Chống trùng theo **ngày Việt Nam**: cùng một hóa đơn trong cùng một ngày chỉ nhắc một lần — gọi lại trong ngày không nhắc thêm lần nào (kết quả rỗng) và giao diện báo "đã nhắc hôm nay" ✅ [S30] apps/server/src/lib/notifications/templates.ts:36-54, [S51] apps/server/src/routes/debt-reminders.test.ts:336-366, [S3] apps/web/src/routes/_auth/debts/index.tsx:280-296.
- Gửi qua hàng đợi thông báo email + trong ứng dụng và ghi nhật ký thông báo; giao diện làm mới nhật ký, xóa lựa chọn, toast kèm lối xem nhật ký ✅ [S7] apps/server/src/routes/kernel.ts:3463-3488, [S3] apps/web/src/routes/_auth/debts/index.tsx:261-297.
- Thất bại mạng/ghi → toast lỗi nguyên văn "Không gửi được nhắc học phí. Vui lòng thử lại." ✅ [S3] apps/web/src/routes/_auth/debts/index.tsx:292-293.

### FR-11 — Biểu đồ doanh thu theo kỳ

- Chọn kỳ tháng/quý/năm; cửa sổ cố định: 12 tháng / 8 quý / 5 năm gần nhất tính cả kỳ hiện tại; kỳ rỗng vẫn vẽ cột 0; sắp cũ→mới ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:95-184.
- Mỗi hóa đơn vào kỳ theo **thời điểm tạo**, quy đổi theo múi giờ Việt Nam; tiền thu đi đúng quy tắc tiền đã thu từng hóa đơn ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:102-111.
- Hóa đơn có mốc thời gian tạo không đọc được (0/NaN — dữ liệu cũ lệch phiên triển khai) bị **loại khỏi biểu đồ và được đếm** trong số "dropped", không im lặng với chỉ số tài chính; hóa đơn thật ngoài cửa sổ bị loại có chủ ý, không tính dropped ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:162-183.
- Chọn kỳ cập nhật URL bằng replace (không dồn lịch sử) ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:84-88.

### FR-12 — Trang thanh toán công khai (không đăng nhập)

- Trang hoạt động bằng token 128-bit trong URL; token quá ngắn hoặc lạ → 404 chung, không tiết lộ sự tồn tại ✅ [S16] apps/server/src/routes/public-pay.ts:21-40.
- Phản hồi **cố ý bỏ** ghi chú của giáo viên và hạn đóng (liên kết đi qua nhóm chat ngoài tầm kiểm soát của giáo viên), và tắt cache ✅ [S16] apps/server/src/routes/public-pay.ts:10-17, [S16] apps/server/src/routes/public-pay.ts:45-52.
- Trang hiện tổ chức, học viên, bảng QR và trạng thái (kể cả khi đã đủ); polling theo quy tắc chung, hết hạn mức thì hiện nút "Làm mới"; link hết hiệu lực (đã rotate) hiện thông báo riêng ✅ [S17] apps/web/src/routes/pay.$token.tsx:14-116.

### FR-13 — Phân quyền tài chính

- Danh sách cho phép nghiêm ngặt (mặc định chặn): ba vai được xem dữ liệu tài chính; vai khác hoặc giá trị lạ bị chặn cả API lẫn giao diện ✅ [S28] packages/auth/src/role.ts:69-87.
- Thứ tự gate bảo toàn: chưa đăng nhập → 401 "unauthorized" **trước** khi xét vai; sai vai → 403 "finance-forbidden" ✅ [S29] apps/server/src/lib/require-finance-role.ts:15-27, [S53] apps/server/src/lib/require-finance-role.test.ts:1-375.
- Mọi đường dẫn API hóa đơn và con của nó đòi quyền này ở mức tiền xử lý; hai route gắn ngoài tiền xử lý (timeline, nhắc học phí) gắn guard tường minh vì không nằm dưới tiền tố đó ✅ [S7] apps/server/src/routes/kernel.ts:209-211, [S7] apps/server/src/routes/kernel.ts:3266-3273, [S7] apps/server/src/routes/kernel.ts:3389-3393.
- Snapshot dữ liệu nền **ẩn danh sách hóa đơn** cho người không có quyền tài chính (trả rỗng), và giao diện chặn render + điều hướng về trang chủ kèm toast một-lần ✅ [S8] apps/server/src/routes/snapshot.ts:239, [S8] apps/server/src/routes/snapshot.ts:348, [S27] apps/web/src/lib/use-finance-route-guard.ts:10-31, [S54] apps/web/src/routes/_auth/tuition/index.test.tsx:153-177.
- Trang chi tiết khi thiếu quyền điều hướng về trang chủ thay vì ném "không tìm thấy" ✅ [S55] apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx:369-394.

### FR-14 — Lịch sử giao dịch trên trang chi tiết hóa đơn

- Trang chi tiết tải riêng lịch sử giao dịch **đã khớp** của hóa đơn (tối đa 100, mới nhất trước), độc lập với bộ đếm thời gian QR để tránh lệch pha; dừng khi QR lỗi, khi hết phải thu, hoặc hết hạn mức 15 phút ✅ [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:125-138, [S7] apps/server/src/routes/kernel.ts:3222-3264.
- Dòng giao dịch chỉ mang **trường hiển thị**: ngày giao dịch, số tiền, nội dung, phương thức (nhãn tiếng Việt cho phiếu thu; dòng ngân hàng để trống → hiển thị "Chuyển khoản"), mã tham chiếu, mốc ghi nhận — không trả payload gốc hay định danh nhà cung cấp ✅ [S7] apps/server/src/routes/kernel.ts:3246-3262, [S13] packages/api/src/contracts.ts:3064-3081, [S47] apps/server/src/invoice-transactions.test.ts:240-259.
- Khi tiền về giữa phiên (số đã thu của QR khác với snapshot nền), trang **heal** các kho dữ liệu: đồng bộ lịch sử và dữ liệu nền ngay khi quan sát thấy số thay đổi, kể cả trường hợp snapshot cũ ngay lúc mở trang ✅ [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:73-116, [S55] apps/web/src/routes/_auth/tuition/$invoiceId.test.tsx:267-343.
- Ba trạng thái rỗng phân biệt: lỗi tải; đánh dấu thủ công ("không có giao dịch chuyển khoản nào khớp"); chưa có giao dịch nào ✅ [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:318-324.
- Hóa đơn không tồn tại (hoặc của tổ chức khác) → trang 404 riêng với nội dung "Không tìm thấy hóa đơn… Hóa đơn này không tồn tại hoặc dữ liệu đã được reset." + lối về Doanh thu ✅ [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:45-58, [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:105-108.

## Mục 4 — Yêu cầu phi chức năng (NFR)

- **NFR-01 — Cô lập dữ liệu đa tổ chức**: mọi truy vấn hóa đơn/giao dịch đều mang vị từ tổ chức; id lạ và id của tổ chức khác trả **cùng một** 404, không phân biệt được ✅ [S4] apps/server/src/routes/payment-transactions.ts:99-107, [S7] apps/server/src/routes/kernel.ts:3051-3083, [S47] apps/server/src/invoice-transactions.test.ts:214-218, [S49] apps/server/src/lib/payments/manual-payment.test.ts:345-351.
- **NFR-02 — Nguyên tử & chống ghi đúp**: ghi sổ + tính lại hóa đơn luôn trong một lô; guard đã-đủ/không-vượt-nợ nằm **trong** câu ghi, hai ghi đua không thể vượt nợ; khóa chống trùng (nhà cung cấp + mã giao dịch) là chỉ mục duy nhất ✅ [S11] apps/server/src/lib/payments/ingest-transaction.ts:100-138, [S12] apps/server/src/lib/payments/record-manual-payment.ts:84-96, [S50] apps/server/src/lib/payments/ledger-invariants.test.ts:263-347.
- **NFR-03 — Kỷ luật polling**: 5 giây/lần, chỉ khi panel mở + còn phải thu + tab nhìn thấy, trần 15 phút; quay lại tab reset trần (modal và trang chi tiết dùng chung một quy tắc); trang công khai cùng luật và có nút làm mới tay — link chia sẻ rộng không được poll CSDL mãi ✅ [S21] apps/web/src/lib/repos/payments.ts:13-31, [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:32-38, [S17] apps/web/src/routes/pay.$token.tsx:14-20.
- **NFR-04 — Múi giờ Việt Nam xuyên suốt**: mọi phép tính "hôm nay"/phân kỳ doanh thu/nhóm timeline theo múi giờ Việt Nam, không bao giờ theo giờ máy hay UTC (UTC trễ 7h gây sai ranh ngày) 🔵 [S45] apps/web/src/lib/week-grid.ts:29-31, [S18] apps/web/src/lib/tuition-from-kernel.ts:73-93, [S63] packages/api/src/vietnam-date.ts:27-29, [S25] apps/web/src/components/debts/billing-timeline-drawer.tsx:16-30.
- **NFR-05 — Giữ dữ liệu nhạy cảm tối thiểu**: payload ngân hàng chỉ lưu khi chưa khớp, dòng khớp xóa trắng; DTO chỉ trường hiển thị; timeline không trả nội dung/nguồn/định danh thô của ngân hàng; mã của tổ chức khác bị che trong hàng đợi ✅ [S9] packages/db/src/schema/payment-transaction.ts:19-23, [S11] apps/server/src/lib/payments/ingest-transaction.ts:131, [S52] apps/server/src/routes/billing-timeline.test.ts:336-346, [S4] apps/server/src/routes/payment-transactions.ts:62-75.
- **NFR-06 — Trung thực số liệu**: hóa đơn mốc thời gian hỏng bị đếm là "dropped", không bỏ im lặng; mọi con số suy từ kho dữ liệu máy chủ; sau ghi, hệ thống tải lại để không tự chế số ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:64-71, [S18] apps/web/src/lib/tuition-from-kernel.ts:162-183, [S1] apps/web/src/routes/_auth/tuition/index.tsx:66-69.
- **NFR-07 — Tiếp cận (a11y)**: vùng trạng thái ẩn đọc số dòng cho trình đọc màn hình; ô kiểm có nhãn riêng từng người; modal/drawer bẫy focus, đóng Escape; nút trong dòng chặn Enter/Space nổi bọt ✅ [S3] apps/web/src/routes/_auth/debts/index.tsx:303-305, [S3] apps/web/src/routes/_auth/debts/index.tsx:474-497, [S25] apps/web/src/components/debts/billing-timeline-drawer.tsx:108-144, [S1] apps/web/src/routes/_auth/tuition/index.tsx:308-317.
- **NFR-08 — Hiệu năng gói trang**: thư viện biểu đồ được tách chunk riêng, chỉ trang Doanh thu tải 🔵 [S1] apps/web/src/routes/_auth/tuition/index.tsx:32-38, [S40] apps/web/src/components/tuition/revenue-chart.tsx:1-8.
- **NFR-09 — Khả dụng đọc-ghi dưới SQLite single-writer**: quyết định khớp/tính lại gói trong một lô để không có cửa sổ đọc-ghi chênh; đọc kết quả qua dòng trả về thay vì đếm dòng 🟡 [S11] apps/server/src/lib/payments/ingest-transaction.ts:41-51, [S12] apps/server/src/lib/payments/record-manual-payment.ts:88-96 → OQ-13.

## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01 — Tiền đã thu của một hóa đơn**: nếu đã được đánh dấu đủ thì tính **đủ toàn bộ** số tiền (dù sổ chưa ghi gì — tiền mặt thu ngoài hệ thống); ngược lại tính phần sổ đã ghi, kẹp không vượt số tiền 🔵 [S18] apps/web/src/lib/tuition-from-kernel.ts:21-33, [S14] apps/server/src/lib/payment-instructions.ts:78-83.
- **BR-02 — Còn phải thu tổ chức** = tổng (số tiền − tiền đã thu) của mọi hóa đơn **chưa** được đánh dấu đủ; trạng thái lạ tính vào còn phải thu (an toàn) ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:35-48.
- **BR-03 — Còn nợ của một hóa đơn** = max(0, số tiền − tiền đã thu); trả tiền dư (overpay) bị kẹp về 0, không bao giờ hiện "còn 0đ" ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:420-426, [S19] apps/web/src/lib/format-invoice.ts:39-56.
- **BR-04 — Tiên quyết hiển thị trạng thái**: đã-đủ thắng mọi thứ; chưa-đủ mà hạn đã qua → quá hạn; ngược lại chưa thu; hạn trống/không hợp lệ → chưa thu ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:186-202, [S26] apps/web/src/components/tuition/invoice-status-cell.tsx:29-40.
- **BR-05 — Trạng thái nợ học viên** bốn mức theo ưu tiên (quá hạn > sắp đến hạn > còn nợ > đã thu đủ), đánh giá trên các khoản còn nợ ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:472-497.
- **BR-06 — Ngưỡng "sắp đến hạn"** = hôm nay ≤ hạn ≤ hôm nay + 7 ngày (cộng ngày trên mốc UTC của chuỗi ngày, không qua giờ máy) ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:484-496, [S18] apps/web/src/lib/tuition-from-kernel.ts:409-418.
- **BR-07 — Phạm vi tính KPI sổ công nợ**: sau lọc lớp + từ khóa, trước chip trạng thái; đếm chip: tất cả / quá hạn / (sắp đến hạn + còn nợ) / đã thu đủ ✅ [S18] apps/web/src/lib/tuition-from-kernel.ts:517-523, [S18] apps/web/src/lib/tuition-from-kernel.ts:656-685.
- **BR-08 — KPI "chưa khớp" của trang Doanh thu** = số hóa đơn chưa đủ tiền (cùng tiêu chí với danh sách hóa đơn cho phép gán) ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:70-74, [S1] apps/web/src/routes/_auth/tuition/index.tsx:355-367.
- **BR-09 — Phương thức khi đánh dấu đủ từ bảng**: nếu hóa đơn chưa có phương thức (mặc định gạch ngang) thì gửi nhãn rút gọn chuyển khoản, nếu đã có thì giữ nguyên; replay có chủ ý ghi đè phương thức ✅ [S1] apps/web/src/routes/_auth/tuition/index.tsx:329-338, [S7] apps/server/src/routes/kernel.ts:3119-3124.
- **BR-10 — Nhãn phương thức theo nguồn tiền**: phiếu thu thủ công hiển thị nhãn đầy đủ (Chuyển khoản/Tiền mặt/Khác) — nhãn này cũng được ghi vào hóa đơn khi tự tất toán; dòng ngân hàng để trống và giao diện hiểu là chuyển khoản ✅ [S13] packages/api/src/contracts.ts:1520-1528, [S7] apps/server/src/routes/kernel.ts:3254-3261, [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:336-340.
- **BR-11 — Hóa đơn đủ tiền không nhận thêm tiền tự động** (vào hàng đợi với lý do "đã đủ"); gán tay bị chặn 409; **nhưng** còn thiếu so với số tiền thì vẫn nhận bù 🔵 [S11] apps/server/src/lib/payments/ingest-transaction.ts:117-130, [S4] apps/server/src/routes/payment-transactions.ts:108-115.
- **BR-12 — QR không bao giờ lưu**: luôn dựng tại thời điểm đọc từ tài khoản liên kết hiện hành và nợ hiện hành ✅ [S14] apps/server/src/lib/payment-instructions.ts:57-61.
- **BR-13 — Số tiền hóa đơn nguyên dương tối đa 12 chữ số** (mặt nạ nhập web); khác với giá gói buổi học cho phép 0 — hóa đơn là khoản phải thu cụ thể ✅ [S22] apps/web/src/components/modals/add-invoice-modal.tsx:77-83, [S13] packages/api/src/contracts.ts:1556-1563.
- **BR-14 — Chống trùng phiếu thu theo tổ chức**: mã chống lặp là duy nhất toàn cục (không tách theo tổ chức), nên replay phải khớp đúng hóa đơn + số tiền mới trả kết quả cũ; trùng với nội dung khác → 409 ✅ [S12] apps/server/src/lib/payments/record-manual-payment.ts:42-48, [S12] apps/server/src/lib/payments/record-manual-payment.ts:161-187.
- **BR-15 — Trạng thái đã-thu không thể đảo**: mọi đường tính lại đều giữ nguyên đã-thu; tiền bù sau đó không "mở lại" hóa đơn 🔵 [S10] apps/server/src/lib/payments/recompute-invoice.ts:28-36, [S18] apps/web/src/lib/tuition-from-kernel.ts:28-33.
- **BR-16 — Hóa đơn gắn chặt tổ chức qua học viên**: tạo phải qua đăng ký cùng tổ chức; snapshot chỉ inner-join học viên cùng tổ chức — hóa đơn trỏ học viên lạ không bao giờ lộ ✅ [S7] apps/server/src/routes/kernel.ts:3051-3083, [S8] apps/server/src/routes/snapshot.ts:61-93.
- **BR-17 — Mã hóa đơn ngắn**: "INV-" + 8 ký tự cuối mã gốc in hoa — đọc được, vẫn truy ngược về mã đầy đủ (mã đầy đủ hiện ở trang chi tiết) ✅ [S19] apps/web/src/lib/format-invoice.ts:4-9, [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:194-198.

## Mục 6 — Ma trận lỗi (wording nguyên văn)

> Wording trích NGUYÊN VĂN từ throw-site; repo không có catalog i18n.

| Mã | Bề mặt | Điều kiện | Wording/mã lỗi nguyên văn | Nguồn |
|---|---|---|---|---|
| E-001 | API tạo hóa đơn | Đăng ký lạ hoặc học viên lạ (cùng 404) | `{"error": "enrollment not found"}` (404) | [S7] apps/server/src/routes/kernel.ts:3066-3067, 3081-3083 |
| E-002 | API tạo hóa đơn | Đăng ký chưa được học viên chấp nhận | `{"error": "Học viên chưa đồng ý tham gia lớp"}` (409) | [S7] apps/server/src/routes/kernel.ts:3069-3071 |
| E-003 | API tạo hóa đơn | Hạn đóng không phải ngày lịch thật | `{"error": "invalid body"}` (400) | [S7] apps/server/src/routes/kernel.ts:3085-3087 |
| E-004 | API hóa đơn (mark-paid/payments/QR/rotate/transactions) | Id lạ hoặc của tổ chức khác | `{"error": "invoice not found"}` (404) | [S7] apps/server/src/routes/kernel.ts:3129-3131, 3152, 3207, 3217, 3233 |
| E-005 | API gán giao dịch | Hóa đơn đã đủ tiền | `{"error": "invoice already paid", "code": "INVOICE_ALREADY_PAID"}` (409) | [S4] apps/server/src/routes/payment-transactions.ts:110-115 |
| E-006 | API gán/bỏ qua | Giao dịch không còn trạng thái chưa khớp | `{"error": "transaction not found"}` (404) | [S4] apps/server/src/routes/payment-transactions.ts:95-97, 147 |
| E-007 | Tất cả endpoint tài chính | Chưa đăng nhập | `{"error": "unauthorized"}` (401) | [S29] apps/server/src/lib/require-finance-role.ts:19-22 |
| E-008 | Tất cả endpoint tài chính | Vai không có quyền tài chính | `{"error": "finance-forbidden"}` (403) | [S29] apps/server/src/lib/require-finance-role.ts:23-25 |
| E-009 | API hàng đợi giao dịch | Body không phải JSON / không hợp lệ | `{"error": "invalid json"}` / `{"error": "invalid body"}` (400) | [S4] apps/server/src/routes/payment-transactions.ts:36-43 |
| E-010 | API phiếu thu | Mã chống lặp đã dùng cho nội dung khác | `{"error": "client-request-id-conflict"}` (409) | [S7] apps/server/src/routes/kernel.ts:3180-3181 |
| E-011 | API phiếu thu | Hóa đơn đã tất toán | `{"error": "invoice-settled"}` (422) | [S7] apps/server/src/routes/kernel.ts:3182-3183 |
| E-012 | API phiếu thu | Số tiền vượt số dư còn nợ | `{"error": "amount-exceeds-debt", "remaining": N}` (422) | [S7] apps/server/src/routes/kernel.ts:3184-3191 |
| E-013 | API timeline công nợ | Học viên lạ hoặc của tổ chức khác | `{"error": "student not found"}` (404) | [S7] apps/server/src/routes/kernel.ts:3278-3282 |
| E-014 | API trang công khai | Token quá ngắn/không tồn tại | `{"error": "not found"}` (404) | [S16] apps/server/src/routes/public-pay.ts:22-40 |
| E-015 | API đối soát | Gọi trong thời gian chờ | `{"error": "reconcile cooldown", "code": "RECONCILE_COOLDOWN"}` (429) | [S37] apps/server/src/routes/bank-link.ts:278-281, [S74] apps/server/src/bank-hub-reconcile.test.ts:223-229 |
| E-016 | API nhắc học phí | Body sai (rỗng/trùng/vượt 100) | `{"error": "invalid body"}` (400) | [S7] apps/server/src/routes/kernel.ts:3396-3397, [S13] packages/api/src/contracts.ts:4087-4098 |
| E-017 | Web · modal tạo hóa đơn | Số tiền trống / không phải số nguyên dương | "Vui lòng nhập số tiền." / "Số tiền phải là số nguyên dương, tối đa 12 chữ số." | [S22] apps/web/src/components/modals/add-invoice-modal.tsx:77-83 |
| E-018 | Web · modal tạo hóa đơn | Thiếu đăng ký / hạn không hợp lệ / ghi chú dài | "Vui lòng chọn học viên." / "Vui lòng chọn ngày đến hạn hợp lệ." / "Ghi chú tối đa 500 ký tự." | [S22] apps/web/src/components/modals/add-invoice-modal.tsx:84-91 |
| E-019 | Web · modal phiếu thu | Số tiền > 0 và ≤ còn nợ không thỏa | "Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ" | [S24] apps/web/src/components/modals/record-payment-modal.tsx:21-22 |
| E-020 | Web · modal phiếu thu | Máy chủ 422 đã tất toán | "Hóa đơn đã được ghi nhận đủ trước đó — không lưu thêm phiếu thu." | [S24] apps/web/src/components/modals/record-payment-modal.tsx:160-163 |
| E-021 | Web · modal phiếu thu | Máy chủ 422 vượt nợ | "Số tiền vượt số dư còn nợ của khoản đang chọn — đã cập nhật số nợ mới." | [S24] apps/web/src/components/modals/record-payment-modal.tsx:166-173 |
| E-022 | Web · modal phiếu thu | Máy chủ 409 mã chống lặp cháy | "Mã phiếu thu đã được dùng cho nội dung khác — đã tạo mã mới, vui lòng kiểm tra lại." | [S24] apps/web/src/components/modals/record-payment-modal.tsx:176-183 |
| E-023 | Web · trang tài chính | Vai không đủ quyền | "Bạn không có quyền xem Sổ công nợ" (toast, điều hướng về trang chủ) | [S27] apps/web/src/lib/use-finance-route-guard.ts:5-6 |
| E-024 | Web · ghi nhận đã thu | Kết quả ghi không chắc chắn / lỗi | "Không xác định được kết quả — có thể đã lưu. Đang tải lại để kiểm tra…" / "Không lưu được — dữ liệu chưa được ghi lên máy chủ." | [S34] apps/web/src/lib/kernel-outcome.ts:72-85 |
| E-025 | Web · gửi nhắc | Thất bại gọi API | "Không gửi được nhắc học phí. Vui lòng thử lại." | [S3] apps/web/src/routes/_auth/debts/index.tsx:292-293 |
| E-026 | Web · chi tiết hóa đơn | Không tải được QR / lịch sử | "Không tải được thông tin chuyển khoản." / "Không tải được lịch sử giao dịch." | [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:280-282, 350-353 |
| E-027 | Web · trang công khai | Link lạ/hết hiệu lực | "Link thanh toán không tồn tại hoặc đã bị thu hồi." | [S17] apps/web/src/routes/pay.$token.tsx:72-80 |
| E-028 | Web · hàng đợi giao dịch | Đối soát trong cooldown | "Vừa đối soát, thử lại sau 1 phút." | [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:335-339 |
| E-029 | Web · lý do chưa khớp | Nhãn lý do hiển thị | "Mã không tồn tại" / "Phiếu đã đủ tiền" / "Không có mã học phí" / "Chuyển khoản lạ" | [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:254-259 |
| E-030 | Web · rotate link | Xác nhận tạo link mới | "Link cũ sẽ hết hiệu lực — phụ huynh vẫn lưu link cũ sẽ không mở được trang thanh toán." | [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:196-201 |

## Mục 7 — Chỉ số thành công (như code đo lường)

- **Tạo hóa đơn e2e (kịch bản QC #61/#135/#62)**: tạo hợp lệ → dòng mới xuất hiện, sống qua reload, KPI "Đã thu" 0đ → đủ và "Còn phải thu" ngược lại sau khi đánh dấu đủ; hạn đóng hiển thị dd/mm đúng ngày đã nhập; ghi chú hiện tooltip ✅ [S6] apps/e2e/specs/create-invoice.spec.ts:126-180.
- **Chặn ghi rác phía client**: submit thiếu số tiền hoặc số âm (bị mặt nạ làm rỗng) → lỗi trường, **0** yêu cầu POST, không có dòng mới ✅ [S6] apps/e2e/specs/create-invoice.spec.ts:182-217.
- **Trình chọn loại trừ chưa kích hoạt**: học viên trạng thái được mời không xuất hiện trong lựa chọn của modal ✅ [S6] apps/e2e/specs/create-invoice.spec.ts:219-248.
- **Sổ cái vô biến trên toàn không gian kịch bản**: bài kiểm tra bất biến duyệt mọi chuỗi sự kiện hữu hạn (thu ngân hàng, phiếu thu, đánh dấu đủ, gán tay) và khẳng định đã khám phá trọn không gian ✅ [S50] apps/server/src/lib/payments/ledger-invariants.test.ts:263-347.
- **Nhắc học phí**: `{queued, skipped}` đúng đơn vị hóa đơn còn nợ; gọi lại trong ngày → queued=0, skipped=tổng ✅ [S51] apps/server/src/routes/debt-reminders.test.ts:310-366.
- **Đối soát**: phản hồi cặp số `{scanned, matched, unmatched}`; giao diện báo đúng cặp số này ✅ [S13] packages/api/src/contracts.ts:3083-3087, [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:329-334.
- **Độ phủ quy tắc tính số web**: 64 bài kiểm tra đơn vị cho mọi helper KPI/trạng thái/sổ công nợ/doanh thu theo kỳ ✅ [S57] apps/web/src/lib/tuition-from-kernel.test.ts:1-1470.

## Mục 8 — Thực thể dữ liệu

> Chi tiết cột đầy đủ: `srs/tuition-invoicing-reverse-erd.md`. Tóm tắt vai trò:

| Thực thể | Vai | Ghi chú quan trọng |
|---|---|---|
| Hóa đơn (invoice) | Khoản phải thu | id gốc UUID; mã nội dung + token công khai là cột **cho phép rỗng** với chỉ mục duy nhất (nhiều dòng rỗng không xung đột); số đã thu tính lại từ sổ; hai khóa ngoài thật (tổ chức, học viên) xóa-đổ-domino; tham chiếu đăng ký là văn bản thuần — không khóa ngoài — để dòng tiền sống sót khi đăng ký bị xóa ✅ [S5] packages/db/src/schema/invoice.ts:12-61 |
| Giao dịch thanh toán (payment_transaction) | Sổ cái tiền vào | khóa duy nhất (nhà cung cấp + mã giao dịch nhà cung cấp) = chống trùng; trạng thái khớp + lý do chưa khớp; payload gốc chỉ khi chưa khớp; phương thức + người lập chỉ dành cho phiếu thu ✅ [S9] packages/db/src/schema/payment-transaction.ts:11-63 |
| Liên kết ngân hàng của tổ chức (org_bank_link) | Nguồn tài khoản nhận | 1 tổ chức 1 dòng; vòng đời trạng thái none → linked → inactive/unlinked; giữ lịch sử tài khoản cũ cho đối soát ✅ [S69] packages/db/src/schema/org-bank-link.ts:14-47 |
| Đăng ký học (enrollment) | Nguồn xác định học viên–lớp khi tạo hóa đơn và lọc nợ theo lớp | duy nhất theo (lớp, học viên); trạng thái mời → hoạt động ✅ [S67] packages/db/src/schema/enrollment.ts:15-47 |
| Lớp (class) | Chứa học phí mỗi học viên cả khóa (dùng bởi tab học phí hồ sơ học viên — feature khác chạm biên) | học phí có thể null = chưa thiết lập ✅ [S68] packages/db/src/schema/class.ts:34-35 |
| Học viên (student) / Tổ chức (organization) | Chủ thể | hóa đơn xóa-đổ-domino theo cả hai ✅ [S71] packages/db/src/schema/student.ts:18-24, [S70] packages/db/src/schema/organization.ts:5-9 |
| Thông báo (qua sự kiện) | Kênh invoice_issued + nhắc học phí | sự kiện phát từ route, khóa chống trùng theo hóa đơn (+ ngày cho nhắc) ✅ [S30] apps/server/src/lib/notifications/templates.ts:40-54, [S30] apps/server/src/lib/notifications/templates.ts:130-146 |

## Mục 9 — Luồng nghiệp vụ (F1..F10)

> Sequence + flowchart đầy đủ: `srs/tuition-invoicing-reverse-flows.md`. Vòng đời trạng thái: `srs/tuition-invoicing-reverse-states.md`.

| F-id | Tên | Actor chính | Bằng chứng chính |
|---|---|---|---|
| F1 | Tạo hóa đơn học phí | Người tài chính | [S7] apps/server/src/routes/kernel.ts:3043-3111, [S22] apps/web/src/components/modals/add-invoice-modal.tsx:73-114 |
| F2 | Xem chi tiết hóa đơn + QR + quản lý liên kết công khai | Người tài chính | [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:93-358, [S14] apps/server/src/lib/payment-instructions.ts:21-116 |
| F3 | Thu tự động: phụ huynh chuyển khoản → thông báo ngân hàng → tự khớp → heal giao diện | Ngân hàng + hệ thống | [S36] apps/server/src/routes/bank-hub-webhooks.ts:28-60, [S11] apps/server/src/lib/payments/ingest-transaction.ts:52-141, [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:73-116 |
| F4 | Đánh dấu đã thu thủ công | Người tài chính | [S7] apps/server/src/routes/kernel.ts:3113-3133, [S32] apps/web/src/lib/data-store-reducer.ts:77-87 |
| F5 | Ghi nhận phiếu thu từng phần trên Sổ công nợ | Người tài chính | [S12] apps/server/src/lib/payments/record-manual-payment.ts:97-196, [S24] apps/web/src/components/modals/record-payment-modal.tsx:124-191 |
| F6 | Xử lý giao dịch chưa khớp: gán vào phiếu / bỏ qua | Người tài chính | [S4] apps/server/src/routes/payment-transactions.ts:47-149, [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:265-445 |
| F7 | Đối soát tài khoản ngân hàng | Người tài chính + hệ thống | [S37] apps/server/src/routes/bank-link.ts:255-281, [S11] apps/server/src/lib/payments/ingest-transaction.ts:32-39 |
| F8 | Sổ công nợ: lọc/tìm/chọn → gửi nhắc học phí hàng loạt | Người tài chính | [S3] apps/web/src/routes/_auth/debts/index.tsx:224-297, [S7] apps/server/src/routes/kernel.ts:3389-3488 |
| F9 | Xem dòng thời gian hóa đơn & giao dịch theo học viên | Người tài chính | [S7] apps/server/src/routes/kernel.ts:3270-3387, [S25] apps/web/src/components/debts/billing-timeline-drawer.tsx:78-354 |
| F10 | Phụ huynh thanh toán qua liên kết công khai | Phụ huynh (không đăng nhập) | [S16] apps/server/src/routes/public-pay.ts:18-56, [S17] apps/web/src/routes/pay.$token.tsx:25-116 |

## Mục 10 — Màn hình (Screens)

| Màn | Đường dẫn | Thành phần chính | Nguồn |
|---|---|---|---|
| Doanh thu | `/_auth/tuition` (web) | PageHead + CTA tạo hóa đơn; 4 StatCard KPI; biểu đồ doanh thu (lazy, chọn kỳ); bảng gói học; bảng hóa đơn; hàng đợi giao dịch chưa khớp; modal thu học phí; modal tạo hóa đơn | [S1] apps/web/src/routes/_auth/tuition/index.tsx:92-376 |
| Chi tiết hóa đơn | `/_auth/tuition/$invoiceId` | Backlink giữ kỳ; tiêu đề mã + badge; thông tin hóa đơn (9 dòng meta); 3 ô số; ghi chú thu thủ công; học viên & lớp; panel QR + copy/rotate; bảng lịch sử giao dịch; 404 riêng | [S2] apps/web/src/routes/_auth/tuition/$invoiceId.tsx:142-358 |
| Sổ công nợ | `/_auth/debts` | PageHead + nút nhắc phí + tạo khoản thu; 3 StatCard; thanh lọc (tìm/chip/lớp/xóa bộ lọc); bảng dòng nợ (ô kiểm, tiền, hạn + badge, nút Thu/eye); 2 trạng thái rỗng; modal tạo khoản thu; modal phiếu thu; drawer timeline; modal xác nhận nhắc | [S3] apps/web/src/routes/_auth/debts/index.tsx:301-612 |
| Modal Tạo hóa đơn | (overlay) | Chọn đăng ký (nhãn học viên · lớp), số tiền (mặt nạ), hạn (date input), ghi chú; lỗi theo trường; thông báo đã-lưu/chưa-chắc | [S22] apps/web/src/components/modals/add-invoice-modal.tsx:123-213 |
| Modal Thu học phí | (overlay) | Panel QR + footer copy link / tạo link mới (khi còn phải thu) | [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:206-252 |
| Hàng đợi giao dịch chưa khớp | (trên trang Doanh thu) | Tiêu đề + đếm; nút đối soát + kết quả/cooldown; bảng: thời gian, tiền, nội dung (che nếu lạ), lý do, chọn phiếu + Gán/Bỏ qua | [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:314-445 |
| Modal Ghi nhận thu tiền | (overlay) | Chọn khoản (nếu >1); tóm tắt Phải đóng·Đã thu·Còn nợ; số tiền + nút thu toàn bộ; radio phương thức; ghi chú; dự báo số dư sau ghi; lỗi máy chủ nguyên văn | [S24] apps/web/src/components/modals/record-payment-modal.tsx:193-323 |
| Drawer Dòng thời gian | (overlay phải) | Tiêu đề tên học viên; 3 ô tổng; nhóm theo tháng; mục phát-hành-hóa-đơn và mục thu tiền (nguồn QR Bank-Hub / thủ công + ghi chú); link sang chi tiết hóa đơn | [S25] apps/web/src/components/debts/billing-timeline-drawer.tsx:146-354 |
| Trang thanh toán công khai | `/pay/$token` (không auth) | Card giữa: tổ chức, tên học viên, QR panel, nút Làm mới khi hết hạn poll; lỗi link; trạng thái loading | [S17] apps/web/src/routes/pay.$token.tsx:72-116 |

## Mục 11 — Ràng buộc kiến trúc/kỹ thuật

- **D1/SQLite, một writer**: các biến đổi tài chính gói trong một lô câu lệnh; kết quả đọc qua dòng trả về của câu ghi — không có giao dịch nhiều bước kiểu SQL tổng quát 🟡 [S11] apps/server/src/lib/payments/ingest-transaction.ts:41-51, [S12] apps/server/src/lib/payments/record-manual-payment.ts:84-96 → OQ-13.
- **Không khóa ngoài cho tham chiếu "tài chính sống sót"**: hóa đơn trỏ đăng ký bằng văn bản thuần; sổ trỏ hóa đơn bằng văn bản thuần — dòng tiền phải còn dù bản ghi gốc bị xóa; tính hợp lệ kiểm tại thời điểm ghi ✅ [S5] packages/db/src/schema/invoice.ts:12-18, [S9] packages/db/src/schema/payment-transaction.ts:16-19.
- **Chỉ mục duy nhất trên cột rỗng** (mã nội dung, token, mã giao dịch): dùng chỉ mục riêng thay ràng buộc inline để nhiều dòng NULL không xung đột ✅ [S5] packages/db/src/schema/invoice.ts:55-60, [S43] packages/db/src/migrations/0034_familiar_jamie_braddock.sql:43-47.
- **Tạo hóa đơn không idempotent có chủ ý**, nhất quán với tiền lệ tạo tài liệu ✅ [S7] apps/server/src/routes/kernel.ts:3042-3043.
- **Hợp đồng tạo `.strict()`**: body phải đúng bộ trường; ghi chú luôn đi kèm (mặc định rỗng) ✅ [S13] packages/api/src/contracts.ts:1564-1572, [S31] apps/web/src/lib/repos/kernel.ts:71-81.
- **Mốc thời gian trên wire là chuỗi ISO** (timestamp mili-giây → Date → toISOString) — web không được gọi Number() trực tiếp ✅ [S8] apps/server/src/routes/snapshot.ts:87-93, [S13] packages/api/src/contracts.ts:1790-1796.
- **Trang công khai nằm ngoài /api**: bootstrap chặn phiên học viên trên /api, nên trang này gắn ngoài để phụ huynh không đăng nhập vẫn mở; không đọc phiên, không ghi ✅ [S16] apps/server/src/routes/public-pay.ts:10-17, [S64] apps/server/src/app.ts:423.
- **Cả hai họ webhook trên một URL**, phân biệt bằng header (Sandbox ghim URL IPN đầu tiên — đổi URL không di chuyển điểm đến) ✅ [S36] apps/server/src/routes/bank-hub-webhooks.ts:17-36.
- **Snapshot là nguồn nạp chính của web** (staleTime vô hạn, không tự poll): tiền về giữa phiên được "heal" bằng "invalidate" có giám sát theo giá trị số đã thu ✅ [S23] apps/web/src/components/modals/invoice-payment-modal.tsx:73-86.

## Mục 12 — Câu hỏi mở (OQ) & khe hở

> Chi tiết đầy đủ: `reverse-gaps.md`. Tóm tắt OQ:

| OQ | Câu hỏi | Nhãn |
|---|---|---|
| OQ-01 | Hai cột mô tả loại và ngày lập của hóa đơn không còn nơi ghi nào (tạo không set; đã tìm — không thấy sau khi tìm). Giữ để tương thích dữ liệu cũ — có kế hoạch bỏ/xóa? | 🟡 |
| OQ-02 | Không có sửa/xóa/hủy hóa đơn — non-goal có chủ ý hay backlog? Ảnh hưởng: nhầm nhập số tiền phải tạo lại hóa đơn mới. | 🟡 |
| OQ-03 | Nhãn quá hạn có nhánh đọc giá trị quá hạn từ dữ liệu nhưng không writer nào ghi — nhánh chết hay còn cho dữ liệu cũ/migration? | 🟡 |
| OQ-04 | Web gửi tham số lọc khi tải hàng đợi nhưng máy chủ bỏ qua toàn bộ tham số truy vấn — dư thừa hay chuẩn bị cho tương lai? | 🟡 |
| OQ-05 | Nhắc học phí không loại hóa đơn của học viên đã rời lớp (chỉ lọc theo lớp khi có chọn) — có cần loại theo trạng thái đăng ký hoạt động? | 🟡 |
| OQ-06 | Sổ công nợ giới hạn 200 sự kiện/hóa đơn mỗi loại, hàng đợi 50, giao dịch theo phiếu 100 — có nhu cầu phân trang? | 🟡 |
| OQ-07 | Cooldown đối soát 1 phút — hằng số cứng; có cần cấu hình theo tổ chức? | 🟡 |
| OQ-08 | Không có thông báo cho học viên khi tiền tự động được ghi nhận (chỉ có tạo-hóa-đơn và nhắc-phí) — thiếu chủ ý? | 🟡 |
| OQ-09 | Hóa đơn đã đánh dấu đủ mà sổ còn thiếu vẫn nhận tiền bù — ngữ nghĩa "đã đủ" hai lớp này có cần nhãn riêng trên UI? | 🟡 |
| OQ-10 | KPI sổ công nợ mang nhãn "kỳ này" nhưng tính trên mọi hóa đơn, không theo kỳ — nhãn sai hay định nghĩa "kỳ" khác? | 🟡 |
| OQ-11 | Khóa chống trùng sổ là duy nhất toàn cục: hai tổ chức nhận cùng một mã giao dịch từ nhà cung cấp thì tổ chức sau bị coi là trùng — khả thi thực tế? | 🟡 |
| OQ-12 | Xác định tổ chức từ tài khoản nhận có nhánh phụ thuộc API trung gian khi tài khoản đã relink — lỗi API trả "api-error" và ack, chờ sweep; có cảnh báo cho giáo viên không? | 🟡 |
| OQ-13 | Backfill muộn mã/token chỉ thử lại 3 lần khi va chạm mã trùng — xác suất ~1e-12 nhưng thất bại im lặng sau 3 lần; có cần đo đếm? | 🟡 |
| OQ-14 | Hộp phiếu thu mặc định chọn khoản **hạn sớm nhất** — có cần ghi nhớ lựa chọn của giáo viên theo học viên? | 🟡 |
| OQ-15 | Trang công khai cố ý ẩn hạn đóng (an toàn khi share) nhưng phụ huynh không thấy hạn — trade-off đã cân nhắc đến đâu? | 🟡 |
| OQ-16 | Nút "Gán" trong hàng đợi không đọc body lỗi của máy chủ (409/404) — chỉ làm mới dữ liệu; người dùng có biết vì sao gán thất bại? | 🟡 |
| OQ-17 | Đánh dấu đủ từ bảng gửi nhãn phương thức rút gọn "CK" — khác nhãn đầy đủ "Chuyển khoản" mà luồng phiếu thu ghi vào hóa đơn; hai quy ước song song trong cùng cột dữ liệu. | 🟡 |
