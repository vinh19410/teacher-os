---
title: "Mời học viên vào tổ chức, chuông thông báo portal và chuyển đổi đa tổ chức (Multi-Org Student)"
description: "Cho phép giáo viên mời học viên vào tổ chức; học viên nhận thông báo ở icon chuông trên portal, chấp nhận/từ chối lời mời và chuyển đổi linh hoạt giữa các tổ chức giáo viên khác nhau."
status: pending
priority: P1
effort: 16h
issue: 263
branch: develop
tags: [feature, database, api, frontend, student-portal]
blockedBy: []
blocks: []
created: 2026-09-24
---

# Mời học viên vào tổ chức, chuông thông báo portal và chuyển đổi đa tổ chức (Multi-Org Student)

## Overview

Hiện tại, hệ thống TeacherOS quản lý dữ liệu theo từng Organization (mỗi giáo viên có một org riêng). Khi học viên tự đăng ký qua Student Portal (`apps/student`), hệ thống đang áp dụng heuristic tạm thời (Decision D2 từ PR #257): tự động gán học viên vào Organization tạo sớm nhất toàn hệ thống (`ORDER BY created_at ASC, id ASC LIMIT 1`). Điều này dẫn tới hai hạn chế nghiêm trọng:
1. Trong môi trường có nhiều giáo viên (hoặc môi trường test/staging có tổ chức rác tạo sớm hơn), học viên bị gán sai tổ chức, khiến giáo viên thật không thấy học viên trong "Danh sách học viên".
2. Một học viên không thể học cùng lúc nhiều giáo viên (đa tổ chức) do bảng `student` đang áp dụng ràng buộc `uniqueIndex("student_email_uq")` toàn cục trên toàn bộ database.

**Mục tiêu của kế hoạch này:**
- **Phía Giáo viên (Teacher App):** Bổ sung nút "Mời học viên" tại trang Học viên (`/students`), cho phép nhập email để gửi lời mời tham gia tổ chức, đồng thời xem và huỷ các lời mời đang chờ chấp nhận.
- **Tầng Dữ liệu & Server:** Tạo bảng `student_invitation`, chuyển đổi unique index của email học viên từ mức toàn cục sang mức tổ chức (`UNIQUE(org_id, lower(trim(email)))`), cung cấp API gửi/danh sách/huỷ lời mời và API thông báo/chấp nhận/từ chối/chuyển đổi tổ chức cho học viên.
- **Phía Học viên (Student Portal):** Thêm icon Chuông thông báo (`NotificationBell`) có huy hiệu đỏ đếm số lời mời đang chờ; mở danh sách lời mời cho phép "Chấp nhận" hoặc "Từ chối"; thêm bộ chuyển đổi tổ chức (`OrgSwitcher`) cho phép học viên chuyển đổi mượt mà qua lại giữa các lớp/tổ chức của các giáo viên khác nhau mà không cần đăng xuất.

---

## Decisions

| # | Quyết định | Nội dung |
|---|-----------|----------|
| D1 | Model dữ liệu Đa Tổ chức: Org-Scoped Student | Thay vì tách bảng `student` thành global profile + membership, ta giữ nguyên cấu trúc `student` org-scoped (chứa `org_id`, `name`, `email`, `phone`, `zalo`...) và đổi unique index email thành `UNIQUE(org_id, lower(trim(email)))`. Mỗi khi học viên chấp nhận vào một org mới, một record `student` riêng của org đó được tạo. Giữ nguyên 100% các quan hệ ràng buộc ngoại và cascade sẵn có của `class`, `enrollment`, `lesson`, `session_package`, `invoice`. |
| D2 | Bảng lời mời `student_invitation` | Lưu trữ lời mời do giáo viên gửi: `id`, `org_id`, `inviter_user_id`, `email`, `status` (`pending`, `accepted`, `rejected`, `canceled`), `created_at`, `updated_at`. Đảm bảo unique index `UNIQUE(org_id, lower(trim(email))) WHERE status = 'pending'` để ngăn việc gửi nhiều lời mời trùng nhau đang chờ xử lý. |
| D3 | Resolve Active Org linh hoạt ở Portal Bridge | Thay thế việc throw 403 `STUDENT_AMBIGUOUS` khi một email có nhiều record `student`. Middleware `/api/student/*` đọc `x-student-org-id` từ request header (hoặc cookie `active_student_org_id`, fallback record mới nhất). Mọi request sau đó được scope chính xác theo `orgId` đã chọn. |
| D4 | Chuông thông báo (Notification Bell) trực quan | Đặt icon Chuông tại thanh Header (mobile) và Sidebar (desktop) của Student Portal. Badge hiển thị số lượng lời mời `pending`. Popover hiển thị chi tiết tên tổ chức/giáo viên mời kèm nút thao tác trực tiếp: "Chấp nhận" (Accept) và "Từ chối" (Decline). |
| D5 | Bộ chuyển đổi tổ chức (Org Switcher) mượt mà | Thêm menu dropdown hiển thị tổ chức hiện tại và danh sách tất cả các tổ chức học viên đã tham gia (`GET /api/student/orgs`). Khi học viên chọn org khác, cập nhật state `active_student_org_id` và kích hoạt re-fetch dữ liệu tổng quan (`student-overview`), lịch học và bài tập của tổ chức đó mà không làm mất phiên đăng nhập. |

---

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Database Schema & Migration](./phase-01-database-schema-and-migration.md) | Pending |
| 2 | [Server Invitation & Multi-Org Bridge](./phase-02-server-invitation-and-multi-org-bridge.md) | Pending |
| 3 | [Teacher Web App Invite UI](./phase-03-teacher-web-invite-ui.md) | Pending |
| 4 | [Student Portal Bell & Org Switcher](./phase-04-student-portal-bell-and-org-switcher.md) | Pending |
| 5 | [E2E Regression & Documentation](./phase-05-e2e-regression-docs.md) | Pending |

---

## Success Criteria

- [ ] Migration tạo bảng `student_invitation` và chuyển unique index của `student.email` sang scoped `(org_id, lower(trim(email)))` an toàn, không làm mất dữ liệu hiện hữu.
- [ ] Giáo viên có thể gửi lời mời học viên qua email từ giao diện `/students`; hệ thống chặn gửi trùng lời mời hoặc mời học viên đã có trong tổ chức.
- [ ] Giáo viên có thể xem danh sách lời mời đang chờ và bấm huỷ lời mời.
- [ ] Học viên đăng nhập Student Portal thấy icon Chuông thông báo kèm số lượng lời mời đang chờ.
- [ ] Bấm vào thông báo, học viên có thể nhấn "Chấp nhận" để tự động gia nhập tổ chức đó, hoặc "Từ chối" để bỏ qua.
- [ ] Học viên thuộc từ 2 tổ chức trở lên có thể dùng menu Org Switcher trên thanh điều hướng để chuyển đổi qua lại; dữ liệu bài tập/lớp học tự động cập nhật theo tổ chức được chọn.
- [ ] Lỗi `STUDENT_AMBIGUOUS` (403) được loại bỏ hoàn toàn khi học viên thuộc nhiều tổ chức; API tự động resolve đúng tổ chức active.
- [ ] Toàn bộ test suite (`pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm --filter e2e e2e`) xanh.
