---
title: "Mời học viên vào tổ chức, chuông thông báo portal và chuyển đổi đa tổ chức (Multi-Org Student)"
description: "Cho phép giáo viên mời học viên vào tổ chức; học viên nhận thông báo ở icon chuông trên portal, chấp nhận/từ chối lời mời và chuyển đổi linh hoạt giữa các tổ chức giáo viên khác nhau."
status: completed
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
| 1 | [Database Schema & Migration](./phase-01-database-schema-and-migration.md) | Completed |
| 2 | [Server Invitation & Multi-Org Bridge](./phase-02-server-invitation-and-multi-org-bridge.md) | Completed |
| 3 | [Teacher Web App Invite UI](./phase-03-teacher-web-invite-ui.md) | Completed |
| 4 | [Student Portal Bell & Org Switcher](./phase-04-student-portal-bell-and-org-switcher.md) | Completed |
| 5 | [E2E Regression & Documentation](./phase-05-e2e-regression-docs.md) | Completed |

---

## Success Criteria

- [x] Migration tạo bảng `student_invitation` và chuyển unique index của `student.email` sang scoped `(org_id, lower(trim(email)))` an toàn, không làm mất dữ liệu hiện hữu.
- [x] Giáo viên có thể gửi lời mời học viên qua email từ giao diện `/students`; hệ thống chặn gửi trùng lời mời hoặc mời học viên đã có trong tổ chức.
- [x] Giáo viên có thể xem danh sách lời mời đang chờ và bấm huỷ lời mời.
- [x] Học viên đăng nhập Student Portal thấy icon Chuông thông báo kèm số lượng lời mời đang chờ.
- [x] Bấm vào thông báo, học viên có thể nhấn "Chấp nhận" để tự động gia nhập tổ chức đó, hoặc "Từ chối" để bỏ qua.
- [x] Học viên thuộc từ 2 tổ chức trở lên có thể dùng menu Org Switcher trên thanh điều hướng để chuyển đổi qua lại; dữ liệu bài tập/lớp học tự động cập nhật theo tổ chức được chọn.
- [x] Lỗi `STUDENT_AMBIGUOUS` (403) được loại bỏ hoàn toàn khi học viên thuộc nhiều tổ chức; API tự động resolve đúng tổ chức active.
- [x] Toàn bộ test suite (`pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build`) xanh.

---

## Red Team Review

### Adversarial Findings & Adjudication

| # | Persona | Finding | Codebase Evidence | Disposition | Rationale / Resolution |
|---|---|---|---|---|---|
| R1 | Assumption Destroyer | Middleware `router.use("*")` trong `routes/student.ts` chặn 403 `NOT_LINKED` toàn bộ route nếu học viên chưa có record `student`, khiến học viên mới không thể xem chuông thông báo hay chấp nhận lời mời. | `apps/server/src/routes/student.ts:103-115` | Accept | Tách middleware: các routes `/notifications`, `/invitations/:id/accept`, `/invitations/:id/reject`, và `/orgs` chỉ yêu cầu session học viên (`role === 'student' && emailVerified === true`), không yêu cầu `studentCtx`. |
| R2 | Failure Mode Analyst | Race condition khi giáo viên click gửi mời nhiều lần hoặc gửi trùng lúc học viên đã là học viên của tổ chức. | `packages/db/src/schema/student.ts:37` | Accept | Thêm partial unique index `(org_id, lower(trim(email))) WHERE status = 'pending'` trên bảng `student_invitation` và kiểm tra 409 `STUDENT_ALREADY_IN_ORG` / `INVITATION_ALREADY_PENDING` tại route `POST /api/students/invite`. |
| R3 | Security Adversary | Giả mạo header `x-student-org-id` để xem trộm bài tập hoặc lớp học của tổ chức khác (IDOR). | `apps/server/src/routes/student.ts:77-82` | Accept | Server luôn lọc `student` theo `email` của session đã xác thực (`session.email`). Nếu `x-student-org-id` không thuộc danh sách orgs mà email đó tham gia, fallback về org hợp lệ gần nhất hoặc từ chối. |
| R4 | Scope & Complexity Critic | Có nên tách bảng `student_profile` global và bảng `student_membership` thay vì giữ bảng `student` scoped theo `org_id`? | `packages/db/src/schema/student.ts:15-34` | Reject | Giữ nguyên schema `student` scoped `org_id` (Decision D1) để bảo toàn 100% foreign key cascades tới `class`, `enrollment`, `lesson`, `invoice` mà không làm phình to scope dự án. |

### Whole-Plan Consistency Sweep (Red Team)
- Verified that Phase 2 route definitions account for unlinked student session accessing notification endpoints.
- Verified schema definition in Phase 1 includes partial unique index for pending invitations.
- All findings resolved without contradictions.

---

## Validation Log

### Verification Results
- Claims checked: 16
- Verified: 16 | Failed: 0 | Unverified: 0
- Tier: Full (5 phases)
- Key verifications:
  - `packages/db/src/schema/student.ts:37`: `student_email_uq` currently global index on `lower(trim(email))`.
  - `apps/server/src/routes/student.ts:128-135`: 403 `STUDENT_AMBIGUOUS` currently thrown when `rows.length > 1`.
  - `apps/server/src/student-provisioning.ts:33-45`: currently provisions to earliest org when 0 rows match.
  - `packages/api/src/contracts.ts`: `STUDENT_ERROR_CODES.AMBIGUOUS` exported.
  - `apps/web/src/routes/_auth/students/index.tsx`: teacher students page ready for invite modal and pending tab.
  - `apps/student/src/components/layout/student-shell.tsx`: ready for `NotificationBell` and `OrgSwitcher`.

### Whole-Plan Consistency Sweep
- Checked dependencies across Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5.
- Verified database migration naming sequence (`0024_*`).
- Verified all error codes and types in `contracts.ts`.
- No unresolved contradictions found. Recommendation: proceed to implementation.
