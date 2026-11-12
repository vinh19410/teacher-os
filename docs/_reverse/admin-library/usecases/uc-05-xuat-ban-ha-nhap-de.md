---
feature: admin-library
type: reverse-usecase
uc: UC-05
status: draft
updated: "2026-11-12"
---

# UC-05 — Xuất bản hoặc hạ ngược đề

a. **Mục tiêu:** Admin công bố đề cho hệ thống (ready) khi nội dung đạt chuẩn, hoặc
   thu về nháp để sửa cấu trúc — bảo đảm đề xuất bản không bao giờ ở trạng thái thiếu
   nội dung hay nhóm câu hỏng. 🟡 (mục tiêu — suy từ luật + UI; OQ-04)
b. **Actor:** Admin.
c. **Tiền điều kiện:** Đề tồn tại; đang ở trạng thái đối nghịch (draft để xuất bản,
   ready để hạ).
d. **Luồng chính (truy vết F5):**
   1. Bấm "Xuất bản" — client tự chấm luật sẵn sàng bằng cùng bộ luật server; còn lý
      do thì hiện khối "Chưa xuất bản được — N lý do:" liệt kê theo part, KHÔNG gửi
      yêu cầu (FR-40, FR-11).
   2. Hợp lệ → gửi chuyển trạng thái; server chốt: (a) không part nào nhóm hỏng, (b)
      mọi part đạt luật — đủ part theo mẫu, part đọc có đoạn văn, part nghe có audio
      kèm tên, ≥1 câu hỏi có đề bài, luật ảnh + ngân hàng đáp án (FR-11, FR-12).
   3. Đạt → "Đã xuất bản bộ đề."; nhãn chuyển "Đã xuất bản".
   4. Hạ ngược: bấm "Hạ về nháp" → luôn được → "Đã hạ về bản nháp." (FR-13).
e. **Luồng thay thế:**
   - 2a. Còn part nhóm hỏng → 409 GROUPS_CORRUPT (E-12, BR-06).
   - 2b. Chưa đạt luật → 400 NOT_READY + danh sách lý do "Bộ đề chưa đủ điều kiện —
     xem danh sách lý do." (E-08); client hiển thị cùng khối lý do.
   - 2c. Gửi kèm kỹ năng trong payload → 400 SKILL_IMMUTABLE (E-10).
f. **Hậu điều kiện:** Đề ready — đủ điều kiện để được vật hóa cho học viên; hoặc quay
   về draft — xóa part/audio mở khóa (BR-09).
g. **Quy tắc liên quan:** FR-11..FR-13, FR-40; BR-04, BR-05, BR-06, BR-09.
h. **Truy vết:** apps/server/src/routes/admin-library.ts:512-586;
packages/api/src/library-contracts.ts:263-476;
apps/admin/src/components/library/publish-bar.tsx:1-140;
apps/admin/src/components/library/part-issues.ts:1-144.
