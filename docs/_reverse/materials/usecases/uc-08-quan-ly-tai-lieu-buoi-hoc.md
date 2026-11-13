---
feature: materials
type: reverse-usecase
uc: UC-08
status: draft
updated: "2026-11-12"
---

# UC-08 — Quản lý tài liệu buổi học

a. **Mục tiêu:** Giáo viên chuẩn bị tài liệu cho từng buổi dạy: xem những gì đã
   gắn và những gì sẽ tự theo giáo trình, gắn thêm từ ngân hàng, tải file thẳng
   vào buổi, sắp thứ tự và gỡ khi thừa — không bao giờ tạo tài liệu "ma" ở ngày
   nghỉ lễ.
b. **Actor:** Giáo viên có quyền ghi; trợ giảng mở được modal nhưng chỉ ở chế độ
   xem.
c. **Tiền điều kiện:** Lớp thuộc tổ chức; ngày đã chọn là một buổi có thật (có
   bài học, hoặc buổi thủ công của lớp chưa có học viên); có quyền ghi để thao
   tác.
d. **Luồng chính (F4):**
   1. Trong chi tiết lớp, mở modal "Tài liệu buổi {tên}" → thấy danh sách đã gắn
      (theo thứ tự vị trí) và mục "Copy theo bài của buổi" liệt kê tài liệu giáo
      trình của đúng bài đang dạy ở buổi đó — chỉ đọc, nhãn "Từ giáo trình"
      (FR-18, BR-14). 🟡 (cách diễn đạt "buổi N ↔ bài N" trên nhãn có thể chưa
      tự giải thích khi lịch đã dời — OQ-08)
   2. "Chọn từ ngân hàng" → duyệt/tìm ngân hàng, tích tài liệu → gắn vào cuối
      danh sách buổi (FR-19, BR-12).
   3. "Tải lên mới" → file vừa vào ngân hàng vừa gắn thẳng vào buổi trong một
      lần ghi nguyên tử (FR-20).
   4. Gỡ tài liệu khỏi buổi → dòng liên kết biến mất, tài liệu vẫn nguyên trong
      ngân hàng (FR-21).
e. **Luồng thay thế:**
   - 1a. Lớp lạ/chéo tổ chức → "Không tìm thấy lớp học." (E-17); ngày không
     đúng dạng → 400 (E-06); ngày không có buổi → "Buổi học không còn tồn tại —
     có thể đã được dời hoặc xóa." (E-18).
   - 1b. Buổi rơi trọn ngày nghỉ lễ → danh sách VẪN xem được, nhưng mọi thao tác
     ghi bị chặn (FR-18, BR-13).
   - 2a. Gắn vào ngày toàn-nghỉ-lễ hoặc ngày đã-dời-lễ còn buổi thủ công →
     "Buổi này là buổi nghỉ lễ đã dời lịch — không gắn tài liệu được." (E-19,
     BR-13).
   - 2b. Tài liệu đã gắn → "Tài liệu này đã được gắn vào buổi học." (E-15).
   - 2c. Tài liệu vừa bị xóa → "Tài liệu không còn tồn tại…" (E-07).
   - 3a. Lỗi file như UC-04 (E-20, E-21, E-22, E-23, E-24) — thất bại để lại
     KHÔNG cả tài liệu lẫn liên kết (FR-20).
   - 4a. Gỡ trên ngày nghỉ lễ → bị chặn như gắn (E-19, BR-13); gỡ tài liệu chưa
     gắn → "Tài liệu không còn gắn với buổi học này." (E-16); gỡ vẫn được dù
     bài học của buổi đã mất (liên kết mồ côi sau khi buổi bị xóa) (FR-21).
   - Toàn bộ: lỗi được báo bằng câu tiếng Việt theo mã, danh sách tự làm mới
     (FR-25).
f. **Hậu điều kiện:** Danh sách tài liệu của buổi thay đổi đúng thao tác; tài
   liệu gắn sai thứ tự không xảy ra (vị trí tăng dần); không tạo dòng liên kết
   ở ngày nghỉ lễ.
g. **Quy tắc liên quan:** FR-18, FR-19, FR-20, FR-21, FR-25, FR-26; BR-01,
   BR-02, BR-11, BR-12, BR-13, BR-14.
h. **Truy vết:** apps/web/src/components/class-detail/session-materials-modal.tsx:36-283;
apps/server/src/routes/materials.ts:434-657,1207-1386;
apps/server/src/lib/session-curriculum-materials.ts:113-174;
apps/server/src/routes/materials.test.ts:1028-1075,1427-1485,1486-2028,2303-2590;
apps/web/src/components/class-detail/session-materials-modal.test.tsx:1-217.
