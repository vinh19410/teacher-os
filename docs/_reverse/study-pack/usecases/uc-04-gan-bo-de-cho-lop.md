---
feature: study-pack
type: reverse-usecase
uc: UC-04
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# UC-04 — Gán bộ đề cho lớp theo lịch

## Mô tả

Giáo viên gán một bộ đề đang sẵn sàng vào lớp: chọn ngày bắt đầu, giờ mở và giờ
hạn trong ngày; hệ thống tính lịch theo ngày học (bỏ ngày nghỉ), vật hoá đề thư
viện, sinh bài giao cho từng mục và mục tiêu cho từng học viên đang học.

## Actor

- Chính: Giáo viên (nhóm vai "chốt bài").

## Tiền điều kiện

- Lớp thuộc trung tâm; bộ đề đang "Sẵn sàng" và có ít nhất một mục.

## Hậu điều kiện

- Lớp có một lượt gán đang chạy cho bộ đó; mọi bài giao có thời điểm mở tuyệt
  đối; học viên đang học có mục tiêu cho từng bài.

## Luồng chính

1. Giáo viên chọn bộ, ngày bắt đầu (dạng yyyy-mm-dd), giờ mở, giờ hạn. ✅
   packages/api/src/contracts.ts:4689-4716
2. Hộp thoại xem trước lịch chạy phía khách: số ngày học, bỏ qua ngày nghỉ
   kèm tên ngày nghỉ. ✅
   apps/web/src/components/classes/class-study-pack-section.tsx:41-72, :432-454
3. Gửi gán; máy chủ kiểm vai ghi và kiểm lớp thuộc trung tâm. ✅
   apps/server/src/routes/study-pack.ts:397-422
4. Thư viện gán kiểm bộ đang sẵn sàng và có mục. ✅
   apps/server/src/lib/study-pack-assign.ts:213-219, :292-308
5. Nếu lớp đang có lượt gán active cho bộ đó: cùng lịch thì tái dùng không tạo
   gì mới; khác lịch thì chặn. ✅
   apps/server/src/lib/study-pack-assign.ts:221-254, :336-363
6. Vật hoá từng mục thư viện thành đề của trung tâm theo khoá duy nhất
   (org, library_ref), đọc lại sau chèn. ✅
   apps/server/src/lib/study-pack-clone.ts:636-810
7. Tính lịch: ngày thứ n là ngày liên tiếp từ ngày bắt đầu, nhảy qua ngày nghỉ
   lớp/tổ chức; quy giờ mở/giờ hạn về thời điểm tuyệt đối múi giờ Việt Nam. ✅
   apps/server/src/lib/study-pack-assign.ts:47-79, :366-392
8. Tạo một lượt gán active, một bài giao mỗi mục (mã ghép lượt gán + mục, cột
   thời điểm mở ghi một lần), mục tiêu cho học viên đang học; ghi theo các lô
   nhỏ dưới trần 100 tham số của D1. ✅
   apps/server/src/lib/study-pack-assign.ts:315-455

## Luồng thay thế / lỗi

- Sai vai → E-03; sai kiểu nội dung/JSON/hợp đồng → E-04/E-05/E-06.
- Lớp không thấy → E-08; bộ chưa sẵn sàng → E-24; bộ rỗng mục → E-25.
- Đang chạy với lịch khác → E-23 ("study pack already active on class").
- Vật hoá hụt → E-22 hoặc E-26 (422).
- Gán đụng huỷ giữa chừng → E-27 kèm dọn dữ liệu vừa ghi. ✅
  apps/server/src/lib/study-pack-assign.ts:457-492
- Kiểm tại chỗ hộp thoại → E-33; lỗi mạng/server → E-34.

## Quy tắc nghiệp vụ liên quan

- BR-02 (bộ phải sẵn sàng), BR-05 (ngày liên tiếp bỏ ngày nghỉ), BR-06 (khung
  giờ áp đều, múi giờ Việt Nam), BR-07 (một bộ một lịch một lớp), BR-10 (mã
  bài suy từ mã mục nên gán lại không mất khớp), BR-12 (mở bài là lọc lúc đọc).

## Truy vết

| Loại | Mã |
|---|---|
| FR | FR-01, FR-03, FR-04, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-22 |
| NFR | NFR-02, NFR-03, NFR-04, NFR-05, NFR-06 |
| BR | BR-02, BR-05, BR-06, BR-07, BR-10, BR-12 |
| E | E-01, E-03..E-06, E-08, E-22..E-27, E-33, E-34 |
| Luồng | F4 |
| Câu hỏi mở | OQ-01 (vai mượn khối chấm), OQ-03 (trần), OQ-05 (part nghe), OQ-06 (ngày nghỉ), OQ-07 (múi giờ), OQ-10 (đổi lịch phải huỷ-gán lại) |

## Ghi chú

- Không có bộ định giờ: sau khi gán, việc "bài mở" chỉ phụ thuộc thời điểm đọc.
  ✅ plans/261101-1357-533-study-pack-scheduled-release/plan.md:19
