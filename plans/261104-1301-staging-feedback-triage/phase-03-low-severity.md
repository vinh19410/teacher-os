# Phase 3: Xử lý nhóm mức Thấp

Các issue: #581, #582, #583, #584, #585, #586, #587.

## Thứ tự gợi ý

1. Sửa nhanh: #586 (chữ nút mờ, gồm 3 vị trí dùng `text-bg`), #582 (lối ra khi dùng tài khoản giáo viên).
2. Cần xem lại trên staging: #581 (thanh Lưu đang `sticky` trong source).
3. Cần chốt thiết kế: #585 (mở rộng danh sách band), #583, #584, #587.

## Kiểm chứng

Làm theo mục "Hướng sửa" trong từng issue, dùng gate chung như phase 1.

## Rủi ro

- #585 mở rộng enum band trong contract, cần kiểm tra chỗ khác đang giả định chỉ có 6.0 đến 7.5.
