# UC-04 — Làm mới bộ đếm

| Trường | Nội dung |
|--------|----------|
| **a. Mô tả** | Bộ đếm luôn phản ánh snapshot mới nhất: tự refetch khi kernel refresh sau mỗi action, và có nút làm mới thủ công. |
| **b. Actor** | Chính: Giáo viên. Phụ: TanStack Query, Kernel command bus. |
| **c. Điều kiện tiên quyết** | Trang dashboard đang mở; đã có snapshot đầu tiên (hoặc đang chờ). |
| **d. Trigger** | (1) Bấm "Làm mới dữ liệu"; (2) kernel snapshot refresh (dataUpdatedAt đổi); (3) bấm "Thử lại" khi lỗi. |
| **e. Luồng chính** | 1. Observer kernel dùng `staleTime: Infinity`, chỉ lắng `dataUpdatedAt` (dashboard.tsx:87-91). 2. Action kernel xong → refetch exact `["kernel"]` → timestamp mới (repos/dashboard-reminders.ts:16-24). 3. Query key reminders = base + timestamp → key mới → TanStack tự refetch (23-24). 4. Nút thủ công gọi `reminders.refetch()`, disabled khi đang fetch (dashboard.tsx:135-142). |
| **f. Luồng thay thế** | f1. `kernelUpdatedAt = 0` (chưa có snapshot): query disabled, không fetch thừa (dashboard.tsx:92-96). f2. Đang fetch: nút disabled, không chồng request. |
| **g. Ngoại lệ** | g1. Refetch lỗi → state lỗi + Thử lại [E-004]. |
| **h. Hậu điều kiện** | Bộ đếm khớp snapshot mới nhất; test chứng minh refetch tăng sau probe refresh (dashboard.test.tsx:248-282). FR: FR-006, FR-013. BR: BR-011. |
