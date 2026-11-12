# UC-01 — Xem tổng quan ngày dạy

| Trường | Nội dung |
|--------|----------|
| **a. Mô tả** | Giáo viên mở trang /dashboard để có bức tranh ngày làm việc: lời chào theo giờ VN, 4 KPI (buổi hôm nay, học viên, bài chưa có điểm, còn phải thu), lịch hôm nay + lịch sắp tới, bảng học viên cần kiểm tra. |
| **b. Actor** | Chính: Giáo viên (membership teacher/owner/admin). Phụ: Kernel snapshot server. |
| **c. Điều kiện tiên quyết** | Đã đăng nhập trên app giáo viên (session `_auth` hợp lệ); org được bootstrap (tự tạo org rỗng nếu giáo viên mới). |
| **d. Trigger** | Truy cập `/dashboard`, hoặc mở app (route `/` redirect về `/dashboard`). |
| **e. Luồng chính** | 1. Route `/` redirect `/dashboard` (apps/web/src/routes/index.tsx:3-7). 2. `_auth` beforeLoad kiểm tra session; thiếu → redirect `/login?returnUrl=` (apps/web/src/routes/_auth/route.tsx:6-37). 3. Tải kernel snapshot `GET /api/kernel` vào store dùng chung (apps/web/src/lib/repos/kernel.ts:622-677). 4. Client tính: lịch hôm nay gom (classId, time) loại cancelled/holiday (dashboard-from-kernel.ts:13-70); lịch sắp tới mai→CN (88-108); risk theo 2 tín hiệu (147-178); KPI 4 thẻ (dashboard.tsx:167-193). 5. Render lời chào theo giờ VN + kicker vi-VN (dashboard.tsx:107-125). |
| **f. Luồng thay thế** | f1. Org rỗng: mọi khối hiển thị empty-state trung thực, không demo data (dashboard.test.tsx:205-225). f2. Lớp không có tên khớp: hiển thị fallback "Lớp" (dashboard.tsx:214, 242). |
| **g. Ngoại lệ** | g1. Snapshot sai dạng/JSON hỏng → MalformedSnapshotError, workspace không áp dữ liệu (repos/kernel.ts:648-661) [E-006]. g2. Session hết giữa chừng → 401 redirect theo cơ chế provider. |
| **h. Hậu điều kiện** | Giáo viên nhìn thấy trạng thái org mới nhất sau snapshot; không có dữ liệu nào bị ghi. BR: BR-005, BR-010, BR-011. FR: FR-001, FR-007…FR-011. |
| Nhãn nguồn | ✅ toàn bộ luồng chính/thay thế có cite trong bảng. |
