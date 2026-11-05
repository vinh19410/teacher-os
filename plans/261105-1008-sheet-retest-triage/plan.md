---
title: "Tái hiện feedback re-test staging 05/11 và tạo GitHub issue"
description: "Đối chiếu các dòng còn mở của sheet staging với develop, tạo #614–#618 cho 5 lỗi đã tái hiện và ghi lại các dòng chưa xác minh được."
status: pending
priority: P2
effort: chưa ước lượng
issue: 614-618
branch: develop
tags: [triage, staging, web, student]
blockedBy: []
blocks: []
created: 2026-11-05
---

# Plan: Tái hiện feedback re-test staging 05/11

## Outcome

Mỗi dòng còn mở trên sheet "TeacherOS staging - Theo dõi lỗi" có trạng thái dựa trên bằng chứng, và mỗi lỗi đã tái hiện có một GitHub issue.

## Non-goals

- Plan này không sửa code. Mỗi issue có plan chi tiết khi được thực hiện.
- Không tạo issue cho dòng có nhãn góp ý (24, 28, 30) khi chưa có quyết định của người dùng.
- Không tạo issue mới cho phần còn thiếu của #583 và #585, vì hai issue đó vẫn mở.

## Cách xác minh

Chạy spec Playwright tạm trên `develop` với stack e2e riêng (cổng 8100–8105), spec đã xoá sau khi chạy. Staging được kiểm tra trên tài khoản giáo viên bằng thao tác đọc, cộng một đề thử ở trạng thái Bản nháp đã được người dùng cho phép. Chưa có phiên học viên trên staging, nên dòng 17 và 32 chưa chạy được ở đó.

## Issue đã tạo

| Issue | Dòng sheet | Nội dung | Mức độ |
|---|---|---|---|
| #614 | 21 | Bài đã lưu trong ngân hàng đề không sửa được | Trung bình |
| #615 | 22 | Chữ gõ trong ô nhận xét lúc đang lưu bị mất | Trung bình |
| #616 | 25 | Tab Lời mời đang chờ trống dù có nhãn Chờ xác nhận | Trung bình |
| #617 | 26 | Dòng mục tiêu hiện `Band — ()` | Trung bình |
| #618 | 32 | Trang chi tiết bài không cập nhật điểm sau khi chấm | Trung bình |

Không suy đoán quan hệ `blocked-by`; các issue độc lập với nhau.

## Dòng chưa xác minh được

| Dòng | Kết quả trên local | Việc còn lại |
|---|---|---|
| 17 | Trang Bài tập hiện bài mới sau 3 giây, chuông báo trong 16 giây. Tổng quan đang mở không tự cập nhật. | Leah re-test sau khi tải lại hẳn trang |
| 22 | IME giả lập không mất chữ | Thử trên máy cô Mỹ với bộ gõ thật |
| 26 | Flash "Something went wrong!" hiện 1 trong 4 lần trên staging, local không tái hiện | Tái hiện trên bản build production để bắt lỗi (#617) |
| 27 | Lỗi tải lại có thông báo đúng và không tạo đề trùng. Trên staging, lưu 1 đề thử thành công sau khoảng 2,1 giây | Ghi lại giờ và thông báo nếu cô Mỹ gặp lại |
| 29 | Trang không tự cuộn khi gõ ở desktop và mobile | Hỏi Leah thiết bị và thao tác |
| 31 | Trên staging, tải hẳn trang chấm khoảng 1,7 giây, chưa đạt mức 2–5 giây | Đo trên máy và mạng của cô Mỹ nếu còn gặp |

## Acceptance criteria

- [x] Sheet ghi trạng thái, issue và bằng chứng cho từng dòng đã kiểm tra.
- [ ] #614–#618 được sửa và re-test trên staging.
- [ ] Các dòng trong bảng trên có kết quả từ staging hoặc thiết bị của người báo.
