---
type: reverse-usecase
feature: placement-test
uc: UC-02
status: draft
updated: "2026-11-12"
---

# UC-02 — Soạn và lưu bản nháp bộ đề

## a. Tên

Soạn nội dung bộ đề (câu hỏi, đoạn nghe, ngưỡng CEFR) và lưu bản nháp an toàn giữa nhiều tab.

## b. Mã UC / phạm vi

- Mã: UC-02; feature `placement-test`. ✅
- Phạm vi: chỉnh sửa nội dung + lưu nháp + xử lý xung đột lưu; không bao gồm tải audio (UC-03) và phát hành (UC-04). ✅

## c. Tác nhân

- Giáo viên/Chủ trung tâm. ✅

## d. Luồng chính

1. GV sửa câu hỏi Phần 1: phân loại, cấp độ, nội dung, 4 đáp án, chọn đáp án đúng. [FR-06]
2. GV sửa đoạn nghe Phần 2: tiêu đề, cấp độ, số lượt nghe tối đa, danh sách câu hỏi. [FR-07]
3. GV khai bảng ngưỡng điểm sang CEFR và khóa học đề xuất, đối chiếu tổng số câu hiển thị. [FR-08]
4. GV bấm "Lưu nháp": hệ thống gửi toàn bộ nội dung kèm số hiệu hiện tại; thành công thì số hiệu tăng lên và hiện "Đã lưu bản nháp.". [FR-10]
5. Màn hình phản ánh trạng thái "có thay đổi chưa lưu" / "có thay đổi chưa phát hành" tương ứng. [FR-45]

## e. Luồng thay thế

- 1a. Nội dung vượt trần (tổng 100 câu, độ dài trường, số lượng) hoặc thiếu trường bắt buộc: bị chặn khi lưu với thông báo như "Tổng số câu hỏi không được vượt quá 100 câu.". [E-08, FR-09, FR-49]
- 4a. Hai nơi cùng lưu một số hiệu (kể cả lần đầu): request sau nhận 409 xung đột; màn hình hiện banner "Đề đã được sửa ở tab khác, tải lại để tiếp tục" và bắt tải lại trước khi sửa tiếp. [E-04, E-30, FR-11]
- 4b. Gửi sai kiểu nội dung / quá 256 KB: nhận lỗi tương ứng từ server. [E-06, E-07]
- 1b. GV định rời trang khi còn thay đổi chưa lưu: hộp thoại cảnh báo mất thay đổi; đóng tab cũng bị chặn. [FR-12]

## f. Hậu điều kiện

- Bản nháp mới nhất của tổ chức đúng bằng nội dung GV vừa lưu; số hiệu tăng 1 sau mỗi lần lưu thành công. ✅
- Nếu đề đã phát hành trước đó: bản công khai không đổi; cờ "có thay đổi chưa phát hành" bật lại. [BR-02]

## g. Quy tắc liên quan

BR-02 (nháp tách khỏi bản phát hành), BR-03 (vai trò), BR-07 (điều kiện hợp lệ áp từ lúc lưu). ✅

## h. Truy vết

| Loại | Giá trị |
|------|---------|
| Nguồn | apps/web/src/routes/_auth/placement-test/index.tsx:165-269,194-211; apps/web/src/components/placement-test/question-card.tsx:69-197; apps/web/src/components/placement-test/clip-card.tsx:124-225; apps/web/src/components/placement-test/bands-editor.tsx:47-130; apps/web/src/lib/repos/placement-test.ts:92-112; apps/server/src/routes/placement-test.ts:121-132,179,183-270; packages/api/src/placement-test-contracts.ts:19-136 |
| Luồng | F3 |
| Test | apps/server/src/routes/placement-test.test.ts:269-326 (CAS, 5 case 409/trúng), :238-267 (403 vai trò + origin); apps/web/src/routes/_auth/placement-test/index.test.tsx:191-243 (409); apps/web/src/components/placement-test/content-model.test.ts (3 it CRUD) |
