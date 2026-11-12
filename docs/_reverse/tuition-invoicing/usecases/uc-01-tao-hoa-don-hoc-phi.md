# UC-01 — Tạo hóa đơn học phí

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

**a. Mô tả**: Người tài chính phát hành một khoản phải thu cho một học viên đã ghi danh lớp, kèm hạn đóng và ghi chú; hệ thống sinh mã chuyển khoản và liên kết thanh toán công khai ngay lúc tạo.
- Actor chính: Người tài chính (giáo viên/chủ/quản trị viên).
- Actor phụ: Học viên mục tiêu (qua đăng ký); Nhật ký thông báo.

**b. Kích hoạt & điều kiện trước**: bấm "+ Tạo hóa đơn"/"+ Tạo khoản thu"; phiên hợp lệ; học viên đã ghi danh và đã chấp nhận tham gia lớp.

**c. Luồng chính**:
1. Chọn đăng ký (nhãn "học viên · lớp").
2. Nhập số tiền nguyên dương (tối đa 12 chữ số), hạn, ghi chú ≤500 ký tự.
3. Hệ thống kiểm từng trường; tất cả hợp lệ.
4. Gửi yêu cầu tạo; máy chủ xác nhận hạn hợp lệ, đăng ký tồn tại trong tổ chức và đang hoạt động.
5. Ghi hóa đơn trạng thái chưa thu, kèm mã chuyển khoản và token công khai.
6. Ghi sự kiện phát-hành-hóa-đơn vào nhật ký thông báo.
7. Danh sách nạp lại: dòng mới hiện "Còn phải thu" đủ số tiền; KPI tăng tương ứng.

**d. Luồng thay thế/ngoại lệ**:
- 3a. Thiếu số tiền / số không hợp lệ / thiếu học viên / hạn sai / ghi chú dài → lỗi dưới trường, **không gọi mạng** (e2e xác nhận 0 POST) ✅ [S6] apps/e2e/specs/create-invoice.spec.ts:182-217.
- 4a. Hạn không hợp lệ → 400 "invalid body" ✅ [S7] apps/server/src/routes/kernel.ts:3085-3087.
- 4b. Đăng ký lạ → 404 "enrollment not found"; chưa chấp nhận → 409 "Học viên chưa đồng ý tham gia lớp" ✅ [S7] apps/server/src/routes/kernel.ts:3063-3072.
- 4c. Chưa đăng nhập → 401; vai không quyền tài chính → 403 "finance-forbidden" ✅ [S29] apps/server/src/lib/require-finance-role.ts:10-26.
- 7a. Phản hồi không dứt khoát → toast "chưa chắc" và nạp lại để tự sửa ✅ [S34] apps/web/src/lib/kernel-outcome.ts:70-85.

**e. Hậu điều kiện**: 1 hóa đơn chưa thu tồn tại; phụ huynh có thể bắt đầu thanh toán ngay; việc tạo **không idempotent** — gửi lại tạo thêm dòng mới (nhất quán tiền lệ tạo tài liệu) ✅ [S7] apps/server/src/routes/kernel.ts:3042-3043.

**f. Quy tắc nghiệp vụ**: BR-13 (số tiền nguyên dương ≤12 chữ số), BR-16 (gắn chặt tổ chức qua đăng ký).

**g. Yêu cầu**: FR-01, FR-13; NFR-01.

**h. Truy vết**:
- Flow: F1. Error: E-001..E-003, E-007/E-008, E-017/E-018.
- Test: ✅ [S58] apps/web/src/components/modals/add-invoice-modal.test.tsx:62-138 (nhãn đăng ký; chặn ghi khi thiếu tiền; phiên mới sạch); ✅ [S6] apps/e2e/specs/create-invoice.spec.ts:126-248 (hợp lệ + KPI + hạn dd/mm; trống/âm không POST; picker loại trừ chưa kích hoạt).
- UI sources: [S22] apps/web/src/components/modals/add-invoice-modal.tsx:73-213; [S7] apps/server/src/routes/kernel.ts:3043-3111.
