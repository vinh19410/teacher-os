# UC-04 — Cập nhật trạng thái và ghi chú đăng ký

**a. Tên use case:** Cập nhật trạng thái và ghi chú nội bộ của một đăng ký.

**b. Mã UC / phạm vi:** UC-04 — ứng dụng web quản lý; hộp thoại chi tiết đăng ký.

**c. Tác nhân:** Giáo viên độc lập / chủ trung tâm / quản trị viên (vai trò tài chính).

**d. Điều kiện tiên quyết:** Đã đăng nhập, đủ quyền; đăng ký thuộc org của người dùng.

**e. Luồng chính:**
1. Mở hộp thoại chi tiết từ bảng danh sách.
2. Chọn trạng thái mới trong 4 lựa chọn; gõ/đổi ghi chú nội bộ (tối đa 1000 ký tự).
3. Bấm "Lưu thay đổi"; ứng dụng gửi cập nhật với đúng hai trường cho phép.
4. Máy chủ kiểm: phiên, vai trò, body, sự tồn tại trong org.
5. Máy chủ ghi trạng thái + ghi chú; nếu trạng thái khác cũ thì ghi mốc thời điểm đổi trạng thái; nếu giữ nguyên thì giữ mốc cũ.
6. Trả về dòng đã cập nhật; UI báo thành công, đóng hộp thoại, làm mới danh sách và các số đếm chip.

**f. Luồng thay thế / ngoại lệ:**
- f1. JSON hỏng hoặc body sai → 400 "invalid body" (kể cả JSON không phân tích được).
- f2. Thiếu quyền → 403 với mã lỗi riêng.
- f3. Đăng ký không tồn tại hoặc thuộc org khác → 404 chung, không lộ tồn tại; UI toast thông báo đăng ký không còn tồn tại và làm mới danh sách.
- f4. Lỗi khác → toast lỗi chung, hộp thoại giữ nguyên để thử lại.

**g. Hậu điều kiện:** Trạng thái và ghi chú mới được lưu; mốc đổi trạng thái phản ánh lần đổi gần nhất; danh sách và chip đếm được làm mới.

**h. Yêu cầu liên quan:** FR-L12, FR-L13; BR-L13, BR-L14, BR-L15, BR-L17; NFR-L04; Flow F4; OQ-L04 (không có ràng buộc chuyển tiếp).

Bằng chứng tổng: [S2] apps/server/src/routes/leads.ts:144-187; [S12] apps/web/src/routes/_auth/leads/index.tsx:180-208, 488-603; [S7] apps/server/src/routes/leads.test.ts:272-365.
