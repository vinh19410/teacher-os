# Phase 2: Xử lý nhóm mức Trung bình

Các issue: #574, #575, #576, #577, #578, #579, #580.

## Thứ tự gợi ý

1. Lỗi cần tái hiện trước: #575 (điều hướng Chấm bài), #580 (cache trang Bài tập).
2. Lỗi đã rõ nguyên nhân: #576 (chip đang chọn), #577 (dạng đề Writing), #579 (giải thích rỗng, sau #571).
3. Tính năng cần chốt thiết kế: #574 (bài nhiều kỹ năng), #578 (đăng nhập qua email).

## Kiểm chứng

Làm theo mục "Hướng sửa" trong từng issue, dùng gate chung như phase 1. #576 sửa component dùng chung nên chạy `pnpm design:compare`.

## Rủi ro

- #574 chạm contract, luồng làm bài và luồng chấm nên cần plan riêng.
- #578 thay đổi xác thực nên cần review bảo mật.
