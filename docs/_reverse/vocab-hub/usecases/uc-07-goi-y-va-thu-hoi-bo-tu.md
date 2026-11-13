---
feature: vocab-hub
type: reverse-usecase
uc: UC-07
status: draft
updated: "2026-11-12"
---

# UC-07 — Gợi ý và thu hồi bộ từ cho học viên

## a. Tên use case

Gợi ý bộ từ cho học viên và thu hồi gợi ý.

## b. Mã UC / phạm vi

UC-07 — feature vocab-hub; phạm vi: phía giáo viên. Học viên chấp nhận/từ
chối gợi ý thuộc student-practice (FR-23) — chỉ nháy chéo.

## c. Tác nhân

Giáo viên (đối tượng: học viên cùng tổ chức).

## d. Luồng chính (truy vết FR)

1. Giáo viên bấm "Gợi ý" trên dòng bộ từ. ✅ FR-12 (vocab-deck-list.tsx:73).
2. Hộp mở: tải lịch sử gợi ý FRESH từ máy chủ (kể cả khi bản chụp chưa làm
   mới); chọn học viên (mặc định học viên đầu tiên); ghi chú tuỳ chọn ≤ 500
   ký tự; lời dẫn giải thích học viên sẽ thấy bộ trong "Gợi ý cho bạn"
   (không bắt buộc). ✅ FR-12, FR-14 (vocab-suggest-dialog.tsx:84-142,218-226).
3. Gửi → POST suggest. ✅ FR-22.
4. Máy chủ kiểm bộ từ + học viên cùng tổ chức (404 nếu sai); tra dòng cũ theo
   duy nhất (student, deck): chưa có → INSERT pending 201; đang chờ hoặc đã
   chấp nhận → 200 trả id cũ (không tạo mới); đã ẩn → flip pending, reset
   note/teacherId/createdAt/respondedAt. ✅ FR-12, BR-06
   (vocab-teacher.ts:339-454).
5. Client tải lại lịch sử → toast "Đã gửi gợi ý bộ từ vựng cho học viên.";
   dòng "chờ" của bộ tăng lên, huy hiệu "{n} chờ" trên hub cập nhật sau lần
   làm mới bản chụp. ✅ FR-14, BR-07 (vocab-suggest-dialog.tsx:150-171;
   vocab-deck-list.tsx:125-131).
6. Thu hồi: nút "Thu hồi" trên dòng đang chờ → POST revoke → máy chủ flip
   dismissed MỀM, GIỮ respondedAt → toast "Đã thu hồi gợi ý bộ từ vựng.",
   lịch sử tải lại. ✅ FR-13 (vocab-suggest-dialog.tsx:68-79,173-188;
   vocab-teacher.ts:456-496).

## e. Luồng thay thế (mã lỗi)

- 2a. Tổ chức không có học viên → "Chưa có học viên nào trong trung tâm." ✅
  E-31 (vocab-suggest-dialog.tsx:222-225).
- 3a. Ghi chú > 500 ký tự → 400 (client cũng chặn bằng maxLength). ✅ E-07
  (contracts.ts:3379-3387; dialog :261).
- 4a. Bộ từ lạ/khác tổ chức → 404 E-09; học viên lạ/khác tổ chức → 404 E-10. ✅
  (vocab-teacher.ts:346-377).
- 4b. Đua tranh duy nhất → select lại trả 200; không thấy dòng → 500 (bảo vệ
  kiểu, không test kích hoạt). ✅ E-25 (vocab-teacher.ts:440-453; GAP-2).
- 6a. Gợi ý lạ/khác tổ chức → 404 VOCAB_SUGGESTION_NOT_FOUND. ✅ E-13
  (vocab-teacher.ts:474-482; test :453).
- 6b. Trạng thái lạ từ server → UI quy về "Đang chờ". ✅ FR-14
  (vocab-teacher.ts:320-323).
- 6c. Thu hồi gợi ý ĐÃ ĐƯỢC CHẤP NHẬN vẫn được (route không kiểm status). ✅
  FR-13; 🟡 OQ-06.
- (cross) Phía học viên đã chấp nhận rồi thu hồi → mất quyền truy cập bên
  cổng học; mã SUGGESTION_ALREADY_ACCEPTED nằm ở route học viên. ✅ FR-23
  (routes/vocab.ts:861).

## f. Hậu điều kiện

- vocab_suggestion tồn tại duy nhất theo (student, deck) với trạng thái
  pending (mới/flip) hoặc dismissed (thu hồi); snapshot tổ chức chỉ phơi
  pending nên "GỢI Ý CHỜ" và "{n} chờ" giảm khi thu hồi.

## g. Quy tắc liên quan

BR-01 (sở hữu), BR-06 (duy nhất + idempotent + flip), BR-07 (snapshot chỉ
pending), BR-13 (không đụng thẻ/nhật ký).

## h. Truy vết

FR-12, FR-13, FR-14, FR-22, FR-23; E-07, E-09, E-10, E-13, E-25, E-31; F5;
SM-03, SM-07; OQ-06, OQ-07;
Nguồn: vocab-suggest-dialog.tsx:10-14,68-79,84-142,150-194,218-285;
vocab-teacher.ts:277-496; schema/vocab.ts:159-203; vocab-teacher.test.ts:453;
e2e vocab-hub-suggestion.spec.ts.
