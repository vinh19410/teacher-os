---
feature: student-practice
type: reverse-usecase
uc: UC-03
status: draft
updated: "2026-11-12"
---

# UC-03 — Ôn tập theo lịch SRS

a. **Mục tiêu:** Học viên ôn đúng các từ sắp quên để giữ/méo mức ghi nhớ: tốt thì
   giãn lịch (3/7/14/30 ngày), sai thì rút ngắn. 🟡 (định hướng "đúng từ đúng lúc" suy từ thuật toán — OQ-09/OQ-10)
b. **Actor:** Học viên.
c. **Tiền điều kiện:** Bộ từ đã có thẻ state review; nút "Ôn tập" bật khi có thẻ đến hạn.
d. **Luồng chính (truy vết F2 + F4):**
   1. Trang bộ từ hiện "Ôn tập (N)" với N = thẻ đến hạn (FR-12); vào phiên mode=review (FR-13).
   2. Engine lấy pool thẻ state review, dueAt asc, xáo trộn crypto (FR-16).
   3. Mỗi thẻ: prompt minigame (4 lựa chọn/gõ/tự-đánh-giá theo dữ liệu từ) (FR-20, FR-21).
   4. Mỗi câu trả lời → POST answer idempotent, đúng/sai + thời gian kẹp ≤1 giờ (FR-17).
   5. Server applyAnswer xếp lịch lại theo BR-01/BR-02 (FR-18): đúng +1 mức; sai thì
      hạ hoặc cảnh báo/rớt mức theo nhánh.
   6. "Chưa nhớ" lần 1 cùng thẻ → chen lại vị trí 4-5; lần 2 → thẻ bị loại khỏi phần còn lại của phiên (đếm vào số thẻ hoàn thành) (BR-12); 5 câu khó liên tiếp →
      overlay khích lệ (BR-13); lỗi audio → bỏ qua không phạt (BR-14).
   7. Hết pool → tổng kết "Đã ôn N từ vựng" + mốc đợt ôn kế.
e. **Luồng thay thế:**
   - 2a. Không còn thẻ đến hạn mà vẫn bấm "Ôn tập" → ôn sớm toàn pool: server trả card
     nhưng KHÔNG ghi log/không đổi lịch (BR-04 🟡 OQ-04).
   - 4a. Thẻ chưa học (còn trạng thái mới) gửi lên server → 409 VOCAB_CARD_NOT_DUE; thẻ ôn chưa đến hạn → 200 im lặng, không ghi log (E-10).
   - 4b. Retry sau rớt mạng → replay trả kết quả cũ (NFR-03).
f. **Hậu điều kiện:** Mỗi câu hợp lệ: 1 log review + thẻ mới level/warning/dueAt;
   thẻ ôn sớm: không đổi gì.
g. **Quy tắc liên quan:** FR-12, FR-13, FR-16..FR-22; BR-01, BR-02, BR-04, BR-05, BR-10, BR-12..BR-14.
h. **Truy vết:** apps/server/src/routes/vocab.ts:918-1044; packages/api/src/srs/review-session.ts:55,
:96-119, :183-286, :296-316, :368-371; packages/api/src/srs/scheduler.ts:27-65;
packages/db/src/schema/vocab.ts:84-124; apps/server/src/routes/vocab.test.ts:626-657;
apps/e2e/specs/vocab-srs.spec.ts:488-665.
