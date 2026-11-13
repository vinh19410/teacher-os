---
feature: study-pack
type: reverse-usecase
uc: UC-06
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-06 — Huỷ bộ đề đang chạy trên lớp

## Mô tả

Giáo viên huỷ một bộ đề đang chạy trên lớp. Hệ thống gỡ mọi bài giao chưa tới giờ mở tính tới thời điểm huỷ và chưa có
lần làm nào; bài đã mở (dù chưa ai làm) và phần đã phát sinh lần làm của học
viên được giữ nguyên.

## Actor

- Chính: Giáo viên (nhóm vai "chốt bài").

## Tiền điều kiện

- Lớp có lượt gán bộ đề đang chạy.

## Hậu điều kiện

- Lượt gán chuyển "Đã huỷ" kèm thời điểm; bài chưa tới giờ mở và chưa có lần làm bị xoá; bài đã mở (dù chưa ai làm)
  và bài có lần làm giữ nguyên toàn vẹn.

## Luồng chính

1. Giáo viên bấm huỷ trên dòng bộ đề của lớp và xác nhận. ✅
   apps/web/src/components/classes/class-study-pack-section.tsx:216-228
2. Máy chủ kiểm vai ghi; tìm lượt gán theo org + lớp + mã lượt. ✅
   apps/server/src/routes/study-pack.ts:424-451
3. Huỷ ghi trong một lô: đặt trạng thái "cancelled" và thời điểm huỷ (giữ thời
   điểm cũ nếu huỷ lại), xoá mục tiêu và mọi bài giao chưa tới giờ mở (tính tới thời điểm huỷ) chưa
có lần làm nào. ✅
   apps/server/src/lib/study-pack-assign.ts:521-566, :140-192
4. Bảng lớp hiển thị bộ chuyển sang nhãn "Đã huỷ". ✅
   apps/web/src/components/classes/class-study-pack-section.tsx:297-302

## Luồng thay thế / lỗi

- Sai vai → E-03; lớp không thấy → E-08; mã lượt không thấy/khác lớp → E-28
  (404); lỗi UI → E-34.
- Huỷ đan ngang lúc gán: bên gán phát hiện và dọn theo mốc thời điểm huỷ, trả
  E-27. ✅ apps/server/src/lib/study-pack-assign.ts:457-492

## Quy tắc nghiệp vụ liên quan

- BR-08: huỷ không xoá dấu vết đã phát sinh — bài đã có lần làm giữ nguyên.

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-03, FR-21, FR-22 |
| NFR | NFR-03, NFR-04 |
| BR | BR-08 |
| E | E-01, E-03, E-08, E-28, E-34 |
| Luồng | F6 |
| Câu hỏi mở | OQ-08 (tuỳ chọn dọn sâu/thông báo), OQ-09 (không thông báo) |

## Ghi chú

- Muốn đổi lịch bộ đang chạy, quy trình V1 là huỷ rồi gán lại (lượt gán mới —
  tiến độ cũ không hồi về, INF-03). ✅
  plans/261101-1357-533-study-pack-scheduled-release/plan.md:42
