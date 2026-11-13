---
feature: vocab-hub
type: reverse-usecase
uc: UC-02
status: draft
updated: "2026-11-12"
---

# UC-02 — Tạo bộ từ vựng

## a. Tên use case

Tạo bộ từ vựng (bộ riêng ở hub, hoặc bộ gắn lớp ở trang lớp).

## b. Mã UC / phạm vi

UC-02 — feature vocab-hub; phạm vi: tạo bộ từ rỗng rồi soạn nội dung sau
(soạn từ thuộc UC-03).

## c. Tác nhân

Giáo viên.

## d. Luồng chính (truy vết FR)

1. Giáo viên bấm "Tạo bộ từ" (hub hoặc trang lớp). ✅ FR-05
   (vocab-deck-list.tsx:186-191).
2. Hộp "Tạo bộ từ vựng mới" mở với ô tiêu đề, placeholder "Ví dụ: Topic 1:
   Environment", lời dẫn khác nhau theo chế độ hub/lớp. ✅ FR-05
   (vocab-deck-list.tsx:222-257).
3. Giáo viên nhập tiêu đề → nút gửi bật. ✅ FR-05.
4. Gửi → POST tạo bộ từ với đích: hub gửi classId rỗng, lớp gửi classId lớp
   đó. ✅ FR-05, FR-22 (vocab-hub.test.tsx:21; data-actions.ts:293-344).
5. Máy chủ kiểm tra lớp (nếu có) cùng tổ chức → chèn vocab_deck → 201. ✅
   FR-05, BR-01 (vocab-teacher.ts:135-174).
6. Client làm mới bản chụp thành công → xoá ô tiêu đề, đóng hộp, dòng mới
   xuất hiện trong danh sách. ✅ FR-05, FR-22.

## e. Luồng thay thế (mã lỗi)

- 3a. Tiêu đề trắng hoặc đang lưu → nút gửi vô hiệu. ✅ FR-05.
- 4a. Thân không hợp lệ (tiêu đề > 200, thừa/thiếu trường) → 400. ✅ E-07
  (contracts.ts:3140-3156).
- 4b. Lớp thuộc tổ chức khác → 404. ✅ E-08 (vocab-teacher.ts:142-156; test :401).
- 4c. Định danh do client cung cấp mang tiền tố libcourse-/libdeck-/libword-
  → 400 (refine hợp đồng). ✅ BR-03, E-07 (contracts.ts:3137-3149; test :708).
- 5a. Xung đột định danh (trùng lặp) → 500. ✅ (vocab-teacher.ts:172) — hiếm,
  không có test riêng.
- 6a. Lệnh không về trạng thái làm-mới (mất mạng / máy chủ từ chối) → HỘP
  GIỮ NGUYÊN, KHÔNG thông báo nào. ✅ E-26 (vocab-deck-list.tsx:150-160);
  🟡 OQ-03.

## f. Hậu điều kiện

- vocab_deck mới tồn tại với lang mặc định "en", classId đúng đích (null ở
  hub); bản chụp tổ chức có thêm dòng; danh sách trên UI phản ánh.

## g. Quy tắc liên quan

BR-01 (sở hữu tổ chức), BR-02 (hai dạng bộ từ), BR-03 (tiền tố dành riêng),
BR-14 (release train khi đổi hợp đồng).

## h. Truy vết

FR-05, FR-22; E-07, E-08, E-26; F2; SM-02; OQ-03;
Nguồn: vocab-deck-list.tsx:133-161,222-257; vocab-teacher.ts:135-174;
contracts.ts:3140-3156; vocab-hub.test.tsx:21.
