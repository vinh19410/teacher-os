---
feature: vocab-hub
type: reverse-usecase
uc: UC-03
status: draft
updated: "2026-11-12"
---

# UC-03 — Soạn từ vựng trong bộ từ

## a. Tên use case

Soạn từ vựng trong bộ từ (thêm / sửa / xoá từng mục từ).

## b. Mã UC / phạm vi

UC-03 — feature vocab-hub; phạm vi: nội dung chữ của từ (từ, IPA, nghĩa);
âm thanh thuộc UC-04.

## c. Tác nhân

Giáo viên.

## d. Luồng chính (truy vết FR)

1. Giáo viên bấm "Soạn từ vựng" trên dòng bộ từ. ✅ FR-07
   (vocab-deck-list.tsx:89).
2. Hộp "Soạn từ vựng" mở, tải danh sách từ CỦA bộ bằng lời gọi riêng. ✅
   FR-07 (editor.tsx:30-54; vocab-teacher.ts:83-133).
3. Giáo viên bấm "+ Thêm từ" nhiều lần để có các dòng nháp, mỗi dòng 3 ô:
   "Từ vựng", "IPA", "Nghĩa tiếng Việt". ✅ FR-07 (vocab-word-row.tsx:45,60,75; editor.tsx:195).
4. Bấm "Thêm" trên dòng nháp: client kiểm từ khác rỗng → POST upsert → tải
   lại danh sách → dòng chuyển thành dòng đã lưu (nút "Lưu"). ✅ FR-07,
   FR-08 (editor.tsx:74-117).
5. Sửa dòng đã lưu → "Lưu" → upsert → tải lại. ✅ FR-07.
6. Xoá dòng đã lưu → server xoá trong MỘT lô: thẻ của từ (trừ thẻ libword-*)
   rồi từ. ✅ FR-09, BR-11, BR-13 (vocab-teacher.ts:714-749).
7. Đóng hộp → các dòng nháp chưa lưu biến mất (không bền). ✅ FR-07.

## e. Luồng thay thế (mã lỗi)

- 4a. Ô từ trắng → "Từ vựng không được để trống.", không gọi mạng. ✅ E-27
  (editor.tsx:74-101).
- 4b. Vi phạm hợp đồng (từ > 200 ký tự, nghĩa > 500, sortOrder âm, trường lạ)
  → 400. ✅ E-07 (contracts.ts:3179-3197).
- 2a/6a. Bộ từ lạ hoặc khác tổ chức → 404 VOCAB_DECK_NOT_FOUND. ✅ E-09
  (vocab-teacher.ts:95-100).
- 6b. Từ lạ hoặc khác tổ chức → 404 VOCAB_WORD_NOT_FOUND. ✅ E-12
  (vocab-teacher.ts:730-735).
- 2b. Tải danh sách lỗi → thông báo + nút "Thử lại". ✅ FR-07 (editor.tsx:163-175).

## f. Hậu điều kiện

- vocab_word được thêm/cập nhật/xoá; thẻ học của từ bị xoá đi kèm (trừ thẻ
  libword-*); danh sách trong hộp phản ánh đúng; số từ trên hub thay đổi sau
  lần làm mới bản chụp kế tiếp.

## g. Quy tắc liên quan

BR-01 (sở hữu), BR-03 (tiền tố dành riêng cho id), BR-11 (thẻ libword-* bất
xâm), BR-13 (server không đụng thẻ/nhật ký ngoài phạm vi xoá).

## h. Truy vết

FR-07, FR-08, FR-09, FR-22; E-07, E-09, E-12, E-27; F3; SM-02;
Nguồn: vocab-deck-editor.tsx:11-201; vocab-word-row.tsx:87-123;
vocab-teacher.ts:83-133,654-749; contracts.ts:3175-3197;
vocab-teacher.test.ts:146,336.
