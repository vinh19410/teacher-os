---
feature: student-practice
type: reverse-usecase
uc: UC-01
status: draft
updated: "2026-11-12"
---

# UC-01 — Xem tổng quan luyện từ vựng

a. **Mục tiêu:** Học viên nhìn một màn hình biết hôm nay cần học/ôn gì, tiến độ ghi nhớ
   dài hạn thế nào, và có gợi ý mới từ giáo viên hay không, từ đó quyết định vào bộ từ nào. 🟡 (mục tiêu nghiệp vụ — INF/records; xem OQ-09 về thước đo)
b. **Actor:** Học viên (student SPA).
c. **Tiền điều kiện:** Đã đăng nhập session student; (dữ liệu) có hoặc không có bộ từ —
   màn hình phải hiển thị đúng cả hai.
d. **Luồng chính (truy vết F1):**
   1. Mở `/practice` → tự chuyển về `/practice/reading` (FR-01); chọn tab từ vựng hoặc
      gõ `/practice/vocabulary`; URL `/vocab` cũ cũng về đây (FR-02).
   2. Client tải overview qua query key ["student","vocab-overview"] (cache 60 giây).
   3. Hiển thị 5 thẻ chỉ số: "Từ mới", "Đến hạn ôn", "Chuỗi ngày (Streak)",
      "Đã thuộc (L2+)", "Thành thạo (L5) · Nhớ" (FR-03).
   4. Có thẻ đến hạn trong tương lai gần (≤1 giờ) → hiện đồng hồ đếm ngược +
      "N từ sắp đến hạn" (FR-04); có thẻ đến hạn ngay → đếm vào "Đến hạn ôn".
   5. Hiển thị dự báo 7 ngày và % nhớ (FR-05).
   6. Hiển thị danh sách gợi ý (FR-07) và lưới bộ từ kèm nhãn nguồn + trạng thái
      bài học + bộ "Bắt đầu từ đây" (FR-06).
e. **Luồng thay thế:**
   - 2a. Tải thất bại → "Không tải được dữ liệu từ vựng. Vui lòng thử lại." (E-16).
   - 6a. Chưa có bộ từ → empty-state "Chưa có bộ từ đang học" (index.tsx:253-267).
   - 6b. Nhấn đồng ý/ẩn gợi ý lỗi → wording tương ứng E-17/E-18.
f. **Hậu điều kiện:** Không đổi dữ liệu (đọc-thuần); đồng hồ tick có thể gây refetch khi hết hạn.
g. **Quy tắc liên quan:** FR-01..FR-07; BR-05, BR-06, BR-07, BR-08.
h. **Truy vết:** apps/student/src/routes/_auth/practice/vocabulary/index.tsx:96-267;
apps/server/src/routes/vocab.ts:562-743; apps/student/src/components/vocab/vocab-countdown.tsx:12-51;
apps/student/src/components/vocab/vocab-lesson-card.tsx:15-90; apps/e2e/specs/vocab-srs.spec.ts:537-555.
