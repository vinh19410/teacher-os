---
type: reverse-srs
feature: online-payment
status: draft
updated: 2026-11-12
confidence_summary: "✅272 · 🔵4 · 🟡7 — OQ 10 (đếm cơ học, loại dòng legend/frontmatter/quy ước)"
complexity_flags: [webhook, payment, external-redirect]
---

# online-payment — SRS tái lập (reverse) từ mã nguồn

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).
> Toàn bộ nhãn tuân theo luật trên; mỗi mệnh đề mang nhãn đặt ở đầu dòng kèm cite `file:line` (định danh chỉ xuất hiện trong cite, trừ mã lỗi là wording hợp đồng API).

## 0. Tổng quan và nguồn

- Mục tiêu tài liệu: tái lập yêu cầu nghiệp vụ của tính năng **thanh toán online** gồm ba mảng: (1) nhận webhook ngân hàng từ SePay Bank Hub và tự động khớp tiền vào hóa đơn học phí; (2) link thanh toán công khai cho phụ huynh kèm QR; (3) liên kết/hủy liên kết tài khoản ngân hàng nhận tiền của tổ chức. — ✅ tập hợp từ code: [S1] `apps/server/src/routes/bank-hub-webhooks.ts:13-27`, [S2] `apps/server/src/routes/public-pay.ts:10-17`, [S3] `apps/server/src/routes/bank-link.ts`.
- Danh mục nguồn đầy đủ: `reverse-sources.md` (S1–S15). Bằng chứng từng mệnh đề: `_evidence.md`. Sơ đồ: `srs/online-payment-reverse-flows.md`, `srs/online-payment-reverse-states.md`, `srs/online-payment-reverse-erd.md`. Use case: `usecases/`. Hổng và câu hỏi mở: `reverse-gaps.md`.
- Phạm vi nhiều chặng: luồng tiền đi qua các chặng **hub gửi webhook → hệ thống xác thực → xác định tổ chức → khớp mã học phí → ghi sổ giao dịch → tính lại hóa đơn → (nếu trục trặc) hàng chờ + đối soát bù**; tài liệu ghi rõ từng chặng ở `_evidence.md` §6 và `srs/online-payment-reverse-flows.md` Flow 2/4. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:58-140`, [S3] `apps/server/src/routes/bank-link.ts:251-344`.

## 1. Scope

### 1.1 In scope

- Nhận và xác thực hai họ webhook từ hub thanh toán: sự kiện vòng đời liên kết tài khoản và thông báo biến động giao dịch (IPN). — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:39-106`.
- Tự động ghi nhận tiền vào vào sổ giao dịch, khớp theo mã học phí trong nội dung chuyển khoản, cập nhật số đã nhận của hóa đơn. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:58-140`, `apps/server/src/lib/payments/recompute-invoice.ts:19-38`.
- Hàng chờ giao dịch chưa khớp cho giáo viên (gán về hóa đơn / bỏ qua) và nút đối soát thủ công kéo lại giao dịch 7 ngày. — ✅ [S6] `apps/server/src/routes/payment-transactions.ts:47-149`, [S3] `apps/server/src/routes/bank-link.ts:251-344`.
- Trang thanh toán công khai theo link bất định (không cần đăng nhập) với QR chuyển khoản dựng thời gian thực và tự cập nhật trạng thái. — ✅ [S2] `apps/server/src/routes/public-pay.ts:21-53`, [S12] `apps/web/src/routes/pay.$token.tsx:36-112`.
- Liên kết tài khoản ngân hàng qua phiên hosted nhúng iframe; đồng bộ, hủy, khôi phục liên kết; một tài khoản hoạt động mỗi tổ chức. — ✅ [S3] `apps/server/src/routes/bank-link.ts:66-249`, [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:58-236`.
- Thu học phí thủ công (tiền mặt/kênh khác) với chống trùng và chặn vượt nợ — ranh giới liền kề để so sánh hành vi ghi nhận. — ✅ [S11] `apps/server/src/routes/kernel.ts:3140-3193`.
- Cổng mô phỏng giao dịch cho môi trường phát triển (chỉ sandbox). — ✅ [S11] `apps/server/src/routes/bank-hub-mock.ts:44-156`.

### 1.2 Out of scope (thuộc feature khác, chỉ định ranh giới)

- Phát hành/sửa/xóa hóa đơn, đánh dấu đã thu thủ công kiểu cũ: API hóa đơn kernel (ranh giới dùng chung). — ✅ [S11] `apps/server/src/routes/kernel.ts:3098-3133`.
- Trang học phí của phụ huynh trên portal học viên (dùng chung panel QR). — ✅ [S11] `apps/server/src/routes/student.ts:960-979`.
- Đăng ký/mở lớp/ghi danh (nguồn của hóa đơn). — ✅ [S7] `packages/db/src/schema/invoice.ts:12-17` (mô tả nguồn tạo).
- Hạ tầng tài khoản hub (tạo đại diện, lấy token dịch vụ) chỉ là phụ thuộc kỹ thuật bên trong, không phải yêu cầu nghiệp vụ người dùng. — ✅ [S5] `apps/server/src/lib/bank-hub/bank-hub-client.ts:250-278`.

## 2. Actors

| Actor | Vai trò | Bằng chứng |
|---|---|---|
| Giáo viên / Chủ sở hữu / Quản trị tổ chức | Vai trò tài chính: liên kết ngân hàng, đối soát, gán/bỏ qua giao dịch, thu thủ công, thu hồi link, xem lịch sử | ✅ [S11] `packages/auth/src/role.ts:74-87`, [S3] `apps/server/src/routes/bank-link.ts:66` |
| Trợ giảng / giáo viên lớp phụ | Bị chặn khỏi mọi endpoint tài chính | ✅ [S11] `apps/server/src/lib/require-finance-role.ts:19-27` |
| Phụ huynh (chưa đăng nhập) | Mở link thanh toán công khai, xem QR, theo dõi trạng thái | ✅ [S2] `apps/server/src/routes/public-pay.ts:10-17` |
| Hệ thống hub SePay Bank Hub (bên ngoài) | Gửi sự kiện vòng đời + IPN giao dịch; nhận lệnh lấy phiên liên kết, kéo giao dịch | ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:13-27`, [S5] `apps/server/src/lib/bank-hub/bank-hub-client.ts:112-151` |
| Hệ thống nền (không tồn tại) | Không có job định kỳ nào tự đối soát — chỉ chạy khi giáo viên bấm | 🟡 negative search: `apps/server/src/index.ts:177` chỉ export app, không có scheduled handler → OQ-1 |

## 3. Functional Requirements

- **FR-op-001** — Hệ thống nhận sự kiện vòng đời liên kết tài khoản từ hub (tạo liên kết, phiên liên kết, thay đổi tài khoản) và cập nhật trạng thái liên kết của tổ chức; sự kiện không thuộc nhóm thay đổi tài khoản được xác nhận mà không thay đổi dữ liệu. — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:53-63`, [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:188-236`.
- **FR-op-002** — Hệ thống nhận thông báo giao dịch (IPN) từ hub, lưu raw payload gốc của thông báo, và luôn trả xác nhận thành công cho mọi kết quả xử lý được chấp nhận (kể cả khi chưa xác định được tổ chức). — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:65-100`.
- **FR-op-003** — Cả hai họ webhook phải xác thực bằng khóa riêng của từng họ (header khác nhau cho sự kiện vòng đời so với IPN); thiếu hoặc sai khóa bị từ chối. Cùng một dispatcher phục vụ mọi đường dẫn webhook vì hub có thể giao đến bất kỳ URL nào từng đăng ký. — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:19-27,39-46`, [S11] `apps/server/src/lib/safe-equal.ts:9-14`.
- **FR-op-004** — Giao dịch trùng lặp (cùng nhà cung cấp và cùng mã giao dịch bên ngoài) không bao giờ được ghi đúp: lần giao lại được bỏ qua âm thầm nhưng vẫn xác nhận cho hub. — ✅ [S7] `packages/db/src/schema/payment-transaction.ts:53-56` (unique index), [S4] `apps/server/src/lib/payments/ingest-transaction.ts:133`; test [S1] `apps/server/src/routes/bank-hub-webhooks.test.ts:156-170`.
- **FR-op-005** — Hệ thống nhận diện mã học phí trong nội dung chuyển khoản theo mẫu định sẵn (tiền tố cố định + 8 ký tự), chống nhận nhầm các từ giống mã trong câu; mã viết thường vẫn khớp. — ✅ [S9] `packages/api/src/lib/payment-code.ts:7-14`; test [S9] `packages/api/src/lib/payment-code.test.ts:10-33`; e2e viết thường [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:298-314`.
- **FR-op-006** — Giao dịch chỉ được khớp với hóa đơn thuộc cùng một tổ chức, tổ chức được xác định qua tài khoản nhận tiền; chuyển khoản mang mã của tổ chức khác rơi vào hàng chờ với nội dung bị che. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:69-98`, [S6] `apps/server/src/routes/payment-transactions.ts:14-19,62-75`.
- **FR-op-007** — Khi khớp, số đã nhận của hóa đơn được tính lại từ toàn bộ giao dịch khớp (không cộng dồn thủ công); đạt đủ thì hóa đơn tự chuyển sang trạng thái đã thanh toán và gợi ý phương thức "Chuyển khoản". — ✅ [S4] `apps/server/src/lib/payments/recompute-invoice.ts:19-38`; test [S1] `apps/server/src/bank-hub-ipn.test.ts:209-230`.
- **FR-op-008** — Giao dịch chưa khớp được phân loại lý do để giáo viên xử lý: không có mã, mã không tồn tại, phiếu đã đủ tiền, mã thuộc tổ chức khác. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:103-130`; nhãn UI [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:254-259`.
- **FR-op-009** — Hệ thống bỏ qua giao dịch không phải tiền vào và giao dịch có số tiền không hợp lệ; tiền vào không kèm mã bị bỏ qua khi đến qua IPN nhưng được giữ lại vào hàng chờ khi kéo bằng đối soát. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:32-39,58-65`; test [S1] `apps/server/src/bank-hub-ipn.test.ts:307-327`, `apps/server/src/bank-hub-reconcile.test.ts:173-206`.
- **FR-op-010** — Link thanh toán công khai mở được khi chưa đăng nhập, hiển thị thông tin hóa đơn, QR và hướng dẫn chuyển khoản; token thiếu hoặc không tồn tại trả lỗi không tìm thấy chung, không phân biệt nguyên nhân. — ✅ [S2] `apps/server/src/routes/public-pay.ts:21-52`; test [S2] `apps/server/src/public-pay.test.ts:66-104`.
- **FR-op-011** — Giáo viên có thể thu hồi và cấp lại link thanh toán của một hóa đơn; link cũ hết hiệu lực ngay lập tức. — ✅ [S11] `apps/server/src/routes/kernel.ts:3196-3209`; xác nhận UI [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:196-201`.
- **FR-op-012** — QR chuyển khoản luôn dựng tại thời gian thực từ tài khoản đang liên kết và số tiền còn nợ; kèm nội dung chuyển khoản chuẩn để hệ thống tự khớp. — ✅ [S10] `apps/server/src/lib/payment-instructions.ts:96-115`, [S9] `packages/api/src/lib/vietqr.ts:7-30`.
- **FR-op-013** — Trang thanh toán tự kiểm tra trạng thái định kỳ (5 giây) tới khi hóa đơn đủ tiền hoặc hết 15 phút, chỉ khi tab đang hiển thị; hết giờ hiện nút làm mới. — ✅ [S12] `apps/web/src/lib/repos/payments.ts:13-31`, `apps/web/src/routes/pay.$token.tsx:51-64,103-112`.
- **FR-op-014** — Liên kết tài khoản diễn ra trong phiên hosted của hub nhúng bằng iframe; server kiểm tra nguồn của link phiên trước khi trả về và chỉ cho phép nhúng từ nguồn tin cậy. — ✅ [S3] `apps/server/src/routes/bank-link.ts:219-242`, [S9] `packages/api/src/lib/bank-hub-origins.ts:8-32`, [S14] `apps/web/src/security-headers.ts:15`; iframe [S13] `apps/web/src/components/modals/bank-hub-link-modal.tsx:163-169`.
- **FR-op-015** — Trạng thái liên kết có 4 giá trị: chưa liên kết, đã liên kết, ngừng hoạt động (phía ngân hàng), đã hủy (giáo viên chủ động); màn hình hiển thị số tài khoản dạng che. — ✅ [S8] `packages/api/src/contracts.ts:2974-2982`, [S3] `apps/server/src/routes/bank-link.ts:33-49`, [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:119-178`.
- **FR-op-016** — Giáo viên mở phiên hủy liên kết hoặc khôi phục liên kết cho tài khoản hiện có; khi liên kết tài khoản mới, tài khoản cũ được lưu lại để đối soát vẫn bao quát tiền về tài khoản cũ. — ✅ [S3] `apps/server/src/routes/bank-link.ts:152-249,285-304`, [S7] `packages/db/src/schema/org-bank-link.ts:10-17`.
- **FR-op-017** — Nút đối soát kéo giao dịch tiền vào trong 7 ngày gần nhất của mọi tài khoản từng liên kết (tài khoản hiện tại + các tài khoản cũ), tối đa 5 trang mỗi tài khoản, đưa qua cùng đường xử lý như IPN; bị giới hạn lặp lại tối thiểu 1 phút. — ✅ [S3] `apps/server/src/routes/bank-link.ts:274-343`; test [S1] `apps/server/src/bank-hub-reconcile.test.ts:173-238`.
- **FR-op-018** — Hàng chờ hiển thị các giao dịch chưa khớp mới nhất của tổ chức (tối đa 50) kèm lý do; giáo viên gán một giao dịch về một hóa đơn (chỉ khi phiếu chưa đủ) hoặc bỏ qua giao dịch. — ✅ [S6] `apps/server/src/routes/payment-transactions.ts:47-149`; UI [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:316-434`.
- **FR-op-019** — Giáo viên ghi nhận phiếu thu học phí thủ công (một phần hoặc đủ) với mã yêu cầu do client cấp để chống ghi đúp; hệ thống chặn phiếu vượt số tiền còn nợ và chặn phiếu mới khi hóa đơn đã đủ. — ✅ [S11] `apps/server/src/routes/kernel.ts:3140-3193`, [S4] `apps/server/src/lib/payments/record-manual-payment.ts:97-148`; test [S4] `apps/server/src/lib/payments/manual-payment.test.ts:170-390`.
- **FR-op-020** — Giáo viên xem danh sách giao dịch đã khớp của một hóa đơn, gồm giao dịch ngân hàng và phiếu thủ công có nhãn phương thức. — ✅ [S11] `apps/server/src/routes/kernel.ts:3224-3264`; test [S11] `apps/server/src/invoice-transactions.test.ts:196-268`.
- **FR-op-021** — Môi trường phát triển có cổng mô phỏng tạo giao dịch đẩy vào đúng đường IPN (chỉ bật ở sandbox; môi trường khác bị chặn), dùng để thử khớp mã, phiếu đủ, giao dịch lạ. — ✅ [S11] `apps/server/src/routes/bank-hub-mock.ts:44-156`; test [S11] `apps/server/src/routes/bank-hub-mock.test.ts:139-264`.
- **FR-op-022** — Mọi endpoint học phí và liên kết ngân hàng chỉ dành cho vai trò tài chính; vai trò khác bị chặn, chưa đăng nhập được trả lỗi đăng nhập trước khi xét vai trò. — ✅ [S11] `apps/server/src/lib/require-finance-role.ts:19-27`, `packages/auth/src/role.ts:74-87`.

## 4. Non-functional Requirements

- **NFR-op-001** — Webhook phải trả lời nhanh và hầu như luôn xác nhận: hub chỉ thử lại khi lỗi mạng nên mọi kết quả hệ thống chấp nhận xử lý được đều được trả thành công (kể cả trùng, lạ, chưa xác định được tổ chức); chỉ dữ liệu hỏng mới trả lỗi phía client kèm log để điều tra. — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:13-27,65-100`; test [S1] `apps/server/src/bank-hub-ipn.test.ts:349-376`.
- **NFR-op-002** — So sánh khóa webhook phải an toàn trước tấn công đo thời gian, kể cả khi độ dài khác nhau. — ✅ [S11] `apps/server/src/lib/safe-equal.ts:9-14`, [S1] `apps/server/src/routes/bank-hub-webhooks.ts:44-45`.
- **NFR-op-003** — Ghi sổ giao dịch và tính lại hóa đơn diễn ra nguyên tử trong một lô duy nhất; trạng thái khớp và lý do được quyết trong cùng câu ghi, không có khoảng cửa đọc–sửa–ghi. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:103-138`; bất biến kiểm bởi [S4] `apps/server/src/lib/payments/ledger-invariants.test.ts:73-342`.
- **NFR-op-004** — Dung lượng body webhook bị giới hạn 64KB. — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:34`.
- **NFR-op-005** — Token link thanh toán có độ nhiễu 128-bit (16 byte ngẫu nhiên mã hóa URL-safe, ~22 ký tự) — không đoán được. — ✅ [S9] `packages/api/src/lib/payment-code.ts:36-43`; test [S9] `packages/api/src/lib/payment-code.test.ts:51-56`.
- **NFR-op-006** — Phản hồi trang công khai không được cache và cố ý lược ghi chú của giáo viên cùng hạn đóng tiền vì link lan truyền trong nhóm chat ngoài tầm kiểm soát. — ✅ [S2] `apps/server/src/routes/public-pay.ts:10-17,45-51`.
- **NFR-op-007** — Đối soát bị giới hạn tần suất tối thiểu 1 phút giữa hai lần (phản hồi 429 kèm mã riêng); UI đếm lời nhắc "Vừa đối soát, thử lại sau 1 phút.". — ✅ [S3] `apps/server/src/routes/bank-link.ts:277-283`; [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:294-339`.
- **NFR-op-008** — Mỗi lần đối soát giới hạn 5 trang × 100 giao dịch mỗi tài khoản để chặn tràn khối lượng. — ✅ [S3] `apps/server/src/routes/bank-link.ts:309-333`.
- **NFR-op-009** — Giá trị khóa bí mật không bao giờ xuất hiện trong log; lỗi từ hub chỉ ghi trạng thái, mã và thông điệp vào log máy chủ, phản hồi cho client chỉ mang mã lỗi ổn định. — ✅ [S3] `apps/server/src/routes/bank-link.ts:96-117`; test không log secret [S5] `apps/server/src/lib/bank-hub/bank-hub-client.test.ts:605`.
- **NFR-op-010** — Trang thanh toán poll 5 giây, dừng sau 15 phút, và chỉ chạy khi tab hiển thị để tiết kiệm tài nguyên. — ✅ [S12] `apps/web/src/lib/repos/payments.ts:13-31`, `apps/web/src/routes/pay.$token.tsx:51-64`.
- **NFR-op-011** — Giao dịch của tổ chức khác trong hàng chờ phải bị che: nội dung chuyển khoản rỗng, không lộ mã tham chiếu. — ✅ [S6] `apps/server/src/routes/payment-transactions.ts:14-19,62-75`; hợp đồng [S8] `packages/api/src/contracts.ts:3042-3057`.
- **NFR-op-012** — Chính sách nhúng iframe chỉ cho phép nguồn hub trong danh sách tin cậy; môi trường thử nghiệm cho phép thêm localhost. — ✅ [S9] `packages/api/src/lib/bank-hub-origins.ts:8-32`, [S14] `apps/web/src/security-headers.ts:15`.
- **NFR-op-013** — Lỗi từ hub hiển thị thông điệp tiếng Việt thân thiện theo từng mã lỗi, không lộ chi tiết kỹ thuật. — ✅ [S13] `apps/web/src/components/modals/bank-hub-link-modal.tsx:16-34`; chuyển 503 → trạng thái tắt tính năng [S12] `apps/web/src/lib/repos/bank-link.ts:31`.
- **NFR-op-014** — Tuyến webhook và trang công khai nằm ngoài không gian API có xác thực phiên, không bị chặn bởi gate vai trò, để hub và phụ huynh không đăng nhập dùng được. — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:13-17`, [S2] `apps/server/src/routes/public-pay.ts:10-17`, [S11] `apps/server/src/app.ts:409-423`.

## 5. Business Rules

- **BR-op-001** — Một tổ chức chỉ có tối đa một tài khoản ngân hàng đang liên kết hoạt động tại một thời điểm; điều kiện này được chặn ở máy chủ chứ không chỉ ở giao diện. — ✅ [S3] `apps/server/src/routes/bank-link.ts:172-187`.
- **BR-op-002** — Tiền chuyển vào chỉ bao giờ dừng ở hóa đơn cùng tổ chức; mã học phí của tổ chức khác không bao giờ đụng tới hóa đơn của tổ chức này. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:69-98`; test [S1] `apps/server/src/bank-hub-ipn.test.ts:281-305`.
- **BR-op-003** — Số tiền ghi nhận vào hóa đơn từ giao dịch ngân hàng là toàn bộ số tiền của giao dịch đó, kể cả khi vượt số còn nợ (khác với phiếu thủ công bị chặn vượt); hành vi này có test cố ý đang fail để ghi nhận rằng bất biến còn bỏ ngỏ. — ✅ [S4] `apps/server/src/lib/payments/ledger-invariants.test.ts:336-342`
- 🟡 Ý định nghiệp vụ của BR-op-003 (by-design hay bug cần sửa cho nhất quán với phiếu thủ công) chưa được quyết → OQ-3.
- **BR-op-004** — Phiếu thu thủ công không được vượt số còn nợ của hóa đơn; hóa đơn đã đủ thì không nhận phiếu mới. — ✅ [S4] `apps/server/src/lib/payments/record-manual-payment.ts:132-139`; [S11] `apps/server/src/routes/kernel.ts:3140-3193`.
- **BR-op-005** — Trạng thái đã thanh toán của hóa đơn là trạng thái "dính": giao dịch đến sau khi đã đủ không mở lại hóa đơn mà rơi vào hàng chờ với lý do "phiếu đã đủ tiền". — ✅ [S4] `apps/server/src/lib/payments/recompute-invoice.ts:29-32`; test [S1] `apps/server/src/bank-hub-ipn.test.ts:264-279`.
- **BR-op-006** — Mã học phí là nhận diện chính của một chuyển khoản; chuyển khoản không kèm mã không được tự khớp qua IPN mà chỉ vào hàng chờ qua đường đối soát. — ✅ [S4] `apps/server/src/lib/payments/ingest-transaction.ts:32-39,61-65`; test [S1] `apps/server/src/bank-hub-reconcile.test.ts:173-206`.
- **BR-op-007** — Không bao giờ ghi đúp: giao dịch ngân hàng trùng, kéo đối soát lại, và phiếu thủ công gửi lại đều là thao tác rỗng. — ✅ [S7] `packages/db/src/schema/payment-transaction.ts:11-24,53-56`; test [S1] `apps/server/src/routes/bank-hub-webhooks.test.ts:156-170`, `apps/server/src/bank-hub-reconcile.test.ts:208-221`; e2e [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:316-336`.
- **BR-op-008** — Trạng thái liên kết do dữ liệu hub quyết định: ngân hàng ngừng hoạt động được phản ánh qua sự kiện; giáo viên chủ động hủy qua phiên riêng; sự kiện cũ hơn thời điểm đã ghi nhận thì bị bỏ qua để tránh quay ngược trạng thái. — 🔵 hai đường cùng một guard: [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:119-178,188-236`.
- **BR-op-009** — Tài khoản đã hủy liên kết vẫn nằm trong phạm vi đối soát cho tới khi hết cửa sổ 7 ngày, để tiền về tài khoản cũ không rơi vào khoảng trống. — ✅ [S3] `apps/server/src/routes/bank-link.ts:251-269,285-304`; test [S1] `apps/server/src/bank-hub-reconcile.test.ts:173-206`.
- **BR-op-010** — QR và nội dung chuyển khoản luôn phản ánh tài khoản đang liên kết và số còn nợ tại thời điểm mở trang; phiếu đủ hiển thị trạng thái đã đủ, chưa liên kết hiển thị hướng dẫn chờ giáo viên thiết lập. — ✅ [S10] `apps/server/src/lib/payment-instructions.ts:62-116`; UI [S13] `packages/ui/src/components/payments/payment-qr-panel.tsx:34-89`.
- **BR-op-011** — Link thanh toán là link chỉ đọc: không có hành động ghi nào trên trang công khai và không đọc phiên đăng nhập. — ✅ [S2] `apps/server/src/routes/public-pay.ts:10-17,21-53`.
- **BR-op-012** — Thu hồi/cấp lại link có hiệu lực tức thời: link cũ chết ngay khi token mới được sinh. — ✅ [S11] `apps/server/src/routes/kernel.ts:3196-3209`; UI cảnh báo [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:196-201`.
- **BR-op-013** — Gán giao dịch chỉ được thực hiện khi hóa đơn đích chưa đủ tiền; bỏ qua chỉ áp dụng cho giao dịch đang nằm ở hàng chờ. — ✅ [S6] `apps/server/src/routes/payment-transactions.ts:108-115,132-149`; test [S6] `apps/server/src/payment-transactions.test.ts:137-203`.
- **BR-op-014** — Khi thiết lập đại diện trên hub, hạn mức nhận thông báo giao dịch được đặt "không giới hạn" để thông báo biến động được phát đầy đủ. — 🔵 [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:39-45,58-108` (hai điểm cùng thiết lập).
- **BR-op-015** — Ở môi trường thử nghiệm, hub ghim URL IPN vào URL đầu tiên từng đăng ký và các lần đổi URL sau đó không có hiệu lực; hệ thống đối phó bằng cách điều hướng theo loại khóa ở mọi đường dẫn webhook thay vì theo URL. — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:19-27` (quan sát 2026-10-07).
## 6. Error Matrix (wording là hợp đồng — trích NGUYÊN VĂN)

| ID | Tình huống | HTTP | Wording / mã trả về | Nguồn | Nhãn |
|---|---|---|---|---|---|
| E-op-001 | Hub chưa cấu hình khi webhook đến | 503 | `BANKHUB_DISABLED` | [S1] `apps/server/src/routes/bank-hub-webhooks.ts:37-38` | ✅ |
| E-op-002 | Khóa webhook thiếu/sai (cả hai họ) | 401 | `unauthorized` | [S1] `apps/server/src/routes/bank-hub-webhooks.ts:39-46`; test `apps/server/src/routes/bank-hub-webhooks.test.ts:183-198` | ✅ |
| E-op-003 | Body webhook không parse được | 400 | `invalid json` | [S1] `apps/server/src/routes/bank-hub-webhooks.ts:47-52` | ✅ |
| E-op-004 | Sự kiện vòng đời fail schema | 400 | `invalid body` | [S1] `apps/server/src/routes/bank-hub-webhooks.ts:53-57` | ✅ |
| E-op-005 | IPN thiếu trường bắt buộc | 400 | `invalid body` + log `[ipn] payload failed required-field validation (transaction_id=...)` | [S1] `apps/server/src/routes/bank-hub-webhooks.ts:70-77`; test `apps/server/src/bank-hub-ipn.test.ts:406` | ✅ |
| E-op-006 | Sự kiện vòng đời không thuộc nhóm tài khoản | 200 | `{ "success": true }` (bỏ qua im lặng) | [S1] `apps/server/src/routes/bank-hub-webhooks.ts:59-61` | ✅ |
| E-op-007 | Không xác định được tổ chức do API hub lỗi | 200 | vẫn xác nhận; log `[ipn] Bank Hub API failed during org resolution (transaction_id=...) — recoverable via reconcile` | [S1] `apps/server/src/routes/bank-hub-webhooks.ts:95-99`; test `apps/server/src/bank-hub-ipn.test.ts:349` | ✅ |
| E-op-008 | Hub chưa cấu hình cho tính năng liên kết | 503 | `BANKHUB_DISABLED` | [S3] `apps/server/src/routes/bank-link.ts:122-131,157-166,351-360` | ✅ |
| E-op-009 | Chưa đăng nhập | 401 | `unauthorized` | [S3] `apps/server/src/routes/bank-link.ts:69`; [S11] `apps/server/src/lib/require-finance-role.ts:19-22` | ✅ |
| E-op-010 | Vai trò không đủ quyền tài chính | 403 | `finance-forbidden` | [S11] `apps/server/src/lib/require-finance-role.ts:23-25` | ✅ |
| E-op-011 | Body JSON/JSON sai schema | 400 | `invalid json` / `invalid body` | [S3] `apps/server/src/routes/bank-link.ts:82-86`; [S6] `apps/server/src/routes/payment-transactions.ts:38-42` | ✅ |
| E-op-012 | Hub trả 429 | 429 | `BANKHUB_RATE_LIMITED` + giữ `Retry-After` (mặc định 60) | [S3] `apps/server/src/routes/bank-link.ts:96-117` | ✅ |
| E-op-013 | Lỗi khác từ hub | 502 | `BANKHUB_UPSTREAM` (chi tiết chỉ vào log) | [S3] `apps/server/src/routes/bank-link.ts:96-117` | ✅ |
| E-op-014 | Yêu cầu liên kết khi đã có tài khoản | 409 | `BANK_LINK_ALREADY_LINKED` | [S3] `apps/server/src/routes/bank-link.ts:175-187` | ✅ |
| E-op-015 | Hủy/khôi phục khi chưa có tài khoản | 409 | `BANK_LINK_NO_LINKED_ACCOUNT` | [S3] `apps/server/src/routes/bank-link.ts:188-196` | ✅ |
| E-op-016 | Đại diện trên hub chưa kịp tạo xong | 409 | `BANK_LINK_COMPANY_SETTLING` | [S3] `apps/server/src/routes/bank-link.ts:200-208` | ✅ |
| E-op-017 | Link phiên không hợp lệ hoặc nguồn không cho phép | 502 | `BANK_LINK_BAD_HOSTED_LINK_ORIGIN` | [S3] `apps/server/src/routes/bank-link.ts:219-242` | ✅ |
| E-op-018 | Bấm đối soát trong 1 phút | 429 | `reconcile cooldown` + `RECONCILE_COOLDOWN` | [S3] `apps/server/src/routes/bank-link.ts:277-283`; test `apps/server/src/bank-hub-reconcile.test.ts:223-238` | ✅ |
| E-op-019 | Gán/bỏ qua giao dịch không tồn tại | 404 | `transaction not found` | [S6] `apps/server/src/routes/payment-transactions.ts:96-97,147` | ✅ |
| E-op-020 | Gán về hóa đơn không tồn tại | 404 | `invoice not found` | [S6] `apps/server/src/routes/payment-transactions.ts:99-107` | ✅ |
| E-op-021 | Gán khi hóa đơn đã đủ | 409 | `invoice already paid` + `INVOICE_ALREADY_PAID` | [S6] `apps/server/src/routes/payment-transactions.ts:108-115` | ✅ |
| E-op-022 | Phiếu thủ công: trùng mã yêu cầu / phiếu đã đủ / vượt nợ | 409 / 422 / 422 | `client-request-id-conflict` / `invoice-settled` / `amount-exceeds-debt` (+ `remaining`) | [S11] `apps/server/src/routes/kernel.ts:3140-3193`; test `apps/server/src/lib/payments/manual-payment.test.ts:224-291` (replay 200 :224, 409 conflict :235, 422 exceeds :248, 422 settled :282 — HTTP-level qua `app.request`) | ✅ |
| E-op-023 | Token trang công khai thiếu/quá ngắn/không tồn tại | 404 | `not found` (chung, không phân biệt) | [S2] `apps/server/src/routes/public-pay.ts:23-40`; test `apps/server/src/public-pay.test.ts:66-104` | ✅ |

## 7. Success Criteria

- **SC-op-01** — IPN tiền vào mang mã đúng khiến hóa đơn cộng tiền và tự chốt đủ trong vòng vài giây, giáo viên không phải làm gì. — ✅ e2e [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:274-296`; test [S1] `apps/server/src/bank-hub-ipn.test.ts:209-230`.
- **SC-op-02** — Gửi lại trăm lần cũng chỉ cộng đúng một lần. — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.test.ts:156-170`; e2e [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:316-336`.
- **SC-op-03** — Phụ huynh mở link thấy đúng QR + số còn nợ; khi đủ tiền trang tự chốt không cần tải lại. — ✅ e2e [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:176-220,298-314`; [S12] `apps/web/src/routes/pay.$token.tsx:51-112`.
- **SC-op-04** — Link đã thu hồi mở ra trang lỗi không tìm thấy. — ✅ [S2] `apps/server/src/public-pay.test.ts:83-104` (token không tồn tại → 404 chung :83-87).
- **SC-op-05** — Giáo viên hoàn tất liên kết trong một phiên iframe; panel đổi sang "Đã liên kết" kèm số tài khoản che. — ✅ e2e [S15] `apps/e2e/specs/tuition-bank-transfer.spec.ts:151-174`; panel [S13] `apps/web/src/components/payments/bank-link-panel.tsx:40-99`.
- **SC-op-06** — Thất bại chuyển giao IPN được bù bằng một lần bấm đối soát; số kết quả hiển thị cho giáo viên. — ✅ [S1] `apps/server/src/bank-hub-reconcile.test.ts:173-238`; wording kết quả [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:329-343`.
- **SC-op-07** — Chuyển khoản lạ không bao giờ lộ nội dung của tổ chức khác trên hàng chờ. — ✅ [S6] `apps/server/src/routes/payment-transactions.ts:62-75`; test [S6] `apps/server/src/payment-transactions.test.ts:137-203`.
- **SC-op-08** — Trợ giảng không truy cập được bất kỳ endpoint tài chính nào. — ✅ guard [S11] `apps/server/src/lib/require-finance-role.ts:19-27` + `packages/auth/src/role.ts:74-87`.

## 8. Data Entities

- **ORG_BANK_LINK** — liên kết ngân hàng của tổ chức (một dòng mỗi tổ chức): khóa chính là mã tổ chức; mã đại diện hub; mã tài khoản hiện tại; danh sách tài khoản cũ (mặc định rỗng); trạng thái (mặc định "none"); tên ngân hàng, mã bin, mã ngân hàng, số tài khoản, tên chủ tài khoản (mặc định rỗng); thời điểm sự kiện cuối; thời điểm đối soát cuối; thời điểm liên kết; thời điểm cập nhật. — ✅ [S7] `packages/db/src/schema/org-bank-link.ts:18-47`.
- **PAYMENT_TRANSACTION** — sổ giao dịch: id; mã tổ chức; nhà cung cấp (mặc định sepay_bankhub); mã giao dịch bên ngoài; mã tài khoản nhận; số tiền; nội dung; mã tham chiếu; ngày giao dịch; mã học phí; mã hóa đơn (không khóa ngoại); trạng thái khớp (mặc định unmatched); lý do chưa khớp; raw payload (chỉ giữ khi chưa khớp); phương thức và người ghi (chỉ phiếu thủ công); thời điểm tạo. — ✅ [S7] `packages/db/src/schema/payment-transaction.ts:25-63`.
- **INVOICE** — hóa đơn học phí với các cột thanh toán: mã chuyển khoản (duy nhất), token link công khai (duy nhất), số đã nhận (tính lại từ sổ, không cộng trực tiếp), trạng thái, phương thức hiển thị. — ✅ [S7] `packages/db/src/schema/invoice.ts:25-61`.
- Quan hệ khóa: `invoice_id` và `enrollment_id` cố ý không có khóa ngoại để hồ sơ tài chính sống sót khi dòng tham chiếu bị xóa. — ✅ [S7] `packages/db/src/schema/payment-transaction.ts:11-24`, `packages/db/src/schema/invoice.ts:12-17`.
- ERD đầy đủ: `srs/online-payment-reverse-erd.md`.

## 9. Flows (tóm tắt — chi tiết ở `srs/online-payment-reverse-flows.md`)

1. Flow 1 — Liên kết tài khoản ngân hàng (phiên hosted + sự kiện vòng lifecycle). — ✅ [S3] `apps/server/src/routes/bank-link.ts:152-249`; [S13] modal.
2. Flow 2 — Webhook IPN giao dịch: xác thực → xác định tổ chức → khớp → ghi sổ → tính lại (có nhánh chữ ký sai / trùng / không khớp). — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:36-101`; [S4] ingest.
3. Flow 3 — Phụ huynh thanh toán qua link công khai (mở trang → poll → chốt đủ). — ✅ [S2] `apps/server/src/routes/public-pay.ts`; [S12] `apps/web/src/routes/pay.$token.tsx`.
4. Flow 4 — Đối soát và hàng chờ (kéo 7 ngày → ingest lại → gán/bỏ qua). — ✅ [S3] `apps/server/src/routes/bank-link.ts:251-344`; [S6] `apps/server/src/routes/payment-transactions.ts`.
5. Flow 5 — Thu học phí thủ công (phiếu một phần/đủ, chống trùng, chặn vượt). — ✅ [S11] `apps/server/src/routes/kernel.ts:3140-3193`; [S4] record-manual-payment.

## 10. Screens

| Màn hình | Nội dung chính | Nguồn | Nhãn |
|---|---|---|---|
| Trang thanh toán công khai `/pay/:token` | Tên tổ chức + học viên, số còn nợ, QR, nội dung chuyển khoản, trạng thái; tự cập nhật; lỗi link chết | [S12] `apps/web/src/routes/pay.$token.tsx:36-112` | ✅ |
| Panel liên kết ngân hàng (cài đặt học phí) | Trạng thái 4 giá trị + số tài khoản che + nút liên kết/hủy/khôi phục + đồng bộ sau đóng modal | [S13] `apps/web/src/components/payments/bank-link-panel.tsx:40-114` | ✅ |
| Modal phiên liên kết | Iframe hosted, poll token 5s, postMessage đóng/hết hạn, bản đồ wording lỗi tiếng Việt | [S13] `apps/web/src/components/modals/bank-hub-link-modal.tsx:16-169` | ✅ |
| Modal "Thu học phí" | Hành động copy link/rotate, hướng dẫn chuyển khoản, hàng chờ giao dịch chưa khớp + gán/bỏ qua, kết quả đối soát | [S13] `apps/web/src/components/modals/invoice-payment-modal.tsx:216-445` | ✅ |
| Panel QR (dùng chung giáo viên + portal học viên) | 4 trạng thái: đủ / chưa liên kết / một phần / đang mở; hint giữ nguyên nội dung chuyển khoản | [S13] `packages/ui/src/components/payments/payment-qr-panel.tsx:34-140` | ✅ |

## 11. Constraints, Dependencies, Assumptions

**Ràng buộc kỹ thuật (cái tên biến môi trường — KHÔNG giá trị):** tính năng cần 5 biến cấu hình hub: `SEPAY_BANKHUB_CLIENT_ID`, `SEPAY_BANKHUB_CLIENT_SECRET`, `SEPAY_BANKHUB_IPN_API_KEY`, `SEPAY_BANKHUB_WEBHOOK_SECRET`, `SEPAY_BANKHUB_BASE_URL`; thiếu bất kỳ biến khóa nào khiến toàn bộ tính năng trả `BANKHUB_DISABLED`. — ✅ [S11] `apps/server/src/index.ts:145-153`, [S5] `apps/server/src/lib/bank-hub/bank-hub-client.ts:459-479`.

**Phụ thuộc bên ngoài:**
- SePay Bank Hub: API base `bankhub-api.sepay.vn` (sandbox `bankhub-api-sandbox.sepay.vn`) — [S5] `apps/server/src/lib/bank-hub/bank-hub-client.ts:12-13`; hosted-link origin iframe `bankhub.sepay.vn` (sandbox `bankhub-sandbox.sepay.vn`) — [S9] `packages/api/src/lib/bank-hub-origins.ts:9,12`. — ✅
- Bộ API hub dùng: lấy token dịch vụ, tạo đại diện, tạo phiên liên kết, xem tài khoản, kéo giao dịch. — ✅ [S5] `apps/server/src/lib/bank-hub/bank-hub-client.ts:334-444`.
- Dịch vụ QR công khai VietQR dựng ảnh từ thông tin tài khoản; ngân hàng VietinBank cần tiền tố đặc biệt trong nội dung. — ✅ [S9] `packages/api/src/lib/vietqr.ts:7-30`.

**Giả định (suy đoán có code hậu thuẫn):**
- Server-state là nguồn chân lý: UI poll 5 giây, không có kênh đẩy. — 🔵 [S12] `apps/web/src/lib/repos/payments.ts:13-31` + `apps/web/src/routes/pay.$token.tsx:36-49`.
- Trùng lặp xác định hoàn toàn bằng cặp nhà cung cấp + mã giao dịch bên ngoài; hub cam kết mã duy nhất. — 🔵 [S7] `packages/db/src/schema/payment-transaction.ts:53-56` + [S4] `apps/server/src/lib/payments/ingest-transaction.ts:133`.
- Không có job định kỳ nào chạy đối soát tự động. — 🟡 negative search `apps/server/src/index.ts:177` → OQ-1.

## 12. Open Questions

Danh sách đầy đủ OQ-1..OQ-10, Gap, Conflict, Inferred: xem `reverse-gaps.md`. Tóm tắt: OQ-1 thiếu tự động hóa đối soát; OQ-2 ai/bao lâu được bấm đối soát; OQ-3 vượt nợ từ ngân hàng; OQ-4 giữ dữ liệu raw và PII; OQ-5 mô hình một tài khoản; OQ-6 phân cấp quyền rotate/xử lý; OQ-7 quy mô poll; OQ-8 lộ link; OQ-9 chuyển môi trường sandbox ghim IPN; OQ-10 giao dịch không mã qua IPN bị bỏ hẳn. — 🟡 (tất cả đang chờ quyết).
