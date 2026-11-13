---
feature: student-tuition
type: reverse-srs
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: d6c0f6b5
confidence_summary: "spec: ✅ 98 / 🔵 2 / 🟡 3; tổng toàn assembly: ✅ 185 / 🔵 13 / 🟡 8"
---

# student-tuition — Đặc tả đảo ngược (reverse-SRS) — draft

Feature "student-tuition" trong tài liệu này = chu trình học viên xem học phí/hóa đơn:
mục "Học phí" trên cổng học viên (danh sách hóa đơn → chi tiết phiếu kèm QR chuyển khoản →
tự cập nhật khi tiền về) và phân hệ B: khối tổng hợp học phí theo lớp trên hồ sơ học viên
ở cổng giáo viên (#347). Phần giáo viên tạo hóa đơn / đối soát / liên kết ngân hàng KHÔNG
thuộc feature này — cross-ref docs/_reverse/tuition-invoicing/.

> Quy ước nhãn — mỗi mệnh đề mang nhãn riêng: ✅ = khẳng định bởi code/test, có cite `path:line`; 🔵 = suy luận từ ≥2 bằng chứng code; 🟡 = phỏng đoán nghiệp vụ/why, bắt buộc kèm OQ tương ứng (Mục 12). Tên endpoint/hàm/bảng chỉ xuất hiện ở cột Truy vết và các file nguồn/evidence, không nằm trong mệnh đề FR/BR.

## Mục 0 — Nguồn soạn thảo (draft provenance)

- Soạn từ mã nguồn develop @ d6c0f6b5; đọc tĩnh, không chạy test (R1: chỉ đếm test, không
  thực thi).
- Phạm vi gồm HAI phân hệ (OQ-01):
  (A) cổng học phí học viên #320 — menu "Học phí" → danh sách → chi tiết phiếu + QR + poll
  (FR-01..FR-26); ✅ apps/student/src/routes/_auth/tuition/index.tsx:1-66, apps/student/src/routes/_auth/tuition/$invoiceId.tsx:1-105
  (B) tab "Học phí" trên hồ sơ học viên ở cổng giáo viên #347/#322/#345 (FR-27..FR-33) —
  component sống ở apps/web nhưng reverse-plan.json gán nguồn e2e của nó cho feature này,
  và docs/_reverse/tuition-invoicing/ không phủ nó. 🟡 (ranh giới feature — OQ-01)
- complexity_flag: state-machine nhẹ — máy trạng thái hiển thị panel QR 4 giá trị + vòng
  đời phiên poll; hóa đơn chỉ có 2 trạng thái bền unpaid/paid. ✅
  packages/ui/src/components/payments/payment-qr-panel.tsx:83-89, packages/db/src/schema/invoice.ts:37
- Trạng thái working tree khi soạn: `git status --short` cho thấy chỉ `.gitignore`,
  `apps/server/src/routes/admin-library-audio.test.ts`, `biome.json` modified và
  `.claude/`, `_templates/`, `docs/_reverse/` untracked — KHÔNG có file nguồn thuộc feature
  này đang modified, nên mọi cite trỏ trực tiếp working tree = nội dung @ d6c0f6b5. ✅

### 0.1 Bảng tài nguyên S (đầy đủ ở reverse-sources.md)

| S-id | Tài nguyên | Loại |
|---|---|---|
| S1 | Kernel + API học phí học viên (routes/student.ts) | code |
| S2 | Service hướng dẫn thanh toán (payment-instructions.ts) | code |
| S3 | Schema hóa đơn (schema/invoice.ts) | code |
| S4 | Schema liên kết ngân hàng (schema/org-bank-link.ts) | code |
| S5 | Schema sổ giao dịch (schema/payment-transaction.ts) | code |
| S6 | Schema lớp — tuitionFee (schema/class.ts) | code |
| S7 | Schema enrollment (schema/enrollment.ts) | code |
| S8 | Schema học viên (schema/student.ts) | code |
| S9 | Schema tổ chức (schema/organization.ts) | code |
| S10 | Hợp đồng Zod phần học phí + lỗi học viên (contracts.ts) | code |
| S11 | QR VietQR + memo (vietqr.ts) | code |
| S12 | Mã thanh toán + token (payment-code.ts) | code |
| S13 | Sự kiện thông báo học phí (notifications/templates.ts) | code |
| S14 | Trang danh sách /tuition (portal) | client route |
| S15 | Trang chi tiết /tuition/$invoiceId (portal) | client route |
| S16 | Danh sách hóa đơn cột overview (tuition-list.tsx) | client component |
| S17 | Khối trống overview (empty-state.tsx) | client component |
| S18 | View lỗi cổng học viên (student-error-view.tsx) | client component |
| S19 | Gate học viên (student-page-gate.tsx) | client component |
| S20 | Thanh điều hướng cổng học viên (student-nav.tsx) | client component |
| S21 | Chuông thông báo (notification-bell.tsx) | client component |
| S22 | Repo truy vấn học viên (repos/student.ts) | client lib |
| S23 | Hằng số poll portal (repos/payments-portal.ts) | client lib |
| S24 | Cấu hình query client (query-client.ts) | client lib |
| S25 | Panel QR dùng chung (packages/ui payment-qr-panel.tsx) | shared component |
| S26 | Trang hồ sơ học viên — tab Học phí (web $studentId.tsx) | client route |
| S27 | Tổng hợp học phí theo lớp (student-tuition-summary.tsx) | client component |
| S28 | Ô trạng thái hóa đơn (invoice-status-cell.tsx) | client component |
| S29 | Kernel tính học phí GV (tuition-from-kernel.ts) | client lib |
| S30 | Định dạng hóa đơn (format-invoice.ts) | client lib |
| S31 | Hằng số poll web (repos/payments.ts) | client lib |
| S32 | Trang /pay công khai (pay.$token.tsx) — cross-ref | client route |
| S33 | Modal thanh toán giáo viên (invoice-payment-modal.tsx) — cross-ref | client component |
| S34 | E2E tổng hợp học phí (#347) | e2e |
| S35 | E2E chuyển khoản đầu-cuối (tuition-bank-transfer) | e2e |
| S36 | E2E điều hướng portal (student-class-detail) | e2e |
| S37 | Helper e2e ngày VN (helpers.ts) | e2e lib |
| S38 | Test API hóa đơn (invoice-payment.test.ts) | test |
| S39 | Test kernel học phí + component tổng hợp | test |
| S40 | Bộ đặc tả phía giáo viên docs/_reverse/tuition-invoicing/ | doc cross-ref |

### 0.2 Liên kết

- Nguồn chi tiết: [reverse-sources.md](reverse-sources.md)
- Khoảng trống & câu hỏi mở: [reverse-gaps.md](reverse-gaps.md)
- Bằng chứng thô: [_evidence.md](_evidence.md)
- Luồng: [srs/student-tuition-reverse-flows.md](srs/student-tuition-reverse-flows.md)
- Máy trạng thái: [srs/student-tuition-reverse-states.md](srs/student-tuition-reverse-states.md)
- Mô hình dữ liệu: [srs/student-tuition-reverse-erd.md](srs/student-tuition-reverse-erd.md)
- Use cases: [usecases/student-tuition-reverse-usecase-index.md](usecases/student-tuition-reverse-usecase-index.md)

### 0.3 Tài liệu nghiệp vụ hiện có

- Không có tài liệu feature nào trong repo cho phạm vi này (reverse-plan.json
  features[26] `existing_doc = null`, `confidence = medium`). ✅ docs/_reverse/reverse-plan.json
- Phía giáo viên của cùng domain đã có bộ đặc tả riêng: docs/_reverse/tuition-invoicing/
  (tạo hóa đơn, mark-paid, đối soát IPN, liên kết ngân hàng) — feature này chỉ mô tả bước
  nháy liên ứng dụng với học viên. ✅ docs/_reverse/tuition-invoicing/tuition-invoicing-reverse-spec.md (mục "Cổng học viên xem học phí" trỏ về feature này)

## Mục 1 — Phạm vi

- Phân hệ A — cổng học phí học viên (#320): mục "Học phí" trên menu portal; danh sách hóa
  đơn với 2 nhóm đã thanh toán / chưa đủ; trang chi tiết phiếu với QR chuyển khoản và 5
  hàng thông tin copy-per-field; tự cập nhật khi tiền về (poll 5 giây, tab hiển thị, cap 15
  phút); vào từ thông báo. ✅ apps/student/src/routes/_auth/tuition/index.tsx:1-66, apps/student/src/routes/_auth/tuition/$invoiceId.tsx:1-105
- Phân hệ B — tổng hợp học phí theo lớp trên hồ sơ học viên (#347): 3 thẻ Tổng / Đã đóng /
  Còn lại; bảng giải thích theo lớp; ghi chú tiền từ hóa đơn không gắn lớp; bảng hóa đơn
  bấm được mở trang chi tiết hóa đơn phía giáo viên (#345 — cùng ứng dụng web, cross-ref docs/_reverse/tuition-invoicing/) với nhãn trạng thái suy diễn "Quá hạn" (#322). ✅
  apps/web/src/routes/_auth/students/$studentId.tsx:326-365, apps/web/src/components/tuition/student-tuition-summary.tsx:1-118
- Ngoài phạm vi (chỉ cross-ref): tạo/xóa hóa đơn, mark-paid thu tay, đối soát IPN + sweep,
  liên kết/gỡ liên kết tài khoản ngân hàng (feature tuition-invoicing — S40); trang /pay
  công khai (S32); modal thanh toán của giáo viên (S33); vòng đời sổ giao dịch chi tiết.
  ✅ apps/server/src/routes/student.ts:928-976 (chỉ 2 GET, không có POST hóa đơn trên API học viên)

## Mục 2 — Actor

- **Học viên (student)**: duy nhất một actor thao tác ở phân hệ A — đăng nhập session học
  viên, mọi route hóa đơn yêu cầu auth (401 nếu thiếu). ✅ apps/server/src/routes/student.ts:127-129, apps/server/src/routes/student.ts:732-733, apps/server/src/invoice-payment.test.ts:187-194
- **Giáo viên (web)**: actor của phân hệ B — xem tab Học phí trên hồ sơ học viên, bấm dòng
  hóa đơn sang trang chi tiết. ✅ apps/web/src/routes/_auth/students/$studentId.tsx:326-365
- **Hệ thống ngân hàng (SePay/BankHub)**: bị động đối với feature này — tiền về đổi
  `paid_amount`/`status` qua đường đối soát thuộc tuition-invoicing; học viên chỉ đọc kết
  quả. 🟡 (điểm chạm học viên với tiền về thực tế — OQ-10)
  packages/db/src/schema/payment-transaction.ts:5-22

## Mục 3 — Yêu cầu chức năng (FR)

| FR | Yêu cầu | Điều kiện / Giới hạn | Truy vết |
|---|---|---|---|
| FR-01 | Menu "Học phí" (icon ví) có trên thanh điều hướng cổng học viên, dẫn về `/tuition`; trạng thái menu đang mở áp dụng cho mọi đường bắt đầu bằng `/tuition`. | Nhãn mục tái sử dụng cho tiêu đề trang. | ✅ apps/student/src/components/layout/student-nav.tsx:74, apps/student/src/components/layout/student-nav.tsx:103-110 |
| FR-02 | Trang danh sách hiển thị kicker "Học phí" và tiêu đề "Học phí của tôi". | khung trang có dấu dữ liệu ổn định (testid — xem truy vết) cho e2e. | ✅ apps/student/src/routes/_auth/tuition/index.tsx:40-48 |
| FR-03 | Cả hai trang học phí bọc gate học viên: chưa có hồ sơ → view lỗi; hồ sơ chưa hoàn tất onboarding → tự chuyển về trang onboarding. | Gate chạy lại truy vấn hồ sơ theo email phiên trước khi render nội dung. | ✅ apps/student/src/routes/_auth/tuition/index.tsx:20, apps/student/src/routes/_auth/tuition/$invoiceId.tsx:42, apps/student/src/components/layout/student-page-gate.tsx:32-44 |
| FR-04 | Danh sách hóa đơn tải qua khóa cache riêng cho danh sách (truy vết) với thời gian stale 30 giây. | fetch gắn header org phiên. | ✅ apps/student/src/lib/repos/student.ts:832-850, apps/student/src/lib/repos/student.ts:55-67 |
| FR-05 | Lỗi tải danh sách hiển thị view lỗi cổng học viên theo mã lỗi hợp đồng (401 toàn cục tự đăng xuất về login kèm đường quay lại). | Lỗi không phải HTTP → view lỗi mặc định. | ✅ apps/student/src/routes/_auth/tuition/index.tsx:26-35, apps/student/src/lib/query-client.ts:30-39, apps/student/src/components/overview/student-error-view.tsx:82-84 |
| FR-06 | Đang tải danh sách hiển thị Loader. | | ✅ apps/student/src/routes/_auth/tuition/index.tsx:22-24 |
| FR-07 | Không có hóa đơn nào → khối trống "Chưa có hóa đơn học phí" kèm mô tả "Khi giáo viên tạo phiếu thu học phí cho lớp của bạn, thông tin thanh toán và mã QR sẽ hiển thị tại đây." | Icon calendar. | ✅ apps/student/src/routes/_auth/tuition/index.tsx:50-55 |
| FR-08 | Server chỉ trả hóa đơn của đúng học viên trong tổ chức phiên, sắp theo thời điểm tạo rồi theo mã (cũ nhất trước). | Mọi truy vấn where org + student. | ✅ apps/server/src/routes/student.ts:928-953, apps/server/src/routes/student.ts:942 |
| FR-09 | Server bổ sung cho từng dòng: mã ngắn `INV-` + 8 ký tự cuối mã hóa đơn (in hoa) và số tiền còn lại = tổng − đã thu, chặn không âm. | Mã ngắn sinh tại chỗ đọc, không lưu DB. | ✅ apps/server/src/routes/student.ts:946-951, apps/web/src/lib/format-invoice.ts:8-13 |
| FR-10 | Danh sách chia 2 nhóm: khoản đã xong hiện gọn (loại + số tiền + nhãn "Đã thanh toán"); khoản chưa đủ hiện loại, hạn đóng, và "Đã nhận X / Y" hoặc "Tổng Y". | Loại rỗng hiển thị "Học phí"; không có hạn → "Chưa có hạn đóng". | ✅ apps/student/src/components/overview/tuition-list.tsx:83-123 |
| FR-11 | Khoản coi là đã xong khi trạng thái "paid" HOẶC số tiền còn lại ≤ 0 — bắt cả hóa đơn thu tay có trạng thái paid nhưng số đã thu để 0. | Quy tắc client lấy theo comment service. | ✅ apps/student/src/components/overview/tuition-list.tsx:10-14 |
| FR-12 | Đầu danh sách có 2 ô tổng "Đã đóng" và "Còn lại": Đã đóng = tổng phần đã nhận của từng khoản (khoản đã xong tính trọn); Còn lại = tổng số còn phải thu của khoản chưa xong; ô Còn lại luôn kiểu nổi bật. | Danh sách rỗng → component tự ẩn. | ✅ apps/student/src/components/overview/tuition-list.tsx:16-22, apps/student/src/components/overview/tuition-list.tsx:63-80 |
| FR-13 | Khoản chưa xong dẫn sang trang chi tiết `/tuition/$invoiceId` (khoản đã xong vẫn bấm được — cùng dẫn sang chi tiết, chỉ khác nội dung hàng). | Link bọc toàn bộ hàng (cả khoản đã xong). | ✅ apps/student/src/components/overview/tuition-list.tsx:83-86, apps/student/src/components/overview/tuition-list.tsx:102-123 |
| FR-14 | Trang chi tiết tải hướng dẫn thanh toán qua khóa cache gồm mã hóa đơn + bộ đếm làm mới, KHÔNG tự thử lại khi lỗi. | Bộ đếm làm mới tăng khi poll — xem FR-26. | ✅ apps/student/src/routes/_auth/tuition/$invoiceId.tsx:22-29 |
| FR-15 | Chi tiết: đang tải → "Đang tải…"; lỗi hoặc không mở được → "Không mở được phiếu học phí này." | retry=false nên lỗi hiện ngay. | ✅ apps/student/src/routes/_auth/tuition/$invoiceId.tsx:44-58 |
| FR-16 | Header chi tiết: link quay về "← Học phí", tên học viên, mã hóa đơn + tổng tiền định dạng vi-VN, và 2 ô "Đã đóng" / "Còn lại". | Tổng tiền = số tiền hóa đơn định dạng nhóm chữ số vi-VN. | ✅ apps/student/src/routes/_auth/tuition/$invoiceId.tsx:63-97 |
| FR-17 | Chi tiết server: hóa đơn không tồn tại, không thuộc học viên/tổ chức phiên, ; mã vẫn thiếu sau 3 lần tự cấp thì luồng vẫn trả 200 với nội dung chuyển khoản rỗng (không có nhánh 404 cho mã thiếu) (đồng nhất, không lộ tồn tại). | 3 nhánh trả cùng một thân lỗi. | ✅ apps/server/src/routes/student.ts:957-976, apps/server/src/invoice-payment.test.ts:170-181 |
| FR-18 | Hóa đơn cũ thiếu mã chuyển khoản / token được tự bổ sung ngay tại lần đọc đầu (lazy backfill); ghi cập nhật có điều kiện để hai luồng đọc song song không ghi đè nhau; trùng mã thì sinh lại, tối đa 3 lần thử. | Backfill chỉ đắp trường còn thiếu, không đổi trường đã có. | ✅ apps/server/src/lib/payment-instructions.ts:21-55 |
| FR-19 | Hướng dẫn thanh toán trả kèm cờ cho-biết-còn-phải-thu (trường hợp đồng — xem truy vết): đúng khi còn tiền phải thu; kèm nguyên nhân "PAID" khi đã tất toán, "NO_BANK_LINK" khi tổ chức chưa có liên kết tài khoản nhận hợp lệ. | Đã tất toán = còn lại ≤ 0 HOẶC trạng thái paid — bao cả thu tay. | ✅ apps/server/src/lib/payment-instructions.ts:62-95 |
| FR-20 | QR luôn dựng từ tài khoản liên kết HIỆN TẠI của tổ chức và số tiền còn lại HIỆN TẠI — không lưu snapshot QR/nội dung vào hóa đơn. | Mỗi lần đọc dựng mới từ link + số nợ hiện thời. | ✅ apps/server/src/lib/payment-instructions.ts:57-61, apps/server/src/lib/payment-instructions.ts:96-115 |
| FR-21 | Nội dung chuyển khoản = mã thanh toán của hóa đơn; riêng ngân hàng VietinBank (bin 970415) thêm tiền tố "SEVQR" vào nội dung. | | ✅ packages/api/src/lib/vietqr.ts:5-13 |
| FR-22 | Ảnh QR dựng qua dịch vụ vietqr.app với tham số: số tài khoản, ngân hàng (bin), số tiền (làm tròn xuống), nội dung, khuôn "compact". | URL trả về dạng ảnh tĩnh. | ✅ packages/api/src/lib/vietqr.ts:16-29 |
| FR-23 | Panel QR dùng chung có 4 trạng thái hiển thị: đã thanh toán đủ ("Đã thanh toán đủ"), chưa liên kết ("Giáo viên chưa thiết lập nhận chuyển khoản"), đóng một phần ("Đã nhận X / Y"), còn đủ phải thu. | Trạng thái suy từ payable + reason + còn lại < tổng. | ✅ packages/ui/src/components/payments/payment-qr-panel.tsx:33-49, packages/ui/src/components/payments/payment-qr-panel.tsx:83-89 |
| FR-24 | Khi còn phải thu và có liên kết: panel hiện ảnh QR + 5 hàng thông tin sao chép từng trường — Ngân hàng, Số tài khoản, Chủ tài khoản, Số tiền (còn lại), Nội dung; nút "Sao chép" đổi thành "Đã sao chép" kèm vùng aria-live "Giữ nguyên nội dung chuyển khoản để hệ thống tự xác nhận". | Mỗi hàng copy độc lập theo nhãn. | ✅ packages/ui/src/components/payments/payment-qr-panel.tsx:91-108, packages/ui/src/components/payments/payment-qr-panel.tsx:143-178 |
| FR-25 | Ảnh QR đặt trên nền trắng cố định (không theo giao diện tối/sáng); không dựng được ảnh → chữ "Không tạo được ảnh QR". | Nền trắng là màu cố ý ngoài token. | ✅ packages/ui/src/components/payments/payment-qr-panel.tsx:130-141 |
| FR-26 | Trang chi tiết tự hỏi lại mỗi 5 giây: chỉ khi còn phải thu, chỉ khi tab đang hiển thị, và dừng hẳn sau 15 phút kể từ lúc mở trang. | Cùng quy tắc với trang /pay công khai; hằng số nhân bản ở portal và web — OQ-03. | ✅ apps/student/src/routes/_auth/tuition/$invoiceId.tsx:14-17, apps/student/src/routes/_auth/tuition/$invoiceId.tsx:31-39, apps/student/src/lib/repos/payments-portal.ts:1-4, apps/web/src/lib/repos/payments.ts:13-16 |
| FR-27 | Phân hệ B — hồ sơ học viên có tab "Học phí" đặt giữa "Lịch sử buổi" và "Bài tập". | Tab thuộc trang hồ sơ phía giáo viên. | ✅ apps/web/src/routes/_auth/students/$studentId.tsx:227-234 |
| FR-28 | Tab hiển thị 3 thẻ "Tổng học phí (VND)" / "Đã đóng (VND)" / "Còn lại (VND)"; không có lớp nào được tính → cả 3 thẻ hiện "—"; thẻ Còn lại bật kiểu nổi bật khi còn nợ. | khung 3 thẻ có dấu dữ liệu ổn định cho e2e (xem truy vết). | ✅ apps/web/src/components/tuition/student-tuition-summary.tsx:59-81 |
| FR-29 | Chỉ lớp có enrollment trạng thái "active" VÀ đã thiết lập học phí được cộng vào tổng; đóng thừa không bù sang lớp khác; tiền đã thu từ hóa đơn không gắn lớp tách thành chỉ số riêng "đã thu ngoài lớp", không cộng vào cột lớp nào. | Trạng thái lạ của enrollment coi như chưa kích hoạt. | ✅ apps/web/src/lib/tuition-from-kernel.ts:329-399, apps/web/src/lib/tuition-from-kernel.test.ts:707-1014 |
| FR-30 | Tiền đã nhận của một hóa đơn: trạng thái "paid" tính trọn tổng hóa đơn (kể cả khi sổ cái chưa kịp phản ánh — thu tay); trạng thái khác tính min(đã thu, tổng) chặn tràn số. | Cùng hàm nguồn với thẻ KPI doanh thu giáo viên. | ✅ apps/web/src/lib/tuition-from-kernel.ts:28-33, apps/web/src/lib/tuition-from-kernel.test.ts:452-475 |
| FR-31 | Bảng theo lớp 4 cột Lớp / Học phí / Đã đóng / Còn lại giải thích từng con số của thẻ: ô Còn lại lần lượt — chưa thiết lập phí → "—"; chưa kích hoạt → "Chưa kích hoạt — chưa tính"; đóng thừa → "Dư Xđ"; đóng đủ → nhãn "Đã đóng đủ"; còn thiếu → số tiền. | Ô Lớp là link trang lớp; tiền luôn font mono. | ✅ apps/web/src/components/tuition/student-tuition-summary.tsx:14-51, apps/web/src/components/tuition/student-tuition-summary.tsx:99-113 |
| FR-32 | Lớp chưa thiết lập học phí hiển thị "Chưa thiết lập" ở ô Học phí nhưng vẫn thấy tiền đã thu; enrollment chưa active (kể cả trạng thái lạ) gắn nhãn "Đã mời" cạnh tên lớp. | Nhãn hiển thị, không chặn đọc tiền. | ✅ apps/web/src/components/tuition/student-tuition-summary.tsx:24-30, apps/web/src/components/tuition/student-tuition-summary.tsx:32-51 |
| FR-33 | Ghi chú và trạng thái trống của tab: hóa đơn ngoài lớp có tiền → "Ngoài ra đã thu X từ hóa đơn không gắn lớp."; không có enrollment → "Chưa tham gia lớp học nào."; có lớp nhưng không lớp nào tính được → "Chưa lớp nào được thiết lập học phí. Thiết lập ở trang lớp."; kèm bảng hóa đơn 5 cột "Mã / Loại / Số tiền / Ngày / Trạng thái", bấm dòng mở trang chi tiết hóa đơn phía giáo viên (cùng ứng dụng web — cross-ref tuition-invoicing), nhãn Trạng thái suy thêm "Quá hạn" khi hạn đóng < hôm nay (giờ Việt Nam); hóa đơn đã nhận một phần nhưng chưa paid hiển thị "Thu một phần" + "còn X" (đỏ khi quá hạn). | Mã hiển thị = mã ngắn INV; click/Enter trên dòng (#345). | ✅ apps/web/src/components/tuition/student-tuition-summary.tsx:82-98, apps/web/src/routes/_auth/students/$studentId.tsx:326-365, apps/web/src/lib/tuition-from-kernel.ts:194-205 |

## Mục 4 — Yêu cầu phi chức năng (NFR)

| NFR | Yêu cầu | Truy vết |
|---|---|---|
| NFR-01 | Poll tiết kiệm D1: không gửi request khi tab ẩn (interval vẫn chạy nhưng bỏ lượt hỏi). | ✅ apps/student/src/routes/_auth/tuition/$invoiceId.tsx:33-37 |
| NFR-02 | Poll có hạn: dừng hẳn sau 15 phút — liên kết chia sẻ rộng không giữ truy vấn mãi. | ✅ apps/student/src/lib/repos/payments-portal.ts:1-4, apps/web/src/routes/pay.$token.tsx:18 |
| NFR-03 | Cache client: danh sách hóa đơn stale 30 giây; mặc định query stale 60 giây + ưu tiên dữ liệu offline. | ✅ apps/student/src/lib/repos/student.ts:844-850, apps/student/src/lib/query-client.ts:40-50 |
| NFR-04 | 401 toàn cục: tự đăng xuất rồi về `/login?returnUrl=<trang hiện tại>`. | ✅ apps/student/src/lib/query-client.ts:30-39 |
| NFR-05 | Không lộ tồn tại: hóa đơn của tổ chức khác trả 404 indistinguishable so với hóa đơn không tồn tại. | ✅ apps/server/src/routes/student.ts:971-975, apps/server/src/invoice-payment.test.ts:170-181 |
| NFR-06 | Token trang thanh toán công khai 128-bit ngẫu nhiên crypto; portal học viên KHÔNG dùng token — định danh qua phiên + tổ chức. | ✅ packages/api/src/lib/payment-code.ts:36-43, packages/db/src/schema/invoice.ts:19-25, apps/server/src/routes/student.ts:957-976 |
| NFR-07 | Mã chuyển khoản + token có unique DB (index riêng cho cột nullable để nhiều dòng NULL coi như khác nhau); trùng mã thì sinh lại khi backfill. | ✅ packages/db/src/schema/invoice.ts:54-59, apps/server/src/lib/payment-instructions.ts:30-49 |
| NFR-08 | Khả dụng: vùng aria-live báo trạng thái sao chép; nhãn nút copy là chữ thật (không chỉ icon). | ✅ packages/ui/src/components/payments/payment-qr-panel.tsx:165-177 |
| NFR-09 | QR luôn quét được: nền trắng cố định bất kể giao diện tối. | ✅ packages/ui/src/components/payments/payment-qr-panel.tsx:130-137 |
| NFR-10 | Trình bày: e2e portal đo không tràn ngang ở 3 viewport (1440/768/375) tại trang Tổng quan; panel QR dùng chung một nguồn chữ cho cả 3 bề mặt (portal, /pay, modal giáo viên). | ✅ apps/e2e/specs/student-class-detail.spec.ts:327-346, apps/web/src/components/modals/invoice-payment-modal.tsx:3, apps/web/src/routes/pay.$token.tsx:4 |

## Mục 5 — Quy tắc nghiệp vụ (BR)

- **BR-01.** Học viên chỉ thấy hóa đơn của chính mình trong tổ chức phiên hiện hành; hai
  điều kiện luôn đi cùng nhau trong truy vấn. ✅ apps/server/src/routes/student.ts:928-953
- **BR-02.** Tổ chức phiên chọn qua header tùy chọn tên tổ chức học viên (truy vết), dự phòng tham số ?org trên URL (cho thẻ
  media/tải không gửi được header); giá trị chỉ khớp hồ sơ học viên của chính phiên đăng
  nhập — không tin org từ client một cách vô điều kiện. ✅
  apps/server/src/routes/student.ts:179-189, apps/student/src/lib/repos/student.ts:45-67
- **BR-03.** Hồ sơ học viên tự cấp theo email đã xác thực khi lần đầu vào portal; nếu sau
  cấp vẫn không có hồ sơ → 403 STUDENT_NOT_LINKED. ✅ apps/server/src/routes/student.ts:141-171
- **BR-04.** "Đã xong" bao cả thu tay: trạng thái `paid` đủ để coi tất toán dù số đã thu
  còn 0 — áp dụng ở cả portal (ẩn khỏi "Còn lại", hiện nhãn "Đã thanh toán") lẫn service
  (reason "PAID", không cho chuyển khoản). ✅
  apps/student/src/components/overview/tuition-list.tsx:10-14, apps/server/src/lib/payment-instructions.ts:78-82
- **BR-05.** Số tiền phải thu không bao giờ âm — chặn clamp ở cả danh sách lẫn hướng dẫn
  thanh toán. ✅ apps/server/src/routes/student.ts:946-951, apps/server/src/lib/payment-instructions.ts:67
- **BR-06.** Số đã thu của hóa đơn là số dư tính lại từ sổ giao dịch (tổng các dòng khớp), không
  cộng dồn trực tiếp; phía hiển thị chỉ đọc con số này. ✅
  packages/db/src/schema/payment-transaction.ts:5-22, packages/db/src/schema/invoice.ts:19-25
- **BR-07.** Học phí là cấu hình của từng lớp (mức mỗi học viên cho toàn khóa), không phải
  tổng học phí cả lớp, và không suy ra từ hóa đơn (persist-vs-derive carve-out). ✅
  packages/db/src/schema/class.ts:33-36
- **BR-08.** Chỉ enrollment "active" được tính vào tổng học phí; "invited" và trạng thái lạ
  hiển thị trong bảng nhưng không tính tiền, kèm nhãn "Đã mời". ✅
  apps/web/src/lib/tuition-from-kernel.ts:329-399, apps/web/src/components/tuition/student-tuition-summary.test.tsx:159-205
- **BR-09.** Hóa đơn không trỏ vào enrollment nào (không gắn lớp) vẫn được ghi nhận đã thu
  nhưng tách khỏi mọi cột lớp — dòng "Ngoài ra đã thu…". ✅
  apps/web/src/lib/tuition-from-kernel.ts:329-399, apps/web/src/components/tuition/student-tuition-summary.tsx:82-87
- **BR-10.** Đóng thừa một lớp không bù sang lớp khác; phần dư hiển thị "Dư Xđ" ngay trên
  lớp đó. ✅ apps/web/src/components/tuition/student-tuition-summary.tsx:14-22, apps/web/src/components/tuition/student-tuition-summary.test.tsx:90-128
- **BR-11.** "Quá hạn" chỉ là nhãn hiển thị suy ra từ hạn đóng so với hôm nay (giờ Việt
  Nam); DB chỉ có unpaid/paid; trạng thái lạ hiển thị như "Chưa thu" (riêng status "overdue" legacy được tôn trọng thành "Quá hạn" — không có writer
  trạng thái quá hạn. ✅ apps/web/src/lib/tuition-from-kernel.ts:194-205, packages/db/src/schema/invoice.ts:37

## Mục 6 — Ma trận lỗi

Mã lỗi giữ nguyên giá trị hợp đồng ("từ vựng hợp đồng"). Wording UI trích nguyên văn từ component.

| Mã / tình huống | HTTP | Điều kiện | Wording / hiển thị | Truy vết |
|---|---|---|---|---|
| E-01 — chưa đăng nhập | 401 | Thiếu session trên route học viên (mọi route /invoices) | (API thuần, "unauthorized"/UNAUTHORIZED) | ✅ apps/server/src/routes/student.ts:127-129, apps/server/src/invoice-payment.test.ts:187-194 |
| E-02 — `STUDENT_EMAIL_UNVERIFIED` | 403 | Email phiên chưa xác thực | "Email chưa được xác thực" + "Gửi lại email" / "Đã gửi lại — kiểm tra hộp thư" / "Tôi đã xác thực — Kiểm tra lại" | ✅ apps/server/src/routes/student.ts:130-137, apps/student/src/components/overview/student-error-view.tsx:109-113, apps/student/src/components/overview/student-error-view.tsx:191-203 |
| E-03 — `STUDENT_NOT_LINKED` | 403 | Sau khi tự cấp vẫn không có hồ sơ học viên cho email phiên | "Tài khoản chưa được liên kết" + hướng dẫn bấm Chuông thông báo để nhận lời mời lớp | ✅ apps/server/src/routes/student.ts:165-171, apps/student/src/components/overview/student-error-view.tsx:105-107 |
| E-04 — `STUDENT_AMBIGUOUS` | 403 | (khai báo hợp đồng) nhiều hồ sơ trùng email | "Thông tin tài khoản chưa rõ ràng" | ✅ apps/student/src/components/overview/student-error-view.tsx:115-119 + 🟡 không có nhánh server nào trả mã này — OQ-04 |
| E-05 — giáo viên vào cổng học viên | — | Mã tài khoản `TEACHER_ON_STUDENT_PORTAL` | "Đây là tài khoản giáo viên" + "Chuyển sang cổng giáo viên" / "Đăng xuất" | ✅ apps/student/src/components/overview/student-error-view.tsx:99-104, apps/student/src/components/overview/student-error-view.tsx:148 |
| E-06 — onboarding chưa xong | — | `onboardingCompletedAt` null | Tự chuyển về trang onboarding | ✅ apps/student/src/components/layout/student-page-gate.tsx:42-44 |
| E-07 — lỗi tải danh sách | — | fetch /invoices thất bại | View lỗi theo mã; lỗi mạng → view mặc định "Không thể truy cập cổng học viên" | ✅ apps/student/src/routes/_auth/tuition/index.tsx:26-35, apps/student/src/components/overview/student-error-view.tsx:82-84 |
| E-08 — hóa đơn không mở được | 404 "invoice not found" | Không tồn tại / không thuộc quyền (hai điều kiện 404 duy nhất); mã thiếu sau backfill không dẫn tới 404 | "Không mở được phiếu học phí này." | ✅ apps/server/src/routes/student.ts:971-975, apps/student/src/routes/_auth/tuition/$invoiceId.tsx:51-58 |
| E-09 — `NO_BANK_LINK` | — | reason trả kèm khi tổ chức chưa liên kết tài khoản nhận | "Giáo viên chưa thiết lập nhận chuyển khoản" | ✅ apps/server/src/lib/payment-instructions.ts:84-95, packages/ui/src/components/payments/payment-qr-panel.tsx:38, apps/server/src/invoice-payment.test.ts:219-231 |
| E-10 — `PAID` | — | reason trả kèm khi đã tất toán | "Đã thanh toán đủ" | ✅ apps/server/src/lib/payment-instructions.ts:81-82, packages/ui/src/components/payments/payment-qr-panel.tsx:36 |
| E-11 — lỗi ảnh QR | — | qrUrl rỗng hoặc ảnh lỗi tải | "Không tạo được ảnh QR" | ✅ packages/ui/src/components/payments/payment-qr-panel.tsx:138-141 |
| E-12 — học viên không tồn tại (phân hệ B) | — | Vào hồ sơ sai mã | "Không tìm thấy học viên" + "← Về danh sách học viên" | ✅ apps/web/src/routes/_auth/students/$studentId.tsx:44-57 |
| E-13 — trùng mã khi backfill | — | unique payment_code đụng nhau | Bắt lỗi im lặng, sinh lại; hết 3 lần trả row hiện trạng — luồng vẫn chạy tiếp với nội dung chuyển khoản rỗng (không 404) | ✅ apps/server/src/lib/payment-instructions.ts:30-49 |

## Mục 7 — Thước đo thành công

| SM | Thước đo | Bằng chứng |
|---|---|---|
| SM-01 | Kịch bản 2 lớp (10tr + 6tr), thu 2tr lớp A → 3 thẻ 16tr/2tr/14tr, từng dòng lớp đúng; số giữ nguyên sau reload; bấm dòng hóa đơn "Đã thu" mở đúng trang chi tiết hóa đơn phía giáo viên (cùng ứng dụng web). | ✅ apps/e2e/specs/student-tuition-summary.spec.ts:89-164 |
| SM-02 | Tổng hợp khớp ảnh chụp hồi quy ở 3 viewport. | ✅ apps/e2e/specs/student-tuition-summary.spec.ts:166-218 |
| SM-03 | Đầu-cuối: giáo viên tạo hóa đơn + liên kết tài khoản → học viên đăng ký thật, xác thực email, mở mục Học phí → thấy QR thật (ảnh vietqr.app). | ✅ apps/e2e/specs/tuition-bank-transfer.spec.ts:222-272 |
| SM-04 | Hóa đơn cũ lần đọc đầu được cấp mã ổn định, các lần đọc sau giữ nguyên mã. | ✅ apps/server/src/invoice-payment.test.ts:142-168 |
| SM-05 | Endpoint hóa đơn học viên chặn anonymous với 401. | ✅ apps/server/src/invoice-payment.test.ts:187-194 |
| SM-06 | Vào /tuition khi chưa có hóa đơn: tiêu đề "Học phí của tôi" + "Chưa có hóa đơn học phí". Riêng kiểm không tràn ngang 3 viewport của e2e chạy ở trang Tổng quan (không phải /tuition). | ✅ apps/e2e/specs/student-class-detail.spec.ts:297-307, apps/e2e/specs/student-class-detail.spec.ts:327-346 |

## Mục 8 — Thực thể nghiệp vụ

Chi tiết đủ ở ERD; ở đây chỉ vai trò nghiệp vụ.

| Thực thể | Vai trò nghiệp vụ | Truy vết |
|---|---|---|
| Hóa đơn học phí | Khoản thu per học viên, scoped theo tổ chức; trạng thái bền unpaid/paid; hạn + ghi chú + loại; cột thanh toán bổ sung khi đọc | ✅ packages/db/src/schema/invoice.ts:26-52 |
| Liên kết ngân hàng của tổ chức | Một tài khoản nhận duy nhất mỗi tổ chức; vòng đời none → linked → inactive/unlinked; nguồn dữ liệu QR | ✅ packages/db/src/schema/org-bank-link.ts:7-18 |
| Sổ giao dịch | Mỗi dòng tiền về (ngân hàng hoặc thu tay); nguồn tính lại paid_amount; khóa idempotency theo giao dịch gốc | ✅ packages/db/src/schema/payment-transaction.ts:5-22 |
| Lớp | Nơi cấu hình học phí mỗi học viên (tuitionFee, null = chưa thiết lập) | ✅ packages/db/src/schema/class.ts:33-36 |
| Enrollment | Thành viên lớp với trạng thái invited/active — điều kiện tính tiền phân hệ B | ✅ packages/db/src/schema/enrollment.ts:13-16 |
| Học viên | Hồ sơ theo tổ chức, tự cấp theo email đã xác thực | ✅ packages/db/src/schema/student.ts:1-71 |
| Tổ chức | Ranh giới dữ liệu mọi truy vấn | ✅ packages/db/src/schema/organization.ts:1-10 |

## Mục 9 — Luồng (danh mục)

Đặc tả đủ (sequence + activity) ở srs/student-tuition-reverse-flows.md.

| F-id | Luồng | Một dòng |
|---|---|---|
| F1 | Vào mục Học phí — danh sách hóa đơn | Gate học viên → tải danh sách → 2 nhóm + 2 tổng (hoặc trang trống) |
| F2 | Xem chi tiết phiếu + QR | Backfill mã → dựng hướng dẫn từ link hiện tại → panel 4 trạng thái |
| F3 | Tự cập nhật khi tiền về (poll) | 5 giây / tab hiển thị / cap 15 phút → đổi trạng thái panel |
| F4 | Vào mục học phí từ thông báo | Chuông → linkPath /tuition → về F1 |
| F5 | Xem tổng hợp học phí theo lớp (GV) | Tab hồ sơ → kernel tính 3 thẻ + bảng theo lớp |
| F6 | Mở hóa đơn từ hồ sơ học viên (GV) | Bấm dòng → navigate trang chi tiết hóa đơn phía giáo viên trong cùng app web (cross-ref tuition-invoicing) |

## Mục 10 — Màn hình

- Thanh điều hướng cổng học viên — mục "Học phí" với trạng thái active theo prefix (S20).
- `/tuition` — danh sách: header kicker + h1, 2 ô tổng, 2 nhóm khoản, khối trống (S14, S16, S17).
- `/tuition/$invoiceId` — chi tiết: link về, tên, mã + tổng, 2 ô Đã đóng/Còn lại, panel QR (S15, S25).
- View lỗi cổng học viên — 4 lý do hiển thị + nút phục hồi tương ứng (S18).
- Trang onboarding — đích tự chuyển khi chưa hoàn tất (S19).
- Tab "Học phí" trên hồ sơ học viên (web) — 3 thẻ KPI + bảng theo lớp + bảng hóa đơn (S26, S27, S28).
- Trang `/pay/<token>` công khai — cùng panel + quy tắc poll, có thêm nút làm mới thủ công (S32 — cross-ref, không đặc tả).

## Mục 11 — Ràng buộc

- Không có catalog i18n: mọi wording là literal tại component (R2). ✅ negative-search trong reverse-gaps.md
- API học phí học viên chỉ-đọc: không có POST hóa đơn nào trên kernel học viên — học viên không có hành động ghi nào với hóa đơn. ✅ apps/server/src/routes/student.ts (toàn bộ router.post: invitations/inbox/onboarding/enrollments/attempts — không có invoices)
- Bề mặt QR dùng chung một component cho portal học viên, /pay công khai, modal giáo viên — đổi wording ảnh hưởng cả 3. ✅ packages/ui/src/components/payments/payment-qr-panel.tsx:33, apps/web/src/components/modals/invoice-payment-modal.tsx:244
- Hằng số poll nhân bản ở portal và web (không chia sẻ module) — lệch một nơi là lệch quy tắc. 🔵 apps/student/src/lib/repos/payments-portal.ts:1-4, apps/web/src/lib/repos/payments.ts:13-16 (OQ-03)
- `invoice.enrollment_id` plain-text không FK — hồ sơ tài chính sống sót khi enrollment bị xóa; tính hợp lệ kiểm ở thời điểm ghi (phía tuition-invoicing). ✅ packages/db/src/schema/invoice.ts:11-25
- `payment_transaction.invoice_id` cũng không FK — cùng tinh thần giữ sổ. ✅ packages/db/src/schema/payment-transaction.ts:5-22
- QR không lưu snapshot: mọi lần đọc dựng lại từ link ngân hàng hiện thời + số nợ hiện thời. ✅ apps/server/src/lib/payment-instructions.ts:57-61
- Ghi chú release train trong contracts.ts thuộc nhóm schema vocab (.strict(), #359/#361): apps/server và apps/student phải lên cùng phiên bản — KHÔNG phải ràng buộc của hợp đồng học phí. ✅ packages/api/src/contracts.ts:3089-3094
- Ngày logic "hôm nay" cho nhãn Quá hạn theo múi giờ Việt Nam. ✅ apps/web/src/routes/_auth/students/$studentId.tsx:7, apps/web/src/lib/tuition-from-kernel.ts:194-205
- Deploy tách bề mặt: phân hệ B nằm ở web (giáo viên) nhưng chia sẻ kernel tính tiền với trang Doanh thu — cùng hàm nguồn, khác cách gom. 🔵 apps/web/src/lib/tuition-from-kernel.ts:28-48, apps/web/src/lib/tuition-from-kernel.ts:329-399

## Mục 12 — Câu hỏi mở (OQ)

| OQ | Câu hỏi | Bối cảnh | Ảnh hưởng nếu sai |
|---|---|---|---|
| OQ-01 | Phân hệ B (tab Học phí trên hồ sơ + e2e #347) thuộc feature student-tuition hay một feature giáo viên riêng? | reverse-plan.json gán e2e student-tuition-summary cho feature này; docs/_reverse/tuition-invoicing không phủ; component sống ở apps/web | Sai phạm vi: trùng/thiếu đặc tả khối tổng hợp |
| OQ-02 | Học viên không có hành động ghi nào với hóa đơn (không "tôi đã chuyển khoản", không yêu cầu hóa đơn giấy) — chủ ý sản phẩm hay chưa làm? | R3: không có POST hóa đơn trên API học viên | Thiếu chức năng học viên kỳ vọng |
| OQ-03 | Hằng số poll 5s/15m nhân bản ở apps/student (payments-portal.ts) và apps/web (repos/payments.ts) — cố ý tách module hay cần gom chung? | 2 bản sao giống nhau, không import chéo | Lệch quy tắc poll giữa portal và /pay khi sửa một nơi |
| OQ-04 | `STUDENT_AMBIGUOUS` không có nhánh server nào trả (chỉ khai báo + view hiển thị) — mã còn sống không? Kịch bản nào sinh nhiều hồ sơ trùng email? | negative-search: chỉ contracts.ts:1969 + student-error-view.tsx:115 | Ma trận lỗi thừa; dead code |
| OQ-05 | "Quá hạn" chỉ hiển thị (suy diễn), DB không lưu — có kế hoạch trạng thái quá hạn thật (nhắc nợ, báo cáo nợ)? | BR-11; schema chỉ unpaid/paid | Thiếu dữ liệu cho báo cáo/nhắc nợ sau này |
| OQ-06 | Trang chi tiết portal không hiển thị `note` và `due` của hóa đơn dù hợp đồng trả cả hai — đơn giản hóa cố ý hay thiếu? | PaymentInstructions có note/due; $invoiceId.tsx chỉ render code/amount/paid/amountDue | Thông tin học viên cần (hạn đóng, ghi chú) chỉ thấy ở danh sách |
| OQ-07 | Danh sách portal không có nút làm mới thủ công và poll chỉ chạy ở trang chi tiết — học viên đứng ở danh sách bao lâu thì thấy tiền về? | staleTime 30s + không poll ở index | Kỳ vọng "về tiền là thấy" không đạt ở danh sách |
| OQ-08 | Hóa đơn thu tay (status paid, paidAmount 0): trang chi tiết hiện "Đã đóng 0đ / Còn lại <tổng>" nhưng panel báo "Đã thanh toán đủ" — chênh lệch hiển thị này có được chấp nhận không? | BR-04; payment-instructions.ts:78-82 (comment "paidAmount may stay 0"); $invoiceId.tsx:80-97 | Học viên hiểu nhầm còn nợ; hỏi lại trung tâm |
| OQ-09 | Danh sách sắp cũ nhất trước (orderBy createdAt asc) — học viên nhiều hóa đơn thấy khoản mới nhất dưới cùng; có chủ ý không? | student.ts:941 | Khoản mới nhất/quan trọng nhất bị khuất |
| OQ-10 | QR dựng theo số nợ hiện thời: học viên chụp QR cũ rồi chuyển khoản sau khi có giao dịch mới — đối soát theo nội dung (mã) vẫn ghép đúng hóa đơn nhưng số tiền lệch; quy tắc chấp nhận sai lệch thế nào? | FR-20; sổ giao dịch khớp theo payment_code (cross-ref tuition-invoicing) | Chênh tiền một phần/thừa không có quy trình rõ cho học viên |
| OQ-11 | Portal không có dòng "Ngoài ra đã thu… từ hóa đơn không gắn lớp" như phân hệ B — học viên có cần tổng tương đương? | BR-09 chỉ hiển thị ở web GV | Học viên thấy danh sách từng khoản nhưng không có ngữ cảnh tổng ngoài lớp |
| OQ-12 | /pay công khai có nút làm mới thủ công sau cap 15 phút, portal chi tiết không có — chênh lệch có chủ ý? | apps/web/src/routes/pay.$token.tsx:18 vs $invoiceId.tsx:14-17 | Người dùng portal bị kẹt dữ liệu cũ nếu xem quá 15 phút |
