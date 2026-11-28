---
phase: 4
title: "Phase 4: Verification, Review & Dual-Stage Ship"
status: done
priority: P1
effort: 1h
dependencies: [2, 3]
---

# Phase 4: Verification, Review & Dual-Stage Ship

## Goal

Kiểm thử E2E lẻ, chụp screenshot 3 viewport (Light + Dark), chạy `pnpm design:compare`, chạy toàn bộ local gates, review code local với fresh-context `code-reviewer`, đồng bộ docs nếu có impact, và ship cả 2 chặng (`develop`/staging → `main`/production) kèm comment POT bằng SHA permalink trên GitHub issue.

## Files to Create / Modify

- Create: `apps/e2e/specs/remove-student-from-class.spec.ts`
- Create: `plans/reports/<ISSUE_NUM>-remove-student-*.png`

## Tasks & Steps

1. Viết & chạy spec E2E lẻ `apps/e2e/specs/remove-student-from-class.spec.ts` (cùng `enroll-existing-student.spec.ts`, `class-roster-tuition-debt.spec.ts`) với `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105` (tuyệt đối KHÔNG chạy full E2E ở local).
2. Chụp screenshot bằng Playwright ở 3 viewport (`1440×900`, `768×1024`, `375×812`) cả Light & Dark mode cho tab Học viên (nút "Xóa khỏi lớp"), modal xác nhận kèm cảnh báo công nợ, và tab Học phí học viên sau khi xóa (`"Đã rời lớp"`); kiểm tra bằng `read_file` và lưu vào `plans/reports/`. Chạy `pnpm design:compare` (exit 0).
3. Chạy đầy đủ local quality gates: tests (`db`, `api`, `server`, `web`, `student`), `pnpm exec biome check .`, `pnpm check-types`.
4. Chạy `/ak-code-review --pending` bằng fresh-context `code-reviewer` subagent, sửa mọi lỗi Critical & Important, chạy lại các gate liên quan.
5. Kiểm tra docs impact (chỉ cập nhật docs nếu mâu thuẫn với hành vi mới).
6. Stage 1 (Beta): sync `origin/develop`, cập nhật `plan.md`, commit (conventional commit) + push, mở PR vào `develop` (`Refs #<ISSUE_NUM>`), chạy `/ak-review-pr --fix --reply`, đợi CI `quality` xanh, gắn label `ready to ship beta`, merge vào `develop`, theo dõi `Deploy Staging` tới khi xanh.
7. Stage 2 (Stable): chỉ bắt đầu khi `Deploy Staging` xanh; kiểm tra `git log origin/main..origin/develop --oneline` (tách nhánh `release/<ISSUE_NUM>-teacher-remove-student-main` cherry-pick từ `origin/main` nếu `develop` có commit ngoài phạm vi), mở PR vào `main` (`Closes #<ISSUE_NUM>`), chạy `/ak-review-pr --fix --reply`, đợi `quality` + 6-shard `e2e` xanh, gắn label `ready to ship stable`, merge vào `main`, theo dõi `Deploy Production` tới khi xanh.
8. Đăng comment POT đầy đủ bằng permalink theo commit SHA trên `main` lên GitHub issue, xác minh bằng `gh issue view <N> --comments`, đóng plan (`ak plan close`) & issue, và xuất Vibe Completion Report tiếng Việt.

## Verification

- `pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/api test && pnpm --filter server test && pnpm --filter web test && pnpm --filter student test`
- `pnpm exec biome check . && pnpm check-types`
- Targeted E2E specs (port 8100-8105) + `pnpm design:compare`
- Staging & Production deploy workflows green trên GitHub Actions + POT verified trên GitHub issue.
