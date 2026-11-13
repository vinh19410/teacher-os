---
feature: vocab-hub
type: reverse-usecase
uc: UC-04
status: draft
updated: "2026-11-12"
---

# UC-04 — Upload âm thanh phát âm

## a. Tên use case

Upload âm thanh phát âm cho từ (và nghe thử).

## b. Mã UC / phạm vi

UC-04 — feature vocab-hub; phạm vi: file tự upload của giáo viên; URL âm
thanh từ thư viện chỉ ĐỌC (FR-11), không nhập tay được (BR-04).

## c. Tác nhân

Giáo viên.

## d. Luồng chính (truy vết FR)

1. Trong hộp soạn (UC-03), dòng từ đã lưu có vùng thả/chọn file âm thanh với
   gợi ý "MP3/M4A/WAV · tối đa 50 MB". ✅ FR-10 (vocab-word-row.tsx:92-99).
2. Giáo viên chọn file → client kiểm MIME thuộc audio/* và kích thước ≤ 50
   MB (hằng dùng chung Speaking). ✅ FR-10 (editor.tsx:119-141;
   contracts.ts:2420-2423).
3. Client gửi PUT raw bytes kèm Content-Length. ✅ FR-10.
4. Máy chủ kiểm tuần tự: kho media tồn tại (503 nếu không), Content-Length
   (411), file rỗng (400), quá 50 MB (413), MIME trong 9 loại (415), từ tồn
   tại cùng tổ chức (404), độ lớn đọc được khớp khai báo (400). ✅ FR-10,
   BR-10 (vocab-teacher.ts:751-840).
5. Máy chủ sinh khóa vocab/{orgId}/{wordId}/{uuid}, ghi object, cập nhật
   audio_key của từ, xoá object cũ. ✅ FR-10, BR-03, BR-10
   (vocab-teacher.ts:816,827-837).
6. Dòng từ hiện nhãn "Đã có audio" (theo audio_key HOẶC audio_url từ thư
   viện). ✅ FR-11 (vocab-word-row.tsx:87-91).
7. Giáo viên bấm nghe → GET audio qua máy chủ (không qua CDN). ✅ FR-11
   (vocab-teacher.ts:842-880).

## e. Luồng thay thế (mã lỗi)

- 2a. File quá trần hoặc sai nhóm MIME → client tự chặn, toast "Không upload
  được file âm thanh phát âm." ✅ E-28 (editor.tsx:119-141).
- 4a. Thiếu Content-Length → 411 (E-15); file rỗng → 400 (E-16); quá 50 MB →
  413 (E-17); MIME ngoài 9 loại → 415 VOCAB_INVALID_AUDIO (E-18, test :237);
  từ lạ → 404 (E-12); lệch độ lớn → 400 (E-19). ✅ (đã cite ở d.4)
- 4b. Chưa cấu hình kho media → 503. ✅ E-14 (vocab-teacher.ts:759-762).
- 7a. Chưa có file / object mất → 404 VOCAB_AUDIO_NOT_FOUND. ✅ E-20
  (vocab-teacher.ts:862-875).
- 7b. Nghe audio thư viện đi qua cùng endpoint đọc; file server-side khác
  nguồn (CDN URL) thì phát trực tiếp từ URL đã chép. ✅ FR-11, BR-04;
  🟡 OQ-08.

## f. Hậu điều kiện

- vocab_word.audio_key trỏ object mới; object cũ đã xoá; nhãn "Đã có audio"
  bật; minigame listening phía học viên tự eligible (chú thích schema khi cả
  hai nguồn null thì không eligible — ranh giới).

## g. Quy tắc liên quan

BR-03 (khóa do server sinh, client không truyền), BR-04 (URL chỉ từ clone),
BR-10 (9 MIME + khai báo độ lớn + khớp thực tế), BR-14 (release train).

## h. Truy vết

FR-10, FR-11, FR-22; E-09, E-12, E-14, E-15, E-16, E-17, E-18, E-19, E-20,
E-28; F3; SM-10;
Nguồn: vocab-word-row.tsx:87-123; vocab-deck-editor.tsx:119-141;
vocab-teacher.ts:41-51,751-880; contracts.ts:2420-2423,3175-3177;
vocab-teacher.test.ts:146,237; media-store.ts:36-40.
