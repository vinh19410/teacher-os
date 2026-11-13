---
feature: student-practice
type: reverse-usecase
uc: UC-04
status: draft
updated: "2026-11-12"
---

# UC-04 — Xử lý gợi ý bộ từ của giáo viên

a. **Mục tiêu:** Học viên đồng ý hoặc ẩn gợi ý mở bộ từ từ giáo viên; đồng ý thì mở
   được bộ từ như bộ lớp. 🟡 (mục tiêu kết nối GV-HV — không có tài liệu nghiệp vụ; OQ-14)
b. **Actor:** Học viên.
c. **Tiền điều kiện:** Có gợi ý pending từ giáo viên (tạo phía vocab-hub, ngoài phạm vi).
d. **Luồng chính (truy vết F5):**
   1. Tổng quan liệt kê gợi ý (FR-07).
   2. "Đồng ý" → POST accept: trạng thái accepted + respondedAt (FR-08).
   3. Client làm mới tổng quan rồi mở thẳng trang bộ từ (FR-10 thỏa qua accepted).
e. **Luồng thay thế:**
   - 2a. Gợi ý đã ẩn/không tồn tại → 404 E-12 → wording E-17.
   - 2b. Ẩn gợi ý đã đồng ý → 409 E-13 (BR-15).
   - 2c. Lỗi mạng → wording E-17/E-18.
f. **Hậu điều kiện:** Suggestion chuyển pending → accepted/dismissed; dữ liệu khác không đổi
   (thẻ chỉ cấp khi vào bộ từ).
g. **Quy tắc liên quan:** FR-07..FR-09; BR-15.
h. **Truy vết:** apps/server/src/routes/vocab.ts:744-885; packages/db/src/schema/vocab.ts:159-203;
apps/student/src/routes/_auth/practice/vocabulary/index.tsx:55-82;
apps/student/src/components/vocab/vocab-suggestion-list.tsx:93-108.
