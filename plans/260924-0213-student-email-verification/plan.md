---
title: "Student email verification (portal registration)"
description: "Gửi email xác thực HTML (Resend) khi học viên đăng ký portal; portal có màn chờ xác thực kèm Gửi lại; soft mode không chặn đăng nhập."
status: completed
priority: P1
effort: 10h
issue: 259
branch: vinh19410/feat/student-email-verification
tags: [feature, backend, auth, frontend, infra]
blockedBy: []
blocks: []
created: 2026-09-24
---

# Student email verification (portal registration)

## Overview

Feature kế thừa plan `260923-0758-students-from-portal-registration` (đã completed, non-goal cũ dành sẵn chỗ cho email verification). Khi học viên đăng ký portal bằng email/password, server gửi ngay email xác thực HTML (tiếng Việt, brand TeacherOS) qua Resend HTTP API; đến khi verify xong, portal chỉ hiện màn "chờ xác thực" kèm nút Gửi lại — không lộ dữ liệu lớp học vì bridge `requireStudent` vẫn chỉ provision khi `emailVerified === true`.

**Chế độ đã chốt với user (2026-09-24):** soft mode — gửi mail khi sign-up, KHÔNG bật `requireEmailVerification` (sign-up vẫn tạo session, sign-in không bị chặn, apps/web teacher flow không đổi).

## Decisions

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | Soft mode: `emailVerification.sendOnSignUp: true` + `autoSignInAfterVerification: true`, không bật `requireEmailVerification` | User chốt; không vỡ luồng teacher/web + e2e hiện có; dữ liệu vẫn bị chặn bởi gate provisioning |
| D2 | Provider = Resend qua `fetch` thuần, bọc sau interface `Mailer` (`LogMailer` dev/test) | User chốt; Workers không có SMTP; free tier đủ; swap provider = 1 file |
| D3 | Fail-open khi gửi mail lỗi: log + user bấm Gửi lại | User chốt; nhất quán D7 của plan trước |
| D4 | Bridge `requireStudent`: 0 row + chưa verify → `EMAIL_UNVERIFIED` (trước đây trả `NOT_LINKED`) | Đúng ngữ nghĩa cho màn chờ xác thực; tái dùng code có sẵn; provisioning vẫn gate `emailVerified === true` |
| D5 | Mailer + template nằm trong `packages/auth` (`src/mail/`), inject qua `CreateAuthInput.mailer` (bắt buộc) | auth là consumer duy nhất (KISS); inject để vitest/e2e chạy plain node theo pattern DI hiện có |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Mailer + HTML verification template + Better-Auth wiring](./phase-01-mailer-and-template.md) | Completed |
| 2 | [Bridge requireStudent — 0 row + chưa verify trả EMAIL_UNVERIFIED](./phase-02-bridge-email-unverified.md) | Completed |
| 3 | [Portal — màn hình chờ xác thực + nút Gửi lại email](./phase-03-portal-pending-verification-ui.md) | Completed |
| 4 | [E2E happy-path + RecordingMailer + Runbook](./phase-04-e2e-and-runbook.md) | Completed |

## Success Criteria

- [x] Đăng ký portal → server gửi email verify (HTML < 15KB, tiếng Việt, có URL verify); dev thấy URL trong console (`LogMailer`)
- [x] User chưa verify vào portal → thấy màn "Email chưa được xác thực" + Gửi lại/Đăng xuất; KHÔNG thấy banner "Tài khoản chưa được liên kết"
- [x] Click link verify → tự đăng nhập, được provision hồ sơ, vào được overview
- [x] E2E happy-path pass 2 lần liên tiếp; spec `student-portal-provisioning` cũ vẫn xanh
- [x] `pnpm check`, `pnpm check-types`, `pnpm test` (root) exit 0

## Non-goals

- Chặn sign-in khi chưa verify (`requireEmailVerification`) — cần separate plan nếu muốn, sẽ đụng apps/web + e2e teacher flow
- Đổi email / password-reset email / email thông báo khác — chỉ làm verify email đăng ký
- Verify domain Resend (việc vận hành, hướng dẫn trong runbook — Phase 4)
- i18n ngoài tiếng Việt; MJML/React Email (template thuần là đủ)

## Risks & Notes

- Better-Auth 1.6.27 có hành vi khác docs: `sendOnSignUp` phải set tường minh; sign-up giữ session trong soft mode — đã xác minh từ source cài đặt, chi tiết trong `research/researcher-report-email-verification.md`
- `callbackURL` bị Better-Auth validate **hai lần**: lúc sign-up (trên body POST) và lúc click link verify (trên query GET) — cả hai đối chiếu `trustedOrigins`. Không cần và không nên rewrite URL verify phía server: BA tự nhúng `callbackURL` từ body sign-up vào URL (`sign-up.mjs:244-245`)
- Origin: dev/prod đã có sẵn đủ (alchemy dev default gồm 8001+8003 tại `alchemy.run.ts:56-61`; prod derive studentOrigin có fail-loud guard) — chỉ **e2e shim** thiếu, đã gán fix vào Task 4.1. Đừng tự đặt `CORS_ORIGIN` thủ công trong dev `.env`
- Cookie sau verify: `email-verification.mjs:295-314` setSessionCookie rồi redirect — đẳng cấu với google callback đang chạy tốt; KHÔNG đụng cookie config khi smoke gặp trở ngại
- Log-only mode in URL verify (token = đăng nhập 1 giờ) vào log dev/e2e — chấp nhận được vì LogMailer/RecordingMailer chỉ chạy dev/test; prod bắt buộc resend (boot guard Task 1.4)
- Anti-enumeration: `/send-verification-email` luôn trả `{status:true}` + timing floor 500ms; BA có sẵn rate rule 3 req/60s/IP (per-isolate memory trên Workers). Durable rate-limit tầng D1 nằm ngoài scope — chỉ làm nếu thấy lạm dụng (runbook)
- Quota Resend free (100/ngày) gồm cả email verify của teacher đăng ký web app (auth config dùng chung) — ghi trong runbook
- Test `student.test.ts:333-343` đổi kỳ vọng chủ đích (NOT_LINKED → EMAIL_UNVERIFIED) — contract change có chủ ý của D4

## Red Team Review

### Session — 2026-09-24
**Reviewers:** kongming (advisory, verdict READY-WITH-EDITS) + 3 hostile reviewers (Security Adversary/Fact Checker, Failure Mode Analyst/Flow Tracer, Assumption Destroyer/Contract Verifier)
**Findings:** 22 raw → 16 unique sau dedupe (**16 accepted**, trong đó 3 accept-modified; 0 rejected sau evidence filter — mọi finding đều có citation file:line)
**Severity breakdown:** 1 Critical, 6 High, 8 Medium, 1 bundle notes
**Verification (tier Standard, 4 phases):** Fact Checker 23 claims (22V/1F — failure: docs/runbook.md không tồn tại → đổi target); Flow Tracer 6 paths (6 confirmed dev/prod, 3 fail ở e2e-env cùng root cause Critical); Contract Verifier 5 interfaces (3 confirmed, 4 mismatches — đã fix hết qua các finding)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | E2E shim thiếu origin student → spec mới 403 ngay sign-up | Critical | Accept | Phase 4 Task 4.1/4.2 |
| 2 | `pnpm --filter @teacher-os/{server,student,e2e}` sai package name | High | Accept | Mọi phase (Verify commands) |
| 3 | 3 env vars không default → fresh clone + CI deploy vỡ | High | Accept | Phase 1 Task 1.4 |
| 4 | Task 1.4 đọc env type trước Task 1.5 khai báo (sequencing) | High | Accept (đổi thứ tự task) | Phase 1 |
| 5 | `userEmail` không được truyền ở nhánh `meQuery.error` → nút Gửi lại không render | High | Accept (bắt buộc hóa) | Phase 3 Task 3.2 |
| 6 | `overview.test.tsx:154` assert "Google" sẽ vỡ khi đổi copy | High | Accept | Phase 3 Task 3.3 |
| 7 | Không guard cấu hình mailer → prod log-only mất email âm thầm | High | Accept (boot guard) | Phase 1 Task 1.4 |
| 8 | Fail-open nuốt cả đường resend → UI báo "Đã gửi lại" khi lỗi | Medium | Accept (throw trên /send-verification-email) | Phase 1 Task 1.5 |
| 9 | ResendMailer không timeout; retry 429 với sleep 500ms vô ích | Medium | Accept (AbortSignal 10s + Retry-After) | Phase 1 Task 1.1 |
| 10 | Success criterion "mailer.send đúng 1 lần" chưa có gate | Medium | Accept (wiring unit test) | Phase 1 Task 1.5 |
| 11 | Regex mail-log `[^ ]+` nuốt cả newline | Medium | Accept (regex `[^\s]+`, bỏ fork meta) | Phase 4 Task 4.1 |
| 12 | E2E thiếu unique email + helper "dòng cuối" không đủ cho assert đếm | Medium | Accept | Phase 4 Task 4.3 |
| 13 | Tab chờ xác thực không tự phục hồi sau verify ở tab khác | Medium | Accept-modified (nút reload thay vì plumbing invalidation) | Phase 3 Task 3.2 |
| 14 | `docs/runbook.md` không tồn tại (runbook thật: production-release-runbook.md) | Medium | Accept | Phase 4 Task 4.5 |
| 15 | Mail-bombing endpoint resend — durable rate-limit store | Medium | Accept-modified (BA đã có rule 3/60s/IP + runbook; D1 store ngoài scope) | Phase 4 Task 4.5 + plan Risks |
| 16 | Notes kongming: callbackURL validate 2 lần; cookie path = google callback; import subpath; mkdir preview; log-noise là expected; .env.example:20 stale comment | P3 | Accept | Phase 1/3/4 + Risks |

**Decision được bảo toàn (không relitigate):** D1 soft mode, D2 Resend, D3 fail-open — mọi finding đều áp trong khung 3 quyết định này.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-04 (sau khi áp findings)
- Decision deltas checked: 16
- Reconciled stale references: pnpm filter names (toàn bộ), docs/runbook.md → production-release-runbook.md (phase-04 + sweep), Task 1.4/1.5 swap (plan.md không tham chiếu số task theo cách gãy), bỏ fork meta.verifyUrl (phase-04 khớp phase-01), userEmail "nếu cần" đã bỏ trong mọi file
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-09-24 (intake, trước khi draft)
- Chế độ verify: **Mềm — gửi mail, không chặn** (user chọn; recommended)
- Provider: **Resend qua HTTP API** (user chọn; recommended)
- Xử lý lỗi mail: **Fail-open** (user chọn; recommended)

### Session 2 — 2026-09-24 (red-team disposition)
- User chọn "Apply tất cả findings đã Accept" (15 + notes bundle)

### Verification Results
- Tier: Standard (4 phases)
- Claims checked: 34 (Fact Checker 23 + Flow Tracer 6 + Contract Verifier 5)
- Verified: 28 | Failed: 5 | Unverified: 1
- Failures (đã fix qua findings #1, #2, #6, #14 và sequencing #4): boot.ts CORS chỉ 8001; package name filters; test assert "Google"; docs/runbook.md; env type trước binding
- Unresolved: 0
