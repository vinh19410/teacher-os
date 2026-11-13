---
type: reverse-usecase
feature: placement-test
uc: UC-03
status: draft
updated: "2026-11-12"
---

# UC-03 — Tải lên và nghe thử audio đoạn nghe

## a. Tên

Tải lên file âm thanh cho một đoạn nghe và nghe thử ngay trên màn soạn đề.

## b. Mã UC / phạm vi

- Mã: UC-03; feature `placement-test`. ✅
- Phạm vi: chọn file, kiểm tra, tải lên, gắn vào đoạn nghe, nghe thử; không bao gồm phát hành (UC-04). ✅

## c. Tác nhân

- Giáo viên/Chủ trung tâm. ✅

## d. Luồng chính

1. GV mở trường audio của một đoạn nghe và chọn file âm thanh (mp3/m4a/aac/wav/webm/ogg). [FR-13]
2. Trình duyệt kiểm tra định dạng và dung lượng tối đa 20 MB trước khi gửi. [FR-13]
3. Hệ thống tải file lên kèm thanh tiến trình và tên file; server kiểm tra lại chiều dài, kiểu, tên, dung lượng thực. [FR-13, FR-14]
4. Server lưu file vào kho đối tượng theo khóa riêng của tổ chức và ghi dòng thông tin audio; trả mã audio. [FR-15]
5. Đoạn nghe hiển thị tên file và nút nghe thử; GV bấm "Nghe thử" để phát ngay qua địa chỉ tạm trong trình duyệt. [FR-16]

## e. Luồng thay thế

- 2a. Định dạng không hỗ trợ: chặn với thông báo "Định dạng file âm thanh không được hỗ trợ.". [E-23]
- 2b. Dung lượng vượt 20 MB: chặn với thông báo "Dung lượng file âm thanh không được vượt quá 20 MB.". [E-22]
- 3a. Server từ chối (thiếu/không hợp lệ chiều dài hoặc tên file xấu hoặc thân rỗng): lỗi 400. [E-21]
- 3b. Dung lượng thực khác với khai báo: hủy file đã lưu và trả 400. [E-24]
- 5a. Nghe thử thất bại hoặc dữ liệu không phải âm thanh: thông báo lỗi nghe thử tương ứng. [E-38]

## f. Hậu điều kiện

- Đoạn nghe gắn mã audio hợp lệ thuộc tổ chức; file nằm trong kho đối tượng và có dòng thông tin kèm tên/kiểu/dung lượng. ✅
- Audio không còn được tham chiếu sau khi phát hành sẽ tự được dọn sau 24 giờ (thuộc UC-04). [BR-06]

## g. Quy tắc liên quan

BR-06 (audio là tài nguyên tổ chức; dọn rác 24 giờ). ✅

## h. Truy vết

| Loại | Giá trị |
|------|---------|
| Nguồn | apps/web/src/components/placement-test/clip-audio-field.tsx:60-188; apps/web/src/lib/repos/placement-test.ts:114-237; apps/server/src/routes/placement-test.ts:272-361,53-107; packages/api/src/library-contracts.ts:43-54; packages/api/src/lib/quiz-media.ts:68; packages/db/src/schema/placement-test.ts:35-51 |
| Luồng | F4 |
| Test | apps/e2e/specs/placement-test-editor.spec.ts:209-230 (thay audio + nghe thử blob); apps/server/src/routes/placement-test.test.ts:399-450 (CORP + 404 chéo tổ chức) |
