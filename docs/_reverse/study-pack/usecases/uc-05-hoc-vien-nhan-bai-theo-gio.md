---
feature: study-pack
type: reverse-usecase
uc: UC-05
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-05 — Học viên nhận bài theo giờ mở

## Mô tả

Học viên mở ứng dụng và thấy đúng các bài của bộ đề đã tới giờ mở; bài chưa tới
giờ không hiện ở danh sách và không làm được qua đường khác.

## Actor

- Chính: Học viên.

## Tiền điều kiện

- Học viên đang học trong lớp có bộ đề đang chạy.

## Hậu điều kiện

- Không đổi dữ liệu (việc làm bài thuộc feature quiz).

## Luồng chính

1. Học viên mở danh sách bài tập của lớp. ✅
   apps/student/src/components/overview/assignment-row.tsx:67-71
2. Hệ thống lọc bài theo thời điểm: chỉ trả bài có cột thời điểm mở rỗng hoặc
   đã qua. ✅ apps/server/src/lib/assignment-visibility.ts:1-16
3. Bài hiển thị kèm tên đề; học viên thấy ngày học của từng bài trên trang lớp
   (phía giáo viên xem cùng dữ liệu). ✅
   apps/web/src/components/classes/class-study-pack-section.tsx:352-369
4. Khi giờ mở tới, lần đọc sau trả thêm bài mà không cần thao tác nào khác —
   không có bộ định giờ. ✅
   plans/261101-1357-533-study-pack-scheduled-release/plan.md:19, :27

## Luồng thay thế / lỗi

- Đọc/làm bài trước giờ qua đường trực tiếp → E-31 (404). ✅
  apps/server/src/routes/student.ts:1354-1383, :918

## Quy tắc nghiệp vụ liên quan

- BR-02 (nội dung chưa sẵn sàng không vào lộ trình), BR-06 (khung giờ áp đều,
  múi giờ Việt Nam), BR-08 (huỷ chỉ gỡ bài chưa tới giờ mở và chưa có lần làm; bài đã mở được giữ —
  quyết định OQ-08), BR-11 (học viên không đọc bảng bộ đề), BR-12 (mở bài là
  đặc tính thời điểm đọc).

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-23 |
| NFR | NFR-06 |
| BR | BR-02, BR-06, BR-08, BR-11, BR-12 |
| E | E-01, E-31 |
| Luồng | F5 |
| Câu hỏi mở | OQ-08 (huỷ làm bài đã mở biến mất), OQ-09 (không thông báo khi mở bài) |

## Ghi chú

- Không có thông báo in-app/email khi bài mở — quyết định có ghi trong kế hoạch
  (OQ-09). ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:27
