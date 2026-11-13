---
type: reverse-usecase
feature: placement-test
uc: UC-07
status: draft
updated: "2026-11-12"
---

# UC-07 — Nộp bài, xem kết quả và đồng bộ điểm vào lead

## a. Tên

Nộp bài, xem kết quả CEFR ước tính và khóa học gợi ý, đồng bộ kết quả vào thông tin đã để lại.

## b. Mã UC / phạm vi

- Mã: UC-07; feature `placement-test`. ✅
- Phạm vi: chấm điểm, hiển thị kết quả, đồng bộ lead, làm lại/đăng ký; kết thúc hành trình học viên. ✅

## c. Tác nhân

- Học viên. ✅
- Hệ thống lead (nhận tóm tắt kết quả gắn vào lead). ✅

## d. Luồng chính

1. Hệ thống chấm ngay trong trình duyệt: mỗi câu trúng 1 điểm, câu bỏ trống 0 điểm; không trừ điểm sai. [FR-40, BR-08]
2. Tổng điểm được so vào bảng ngưỡng để chọn mức CEFR và khóa học gợi ý; nếu không ngưỡng nào khớp thì dùng ngưỡng cao nhất thấp hơn điểm. [FR-40]
3. Học viên xem màn kết quả: trình độ CEFR ước tính, khóa học gợi ý tham khảo, và thông điệp giải thích chi tiết đáp án được giữ cho việc chữa trực tiếp. [FR-41, BR-14]
4. Hệ thống gửi tóm tắt kết quả (tổng/trúng, đúng từng phần, nhãn CEFR, tối đa 300 ký tự) cập nhật vào lead đã tạo ở UC-05. [FR-42, BR-13]
5. Học viên có thể bấm "Đăng Ký Theo Kết Quả Này" để sang trang đăng ký, hoặc "🔄 Làm Lại" để làm lại (xóa bài, giữ thông tin), ; nút "Không phải bạn? Đổi thông tin" chỉ nằm ở bước thông tin, không ở màn kết quả. [FR-43]
6. Dữ liệu chấm dựa trên đáp án đúng đã được chuẩn hóa sẵn trong đề công khai (câu chưa đặt đáp án xem như chọn A). [FR-50]

## e. Luồng thay thế

- 4a. Request đồng bộ thất bại hoặc bị chặn: kết quả vẫn hiển thị bình thường; tóm tắt không được ghi vào lead (xem OQ-10). 🟡
- 5a. Làm lại: về trang chủ với thông tin cá nhân còn giữ, bài làm và kết quả bị xóa. ✅

## f. Hậu điều kiện

- Lead mang tóm tắt kết quả để GV liên hệ có ngữ cảnh. [BR-13]
- Bài làm và kết quả bị xóa khỏi trình duyệt sau "Làm Lại"; không còn bài dở. ✅

## g. Quy tắc liên quan

BR-08 (thang điểm đếm câu), BR-13 (đồng bộ lead), BR-14 (che đáp án chi tiết). ✅

## h. Truy vết

| Loại | Giá trị |
|------|---------|
| Nguồn | apps/profile/public/kiem-tra-dau-vao/grading.js:49-131; apps/profile/public/kiem-tra-dau-vao/test.js:1422-1465,1472-1644; packages/api/src/placement-test-contracts.ts:447-514 |
| Luồng | F8; SM-02 (RESULT) |
| Test | apps/e2e/specs/profile-placement-test.spec.ts:155-410 (đồng bộ lead + merge); apps/profile/tests/placement-test.test.mjs:116-229 (grading bands), :343-410 (buildLeadPayload, leadErrorMessage) |
