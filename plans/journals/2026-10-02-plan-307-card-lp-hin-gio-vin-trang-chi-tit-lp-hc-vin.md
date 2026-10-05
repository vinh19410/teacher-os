---
title: "Plan #307: card lớp hiện giáo viên + trang chi tiết lớp học viên"
date: 2026-10-02
summary: Lập plan 3 phase cho card lớp hiện giáo viên và trang /classes/$classId của portal học viên
---

# Plan #307: card lớp hiện giáo viên + trang chi tiết lớp học viên

## Chuyện gì đã xảy ra
User yêu cầu card "Lớp học của tôi" ở portal học viên hiển thị thông tin giáo viên, và bấm card thì mở trang chi tiết lớp. Scout cho thấy ba điều:
- Bảng `class` không có cột giáo viên. Giáo viên là người sở hữu org, được tạo bởi bootstrap ở `apps/server/src/app.ts:84-93` với `membership.role = "teacher"`.
- Student app chưa có route chi tiết lớp nào.
- Mục sidebar "Trang chủ" là `div` tĩnh, không phải link.

## Quyết định
- Giáo viên của lớp là membership `role = 'teacher'` sớm nhất của org, join `user`. Không thêm cột `teacherId` vì repo chưa có khái niệm nhiều giáo viên mỗi org.
- `StudentClass.teacher` có kiểu `{ name, email, image } | null` và dùng `.catch(null)` để client chạy được với server cũ.
- Thêm endpoint `GET /api/student/classes/:classId`. Endpoint chỉ trả cho enrollment `active` của chính học viên. Các trường hợp còn lại (invited, org khác, chưa ghi danh) đều trả 404.
- Buổi học lọc theo `enrollmentId`, không theo `classId`, để trạng thái riêng như vắng là của chính học viên.
- User chốt: card hiện avatar + tên + email. Trang chi tiết có buổi học và bài tập, không có link Zoom. Lớp invited không click được.
- Card active được bọc toàn bộ bằng `Link`. Email trên card là text thường để tránh lồng link; `mailto:` chỉ dùng ở trang chi tiết.

## Bước tiếp theo
- Issue: https://github.com/vinh19410/teacher-os/issues/307
- Implement bằng `/ak:cook plans/261002-1345-student-class-card-teacher-detail/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
