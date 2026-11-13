---
type: reverse-usecase
feature: placement-test
uc: UC-06
status: draft
updated: "2026-11-12"
---

# UC-06 — Làm bài kiểm tra hai phần với giới hạn lượt nghe

## a. Tên

Làm bài kiểm tra đầu vào gồm Phần 1 (Ngữ pháp + Từ vựng) và Phần 2 (Nghe hiểu) với giới hạn số lượt nghe mỗi đoạn.

## b. Mã UC / phạm vi

- Mã: UC-06; feature `placement-test`. ✅
- Phạm vi: từ khi vào Phần 1 đến trước khi chấm điểm; gồm tự lưu, phát audio, xác nhận nộp khi còn câu trống. ✅

## c. Tác nhân

- Học viên. ✅
- Hệ thống (phục vụ đề và audio công khai). ✅

## d. Luồng chính

1. Hệ thống phục vụ đề và audio công khai cho trình duyệt học viên; audio hỗ trợ nghe từng phần dữ liệu để tương thích trình duyệt di động. [FR-26, FR-27, FR-28]
2. Hệ thống gắn chính sách chia sẻ tài nguyên cho audio để trang profile cùng site đọc được audio qua API riêng tư của GV khi nghe thử; tổ chức khác thì không. [FR-29]
3. Học viên trả lời Phần 1 bằng cách chọn 1 trong 4 đáp án cho từng câu; bộ đếm hiển thị "Đã trả lời: X/Y câu". [FR-35]
4. Mỗi lựa chọn được tự lưu vào trình duyệt; tải lại trang tiếp tục đúng chỗ đang làm. [FR-36]
5. Sang Phần 2, học viên bấm phát audio từng đoạn: mỗi lượt phát trừ một lượt theo giới hạn GV đặt; âm thanh phát xong tự quay về đầu, không tua lại. [FR-37, FR-38, BR-10]
6. Học viên bấm nộp bài; nếu còn câu chưa chọn, hệ thống hỏi xác nhận với nội dung đếm số câu bỏ trống và cho chọn nộp hoặc quay lại. [FR-39]

## e. Luồng thay thế

- 1a. Đề có phiên bản mới hơn bài đang làm dở: đặt lại về đầu nhưng giữ thông tin cá nhân đã điền. [FR-31]
- 2a. API đề hoặc audio lỗi giữa chừng: hiện "Bài kiểm tra đang bảo trì" và giữ nguyên bài làm dở. [E-28]
- 5a. Tải audio lỗi: hoàn lại một lượt nghe và thông báo không bị trừ lượt. [E-29]
- 5b. Hết lượt nghe: nút phát bị vô hiệu với nhãn "Đã hết lượt nghe". [E-29, FR-37]
- 6a. Chọn "Quay lại làm tiếp": ở lại Phần 2 sửa tiếp. ✅

## f. Hậu điều kiện

- Tập đáp án đầy đủ nằm trong trình duyệt học viên; bài làm dở (nếu chưa nộp) lưu sẵn để tiếp tục. [BR-12]
- Số lượt nghe đã trừ đúng số lần phát thành công. ✅

## g. Quy tắc liên quan

BR-10 (giới hạn lượt nghe), BR-12 (bài làm dở theo phiên bản đề). ✅

## h. Truy vết

| Loại | Giá trị |
|------|---------|
| Nguồn | apps/profile/public/kiem-tra-dau-vao/test.js:17,1139-1470,1302-1349; apps/profile/public/kiem-tra-dau-vao/grading.js:13-40; apps/server/src/routes/public-placement-test.ts:70-171; apps/server/src/app.ts:325-328; packages/api/src/placement-test-contracts.ts:447-514 |
| Luồng | F7; SM-02 (P1, P2), SM-03 |
| Test | apps/e2e/specs/profile-placement-test.spec.ts:535-663 (viewport, bàn phím, hoàn lượt nghe, xác nhận bỏ trống); apps/e2e/specs/placement-test-editor.spec.ts:236-259 (Range 206), :261-283 (API lỗi giữ localStorage); apps/server/src/routes/public-placement-test.test.ts:185-292 (audio 200/206/416/404) |
