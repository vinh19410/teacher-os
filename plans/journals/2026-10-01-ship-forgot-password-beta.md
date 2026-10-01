---
title: Ship beta quên mật khẩu qua email (#292)
date: 2026-10-01
summary: "Tiếp phiên cook dở, sync base mới, verify toàn bộ gates, review 2 reviewer, ship PR #295 vào develop."
---

# Ship beta quên mật khẩu qua email (#292)

## What happened
Vibe `--ship --beta` vào issue #292 thấy worktree `teacher-os-vinh19410-feat-forgot-password-email-reset` đang giữ implementation chưa commit từ phiên trước (3/3 phase đã `done` trong plan). Worktree đứng ở `b0c27ce`, tức cũ hơn `develop` 3 commit — trong đó có chính commit plan `0bb2b68` và release `v0.0.11` đụng CHANGELOG. Đồng bộ bằng stash → ff-merge → pop: plan dir trong worktree (mới hơn, mtime 11:04) đè bản tracked, CHANGELOG gộp tay entry #292 + #293.

Toàn bộ Verify gates chạy lại trên base mới: auth 67/67 (gồm 6 test vòng đời token), server 6/6 + check-types, web 1166/1166, student 136/136, preview email, e2e `password-reset.spec.ts` 4/4 ở port 810x, `pnpm check`. Commit 6 nhóm theo phase + 3 docs commits.

Review fanout 2 reviewer fresh-context (security-invariant + correctness) — cả hai tự đối chiếu better-auth trên source tag v1.6.27 vì hook chặn đọc node_modules: 0 Critical / 0 Important / 6 Minor (1 trùng). Fix 2: guard cooldown student forgot-form (Enter-submit lúc cooldown vẫn gọi API — D9), và 2 case e2e (link hỏng khi chưa đăng nhập F5; token-stale bị strip khỏi URL F14). Rerun student + e2e xanh.

Ship beta: PR #295 vào develop, review tự post (self-PR downgrade COMMENT — body vẫn verdict Approve), label `ready to ship beta`, rebase-merge giữ 10 commit. develop không trigger CI (workflow chỉ chạy target main theo cấu hình hiện tại; run develop mới nhất là 2026-09-30) — bằng chứng chất lượng là bộ gates local.

## Decision
- Keep scope: 4 Minor còn lại không fix trong PR (log Resend chứa email đích là code có sẵn ngoài diff; log mailer in URL ở chế độ log-only đã accept F4) — ghi follow-up trong PR + issue.
- E2E web test link-hỏng dùng `?error=INVALID_TOKEN` (behavior thật) thay vì `?token=invalid` như chữ plan — task 3.2 mâu thuẫn với task 2.3; bù case `?token=dead-token` riêng.
- Journal ghi sau merge-CI thay vì trong ship pipeline để có đủ evidence kết quả.

## Next steps
Stable promotion theo quy trình riêng khi được yêu cầu. Follow-up: redact token verify-email trong access log; log lỗi mailer không in raw message. Issue #292 vẫn mở chờ stable.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
