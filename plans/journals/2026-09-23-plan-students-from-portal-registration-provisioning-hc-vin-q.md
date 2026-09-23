---
title: "Plan students-from-portal-registration: provisioning học viên qua bridge portal thay vì auth-hook"
date: 2026-09-23
summary: "Plan #257: bỏ tạo học viên thủ công (POST /api/students + UI); student row tự sinh ở lần đầu đăng nhập portal qua requireStudent + unique expression index lower(trim(email)); red-team 12 findings làm pivot thiết kế"
---

# Plan students-from-portal-registration: provisioning học viên qua bridge portal thay vì auth-hook

## What happened
Soạn plan `plans/260923-0758-students-from-portal-registration/` (issue #257): menu Học viên ở admin/teacher không còn tạo học viên tay — danh sách lấy từ học viên tự đăng ký portal.

Red-team (3 reviewer, 23 findings thô → 12 cụm) đã phá thiết kế đầu tiên:
1. `databaseHooks.user.create.after` không phân biệt được teacher vs student → teacher Google signup (nút có ở login.tsx:94) sẽ thành student row trong org #1 (PII dồn 1 tenant).
2. Hook create chỉ fire 1 lần — D7 cũ "re-provision lần đăng nhập sau" là sai; email→Google-link đi qua `updateUser` không fire create-hook.
3. Scout report sai: báo "apps/student chưa tồn tại" — thực tế PR #255 (0972f99) đã merge bridge `apps/server/src/routes/student.ts` + `apps/student`. Planner xác nhận lại qua git log.
4. Unique index raw-email cho qua case-variant; e2e seed vào "earliest org" sai org với 3 spec 2-teacher; `addStudent` trong kernel.test.ts là API-helper (~33 call sites) không phải DB-seed.

## Decision
- User chốt: provisioning chuyển sang **bridge portal** — `requireStudent` thấy 0 row + `emailVerified === true` → `provisionStudentForUser` (org sớm nhất toàn cục) → resolve lại trong cùng request. Teacher không bao giờ bị provision; mỗi request portal là retry tự nhiên.
- Migration 0022: dedupe non-destructive + unique **expression** index `ON lower(trim(email)) WHERE trim(email) != ''`; phase 1-3 trong cùng PR (deploy cùng nhau).
- e2e: `seedStudent()` seed DB trực tiếp vào `apps/e2e/local.db`, resolve org theo teacher đang đăng nhập của spec (email → membership → orgId).
- Metadata `blockedBy: 254` bị bỏ vì moot — plan này sửa trực tiếp code #255 đã merge.

## Next steps
- `/ak:cook plans/260923-0758-students-from-portal-registration/plan.md` để thực thi (3 phase, ~15h).
- Commit + push plan files trước khi cook để issue #257 link tới đúng path trên repo.
- Follow-up đã ghi non-goal: link-table teacher-approve cho deployment đa-org; SĐT vào form signup portal.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
