---
feature: student-practice
type: reverse-usecase
uc: UC-02
status: draft
updated: "2026-11-12"
---

# UC-02 — Học từ mới trong phiên Learn

a. **Mục tiêu:** Học viên lần đầu làm quen từng từ trong bộ (nghe, nghĩa, gõ) để sau
   phiên, mọi từ đã học rơi vào lịch ôn +1 ngày. 🟡 (đích "mọi từ" phụ thuộc phiên hoàn tất — OQ-07 về phiên dài)
b. **Actor:** Học viên.
c. **Tiền điều kiện:** Có quyền mở bộ từ (FR-10); còn từ mới chưa học (đếm N > 0).
d. **Luồng chính (truy vết F2 + F3):**
   1. Mở trang bộ từ → session-data cấp thẻ lần đầu (FR-11), đếm "Bắt đầu học (N)" (FR-12).
   2. Vào `/practice/vocabulary/:deckId/session?mode=learn` (FR-13).
   3. Mỗi từ: lật thẻ intro (bắt buộc) → bước nghe-chọn/chọn-nghĩa → bước gõ/chọn-từ (FR-14).
   4. Trả lời sai → "Chưa đúng", từ quay lại cuối hàng đợi trong phiên (BR-11).
   5. Hoàn tất mọi bước của từ → ghi learn-commit với gradeGood (đúng ngay lần đầu) (FR-15).
   6. Server xếp lịch: level 1, state review, +1 ngày (BR-03), log idempotent.
   7. Hết hàng đợi → tổng kết "Đã thuộc N từ mới" + "Đợt ôn tiếp theo sau 1d".
e. **Luồng thay thế:**
   - 3a. Chưa lật thẻ mà bấm sang bước luyện → chặn + nhắc "Hãy lật thẻ để xem nghĩa
     trước khi chuyển sang bước luyện tập".
   - 5a. Lỗi mạng khi ghi → panel E-19: "Thử lại" hoặc "Bỏ qua" (không mất phần đã lưu).
   - 2a. Bộ từ bị xóa giữa phiên → dialog E-20 dừng phiên.
   - 7a. Thoát giữa phiên (Escape) → xác nhận "Tạm dừng phiên học?"; phần đã ghi giữ nguyên.
f. **Hậu điều kiện:** Mỗi từ hoàn tất có 1 log learn + thẻ chuyển state review, hạn +1 ngày;
   từ chưa xong không đổi gì.
g. **Quy tắc liên quan:** FR-10..FR-15, FR-19..FR-22; BR-01, BR-02, BR-03, BR-10, BR-11, BR-14.
h. **Truy vết:** apps/server/src/routes/vocab.ts:1046-1161; packages/api/src/srs/learn-session.ts:15-83,
:279-302, :376-411; packages/api/src/srs/scheduler.ts:70-79;
apps/student/src/components/vocab/vocab-session-view.tsx:102-334, :631-694;
apps/e2e/specs/vocab-srs.spec.ts:359-486; apps/server/src/routes/vocab.test.ts:386-487.
