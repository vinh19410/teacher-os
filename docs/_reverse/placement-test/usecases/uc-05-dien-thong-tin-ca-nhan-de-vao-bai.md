---
type: reverse-usecase
feature: placement-test
uc: UC-05
status: draft
updated: "2026-11-12"
---

# UC-05 — Điền thông tin cá nhân để vào bài (cổng lead)

## a. Tên

Học viên để lại thông tin cá nhân hợp lệ để được vào làm bài kiểm tra đầu vào.

## b. Mã UC / phạm vi

- Mã: UC-05; feature `placement-test`. ✅
- Phạm vi: từ lúc học viên mở trang công khai đến khi qua cổng thông tin thành công; không bao gồm làm bài (UC-06). Gồm cả việc nạp đề công khai vì bảo trì/404 quyết định có vào được cổng hay không. ✅

## c. Tác nhân

- Học viên (khách chưa đăng nhập). ✅
- Hệ thống lead (biên tính năng leads: nhận và tạo/cập nhật lead). ✅

## d. Luồng chính

1. Học viên mở trang "Bài Kiểm Tra Đầu Vào (CEFR & IELTS) | Cô Đỗ Thục Mỹ". [FR-44]
2. Trang nạp đề công khai của tổ chức lead; nhận snapshot gồm hai phần, các đoạn nghe với số lượt nghe và địa chỉ audio, cùng bảng ngưỡng. [FR-25, FR-26]
3. Học viên bấm bắt đầu và điền form thông tin: họ tên, số điện thoại Việt Nam, email, ngày sinh, mục tiêu học. [FR-32]
4. Trang xác thực dữ liệu (định dạng SĐT 10 số bắt đầu bằng 0, email hợp lệ khi nguồn là bài test đầu vào, ngày sinh hợp lệ) kèm các bộ phận chống bot ẩn. [FR-32, BR-11]
5. Trang gửi thông tin với nguồn cố định "placement-test" đến API lead công khai; nhận thành công thì vào Phần 1. [FR-33]
6. Nếu số điện thoại đã tồn tại trong thời gian cho phép, lead cũ được cập nhật thay vì tạo mới. [FR-34]

## e. Luồng thay thế

- 2a. Tính năng tắt hoặc chưa phát hành hoặc API lỗi: hiện "Bài kiểm tra đang bảo trì" mà không xóa bài làm dở. [E-27, E-28]
- 4a. SĐT/ngày sinh/tên không hợp lệ: thông báo lỗi theo từng trường. [E-32]
- 4b. Gửi quá nhanh hoặc dính ô ẩn: server bỏ qua im lặng. [E-33]
- 5a. Gửi quá tần suất hoặc vượt trần ngày: 429 và thông báo "Có quá nhiều lượt đăng ký..." tương ứng. [E-34]
- 5b. Lỗi máy chủ: thông báo hệ thống bận kèm hướng thử lại. [E-35]

## f. Hậu điều kiện

- Một lead nguồn "placement-test" tồn tại (mới hoặc vừa cập nhật) và học viên đang ở Phần 1. ✅
- Thông tin học viên được giữ cục bộ để dùng lại cho lần sau và cho việc làm lại bài. [BR-12]

## g. Quy tắc liên quan

BR-04 (chỉ tổ chức lead), BR-09 (bắt buộc thông tin hợp lệ), BR-11 (chống bot). ✅

## h. Truy vết

| Loại | Giá trị |
|------|---------|
| Nguồn | apps/profile/public/kiem-tra-dau-vao/index.html:1-58; apps/profile/public/kiem-tra-dau-vao/test.js:52-350,604-1129,1076-1086,1646-1671; apps/profile/public/kiem-tra-dau-vao/lead-gate.js:8-12,64-248; apps/server/src/routes/public-placement-test.ts:39-68; apps/server/src/routes/public-leads.ts:23-36,292-328; packages/api/src/lead-contracts.ts:146-231 |
| Luồng | F6; SM-02 (LOAD, MAINT, HOME, GATE) |
| Test | apps/e2e/specs/profile-placement-test.spec.ts:155-410 (luồng gate + đồng bộ), :412-534 (lỗi gate + 500 + Zalo); apps/server/src/routes/public-placement-test.test.ts:102-183 (503/404/200); apps/profile/tests/placement-test.test.mjs:268-410 (validateLeadForm, buildLeadPayload, leadErrorMessage) |
