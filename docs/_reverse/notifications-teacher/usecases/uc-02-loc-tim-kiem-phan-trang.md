---
type: reverse-usecase
feature: notifications-teacher
uc: UC-02
status: draft
updated: 2026-11-12
---

# UC-02 — Lọc, tìm kiếm và phân trang nhật ký

a. **Mục tiêu:** Thu hẹp nhật ký về đúng nhóm sự kiện/trạng thái/học viên cần đối soát, và đi qua lượng dòng lớn bằng phân trang server-side — mọi lựa chọn sống trên URL để chia sẻ/back không mất trạng thái. (mục tiêu nghiệp vụ do BA suy — OQ-02)
b. **Actor:** Giáo viên.
c. **Tiền điều kiện:** Như UC-01.
d. **Luồng chính (truy vết F1):**
   1. Gõ ô tìm kiếm → client giữ state, ngừng gõ 300ms mới đẩy `?q=` lên URL và quay về trang 1 (FR-06).
   2. Chọn chip "Nhóm sự kiện" — 5 lựa chọn: "Tất cả" / "Mời vào lớp" / "Giao bài / Trả điểm" / "Học phí" / "Đổi lịch / Nghỉ lễ" → `?event=` theo event_group (FR-05).
   3. Chọn chip "Trạng thái" (Tất cả / Đang chờ / Đã gửi / Đã xem / Lỗi gửi) → `?status=`; badge đếm không đổi theo status vì counts tính trên q+event (FR-04, BR-07).
   4. "Trang sau" / "Trang trước" → `?page=`; dòng trạng thái "Trang {page} / {pageCount} · {total} thông báo" (FR-10).
   5. Server lọc: `q` LIKE đã escape trên tên học viên / recipient_email / title (+ email hiện tại khi dòng có kênh email), `event` theo event_group, `status` theo status (FR-02, FR-03, BR-09).
e. **Luồng thay thế:**
   - 1a. `q` đổi từ phía URL (back/forward, link chia sẻ) → sync xuống input (FR-06).
   - 2a. Giá trị `?event=`/`?status=`/`?page=` lạ → về mặc định, không lên URL (FR-05).
   - 5a. Query lệch enum/page không nguyên dương → 400 `invalid query` (E-03).
   - 5b. Kết quả lọc rỗng → "Không có thông báo nào phù hợp với bộ lọc." — thanh lọc vẫn giữ (FR-11).
f. **Hậu điều kiện:** URL phản ánh đúng bộ lọc hiện tại; reload/back/share tái tạo cùng danh sách.
g. **Quy tắc liên quan:** FR-02, FR-03, FR-05, FR-06; BR-07 (counts không áp status), BR-09 (q hai chế độ khớp email).
h. **Truy vết:** apps/web/src/routes/_auth/notifications/index.tsx:48-145, apps/web/src/routes/_auth/notifications/index.tsx:175-195, apps/web/src/routes/_auth/notifications/index.tsx:256-292, apps/web/src/routes/_auth/notifications/index.tsx:555-598; apps/server/src/lib/notifications/requeue.ts:19-59; apps/server/src/routes/notification-logs.ts:89-95; test: apps/web/src/routes/_auth/notifications/index.test.tsx:128-223, apps/server/src/routes/notification-logs.test.ts:187-230, apps/server/src/routes/notification-logs.test.ts:231-317.
