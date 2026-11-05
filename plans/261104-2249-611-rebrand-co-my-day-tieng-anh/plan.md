---
title: "Đổi tên thương hiệu Teacher OS thành Cô Mỹ Dạy Tiếng Anh"
description: "Thay tên hiển thị Teacher OS / TeacherOS bằng Cô Mỹ Dạy Tiếng Anh ở UI, email, landing, smoke check deploy và docs; giữ nguyên mọi định danh hạ tầng."
status: completed
priority: P2
effort: 5h
issue: 611
branch: develop
tags: [branding, web, admin, student, server, auth, landing, docs]
blockedBy: []
blocks: []
created: 2026-11-04
---

# Đổi tên thương hiệu thành "Cô Mỹ Dạy Tiếng Anh"

Issue: #611. Yêu cầu gốc: rebrand lại tên "Teacher OS" thành "Cô Mỹ Dạy Tiếng Anh".

## Outcome

Mọi chỗ người dùng nhìn thấy hoặc nhận được (tab title, header, màn đăng nhập, email, trang landing, tên người gửi mail) ghi "Cô Mỹ Dạy Tiếng Anh". Không còn chuỗi "Teacher OS" hay "TeacherOS" trong thứ người dùng đọc. Hệ thống chạy như cũ: domain, worker, package, cookie không đổi.

## Hiện trạng (đã scout)

- Chuỗi hiển thị `Teacher OS` có ở khoảng 124 chỗ và `TeacherOS` ở khoảng 35 chỗ, ngoài `plans/` và `dogfood-output/` (file sinh tự động).
- Nhóm hiển thị trong runtime:
  - UI: `apps/web` (`index.html`, `routes/__root.tsx`, `components/auth/auth-shell.tsx`, `routes/login.tsx`, `routes/verify-email.tsx`), `apps/admin` (shell, auth shell, `__root.tsx`, `login.tsx`, `index.html`), `apps/student` (`__root.tsx`, auth shell, `index.html`).
  - Server: `apps/server/src/routes/kernel.ts` (5 chỗ `fromName: "… qua Teacher OS"`), `lib/notifications/deliver.ts`, `lib/notifications/invite-email.ts`, `routes/grading.ts:774` (`source: "Teacher OS Demo"`).
  - Mail auth: 3 template trong `packages/auth/src/mail/` (reset-password, verification, otp).
  - Mặc định `MAIL_FROM` = `TeacherOS <onboarding@resend.dev>` ở `packages/infra/alchemy.run.ts:220` và `packages/infra/.env.example:54`.
  - Landing `apps/landing/public/index.html` (title, meta, og, twitter, hero, mockup, beta, FAQ).
- Ràng buộc nối: `.github/workflows/deploy.yml:137` và `deploy-staging.yml:231` chạy `grep -q 'Teacher OS' /tmp/landing.html` làm smoke check. Đổi landing mà không đổi hai dòng này thì deploy đỏ.
- Test và e2e khóa cứng chuỗi cũ: `apps/e2e/specs/{admin-auth,404-branded-status,notifications-ac-001}.spec.ts`, `apps/web/src/{routes/login-signup-gate,components/not-found}.test.tsx`, `apps/server/src/{student-invitation,lib/notifications/notifications}.test.ts`, `packages/auth/src/mail/mail.test.ts`.
- Không có hằng số tên thương hiệu dùng chung; `packages/config` chỉ chứa tsconfig, `packages/auth` không phụ thuộc `packages/api`.
- Plan #600 (landing `msmy.io.vn`, `apps/profile`) không đụng `apps/landing`. Chỉ có thể trùng ở `docs/production-release-runbook.md` và `CHANGELOG.md`.

## Quyết định thiết kế

1. **Chỉ đổi tên hiển thị.** Giữ nguyên `@teacher-os/*`, tên repo, `teacheros.io.vn` và subdomain, tên worker/D1/KV trong `packages/infra`, cookie prefix, topology test. Đổi các thứ này là migration hạ tầng riêng, rủi ro cao, không thuộc yêu cầu.
2. **Mỗi tầng một hằng số `BRAND_NAME`**, không phân tán literal: `apps/server/src/lib/brand.ts` và `packages/auth/src/mail/brand.ts`. UI mỗi app truyền chuỗi qua `brandLabel` có sẵn của `packages/ui`. Không tạo package mới chỉ để chứa một chuỗi.
3. **Hậu tố giữ nguyên** (`· Quản trị`, `· Học viên`, `· Cổng quản trị`, `qua …`) để cấu trúc câu và selector test không đổi ngoài phần tên.
4. **Landing chỉ thay tên và sửa câu đọc vô nghĩa** (ví dụ "Teacher OS is a teacher-first workspace…"). Không viết lại định vị sản phẩm; đó là quyết định nội dung riêng (xem Câu hỏi mở).
5. **Không đụng artifact sinh tự động và lịch sử**: `plans/`, `dogfood-output/`, `assets/videos/teacher-os-intro*`, `open-design/`, `scripts/claude-startups-apply.console.js`, `docs/journals/`.

## Phases

| # | Phase | Trạng thái | Phụ thuộc |
|---|---|---|---|
| 1 | [UI web, admin, student](phase-01-ui-apps.md) | completed | - |
| 2 | [Email, tên người gửi, MAIL_FROM](phase-02-email-and-sender.md) | completed | - |
| 3 | [Landing và smoke check deploy](phase-03-landing-and-deploy-smoke.md) | completed | - |
| 4 | [Docs, rà soát và xác minh](phase-04-docs-and-verify.md) | completed | 1-3 |

Phase 1-3 sở hữu file tách biệt nên làm song song được; phase 3 phải đổi landing và hai workflow trong cùng một commit.

## Acceptance criteria

- `grep -rnE "Teacher ?OS" apps packages .github docs README.md DESIGN.md CHANGELOG.md --include=* -I` chỉ còn trong allowlist ghi ở phase 4 (định danh hạ tầng, lịch sử, ghi chú "trước đây là Teacher OS").
- Tab title, header, màn đăng nhập của web, admin, student hiển thị tên mới; tên dài không làm vỡ sidebar ở 1440×900, 768×1024, 375×812.
- Email reset, verify, OTP, thông báo hóa đơn và lời mời có tên mới; `fromName` dạng `{senderName} qua Cô Mỹ Dạy Tiếng Anh`.
- Landing có tên mới trong title, meta, og, twitter, hero; smoke check của hai workflow deploy khớp với landing.
- `pnpm exec biome check .`, `pnpm check-types`, `pnpm --filter web test`, `--filter admin`, `--filter student`, `--filter server`, `--filter @teacher-os/auth`, `--filter landing` xanh; e2e `admin-auth`, `404-branded-status`, `notifications-ac-001` xanh local với port 8100/8101/8103/8104.
- Gửi thử một email thật trên staging và xác nhận tên người gửi có dấu hiển thị đúng.

## Non-goals

- Đổi domain `teacheros.io.vn`, tên worker, D1, package scope, tên repo.
- Đổi logo, màu, favicon, hay render lại video intro.
- Viết lại định vị landing từ "workspace cho gia sư" sang trang giới thiệu trung tâm.
- Đổi `msmy.io.vn` / `apps/profile` (đã mang tên cô Mỹ).

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Deploy đỏ vì smoke check còn grep `Teacher OS` | Phase 3 đổi landing và 2 workflow cùng commit; kiểm bằng `grep` trên `dist` sau build |
| Tên có dấu trong `From` bị nhà cung cấp mail/ client hiển thị lỗi | Thử staging trước khi đổi biến production; phương án lui: giữ biến `MAIL_FROM` cũ trên prod |
| Tên 19 ký tự tràn sidebar/auth card | Kiểm 3 viewport; nếu tràn, dùng `truncate` ở shell thay vì rút gọn tên |
| Đổi `MAIL_FROM` trên GitHub env là thay đổi vận hành ngoài repo | Ghi vào runbook; chỉ làm sau khi người dùng xác nhận |

## Câu hỏi mở

1. Có đổi domain `teacheros.io.vn` sang tên mới không? Mặc định plan này: **không** (cần kế hoạch DNS, OAuth redirect, cookie, CORS riêng).
2. Landing `apps/landing` hiện bán Teacher OS như SaaS cho gia sư IELTS. Giữ định vị đó với tên mới, hay chuyển thành trang giới thiệu của cô Mỹ? Mặc định: chỉ thay tên.
3. Tên người gửi mail dùng có dấu `Cô Mỹ Dạy Tiếng Anh` hay không dấu? Mặc định: có dấu, xác minh trên staging.

## Red Team Review

### Adversarial Reviewers
- **Security Adversary:** RFC 5322 compliance for multi-word UTF-8 display name in `composeFrom`, missing `<meta charset="utf-8">` in notifications, and sanitization boundaries.
- **Assumption Destroyer:** Missed `const ORG_NAME = "Teacher/OS"` in `apps/web/src/components/layout/app-shell.tsx`, hardcoded strings in `packages/ui/src/components/not-found-page.tsx`, and omitted auth email subject lines in `packages/auth/src/index.ts`.
- **Failure Mode Analyst:** Unicode NFC/NFD normalization risk in deploy smoke check `grep` between workflow YAML and landing HTML, and test suite scope.

### Findings & Dispositions
1. **Accept:** Add `apps/web/src/components/layout/app-shell.tsx` and `app-shell.test.tsx` to Phase 1 (`ORG_NAME = "Teacher/OS"` → `"Cô Mỹ Dạy Tiếng Anh"`).
2. **Accept:** Add `packages/ui/src/components/not-found-page.tsx` to Phase 1 (wordmark, monogram "CM", copyright).
3. **Accept:** Add Better-Auth email subject lines in `packages/auth/src/index.ts` to Phase 2.
4. **Accept:** Update `composeFrom` in `packages/auth/src/mail/mailer.ts` to quote multi-word display names (`"${name}" <${email}>`) for RFC 5322 compliance.
5. **Accept:** Add `formatSenderName` helper in `apps/server/src/lib/brand.ts` to prevent duplicate `"Cô Mỹ Dạy Tiếng Anh qua Cô Mỹ Dạy Tiếng Anh"`.
6. **Accept:** Enforce UTF-8 NFC normalization across all touched files.

### Whole-Plan Consistency Sweep
- Phase 1 & 2 files updated with exact file lists, test updates, and contracts.
- Consistent `BRAND_NAME = "Cô Mỹ Dạy Tiếng Anh"` (NFC encoded) across all layers.
- Invariants preserved: no changes to `@teacher-os/*`, domain `teacheros.io.vn`, worker/D1 bindings, or cookie prefixes.

## Validation Log

### Verification Results
- Claims checked: 28 claims verified across apps/web, apps/admin, apps/student, apps/server, packages/auth, packages/ui, landing, and deploy workflows.
- Verified: 28 | Failed: 0 | Unverified: 0
- Kongming advisory checkpoint: GO with conditions (sweep verification, NFC check, `formatSenderName` helper, RFC 5322 quoting in `composeFrom`).
