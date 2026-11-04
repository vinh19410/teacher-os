---
title: "Triage feedback trải nghiệm staging thành GitHub issue"
description: "19 dòng feedback staging được gộp thành 18 issue (#570–#587), xếp theo mức độ Cao, Trung bình, Thấp, kèm nguyên nhân đã truy trong source."
status: pending
priority: P1
effort: chưa ước lượng
issue: 570-587
branch: develop
tags: [triage, staging, web, student, server]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Plan: Triage feedback trải nghiệm staging

## Outcome

Mỗi feedback trên sheet "TeacherOS staging - Theo dõi lỗi" có một GitHub issue mô tả hiện tượng, nguyên nhân và hướng sửa, được ưu tiên theo mức độ, và sheet ghi lại issue tương ứng của từng dòng.

## Non-goals

- Plan này không sửa code. Mỗi issue đi qua pipeline `ai-handle` riêng khi được kéo sang **Ready**, và có plan chi tiết ở bước đó.
- Không thay đổi mức độ do người báo đề xuất và không sắp xếp lại dòng trên sheet.

## Quyết định

- Gộp dòng 4 và 9 thành #572 vì cùng nguyên nhân là `<input type="date">` gốc của trình duyệt. Các dòng còn lại mỗi dòng một issue, nên 19 dòng thành 18 issue.
- Dùng một plan tổng hợp thay vì 18 thư mục plan, vì phần lớn issue là độc lập và plan chi tiết nên dựa trên trạng thái code lúc thực hiện.
- Mức Cao gắn thêm label `P1`. Không suy đoán quan hệ `blocked-by`; quan hệ gợi ý chỉ ghi trong nội dung issue.

## Danh sách ưu tiên

| Mức độ | Issue | Dòng sheet | Nội dung | Độ chắc của nguyên nhân |
|---|---|---|---|---|
| Cao | #570 | 1 | Mời bằng email không gửi thư, không gửi lại được | Đã xác minh một phần |
| Cao | #571 | 3 | Giáo viên không nhập được giải thích đáp án | Đã xác minh |
| Cao | #572 | 4, 9 | Ô hạn nộp sai định dạng, khó nhập, không có giờ | Đã xác minh |
| Cao | #573 | 14 | Trang khóa từ vựng trống dù quảng cáo 20 khóa | Giả thuyết: chưa seed |
| Trung bình | #574 | 2 | Gộp nhiều kỹ năng trong một bài | Tính năng mới |
| Trung bình | #575 | 6 | Bấm Chấm bài không đổi nội dung | Chưa tái hiện |
| Trung bình | #576 | 7 | Nút đang chọn không nổi bật | Đã xác minh |
| Trung bình | #577 | 8 | Dạng đề Writing tự chọn sẵn | Đã xác minh |
| Trung bình | #578 | 10 | Đăng nhập học viên qua email | Tính năng mới |
| Trung bình | #579 | 15 | Xem giải thích chi tiết không có nội dung | Đã xác minh |
| Trung bình | #580 | 17 | Trang Bài tập thiếu bài mới | Giả thuyết: cache 60 giây |
| Thấp | #581 | 5 | Không rõ lý do nút Lưu bị khóa | Lệch với source, cần xem lại |
| Thấp | #582 | 11 | Tài khoản giáo viên ở cổng học viên | Đã xác minh |
| Thấp | #583 | 12 | Onboarding không hỏi trình độ | Tính năng mới |
| Thấp | #584 | 13 | Trang lịch học riêng | Tính năng mới |
| Thấp | #585 | 16 | Band mặc định theo lớp | Đã xác minh, cần mở rộng contract |
| Thấp | #586 | 18 | Chữ nút Nộp bài mờ | Đã xác minh |
| Thấp | #587 | 19 | Hiện hạn nộp trên trang làm bài | Tính năng mới |

## Phases

| # | Phase | Trạng thái |
|---|---|---|
| 1 | [Xử lý nhóm mức Cao](phase-01-high-severity.md) | pending |
| 2 | [Xử lý nhóm mức Trung bình](phase-02-medium-severity.md) | pending |
| 3 | [Xử lý nhóm mức Thấp](phase-03-low-severity.md) | pending |

## Acceptance criteria

- Cả 19 dòng trên sheet có trạng thái "Đã ghi nhận" và link issue.
- Mỗi issue đã đóng được cập nhật lại trạng thái trên sheet.
- Những issue chưa xác minh nguyên nhân (#573, #575, #580, #581 và phần thư của #570) được kiểm chứng trên staging trước khi sửa.
