---
feature: study-pack
type: reverse-usecase
uc: UC-08
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-08 — Theo dõi tiến độ làm bài của lớp

## Mô tả

Giáo viên xem trên trang lớp danh sách bộ đề đang chạy và đã huỷ, kèm bảng bài
theo ngày: trạng thái đã mở/chưa đến giờ, số đã nộp trên tổng học viên, nộp trễ.

## Actor

- Chính: Giáo viên (nhóm vai "rà chấm" để xem).

## Tiền điều kiện

- Đã đăng nhập; lớp thuộc trung tâm.

## Hậu điều kiện

- Không đổi dữ liệu.

## Luồng chính

1. Giáo viên mở tab "Buổi học & luyện tập" trên trang lớp và chọn chế độ
   "Bộ đề tự học". ✅ apps/web/src/routes/_auth/classes/$classId.tsx:312, :340-366
2. Hệ thống kiểm vai xem và lấy các lượt gán của lớp. ✅
   apps/server/src/routes/study-pack.ts:378-395, :380-381
3. Máy chủ gắn cờ mở bài theo thời điểm hiện tại, đếm tổng mục tiêu và số đã
   nộp cho từng bài, sắp bài trong pack theo ngày học và vị trí mục. ✅
   apps/server/src/lib/study-pack-assign.ts:827-881
4. Bảng hiển thị từng ngày học với huy hiệu "Đã mở"/"Chưa đến giờ" và thanh
   tiến độ nộp. ✅
   apps/web/src/components/classes/class-study-pack-section.tsx:352-369
5. Số "đã nộp" ưu tiên thời điểm nộp thật từ lượt làm bài; thời điểm ghi trên
   mục tiêu chỉ là dự phòng. ✅ (FR-26)

## Luồng thay thế / lỗi

- Sai vai xem → E-02; lớp không thấy → E-08; lỗi mạng/server → E-34.

## Quy tắc nghiệp vụ liên quan

- BR-06 (nhãn "Đã mở" theo cùng khung giờ của bộ).

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-02, FR-25, FR-26 |
| NFR | NFR-07 |
| BR | BR-06 |
| E | E-01, E-02, E-08, E-34 |
| Luồng | F8 |
| Câu hỏi mở | OQ-09 (không thông báo — giáo viên theo dõi thủ công), OQ-10 (sửa bộ giữa chừng không đổi bảng đang chạy) |

## Ghi chú

- Huỷ hiển thị dưới dạng "Đã huỷ" trong cùng bảng. ✅
  apps/web/src/components/classes/class-study-pack-section.tsx:297-302
