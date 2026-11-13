---
feature: study-pack
type: reverse-usecase
uc: UC-07
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-07 — Học viên vào lớp muộn nhận bài còn hạn

## Mô tả

Khi một học viên được kích hoạt vào lớp giữa chừng (duyệt vào lớp, chấp nhận
mời, kích hoạt lại), hệ thống bù mục tiêu cho các bài của bộ đề đang chạy mà
bài vẫn còn hạn nộp.

## Actor

- Chính: Học viên (kích hoạt bởi quy trình ghi danh).
- Phối hợp: Hệ thống kích hoạt ghi danh.

## Tiền điều kiện

- Lớp có ít nhất một bộ đề đang chạy; học viên vừa được kích hoạt.

## Hậu điều kiện

- Học viên có mục tiêu cho mọi bài còn hạn của các bộ đang chạy; bài đã quá hạn
  không sinh mục tiêu.

## Luồng chính

1. Quy trình ghi danh kích hoạt học viên (duyệt / chấp nhận mời / kích hoạt
   lại). ✅ apps/server/src/routes/enrollment-activation.ts
2. Cả ba đường kích hoạt gọi hàm bù mục tiêu cho học viên. ✅
   apps/server/src/routes/enrollment-activation.ts:697, :748, :769
3. Hàm bù lấy bài của các lượt gán đang chạy và chỉ chèn mục tiêu cho bài còn
   hạn (hạn nộp chưa qua); mục tiêu có sẵn thì bỏ qua. ✅
   apps/server/src/lib/study-pack-assign.ts:573-623, :596
4. Học viên thấy các bài đó đúng cổng giờ mở như mọi học viên khác (UC-05).

## Luồng thay thế / lỗi

- Không có mã lỗi hợp đồng riêng: đường bù chạy nội bộ; nếu lớp không có bộ đề
  nào thì bù không tạo gì. Bù không đụng bài giao thường của lớp (kiểm
  #572). ✅ apps/server/src/kernel.test.ts:6712-6737

## Quy tắc nghiệp vụ liên quan

- BR-08 (chỉ phần còn hạn được tiếp tục phát sinh cho người mới), BR-11 (học
  viên vẫn không đọc bảng bộ đề).

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-24 |
| NFR | NFR-04 |
| BR | BR-08, BR-11 |
| E | E-01 |
| Luồng | F7 |
| Câu hỏi mở | — |

## Ghi chú

- Đường bù có kiểm thử hồi quy bảo vệ "không lan sang bài giao tay". ✅
  apps/server/src/kernel.test.ts:6712-6737
