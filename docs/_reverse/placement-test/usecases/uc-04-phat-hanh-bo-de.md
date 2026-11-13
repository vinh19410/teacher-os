---
type: reverse-usecase
feature: placement-test
uc: UC-04
status: draft
updated: "2026-11-12"
---

# UC-04 — Phát hành bộ đề

## a. Tên

Phát hành bộ đề để có hiệu lực ngay trên trang kiểm tra đầu vào của học viên.

## b. Mã UC / phạm vi

- Mã: UC-04; feature `placement-test`. ✅
- Phạm vi: từ bấm "Phát hành" đến khi phiên bản mới có hiệu lực và dọn audio mồ côi; không bao gồm soạn (UC-02, UC-03). ✅

## c. Tác nhân

- Giáo viên/Chủ trung tâm. ✅
- Hệ thống (kiểm tra hợp lệ, tạo snapshot, dọn audio). ✅

## d. Luồng chính

1. GV bấm "Phát hành": hệ thống tự lưu nháp trước. [FR-17]
2. Hệ thống kiểm tra hợp lệ ngay trên trình duyệt; còn lỗi thì chặn, đếm lỗi và cuộn tới lỗi đầu tiên. [FR-17]
3. Hộp thoại xác nhận "Xác nhận phát hành bộ đề (vN)" cảnh báo: đề mới có hiệu lực ngay và học viên đang làm dở bản cũ sẽ phải làm lại từ đầu khi tải lại trang; GV bấm "Xác nhận phát hành". [FR-18]
4. Server kiểm tra lại toàn bộ nội dung (đủ phần, đủ đoạn nghe có audio, câu hỏi hợp lệ, bảng ngưỡng phủ 0..tổng câu, khóa gợi ý hợp lệ). [FR-20, FR-21, BR-07]
5. Server tạo bản snapshot bất biến cho phiên bản kế tiếp, ghi thời điểm và người phát hành theo cơ chế so sánh số hiệu. [FR-19]
6. Giao diện hiện "Đã phát hành bộ đề vN." và cờ thay đổi được xóa. [FR-19]
7. Hệ thống dọn các audio không còn được tham chiếu và cũ hơn 24 giờ trong nền. [FR-23]

## e. Luồng thay thế

- 2a. Lỗi nội dung phía client: "Chưa thể phát hành: còn N lỗi cần kiểm tra." kèm banner liệt kê lỗi. [E-20]
- 4a. Nháp không đọc được: 422 với thông điệp "Bản nháp không đúng định dạng.". [E-09]
- 4b. Thiếu câu Phần 1 / thiếu đoạn nghe / thiếu audio / thiếu câu trong đoạn: các thông báo thiếu tương ứng. [E-10, E-11, E-12, E-13]
- 4c. Đáp án trống/trùng/thiếu đúng: các thông báo đáp án tương ứng; mã câu hoặc mã đoạn trùng nhau bị chặn. [E-14, E-15]
- 4d. Ngưỡng không hợp lệ (thiếu, không từ 0, chồng lấn, hở khoảng, không kết thúc đúng tổng câu) hoặc khóa gợi ý ngoài danh mục: chặn với thông báo ngưỡng tương ứng. [E-16, E-17, E-18]
- 4e. Audio thuộc tổ chức khác: 422 với thông báo "File âm thanh không tồn tại hoặc không thuộc tổ chức này.". [E-19]
- 3a. Hủy hộp thoại: quay lại màn soạn không có gì thay đổi. ✅
- 5a. Số hiệu đã bị thay đổi: 409 xung đột; màn hình yêu cầu tải lại trạng thái mới nhất. [E-05, E-30]
- 4f. Server từ chối 422 sau khi client đã duyệt: toast "Phát hành bị từ chối (N lỗi nội dung)." và banner liệt kê lỗi. [E-31]

## f. Hậu điều kiện

- Trang công khai phục vụ phiên bản mới; phiên bản tăng 1; bản nháp giữ nguyên để chỉnh tiếp. [BR-02, BR-05]
- Không thể quay về phiên bản cũ bằng API (xem OQ-01, OQ-02). 🟡

## g. Quy tắc liên quan

BR-02, BR-05, BR-06, BR-07. ✅

## h. Truy vết

| Loại | Giá trị |
|------|---------|
| Nguồn | apps/web/src/routes/_auth/placement-test/index.tsx:104-126,271-332,492-524; apps/web/src/components/placement-test/publish-dialog.tsx:31-66; apps/server/src/routes/placement-test.ts:33-34,53-107,407-533; packages/api/src/placement-test-contracts.ts:285-514 |
| Luồng | F5; SM-01 |
| Test | apps/server/src/routes/placement-test.test.ts:269-326 (publish sai revision 409), :328-397 (draft sau publish), :452-532 (422 ngưỡng + GC D11), :399-450 (cross-org 422); apps/web/src/routes/_auth/placement-test/index.test.tsx:166-189 (banner ngưỡng), :245-310 (422); apps/e2e/specs/placement-test-editor.spec.ts:121-142,232-259 (sửa ngưỡng, phát hành v1/v2, Range 206) |
