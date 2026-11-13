---
feature: student-practice
type: reverse-usecase
uc: UC-07
status: draft
updated: "2026-11-12"
---

# UC-07 — Duyệt catalog luyện đề và bắt đầu đề

a. **Mục tiêu:** Học viên tự chọn đề luyện IELTS theo kỹ năng (đọc/nghe/viết/nói), lọc
   theo bộ sưu tập hoặc tìm theo tên, rồi vào làm ngay không cần giáo viên giao. 🟡
   (mục tiêu tự học — suy từ phase 10 #378; OQ-13)
b. **Actor:** Học viên.
c. **Tiền điều kiện:** Đã đăng nhập; tổ chức đang chọn có đề `status = ready` (đề nháp
   của giáo viên không bao giờ xuất hiện).
d. **Luồng chính (truy vết F8):**
   1. Menu Luyện tập → chọn kỹ năng (5 mục: Reading/Listening/Writing/Speaking/Vocabulary);
      slug sai → về `/practice/reading` (FR-23).
   2. Catalog: trang 12 đề, lọc bộ sưu tập khớp chính xác, tìm theo tiêu đề không phân biệt
      hoa/thường và không coi %/_ là ký tự đại diện; mới nhất trước (FR-24).
   3. Thẻ đề: số phần, bộ sưu tập, nhóm đề, thời lượng, kết quả gần nhất ("Band x.x" /
      "đúng/tổng" / "Chờ chấm") (FR-26).
   4. Click thẻ → POST start: 201 lượt mới (snapshot gộp mọi phần) hoặc 200 resume lượt dở
      (FR-27) → chuyển màn làm đề (UC-08).
e. **Luồng thay thế:**
   - 2a. Kỹ năng lạ / trang < 1 → 400 (E-23).
   - 2b. Chưa có đề cho kỹ năng → "Giáo viên chưa có đề luyện tập cho kỹ năng này" (FR-30).
   - 4a. Đề nháp/org khác/không part → 404 như đề lạ (E-25, FR-25) → toast
     "Không bắt đầu được bài luyện tập" (E-28).
f. **Hậu điều kiện:** Nếu start thành công: tồn tại lượt làm mode practice không gắn bài
   tập lớp; catalog không đổi dữ liệu.
g. **Quy tắc liên quan:** FR-23..FR-27, FR-30; (ràng buộc id đề: BR-16 áp dụng phía đề
   thư viện từ vựng, không áp đề luyện).
h. **Truy vết:** apps/server/src/routes/student-practice.ts:229-364, :412-470;
apps/student/src/routes/_auth/practice/$skill.tsx:8-50, :92-101;
apps/student/src/components/practice/skill-catalog.tsx:53-69, :176-181;
apps/student/src/lib/repos/student.ts:521-620; apps/server/src/routes/student-practice.test.ts:349-536;
apps/e2e/specs/student-practice.spec.ts:120-158, :180-186.
