---
feature: vocab-hub
type: reverse-usecase
uc: UC-06
status: draft
updated: "2026-11-12"
---

# UC-06 — Thêm bộ từ từ thư viện dựng sẵn

## a. Tên use case

Thêm bộ từ từ thư viện dựng sẵn (nhân bản vào hub hoặc lớp).

## b. Mã UC / phạm vi

UC-06 — feature vocab-hub; phạm vi: duyệt (đọc) + nhân bản (ghi vào bộ từ của
tổ chức). Thư viện luôn chỉ-đọc và toàn cục (BR-08).

## c. Tác nhân

Giáo viên.

## d. Luồng chính (truy vết FR)

1. Giáo viên bấm "Thêm từ thư viện". ✅ FR-16 (vocab-deck-list.tsx:186).
2. Hộp 2 bước mở: reset toàn bộ trạng thái; bước 1 — 20 khóa học (tìm theo
   tên/mô tả/đích); bước 2 — bài trong khóa, tìm kiếm trễ 300 ms, ô kiểm chọn
   nhiều; bài đã có trong đích dán chip "Đã có trong hub"/"Đã có trong lớp". ✅
   FR-16, FR-15 (vocab-library-dialog.tsx:105-118,120-146,519-528;
   vocab-library.ts:47-141).
3. Chọn "theo lượt": client chặn trước khi vượt 50 bài hoặc tổng 500 (footer
   cảnh báo + nút gửi vô hiệu; chọn nhanh cả lượt bị tràn có thông báo riêng). ✅
   FR-16, E-29 (vocab-library-dialog.tsx:14-15,157-159,196-234,306-314).
4. Xác nhận → POST clone (classId đích + deckIds). ✅ FR-22.
5. Máy chủ kiểm: thân (400), deckIds trùng (400), lớp cùng tổ chức (404),
   bài tồn tại (404), trần 2 lần (422). ✅ FR-16, BR-09
   (vocab-library.ts:204-292).
6. Máy chủ dò bài đã có trong đích (đích hub dùng class_id IS NULL) → chỉ
   báo cáo duplicates; chèn 1 lô: vocab_deck mới (lang "en", giữ
   source_library_deck_id) + vocab_word mới (chép word/ipa/translation/
   audioUrl; audioKey rỗng) → 201 {deckId, added, duplicates}. ✅ FR-17,
   BR-08, BR-09 (vocab-library.ts:294-364).
7. Client ứng theo 4 loại kết quả: refreshed → toast "Đã thêm {n} bộ từ."
   (biến thể lớp + trùng) và đóng hộp; committed → "Đã lưu nhưng chưa xác
   nhận..."; definite-failure → "Không thể thêm bộ từ ({lý do}).";
   outcome-unknown → "Không rõ kết quả mạng...". ✅ FR-17, FR-22
   (vocab-library-dialog.tsx:236-293).
8. Dòng bộ từ mới xuất hiện ở hub/lớp với huy hiệu "Thư viện" (theo
   source_library_deck_id trong bản chụp). ✅ FR-03, FR-18
   (snapshot.ts:833-841; vocab-deck-list.tsx:50).

## e. Luồng thay thế (mã lỗi)

- 2a. Chưa đăng nhập → 401 đủ 4 endpoint thư viện. ✅ E-01 (test :211-237).
- 4a. deckIds trùng trong lượt → 400 LIBRARY_CLONE_DUPLICATE_DECK. ✅ E-21
  (vocab-library.ts:220-230; test :337-348).
- 4b. Khóa không tồn tại → 404 LIBRARY_COURSE_NOT_FOUND. ✅ E-22
  (vocab-library.ts:95-103; test :272-279).
- 4c. Bài không tồn tại → 404 LIBRARY_DECK_NOT_FOUND. ✅ E-23
  (vocab-library.ts:158-166,265-273; test :311-318,361-375).
- 4d. Vượt trần (bất kể client đã chặn) → 422 LIBRARY_CLONE_TOO_LARGE. ✅
  E-24 (vocab-library.ts:246-257,281-292; test :378-436).
- 4e. Lớp khác tổ chức → 404. ✅ E-08 (vocab-library.ts:234-245).
- 5a/6a. Bài đã có trong đích → KHÔNG chặn, chỉ nằm trong duplicates. ✅
  FR-17; 🟡 OQ-05.

## f. Hậu điều kiện

- vocab_deck + vocab_word bản sao thuộc tổ chức tồn tại; provenance giữ liên
  kết bài nguồn; thư viện KHÔNG đổi; duplicates được người dùng biết qua
  toast; hub/lớp hiện bộ mới.

## g. Quy tắc liên quan

BR-01 (đích thuộc tổ chức), BR-08 (thư viện toàn cục chỉ-đọc, id
deterministic), BR-09 (trần 50/500, trùng báo cáo), BR-14 (release train).

## h. Truy vết

FR-15, FR-16, FR-17, FR-22; E-08, E-21, E-22, E-23, E-24, E-29, E-30; F4;
SM-05, SM-06; OQ-05, OQ-08;
Nguồn: vocab-library-dialog.tsx:14-314,452-528; vocab-library.ts:21-364;
vocab-library.test.ts:211-588; schema/vocab-library.ts:1-83;
e2e vocab-library-clone.spec.ts.
