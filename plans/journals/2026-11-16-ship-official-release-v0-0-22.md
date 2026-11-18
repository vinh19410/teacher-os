# Ship Official Release v0.0.22 (develop → main)

**Date**: 2026-11-16 19:05 Europe/London
**Severity**: Medium
**Component**: Release `v0.0.22` (nhánh `release/promote-v0.0.22`)
**Status**: PR mở, chờ review + merge

## Chuyện gì đã xảy ra

Promote 101 commit từ `develop` lên `main` (`v0.0.21` → `v0.0.22`, #686 → #743), kèm **4 D1 migration mới** (`0069`–`0072`, đều additive). Nội dung chính: AI chấm nháp Writing/Speaking bài kiểm tra đầu vào (#730), định tuyến public leads/placement về org giáo viên đang hoạt động (#742/#743), chuyển domain production sang `msmy.io.vn` (#737), Study Pack level/listening và trang chi tiết (#717, #720), redesign profile (#699, #709), tinh gọn màn kết quả entry test (#734), thông báo Discord sau deploy (#686, #736).

## Khác biệt so với các lần promote trước

Khác #685 (PR thẳng từ `develop`), lần này `main` đã nhận 5 bản cherry-pick qua nhánh `release/*` (#705, #708, #714, #739, #740) nên `develop` không merge sạch vào `main`. Tạo `release/promote-v0.0.22` từ `origin/develop`, merge `origin/main` vào và giải 6 file xung đột:

- `apps/profile/public/{index,kiem-tra-dau-vao/index,noi-bo/index}.html`, `apps/profile/tests/{index,placement-test}.test.mjs`: lấy bản `develop` — bản gốc của mọi cherry-pick (#699, #706, #710, #737) đã nằm trong `develop` và được phát triển tiếp (#709, bài test 5 kỹ năng).
- `docs/production-release-runbook.md`: lấy bản `main` vì commit `4002935f` (prerequisites cutover + rollback note) chỉ có trên `main`.

`code-reviewer` đối chiếu 23 file `main` đã đổi kể từ merge-base và xác nhận không mất nội dung.

## Kiểm chứng

- `pnpm exec biome check .`: 0 error (151 warning).
- `pnpm check-types`: 12/12.
- `pnpm test`: 12/12 task (server 1541 passed + 1 expected fail, web 2198, student 501, api 465, admin 188, ui 194, auth 112, infra 42, db 34, script suites pass).
- Full E2E: không chạy local theo AGENTS.md — `deploy.yml` gọi `e2e.yml` để gate production.

## Rủi ro còn lại (từ review)

- **H1**: `resolveLeadTargetOrg` không lọc `email_verified`; nếu `TEACHER_EMAILS` prod chứa email chưa có tài khoản, người lạ có thể đăng ký email đó và hứng lead. Prod hiện có đúng 1 email trong allowlist (giả định là giáo viên chính đã đăng ký) → rủi ro thấp, cần xác nhận.
- **M1**: production chưa đặt `OPENAI_GRADING_MODEL` → dùng mặc định `gpt-6-luna` (quyết định của #730).
- **M3**: lỗi ném ra ngoài trong `notify-discord-changelog.mjs` có thể làm đỏ job deploy dù prod đã live.

Report đầy đủ: `plans/reports/code-reviewer-261116-1853-release-v0-0-22.md`.
