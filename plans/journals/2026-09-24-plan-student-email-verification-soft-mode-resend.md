---
title: "Plan student email verification (soft mode, Resend)"
date: 2026-09-24
summary: "Lập kế hoạch gửi mail verify cho portal đăng ký: --advice handover plan, kongming READY-WITH-EDITS, red-team 16 findings đã áp, issue #259"
---

# Plan student email verification (soft mode, Resend)

## What happened
Chạy `/ak:plan --github --advice` cho feature gửi email verify sau khi học viên đăng ký portal (kế thừa non-goal của plan 260923-0758-students-from-portal-registration).

- Root cause tiếp nối session trước: signup email/password tạo user với `emailVerified: false` (Better-Auth 1.6.27 hard-code) + chưa có flow verify → provisioning bị gate vĩnh viễn → banner "Tài khoản chưa được liên kết".
- Đã chốt 3 quyết định với user: (D1) soft mode — `sendOnSignUp` + `autoSignInAfterVerification`, KHÔNG bật `requireEmailVerification`; (D2) Resend qua fetch thuần sau interface Mailer; (D3) fail-open khi mail lỗi lúc đăng ký.
- Nghiên cứu xác minh từ source better-auth 1.6.27 cài đặt (không tin docs): `sendOnSignUp` phải set tường minh khi không có requireEmailVerification (sign-up.mjs:242); token verify là JWT stateless; callbackURL bị validate 2 lần (POST body + GET query); sign-up vẫn giữ session trong soft mode.
- Plan 4 phases (~10h) tại plans/260924-0213-student-email-verification: mailer+template trong packages/auth → bridge trả EMAIL_UNVERIFIED cho 0-row unverified → portal màn chờ xác thực → e2e + runbook.

## Decision
- Kongming advisory (cùng model, host không pin được Fable/Astra): READY-WITH-EDITS — quan trọng nhất: e2e shim boot.ts:26 chỉ trust origin 8001 sẽ làm spec mới 403; không cần rewrite URL verify server-side (BA tự nhúng callbackURL từ body sign-up).
- Red-team 3 persona (Security/Failure/Assumption, tier Standard): 22 findings → 16 unique → 16 accepted sau khi user duyệt. Đáng học: (1) lệnh `pnpm --filter @teacher-os/server|student|e2e` sai vì apps không có scope — chỉ packages/ mang @teacher-os/; (2) task 1.4 đọc env type trước task 1.5 khai báo binding là sequencing bug trong chính plan; (3) Config.string không default sẽ làm vỡ fresh clone + CI deploy — dùng pattern Config.withDefault đã có ở CORS.

## Next steps
- Implement bằng `/ak:cook plans/260924-0213-student-email-verification/plan.md` (plan là authority, mỗi task có Verify cơ học + Failure Protocol STOP → kongming).
- Vận hành: verify domain Resend (DKIM/SPF) + set RESEND_API_KEY/MAILER_IMPL/MAIL_FROM trước khi merge (runbook: docs/production-release-runbook.md).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
