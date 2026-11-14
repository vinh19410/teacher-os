---
title: "feat(auth,student,web): auto-join newly verified students into single active org (#716)"
description: "Tự động đưa học viên mới đăng ký (ngay khi xác thực email thành công) vào tổ chức hoạt động duy nhất, giữ nguyên hồ sơ tạo sẵn/chuyển lời mời pending sang accepted, và gỡ bỏ giao diện mời học viên vào tổ chức trên apps/web và apps/student."
status: completed
priority: P1
issue: 716
branch: "vinh19410/Sync-Student"
base_branch: "develop"
tags: ["auth", "student", "single-org", "web", "provisioning"]
created: 2026-11-14
---

# Plan: Tự động đưa học viên mới xác thực vào tổ chức hoạt động duy nhất (#716)

> **Hợp đồng phạm vi đã khóa (Gate 1 + Gate 2):**
> - **Thời điểm auto-join:** Kích hoạt ngay khi `emailVerified === true` (Google OAuth & Email OTP tạo/cập nhật user là auto-join ngay tại auth hook; Email + Mật khẩu chưa tạo dòng `student` khi `emailVerified = false` và auto-join ngay trong `/api/auth/verify-email`).
> - **Chiến lược chọn org hoạt động (3 tầng):** (1) org có `membership` (`owner`/`teacher`/`admin`) khớp `TEACHER_EMAILS` -> (2) org có `membership` (`owner`/`teacher`/`admin`, bỏ qua org rỗng seed như `e2e-lead-org`) -> (3) fallback org tạo sớm nhất (`createdAt ASC, id ASC`).
> - **Khớp hồ sơ / lời mời có sẵn:** Nếu đã có dòng `student` khớp email -> giữ nguyên hồ sơ, tự động cập nhật `student_invitation` `pending` -> `accepted`, không tạo trùng, không trả `403 STUDENT_NOT_LINKED`.
> - **Dọn UI single-org:** Trên `apps/web` (`/students`, `/students/$studentId`, `AddStudentModal`), gỡ nút "Mời học viên", tab "Lời mời đang chờ", badge/nút "Gửi lại lời mời". Trên `apps/student` (`NotificationBell`), chỉ giữ thông báo hộp thư in-app. Giữ nguyên `class-roster-tab.tsx` (`enrollment` theo lớp) và không xóa bảng `student_invitation`.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Auth Hooks & Server Single-Org Provisioning | completed | [phase-01-auth-server-provisioning.md](./phase-01-auth-server-provisioning.md) |
| 2 | Web & Student UI Single-Org Cleanup | completed | [phase-02-web-student-ui-cleanup.md](./phase-02-web-student-ui-cleanup.md) |
| 3 | E2E, UI Verification, Review & Beta Ship | completed | [phase-03-e2e-verify-and-ship.md](./phase-03-e2e-verify-and-ship.md) |

## Success Criteria

- [x] Học viên mới đăng nhập qua Email OTP hoặc Google OAuth được tạo ngay bản ghi `student` trong org hoạt động của giáo viên tại auth hook, không cần chờ `/api/student/me`.
- [x] Học viên mới đăng ký Email + Mật khẩu chưa có dòng `student` khi `emailVerified = false`, và có ngay dòng `student` sau `/api/auth/verify-email`.
- [x] Email đã tạo sẵn qua "Thêm học viên" hoặc có `student_invitation` `pending` giữ nguyên hồ sơ, chuyển `pending -> accepted`, và vào thẳng portal (không `403 STUDENT_NOT_LINKED`).
- [x] `apps/web` `/students` và `apps/student` `NotificationBell` sạch UI lời mời tổ chức; luồng mời vào lớp vẫn giữ nguyên.
- [x] Pass `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, E2E liên quan, UI 3 viewport, code review cô lập, merge PR vào `develop`, issue `#716` có label `ai-handle` + `shipped` và POT đầy đủ.
