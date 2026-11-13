# UC-schedule-03 — Xóa sự kiện vận hành

| Mục | Nội dung |
|-----|----------|
| **a. Mục tiêu & mức** | Mức người dùng. Gỡ sự kiện nhập nhầm hoặc không còn cần (không có đường sửa — xem OQ-1). |
| **b. Actor chính** | Giáo viên (mọi thành viên tổ chức đã đăng nhập — xem OQ-2). |
| **c. Tiền điều kiện** | Đang ở màn Lịch dạy; tồn tại ít nhất một chip sự kiện vận hành. |
| **d. Trigger** | Bấm vào chip sự kiện trên bất kỳ view nào. |
| **e. Luồng chính** | 1. Hộp thoại chi tiết mở: ngày (định dạng ngày/tháng), khung giờ, ghi chú (nếu có).<br>2. Hộp thoại ghi chú rõ: "Sự kiện không ảnh hưởng ca học, điểm danh hay nhắc việc."<br>3. Giáo viên bấm "Xóa" → hệ thống yêu cầu xác nhận lần hai ("Xóa sự kiện").<br>4. Giáo viên xác nhận: hệ thống gửi yêu cầu xóa; máy chủ chỉ xóa khi sự kiện thuộc đúng tổ chức của phiên.<br>5. Xóa thành công: chip biến mất ngay khỏi view đang mở, báo "Đã xóa sự kiện." |
| **f. Luồng thay đổi** | 3a. Bấm Hủy ở bước xác nhận → quay lại chi tiết, không xóa.<br>4a. Sự kiện đã bị xóa nơi khác (hoặc id không tồn tại) → báo "Sự kiện đã không còn tồn tại." như một thông báo, hộp thoại đóng, không coi là lỗi.<br>4b. Lỗi khác hoặc quá hạn chờ → toast "Không xóa được sự kiện — thử lại.", chip giữ nguyên, hộp thoại mở lại được.<br>4c. Xóa sự kiện của tổ chức khác → máy chủ trả "không tìm thấy", dòng không bị xóa (không lộ sự tồn tại). |
| **g. Hậu điều kiện** | Dòng sự kiện bị gỡ khỏi dữ liệu; mọi view (sau khi tải dữ liệu) không còn chip; số liệu dạy học không đổi. |
| **h. Ràng buộc & kiểm chứng** | BR-006 (chỉ xóa được sự kiện cùng tổ chức; tổ chức khác → không tìm thấy). FR-007, FR-009, FR-012. Kiểm chứng: test xóa của org hiện tại (`apps/server/src/routes/events.test.ts:241-258`), test xóa chéo tổ chức trả "không tìm thấy" và dòng còn nguyên (`:260-281`), test chưa đăng nhập + id không tồn tại (`:283-296`), test UI chip biến mất ngay (`apps/web/src/routes/_auth/schedule.test.tsx:706-728`). |

**Nguồn chính:** `apps/web/src/components/schedule/org-event-chip.tsx:33-58,101-156`; `apps/web/src/lib/repos/events.ts:96-121`; `apps/server/src/routes/events.ts:65-78`.
