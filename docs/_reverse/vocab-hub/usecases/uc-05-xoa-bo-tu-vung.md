---
feature: vocab-hub
type: reverse-usecase
uc: UC-05
status: draft
updated: "2026-11-12"
---

# UC-05 — Xoá bộ từ vựng

## a. Tên use case

Xoá bộ từ vựng.

## b. Mã UC / phạm vi

UC-05 — feature vocab-hub; phạm vi: xoá bộ từ của giáo viên; nhật ký ôn tập
không thuộc phạm vi xoá (BR-05); thẻ libword-* bất xâm (BR-11).

## c. Tác nhân

Giáo viên.

## d. Luồng chính (truy vết FR)

1. Giáo viên bấm "Xoá" trên dòng bộ từ. ✅ FR-06 (vocab-deck-list.tsx:89).
2. Hộp "Xoá bộ từ vựng?" hiện cảnh báo nêu rõ: bộ từ + toàn bộ từ vựng +
  tiến độ học của học sinh trên bộ bị xoá vĩnh viễn, LỊCH SỬ ÔN TẬP KHÔNG
  MẤT. ✅ FR-06 (vocab-deck-list.tsx:259-287).
3. Giáo viên xác nhận → POST xoá. ✅ FR-22.
4. Máy chủ kiểm bộ từ cùng tổ chức (404 nếu sai) rồi thực hiện MỘT lô:
   xoá thẻ (loại trừ thẻ trỏ libword-*) → xoá gợi ý → xoá từ → xoá bộ từ;
   KHÔNG đụng vocab_review_log. ✅ FR-06, BR-05, BR-11, BR-13
   (vocab-teacher.ts:208-275).
5. Client làm mới bản chụp → toast "Đã xoá bộ từ "{tên}"." và dòng biến mất. ✅
   FR-06 (vocab-deck-list.tsx:163-173).

## e. Luồng thay thế (mã lỗi)

- 3a. Hủy xác nhận → không gọi mạng. ✅ (hộp confirm, vocab-deck-list.tsx:259-287).
- 4a. Bộ từ lạ hoặc khác tổ chức → 404. ✅ E-09 (vocab-teacher.ts:227-232;
  test :401).
- 4b. Thân không hợp lệ → 400. ✅ E-07 (contracts.ts:3167-3172).
- 4c. Lô xoá bỏ qua thẻ libword-* — học viên giữ tiến độ khóa thư viện. ✅
  BR-11 (vocab-teacher.ts:246-250).

## f. Hậu điều kiện

- vocab_deck + vocab_word + vocab_card (ngoại trừ libword-*) +
  vocab_suggestion của bộ bị xoá sạch trong một lô; vocab_review_log còn
  nguyên (snapshot word/deck id mồ côi); bản chụp không còn dòng; UI về
  trạng thái rỗng nếu hết bộ.

## g. Quy tắc liên quan

BR-01 (sở hữu), BR-05 (xoá tường minh + giữ nhật ký), BR-11 (thẻ libword-*),
BR-13 (không cascade DB).

## h. Truy vết

FR-06, FR-22; E-07, E-09; F2; SM-04; OQ-10;
Nguồn: vocab-deck-list.tsx:163-173,259-287; vocab-teacher.ts:208-275;
schema/vocab.ts:14-21,126-131; vocab-teacher.test.ts:108-110,146.
