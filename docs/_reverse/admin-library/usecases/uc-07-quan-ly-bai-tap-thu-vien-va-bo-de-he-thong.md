---
feature: admin-library
type: reverse-usecase
uc: UC-07
status: draft
updated: "2026-11-12"
---

# UC-07 — Quản lý bài tập thư viện và bộ đề hệ thống

a. **Mục tiêu:** Admin duy trì kho bài tập lẻ (reading/grammar/vocabulary) và ghép các
   nguồn đã xuất bản thành bộ đề tự học theo ngày cho toàn hệ thống; cập nhật bộ mà
   không làm mất tiến độ của học viên đang làm. 🟡 (mục tiêu — suy từ trang + luật
   bảo toàn; OQ-12)
b. **Actor:** Admin.
c. **Tiền điều kiện:** Đã qua cổng admin. Nguồn đưa vào bộ: part đề đọc đã xuất bản
   hoặc bài tập đã sẵn sàng.
d. **Luồng chính (truy vết F7, F8):**
   1. Mở trang bộ đề hệ thống: hai khối — bài tập thư viện và bộ đề (FR-29, FR-31).
   2. Tạo bài tập: dán JSON (hoặc soạn) → gửi tạo → "Đã tạo bài tập thư viện." (FR-29).
   3. Tạo bộ: tiêu đề + mô tả + trạng thái + danh sách mục (JSON, có trình thêm nhanh
      theo ngày) → gửi tạo → "Đã tạo bộ đề hệ thống." (FR-31).
   4. Cập nhật bộ: sửa danh sách mục — mục giữ nguyên (ngày + nguồn + mã nguồn) GIỮ
      mã cũ; mục biến mất bị xóa; mục mới nhận mã mới → học viên đang làm không mất
      tiến độ (FR-33, BR-13).
   5. Giao lớp (ngoài màn này): giáo viên gán bộ → hệ thống VẬT HÓA bản sao cho lớp —
      sửa thư viện sau đó không đổi bài lớp đã nhận (FR-35, BR-16).
e. **Luồng thay thế:**
   - 2a/3a. JSON hỏng → toast "JSON bài tập không hợp lệ." / "JSON danh sách bài tập
     không hợp lệ." / "JSON danh sách bài chưa hợp lệ."
   - 3b. Nguồn không hợp lệ (nháp, tổ chức khác, mã lạ) hoặc vượt trần 366 ngày/10
     mục/ngày/200 mục → lỗi kèm lý do (E-05, BR-11, BR-12).
   - 4a. Hạ bài tập đã sẵn sàng về nháp khi còn bộ dùng → 409 (E-21, BR-14).
   - 4b. Xóa bài tập khi còn bộ dùng → 409 "Không thể xoá bài tập thư viện." (E-21).
   - 4c. Xóa bộ khi còn lớp gắn → 409 "Không thể xoá bộ đề hệ thống." (E-22, BR-14).
   - 4d. ID lạ → 404 (E-23/E-25).
f. **Hậu điều kiện:** Bài tập/bộ tồn tại với trạng thái mong muốn; bộ hệ thống luôn
   ngoài phạm vi tổ chức; bản sao lớp độc lập với gốc.
g. **Quy tắc liên quan:** FR-29..FR-34, FR-35; BR-11..BR-16.
h. **Truy vết:** apps/server/src/routes/admin-library.ts:898-1195;
apps/admin/src/routes/_auth/library/packs.tsx:1-446;
apps/server/src/lib/study-pack-clone.ts:354-940;
packages/db/src/schema/study-pack.ts:1-146;
apps/server/src/routes/admin-library.test.ts:1272-1656.
