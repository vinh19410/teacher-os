---
title: "Ship student auto-join single active org (#716)"
date: 2026-11-14
summary: "Hoàn tất auto-join 1 org cho học viên mới xác thực email, xử lý góp ý code review và phát hành v0.0.22-beta (#716)"
---

# Ship student auto-join single active org (#716)

## Tóm tắt
- Triển khai `provisionStudentForUser` tại `@teacher-os/auth/student-provisioning` với chiến lược chọn org hoạt động 3 tầng (`TEACHER_EMAILS` -> membership quản trị -> org tạo sớm nhất), loại trừ `demo-student:%`, và tự chuyển `student_invitation` `pending` -> `accepted` đúng phạm vi `orgId`.
- Gắn hook tự động tại `createAuth` (`user.create.after`, `user.update.after`, `afterEmailVerification`) khi `role === "student" && emailVerified === true` cùng fallback đồng bộ tại `apps/server`.
- Gỡ giao diện lời mời cấp tổ chức trên `apps/web` (`/students`, `/students/$studentId`, `AddStudentModal`) và `apps/student` (`NotificationBell`, mô tả `NOT_LINKED` trong `StudentErrorView`), giữ nguyên ghi danh theo lớp.
- Hoàn tất E2E cô lập, `design:compare` 3 viewport light/dark, code review cô lập và toàn bộ local gates trước khi ship PR vào `develop`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
