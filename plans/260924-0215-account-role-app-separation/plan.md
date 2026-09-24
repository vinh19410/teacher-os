---
title: "Tách role tài khoản theo app: student portal vs teacher app"
description: "Gán user.role lúc tạo account theo app nguồn (portal → student, teacher app → teacher, không-sign → student), chặn đăng nhập chéo ngay lúc tạo session (email + Google), và gate role ở middleware API 2 phía vì cookie zone dùng chung cross-subdomain."
status: pending
priority: P1
effort: 16h
issue: 260
branch: vinh19410/feat/account-role-app-separation
tags: [feature, backend, api, database, auth, frontend, security]
blockedBy: []
blocks: []
created: 2026-09-24
---

# Tách role tài khoản theo app: student portal vs teacher app

## Overview

Yêu cầu: account được tạo từ student portal sẽ là role `student`; account role `student` không thể đăng nhập bên teacher app và ngược lại account giáo viên không thể đăng nhập portal. Hiện trạng: bảng `user` không có role, `bootstrapMiddleware` tự cấp workspace teacher cho **mọi** user mới (học viên portal đăng ký xong mở `app.<domain>` là có org), cookie session dùng chung cross-subdomain nên login portal tạo session hợp lệ ngay trên teacher app, và server không biết sign-up đến từ app nào. Plan này gắn role vào account (3 lớp: gán lúc tạo, chặn lúc tạo session, gate ở middleware API) với cơ chế better-auth đã verify trên source 1.6.27 (`reports/researcher-better-auth-hooks.md`).

## Scope Challenge (HOLD)

- Yêu cầu gốc (user, 2026-09-24): account tạo từ student portal → role student; role student không login được teacher app; ngược lại cũng vậy.
- Implicit must-have (không làm thì yêu cầu chỉ là cosmetics): (1) gate ở middleware API — cookie `Domain=.<domain>` dùng chung nên chặn form login là chưa đủ; (2) luồng Google OAuth — portal CÓ nút Google (`apps/student/src/components/auth/google-oauth-button.tsx`) nên không thể chỉ xử lý email/password; (3) backfill user hiện hữu — không phân loại thì gate sẽ khóa nhầm hoặc mở lỗ.
- Giữ nguyên: open sign-up, provisioning portal #257, enrollment lifecycle #253, postures đã chấp nhận (org sớm nhất, fail-open provisioning).

## Decisions

| # | Quyết định | Nội dung |
|---|-----------|----------|
| D1 | Role là cột `user.role` (DEFAULT `'student'`) + better-auth `additionalFields` (`input: false`) | Role gắn danh tính đăng nhập toàn cục — không đặt vào `membership.role` (org-scoped, sinh sau khi bootstrap). `input:false` chặn client tự gán qua sign-up/`update-user`/OAuth profile (verify trên source: 400 `role is not allowed to be set` ở cả 3 đường). Cột thật bắt buộc: drizzle adapter ném `BetterAuthError` nếu thiếu. Default `'student'` = least-privilege cho row sinh trong cửa sổ deploy thiếu hook. |
| D2 | Backfill "nguồn sử dụng ĐẦU TIÊN thắng" theo `created_at` | Nhóm overlap (membership do lỗ hổng cũ + student row) tách 2 chiều: membership sinh trước/như student row → `teacher` (giáo viên chủ test portal — an toàn chiều giáo viên, tie-break tất định); student row sinh trước → `student` (học viên mở nhầm teacher app). Chỉ có membership → teacher; chỉ student row / không dấu vết → student. Kèm audit query bắt buộc trước deploy + runbook flip sau deploy (Red-team Critical #1; user chốt 2026-09-24). |
| D3 | Gán role lúc tạo account: `databaseHooks.user.create.before` trả `{ data: { role } }`; classifier chỉ tin Origin khớp CHÍNH XÁC origin đã biết | Chạy cho CẢ email và OAuth sign-up (cùng qua `createWithHooks`); `hooks.before` mutate body không dùng được cho role (`input:false` → 400). Origin ∈ `studentOrigins` → student; Origin ∈ teacherOrigins (trusted trừ student) → teacher; origin lạ/chuỗi `"null"`/thiếu → OAuth state → `'student'` (least privilege, không bao giờ default teacher với tín hiệu không tin cậy). Curl giả Origin teacher vẫn classify teacher ≡ open sign-up posture hiện hành — ranh giới thật là role column + API gate. |
| D4 | Chặn đăng nhập chéo: `databaseHooks.session.create.before` throw `APIError("FORBIDDEN", { code: "ROLE_MISMATCH", message: <VN> })` | Một chỗ chặn cả email lẫn OAuth (đều qua `internalAdapter.createSession`). Email: JSON error tới form, `authErrorMessage` hiển thị nguyên văn. OAuth callback: 302 tới `errorCallbackURL` kèm `?error=ROLE_MISMATCH&error_description=<message>` → route `/login` toast rồi strip params. |
| D5 | OAuth app-detection: server-side stamping tại initiation | `hooks.before` trên `/sign-in/social` đọc Origin của POST initiation (browser luôn gửi, kể cả client bundle cũ) và stamp `additionalData.app` vào OAuth state (bảng `verification`, server-side); callback đọc bằng `getOAuthState()`. Client KHÔNG khai báo app (loại trừ vector bundle-cũ mà Red-team Critical #2 phát hiện: client-only additionalData khiến teacher bundle cũ bị khóa + Google signup mới nhận role student vĩnh viễn). Client chỉ thêm `errorCallbackURL` để landing lỗi về `/login`. Fallback nếu mutation không chảy: signed cookie marker trong cùng hook. |
| D6 | Gate role ở middleware API 2 phía | `bootstrapMiddleware`: session role `student` → 403 `ACCOUNT_STUDENT_ROLE`, KHÔNG bootstrap org/membership. `requireStudent` (portal): role ≠ `student` → 403 `ACCOUNT_TEACHER_ROLE` TRƯỚC match/provision email. Bắt buộc vì cookie zone dùng chung: login portal đã có session hợp lệ trên `app.<domain>` mà không cần đăng nhập lại. |
| D7 | UX chặn: web blocked view qua seam `QueryCache.onError` (trigger theo `reason`); portal thêm nhánh `StudentErrorView` | Web transport GET phải parse body (`reason = body.error ?? body.reason` — hiện đang vứt body, Red-team High #6) rồi `query-client` so `reason === ACCOUNT_STUDENT_ROLE` — không match theo status 403 chung chung. View chỉ có Đăng xuất (user chốt 2026-09-24, không link chéo sang portal). Portal: nhánh `ACCOUNT_TEACHER_ROLE`. |
| D8 | Env: `STUDENT_ORIGINS` mirror đúng 3 nhánh + guard fail-loud của `CORS_ORIGIN` | Topology → `withDefault(topology.studentOrigin)` + throw nếu explicit env thiếu origin portal (chống override dev âm thầm khi deploy — alchemy nạp cả `apps/*/.env` lúc deploy); dev → `withDefault("http://localhost:8003")`; còn lại → không default (fail tại deploy). Không ghi dev value vào `apps/server/.env`; typing suy từ alchemy env block, không sửa `env.d.ts`. Classifier thuần `packages/auth/src/role.ts` dùng chung Phase 3. |
| D9 | Release sequencing: Phase 1+2+3 ship trong MỘT release (một PR, deploy một lần) | Không có ràng buộc này, sign-up rơi vào cửa sổ giữa migration 0024 và hooks sinh `role` lệch; default `'student'` (D1) + bước post-deploy `count(role IS NULL) = 0` (Phase 3) là 2 lớp phòng còn lại. Precedent: #257 D5 deploy-cùng-nhánh. |

## Non-goals

- Không thêm trang admin đổi role — flip `role` thủ công qua DB khi hỗ trợ (follow-up nếu phát sinh nhu cầu thật).
- Không thêm link "mở cổng học viên" trên blocked view của web (cần plumbing env build mới cho URL portal) — view chỉ có Đăng xuất.
- Không chế email verification flow (plan stub riêng `260924-0213-student-email-verification`); portal tiếp tục chỉ dùng được với Google (email/password portal chưa verify vẫn không provision — non-goal #257).
- Không đụng enrollment lifecycle (#253), provisioning logic #257 (ngoài thứ tự gate phía trước), open sign-up posture, dữ liệu legacy.
- Không hỗ trợ Google One Tap / `idToken` sign-in (repo không dùng; nếu thêm sau, `resolveRequestApp` đã có Origin-first nên vẫn đúng).

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Migration `user.role` + backfill phân loại](./phase-01-start.md) | Pending |
| 2 | [better-auth gán role theo app nguồn + chặn đăng nhập chéo](./phase-02-auth-role-assignment.md) | Pending |
| 3 | [Gate role ở API — bootstrap teacher-app và bridge portal](./phase-03-server-role-gates.md) | Pending |
| 4 | [UX 2 phía + E2E regression + docs](./phase-04-client-ux-e2e-docs.md) | Pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|-------------|------|--------|
| Built-on (portal + provisioning + unique index) | `260923-0758-students-from-portal-registration` | completed |
| Built-on (portal app + bridge + server bridge) | `260923-0641-student-portal-app` | completed |
| Related (cùng domain portal identity, stub TBD) | `260924-0213-student-email-verification` | pending (stub) |

## Success Criteria

- [ ] Account tạo từ portal (email + Google) có `user.role = 'student'`; từ teacher app có `'teacher'`; sign-up không Origin / Origin lạ / `Origin: null` có `'student'`.
- [ ] Google sign-up/đăng nhập phân loại đúng cả khi client bundle cũ (server-side stamping — test đọc state row).
- [ ] Student-role đăng nhập teacher app bị chặn ở form (email) hoặc redirect-error (Google) với message tiếng Việt; KHÔNG có session row được tạo (E2E Test A).
- [ ] Teacher-role đăng nhập portal bị chặn tương tự ở cả 2 phương thức.
- [ ] Stale session student-role (cookie cũ) mở thẳng teacher app → mọi API trả 403 `ACCOUNT_STUDENT_ROLE`, hiển thị blocked view; DB không phát sinh org/membership (E2E Test B).
- [ ] Teacher-role mở portal → 403 `ACCOUNT_TEACHER_ROLE` + error view; KHÔNG sinh student row (kể cả email trùng hồ sơ học viên).
- [ ] Backfill "nguồn dùng đầu tiên thắng": sau migration 0 row `role IS NULL`; giáo viên overlap (membership trước) giữ `'teacher'`; học viên overlap (student row trước) về `'student'`; audit query chạy trước deploy.
- [ ] Client không tự set/đổi role được (400); các 403 khác không bị nhận nhầm thành blocked view (transport test).
- [ ] Phases 1-3 ship một release; post-deploy prod `count(role IS NULL)` = 0.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build` xanh; e2e `account-role-separation.spec.ts` + suite cũ xanh.

## Reports

- [reports/scout-report.md](./reports/scout-report.md)
- [reports/researcher-better-auth-hooks.md](./reports/researcher-better-auth-hooks.md)

## Red Team Review

### Session — 2026-09-24
**Findings:** 21 thô → 12 cụm sau dedup (9 accepted: 6 Accept, 3 Accept-modified; 3 gộp vào cụm khác; 0 rejected sau evidence filter — mọi finding đều có `file:line`)
**Severity breakdown (theo cụm):** 3 Critical, 5 High, 1 Medium
**Reviewers:** Security Adversary + Failure Mode Analyst (Contract Verifier) + Assumption Destroyer (Fact Checker) — 3 reviewer song song, tier Standard
**User decision:** áp dụng toàn bộ (AskUserQuestion 2026-09-24); backfill chọn "nguồn dùng đầu tiên thắng"; UX chặn chỉ có Đăng xuất.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Backfill "membership thắng" dùng dữ liệu bị chính lỗ hổng làm bẩn → giáo viên chủ test portal bị đúng luật, nhưng học viên từng mở nhầm teacher app bị khóa portal vĩnh viễn + giữ workspace rác | Critical | Accept (modified) → luật "nguồn dùng đầu tiên thắng" theo `created_at` + audit query bắt buộc trước deploy + runbook flip sau deploy | plan.md D2, Phase 1 |
| 2 | OAuth app-detection phụ thuộc client `additionalData` — bundle cũ không gửi → teacher Google login redirect về endpoint chết; Google signup mới nhận role `student` vĩnh viễn | Critical | Accept (modified) → server-side stamping `additionalData.app` trong `hooks.before` `/sign-in/social` (bundle-cũ-safe); client chỉ thêm `errorCallbackURL` | plan.md D5, Phase 2 |
| 3 | Classifier fail-open về `teacher` cho mọi origin không khớp (kể cả chuỗi `"null"`, origin lạ) — ngược least-privilege; `Origin: null` ở callback khóa student khỏi Google portal | High | Accept (modified) → chỉ tin origin khớp chính xác student∪teacher; còn lại → OAuth state → `student` | plan.md D3, Phase 2 |
| 4 | Cửa sổ deploy Phase 1→2 sinh user `role IS NULL` được đối xử như teacher, không có re-backfill | High | Accept → D9: ship 1 release; cột `DEFAULT 'student'`; post-deploy `count(role IS NULL) = 0` | plan.md D9, Phase 1, 3 |
| 5 | E2E spec cũ bất khả thi (Phase 2 chặn login tại form → blocked view không bao giờ mount) | High | Accept (modified) → Test A login-rejection UI + Test B stale-session cookie reuse (sign-up API → flip role → addCookies) | Phase 4 |
| 6 | Web read-path vứt body 403 (`HttpError` không mang mã) + 2 file bắt buộc (`repos/kernel.ts`, `kernel-load-state.ts`) thiếu khỏi file list | High | Accept (modified) → GET transport parse `reason = body.error ?? body.reason`; trigger theo `reason`, cấm match status chung chung | Phase 4 |
| 7 | Test recipe chết ở 403 `INVALID_ORIGIN` (trustedOrigins thiếu origin portal) + Phase 3 không thể tạo session qua API cho user student | High | Accept → `corsOrigin` 2 origin trong mọi test; Phase 3 seed session row trực tiếp (pattern `kernel.test.ts:99-104`) | Phase 2, 3 |
| 8 | `STUDENT_ORIGINS`: thiếu guard fail-loud + thiếu nhánh thứ 3; chỉ dẫn ghi dev value vào `.env` mà alchemy nạp cả lúc deploy (override âm thầm biến mọi portal signup thành teacher) | High | Accept (modified) → mirror 3 nhánh + guard throw; bỏ `.env` instruction; bỏ `env.d.ts` (pattern không tồn tại — typing infer từ alchemy) | plan.md D8, Phase 2 |
| 9 | Contract change thiếu consumer: `createAuth` call sites (auth-roundtrip.test.ts, cookie-prefix.test.ts) + `SessionUser` stubs (kernel.test.ts, kernel-occurrence.test.ts, lesson-date-integration.test.ts, student.test.ts ~7 object) | High | Accept → bổ sung đủ vào file list; cấm `role?` optional | Phase 2, 3 |

Gộp: R3F5 (env.d.ts pattern) → #8; R2F8 (Origin `"null"`) → #3; R2F7 (sequencing) → #4.

### Verification Results (gộp 3 reviewer, tier Standard)
- Claims checked: ~60 (có trùng giữa reviewer) · Verified: ~48 · Failed: 9 (mỗi failed map vào 1 finding, đã xử lý) · Unverified: 2
- Unverified đã xử lý: (1) mutating `ctx.body.additionalData` chảy vào state — giữ kèm test bắt buộc đọc row `verification` + fallback signed-cookie chỉ định sẵn; (2) Google callback E2E — không test được với dummy creds (giống #257), cover bằng roundtrip assert 302 `Location` header.
- Fact-check xác nhận ĐÚNG: `getOAuthState` export 1.6.27; `createWithHooks` phủ OAuth sign-up; bảng `verification` + strategy database; portal không chạm bootstrapMiddleware; `topology.studentOrigin` tồn tại; dev ports 8001/8003; migration kế tiếp 0024; cơ chế errorCallbackURL fallback `${baseURL}/error`.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-04 (sau khi áp 9 cụm findings).
- Decision deltas checked: 9 (backfill earliest-usage, server-side stamping, classifier exact-match, release sequencing, e2e 2-test redesign, web reason plumbing, test corsOrigin/seed-session, env guard 3 nhánh, contract consumers).
- Reconciled: Overview, Decisions D1-D9, Non-goals (link chéo portal thành non-goal theo user), Success Criteria, toàn bộ 4 phase viết lại theo findings; bỏ mọi đề cập client `additionalData`, env.d.ts, "membership thắng" cũ.
- Unresolved contradictions: 0.

## Validation Log

### Pre-draft decisions (interview) — 2026-09-24
1. Red-team findings: **áp dụng toàn bộ 9 cụm** (AskUserQuestion).
2. Backfill overlap: **nguồn sử dụng đầu tiên thắng** theo `created_at` (AskUserQuestion).
3. UX chặn teacher app: **chỉ Đăng xuất**, không link chéo sang portal (AskUserQuestion).
