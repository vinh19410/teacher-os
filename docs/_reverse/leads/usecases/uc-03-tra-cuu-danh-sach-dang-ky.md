# UC-03 — Tra cứu danh sách đăng ký mới

**a. Tên use case:** Tra cứu danh sách đăng ký mới trên ứng dụng quản lý.

**b. Mã UC / phạm vi:** UC-03 — ứng dụng web quản lý; màn "Đăng ký mới".

**c. Tác nhân:** Giáo viên độc lập / chủ trung tâm / quản trị viên (vai trò tài chính).

**d. Điều kiện tiên quyết:** Đã đăng nhập; vai trò thuộc nhóm tài chính.

**e. Luồng chính:**
1. Người dùng mở màn từ menu "Đăng ký mới" (mục menu ẩn với vai trò thiếu quyền).
2. Ứng dụng tải danh sách: mới nhất trước, 20 dòng/trang, kèm tổng số và số đếm theo từng trạng thái.
3. Mỗi dòng hiển thị: thời gian gửi, họ tên (kèm "N lần gửi" nếu gửi lại), số điện thoại dạng liên kết Zalo, khoá, hình thức, lịch mong muốn, nhãn trạng thái.
4. Người dùng gõ từ khoá (tên hoặc số điện thoại) — ứng dụng chờ 300ms rồi đẩy bộ lọc lên URL và tải lại; về trang 1.
5. Người dùng bấm chip trạng thái để lọc; số đếm chip vẫn tính trên bộ lọc từ khoá (không thu hẹp theo trạng thái đang chọn).
6. Phân trang server-side qua nút trang trước/sau; bộ lọc sống trên URL nên tải lại/chia sẻ giữ nguyên.
7. Bấm dòng mở hộp thoại chi tiết toàn bộ thông tin (kết quả test, ghi chú, nguồn, số lần gửi).

**f. Luồng thay thế / ngoại lệ:**
- f1. Vai trò thiếu quyền → màn tự ẩn, không gọi API; nếu vào thẳng bằng URL thì bị chặn điều hướng về trang chính kèm toast một lần.
- f2. Phiên hết hạn → điều hướng đăng nhập lại.
- f3. Query sai (trạng thái lạ) → 400; UI hiển thị thông báo không tải được.
- f4. Chưa có đăng ký nào → màn trống với hướng dẫn; có bộ lọc mà không có kết quả → thông báo riêng.

**g. Hậu điều kiện:** Người dùng thấy danh sách đúng org của mình, không bao giờ thấy đăng ký của org khác.

**h. Yêu cầu liên quan:** FR-L11, FR-L13, FR-L14; BR-L13, BR-L14, BR-L15, BR-L17; NFR-L04; Flow F3.

Bằng chứng tổng: [S2] apps/server/src/routes/leads.ts:64-142; [S12] apps/web/src/routes/_auth/leads/index.tsx:147-279, 286-465; [S7] apps/server/src/routes/leads.test.ts:138-269; [S13] apps/web/src/routes/_auth/leads/index.test.tsx:132-271; [S15] apps/web/src/components/layout/sidebar.tsx:128-146.
