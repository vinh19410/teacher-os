---
feature: materials
type: reverse-usecase
uc: UC-06
status: draft
updated: "2026-11-12"
---

# UC-06 — Xóa tài liệu

a. **Mục tiêu:** Giáo viên dọn tài liệu không còn dùng ra khỏi ngân hàng, đồng
   thời hệ thống phải chắc chắn không xóa nhầm tài liệu đang được buổi học hoặc
   giáo trình tham chiếu.
b. **Actor:** Giáo viên có quyền ghi.
c. **Tiền điều kiện:** Tài liệu còn tồn tại trong tổ chức; người dùng hiểu cảnh
   báo không hoàn tác.
d. **Luồng chính (F6):**
   1. Bấm "Xóa" trên dòng tài liệu → hộp thoại xác nhận "Xóa “{tên}” khỏi ngân
      hàng tài liệu? Không thể hoàn tác." (FR-13).
   2. Xác nhận → máy chủ đếm tham chiếu trên CẢ bảng buổi học lẫn bảng giáo trình
      (FR-13, BR-11).
   3. Không còn tham chiếu → xóa dòng dữ liệu TRƯỚC, rồi mới xóa object trong
      kho (BR-10).
   4. Thành công → toast, dòng biến khỏi danh sách, cây đếm cập nhật.
e. **Luồng thay thế:**
   - 2a. Đang gắn → "Tài liệu đang được dùng ở N buổi học…" / "…N bài trong giáo
     trình…" / "…cả hai" kèm số cụ thể để biết chỗ gỡ trước (E-14, BR-11).
   - 3a. Tài liệu file/audio-video mà kho chưa cấu hình → "Kho file tài liệu
     đang tạm ngưng…" và KHÔNG xóa dòng — tránh object mồ côi không ai dọn
     (E-23, BR-10).
   - 3b. Tài liệu vừa bị gắn vào buổi giữa chừng (FK chặn khi xóa) → đếm lại và
     trả đúng câu đang-dùng (E-14).
   - 2b. Tài liệu đã bị người khác xóa trước → "Tài liệu không còn tồn tại…"
     (E-07).
f. **Hậu điều kiện:** Xóa thành công → dòng và object đều biến mất; thất bại →
   KHÔNG gì đổi (không xóa nửa chừng).
g. **Quy tắc liên quan:** FR-13, FR-25; BR-01, BR-10, BR-11.
h. **Truy vết:** apps/web/src/components/materials/material-dialogs.tsx:513-574;
apps/server/src/routes/materials.ts:139-150,265-286,1135-1180;
apps/web/src/lib/repos/materials.ts:159-178;
apps/server/src/routes/materials.test.ts:1076-1113,2303-2549.
