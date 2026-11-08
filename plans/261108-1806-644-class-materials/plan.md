# Plan: Ngân hàng tài liệu chung và tài liệu theo buổi học (#644)

Trạng thái: đang thực hiện. Issue: #644.

## Kết quả
Giáo viên quản lý ngân hàng tài liệu chung theo org (thư mục lồng nhau; file, link ngoài, audio/video), gắn tài liệu vào buổi học (lớp + ngày) bằng cách chọn từ ngân hàng hoặc upload mới (upload luôn vào ngân hàng). Học sinh đúng lớp xem chỉ đọc.

## Quyết định đã chốt
- Phạm vi kho: theo org (`orgId`), mọi giáo viên trong org dùng chung.
- Upload trong buổi học luôn lưu vào ngân hàng; buổi học chỉ tham chiếu.
- Xóa tài liệu đang dùng bị chặn, báo số buổi. Thư mục chỉ xóa được khi rỗng.
- Gắn theo (classId, date), không theo từng dòng `lesson`. Lớp legacy có `date` NULL chưa hỗ trợ.
- Giới hạn: 25 MB tài liệu, 100 MB audio/video. Whitelist: PDF, png/jpg/webp, docx/pptx/xlsx, mp3/m4a/mp4. Link chỉ http/https.
- Bucket R2 private mới `materials` (theo mẫu `libraryAudio`), đĩa ở e2e qua `MediaStore`.
- Học sinh tải qua endpoint server có kiểm tra enrollment, không có URL R2 công khai.

## Phase
1. Backend: schema + migration, contracts, route giáo viên và học sinh, bucket, wiring store, test.
2. Web (giáo viên): trang `/materials`, mục Tài liệu trong chi tiết buổi học, test, e2e.
3. Student: hiển thị tài liệu của buổi học, test.
4. Review độc lập, verify, POT.

## Ngoài phạm vi
Tag, chia sẻ cá nhân/đa org, soft-delete, học sinh upload, preview nhúng, thống kê lượt xem.
