---
title: "Trang xác nhận email sau verify (teacher + student)"
description: "Sau khi bấm link xác thực email, người dùng đang đứng lại origin API nhận response trần; plan này đưa cả teacher lẫn student về trang xác nhận đúng nghĩa trên cổng của họ."
status: completed
priority: P2
effort: 7h
issue: 297
branch: vinh19410/feat/verify-email-confirmation-page
tags: [feature, auth, frontend]
blockedBy: []
blocks: []
created: 2026-10-01
---

# Trang xác nhận email sau verify (teacher + student)

## Overview

Link xác thực email do better-auth phát hành nằm trên origin API. Sign-up student truyền `callbackURL` nên sau verify được redirect — nhưng thẳng vào gate (`/login`), còn sign-up **teacher không truyền** (`apps/web/src/components/sign-up-form.tsx:40-44`) nên đứng lại origin API nhận response trần ("OK"/JSON). Người dùng không có trang xác nhận đúng nghĩa ở cổng nào.

Plan này thêm route `/verify-email` công khai trên **cả hai app** (web tiếng Anh, student tiếng Việt, cùng một thiết kế trạng thái): sign-up/resend truyền `callbackURL` về trang này; card thành công có CTA vào app; link sai/hết hạn có card lỗi + gửi lại email tại chỗ. Bằng chứng scout: `plans/reports/scout-261001-1335-verify-email-flow.md`.

## Scope Challenge

- Existing code: sign-up student có `callbackURL` (`apps/student/src/components/auth/sign-up-form.tsx:36-41`); resend precedent có sẵn (`apps/student/src/components/overview/student-error-view.tsx:39-71`); `?error=` search-param pattern đã dùng ở `apps/web/src/routes/login.tsx:20-30`; worker student có SPA fallback mở.
- Requested scope: thiết kế lại trang đích sau verify mail — thay response trần bằng trang xác nhận đúng nghĩa. Phỏng vấn validation mở rộng sang cả student portal (quyết định của user).
- Complexity: ~12 file, không service mới, 3 phase.
- Selected mode: HOLD SCOPE mở rộng theo phỏng vấn. Không `--yagni`.

## Decisions

| # | Quyết định | Lý do |
|---|------------|--------|
| D1 | Sign-up/resend truyền `callbackURL: ${window.location.origin}/verify-email?verified=1`. Không đổi shape URL email (vẫn `{API}/api/auth/verify-email?token=…&callbackURL=…`) | Fix ở gốc — better-auth chỉ redirect khi có callbackURL. Regex mail-log e2e (`boot.ts:40`) vẫn match |
| D2 | Marker `?verified=1` nướng sẵn trong callbackURL; trang đọc `validateSearch { verified, error }` | Better-auth redirect thành công **nguyên vẹn không thêm param** (đã đối chiếu dist 1.6.27), lỗi mới append `&error=`. Không marker thì không phân biệt được direct-nav với landing thành công |
| D3 | `verified=1` && không `error` → card thành công + CTA vào app (`window.location.assign("/")`, full load qua gate hiện có). Không auto-redirect, không đếm ngược | Chốt qua phỏng vấn: có closure rõ ràng, user chủ động; session cookie đã được set trước redirect nên CTA đi thẳng |
| D4 | Có `error` (TOKEN_EXPIRED/INVALID_TOKEN) hoặc thiếu `verified` → một card lỗi chung + nút gửi lại tại chỗ khi có session chưa verify, ngược lại link về login | Chốt qua phỏng vấn: teacher không có đường resend nào khác — không có nút này thì link hết hạn là ngõ cụt. Copy chung che cả expired/sai/đã-dùng (JWT single-use). Không echo giá trị `error` tùy ý |
| D5 | Làm cả hai cổng: web tiếng Anh + student tiếng Việt, cùng thiết kế trạng thái; 4 spec e2e student refactor qua helper chung | Chốt qua phỏng vấn (user chọn "Cả web + student portal"); student đổi landing từ redirect-thẳng-sang-gate thành trang xác nhận + CTA |
| D6 | Không bật `requireEmailVerification`; không thêm màn chờ xác thực trong workspace teacher; không i18n framework | Ngoài yêu cầu |
| D7 | Không viết component test cho view student (chỉ test view web) | App student có vitest nhưng 0 test file (precedent #292 cũng chỉ test web); view student là bản dịch logic đã test; luồng thật được e2e phủ ở phase 3 |

## Non-goals

- Bật bắt buộc xác thực email; màn pending/resend trong workspace teacher.
- Đổi mail template; đụng plan #292 (forgot/reset password); đổi ngôn ngữ web.
- Auto-redirect/đếm ngược sau verify.

## Phases

| # | Phase | Status |
|-------|-------|--------|
| 1 | [Trang xác nhận email trên web](./phase-01-start.md) | Pending |
| 2 | [Trang xác nhận trên student portal](./phase-02-student-portal.md) | Pending |
| 3 | [E2E hai cổng và CHANGELOG](./phase-03-e2e-changelog.md) | Pending |

## Dependencies

- better-auth `1.6.27` (`pnpm-workspace.yaml` catalog) — hành vi redirect đã đối chiếu dist của đúng version này.
- Không migration: `user.email_verified` có sẵn (`packages/db/src/schema/auth.ts`).
- Phase 2 tái dùng thiết kế trạng thái của phase 1. Phase 3 phụ thuộc cả hai.

## Success Criteria

- [ ] Teacher đăng ký → nhận mail → bấm link → thấy trang "Email verified" trên origin web với CTA vào workspace; không còn landing trần trên origin API.
- [ ] Student đăng ký → bấm link → thấy trang "Email đã được xác thực" trên origin student → CTA vào portal/onboarding.
- [ ] Link sai/hết hạn/bấm-lần-2 → card lỗi thân thiện trên đúng cổng, có nút gửi lại email khi còn session chưa verify.
- [ ] 4 spec e2e student refactor qua helper chung, không còn `goto(verifyUrl)` rải rác, và xanh; spec e2e teacher mới xanh.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter web exec vitest run src/routes-matcher.test.ts src/components/verify-email-view.test.tsx`, `pnpm --filter student check-types`, e2e ports-override đều exit 0.

## Red Team Review

Planner tự đối chiếu source trong phiên lập plan (kèm báo cáo scout). Không spawn 3 reviewer riêng vì plan 3 phase, cùng một thay đổi lặp lại trên hai app.

| ID | Severity | Evidence | Disposition |
|----|----------|----------|-------------|
| RT1 | High | `apps/e2e/src/boot.ts:40` regex `\/verify-email\?` bóc URL từ mail text | Accept — URL mới vẫn chứa `/verify-email?token=…`; chỉ thêm query `callbackURL` |
| RT2 | High | `apps/web/src/routes-matcher.ts:4-21` worker chỉ serve SPA cho route trong allowlist; drift guard test so `FileRoutesByFullPath` | Accept — phase 1 thêm `"/verify-email"` vào cả matcher lẫn test, chạy verify trước khi kết thúc phase |
| RT3 | Medium | Dist 1.6.27: redirect thành công không thêm param ⇒ trang không tự biết "thành công" | Accept — D2 marker `verified=1` trong callbackURL; lỗi thì better-auth append `&error=` giữ nguyên query cũ |
| RT4 | Medium | `autoSignInAfterVerification` set cookie trước redirect ⇒ trang nhận session đã verify | Accept — trang public, chỉ render query params, không PII; CTA full-load `/` đi qua gate đúng cổng. Session chưa verify (link rác) mới là điều kiện hiện resend |
| RT5 | Low | Bấm link lần 2 (JWT single-use) → INVALID_TOKEN | Accept — D4 copy chung "invalid, already used, or expired" |
| RT6 | Medium | 4 spec e2e student đang kỳ vọng landing thẳng `/onboarding` sau `goto(verifyUrl)` (`student-portal-email-verification.spec.ts:72-78`, `student-portal-onboarding.spec.ts:63-68`, `student-org-invitation-and-switcher.spec.ts:96`, `student-quiz-take-review.spec.ts:326`) | Accept — hệ quả tất yếu của D5; phase 3 refactor qua helper chung `verifyStudentEmailFromMailLog`, mỗi spec giữ assertion riêng |

### Whole-Plan Consistency Sweep

Xem Validation Log — sweep chạy sau khi lan quyết định phỏng vấn.

## Validation Log

### Verification Results

- Claims checked: 10
- Verified: 10 | Failed: 0 | Unverified: 0
- Tier: Standard (3 phases)

Claims: sign-up web không callbackURL (`apps/web/src/components/sign-up-form.tsx:40-44`, đọc trực tiếp); root API trả "OK" (`apps/server/src/app.ts:153-154`, scout); hành vi redirect/error/cookie của dist 1.6.27 (WebFetch unpkg đúng version); `trustedOrigins` = corsOrigin gồm cả hai origin app (`packages/auth/src/index.ts:73-78` + `apps/e2e/src/boot.ts:27-30`); regex mail-log (`boot.ts:40`); allowlist + drift guard web (`routes-matcher.ts:4-21`); SPA fallback student (`apps/student/src/worker.ts:83-94`); precedent `validateSearch` đọc `error` (`routes/login.tsx:20-30`); `WEB_ORIGIN` có sẵn (`apps/e2e/specs/origins.ts:7`); 4 vị trí `goto(verifyUrl)` (grep trực tiếp).

### Interview

3 câu hỏi, trả lời ngày 2026-10-01:

1. Phạm vi → **"Cả web + student portal"** (không phải option recommend "chỉ teacher"): D5 đổi, phase 2 + RT6 + refactor helper ở phase 3.
2. Hành vi sau verify thành công → **"Card thành công + nút CTA"** (đề xuất): D3 giữ nguyên.
3. Link hỏng → **"Có resend tại chỗ"** (đề xuất): D4 giữ nguyên.

### Propagation

<!-- Updated: Validation Session 1 - D5 sang cả hai cổng: thêm phase 2 (student portal) + phase 3 (e2e 2 cổng), cập nhật Decisions/Non-goals/Success Criteria/RT6 -->
<!-- Updated: Cook session 2026-10-01 - D2 marker `?verified=1` → `?verified=ok`: full e2e chứng minh TanStack Router parseSearch mặc định JSON.parse search value nên "1" bị parse thành number và URL-sync prune param (5/5 spec fail cùng pattern). better-auth 1.6.27 giữ nguyên callbackURL trên redirect thành công (curl xác nhận) — RT3 đúng tầng API, sai tầng router. Kongming counsel xác nhận qua probe thực nghiệm 4 giá trị marker. -->

### Whole-Plan Consistency Sweep

Sau lan truyền: đã rà `plan.md` + 3 phase file. Cùng một marker `?verified=1`, cùng bảng copy (web EN / student VI), cùng callbackURL ở cả sign-up lẫn resend, cùng lệnh verify (`pnpm check`, `check-types` mỗi app, e2e ports override). Không còn tuyên bố "chỉ teacher" nào sót: Overview, Scope Challenge, Decisions D5, Phases, Success Criteria, RT6 đã đồng bộ; phase-01 giữ đúng phạm vi web (task resend web vẫn dẫn precedent student error-view — vẫn đúng vì chỉ tham chiếu code hiện có). Không mâu thuẫn còn mở.

<!-- slug: verify-email-confirmation-page -->
