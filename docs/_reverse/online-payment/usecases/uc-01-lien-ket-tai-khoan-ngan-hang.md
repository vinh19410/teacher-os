---
type: reverse-usecase
feature: online-payment
uc: UC-01
status: draft
updated: 2026-11-12
---
# UC-01 — Liên kết / hủy / khôi phục tài khoản ngân hàng nhận tiền

| Mục | Nội dung |
|---|---|
| (a) Mô tả | Giáo viên kết nối tài khoản ngân hàng của tổ chức qua phiên hosted của hub để nhận học phí chuyển khoản; có thể hủy hoặc khôi phục sau này |
| (b) Actor chính | Giáo viên/chủ sở hữu/quản trị (vai trò tài chính). Phụ: hệ thống SePay Bank Hub (giao phiên, gửi sự kiện vòng đời) |
| (c) Tiền điều kiện | Đăng nhập với vai trò tài chính; tính năng được cấu hình đủ 5 biến môi trường hub; tổ chức chưa có tài khoản đang liên kết (khi liên kết mới) hoặc đang có (khi hủy/khôi phục) |
| (d) Hậu điều kiện | Trạng thái liên kết cập nhật theo sự kiện; số tài khoản hiển thị dạng che; khi liên kết lại, tài khoản cũ nằm trong danh sách đối soát |

**(e) Luồng chính**

1. Giáo viên mở panel nhận học phí qua chuyển khoản; hệ thống trả trạng thái hiện tại + số tài khoản che. — ✅ [S3] `apps/server/src/routes/bank-link.ts:119-150`
2. Giáo viên bấm liên kết; giao diện yêu cầu tạo phiên (mục đích: liên kết). — ✅ [S13] `apps/web/src/components/payments/bank-link-panel.tsx:44-99`
3. Máy chủ kiểm tra: đã có tài khoản → từ chối 409. — ✅ [S3] `apps/server/src/routes/bank-link.ts:172-187`
4. Máy chủ bảo đảm đại diện tồn tại trên hub (tạo nếu thiếu, đặt hạn mức thông báo không giới hạn). — ✅ [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:39-108`
5. Máy chủ tạo phiên liên kết và kiểm tra nguồn của link phiên trong danh sách tin cậy; không hợp lệ → 502. — ✅ [S3] `apps/server/src/routes/bank-link.ts:219-242`
6. Giao diện mở iframe phiên (CSP chỉ cho nguồn tin cậy); giáo viên nhập thông tin tài khoản tại hub. — ✅ [S13] `apps/web/src/components/modals/bank-hub-link-modal.tsx:163-169`, [S14] `apps/web/src/security-headers.ts:15`
7. Hub gửi sự kiện tài khoản về webhook; hệ thống so khóa, kiểm thời gian sự kiện, cập nhật trạng thái + lưu mã tài khoản. — ✅ [S1] `apps/server/src/routes/bank-hub-webhooks.ts:53-63`; [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:188-236`
8. Giao diện nhận tín hiệu đóng phiên hoặc poll 5 giay; khi đóng, đồng bộ lại trạng thái từ hub và hiển thị "Đã liên kết". — ✅ [S13] `apps/web/src/components/modals/bank-hub-link-modal.tsx:79-125`; [S3] `apps/server/src/routes/bank-link.ts:141-148,346-368`

**(f) Luồng thay thế/đặc biệt**

- f1: Hub chưa cấu hình → 503, panel hiển thị tính năng tắt. — ✅ [S3] `apps/server/src/routes/bank-link.ts:122-131`; [S12] `apps/web/src/lib/repos/bank-link.ts:31`
- f2: Đại diện chưa kịp tạo xong → 409 chờ thử lại. — ✅ [S3] `apps/server/src/routes/bank-link.ts:200-208`
- f3: Lỗi từ hub → 502 (429 giữ thời gian thử lại); chỉ mã ổn định xuống client. — ✅ [S3] `apps/server/src/routes/bank-link.ts:96-117`
- f4: Hủy liên kết: phiên mục đích unlink với mã tài khoản hiện có; sự kiện UNLINK đổi trạng thái thành "đã hủy". — ✅ [S3] `apps/server/src/routes/bank-link.ts:188-196`; [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:188-236`
- f5: Khôi phục: phiên mục đích reactivate từ trạng thái ngừng hoạt động. — ✅ [S8] `packages/api/src/contracts.ts:2984-2992`
- f6: Sự kiện cũ hơn thời điểm đã ghi bị bỏ qua để không quay ngược trạng thái. — ✅ [S5] `apps/server/src/lib/bank-hub/bank-link-service.ts:188-236`
- f7: Phiên hết hạn → thông báo "Phiên liên kết đã hết hạn. Bấm Thử lại.". — ✅ [S13] `apps/web/src/components/modals/bank-hub-link-modal.tsx:103-125`

**(g) Dữ liệu chính**

- Vào: mục đích phiên (liên kết/hủy/khôi phục); trạng thái hiện tại.
- Ra: URL phiên + hạn; trạng thái + tên ngân hàng + số tài khoản che + tên chủ tài khoản + thời điểm liên kết. — ✅ [S8] `packages/api/src/contracts.ts:2974-2992`

**(h) Truy vết test**

- E2E liên kết qua fake hub + fake trang phiên: `apps/e2e/specs/tuition-bank-transfer.spec.ts:151-174`; fake hub gửi sự kiện hoàn tất: `apps/e2e/src/fake-bank-hub.ts:1-120`. — ✅
- Test đơn vị route: `apps/server/src/bank-link.test.ts:226-431` (các nhánh 503/409/502/429, trạng thái). — ✅
- Test client hub (không log secret :605, phân loại context/sandbox :648-676): `apps/server/src/lib/bank-hub/bank-hub-client.test.ts:581-676`; làm mới token: :114,170. — ✅
