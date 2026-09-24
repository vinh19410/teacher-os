---
title: "Cook #260: tách role tài khoản theo app (student portal vs teacher app)"
date: 2026-09-24
---

# Cook #260: tách role tài khoản theo app (student portal vs teacher app)

## Kết quả

Implement đủ 4 phases của plan `260924-0215-account-role-app-separation` (issue #260), route feature qua `/ak:cook --tdd --auto`:

- **Phase 1**: cột `user.role` (default `'student'`) + migration 0024 backfill. Backfill đổi từ 4 bước NULL-based sang 2 statement gán `teacher` vì SQLite `ADD COLUMN ... DEFAULT` điền default vào row hiện hữu ngay — `WHERE role IS NULL` không bao giờ match. 6/6 test case (overlap 2 chiều + tie-break + 0 NULL) xanh.
- **Phase 2**: `packages/auth/src/role.ts` classifier (exact-match origin, unknown → oauthApp → `student` least-privilege); `createAuth` thêm `studentOrigins`, `user.additionalFields.role input:false`, `databaseHooks` user/session create.before (ROLE_MISMATCH message tiếng Việt), stamping OAuth qua hook `/sign-in/social` return `{ context: { body } }` (mutate `ctx.body` KHÔNG chảy vào state — docs better-auth xác nhận return-context merge; fallback signed cookie không cần). Env `STUDENT_ORIGINS` 3 nhánh mirror `CORS_ORIGIN` + guard fail-loud. 10/10 roundtrip test.
- **Phase 3**: `SessionUser.role` (NULL ≡ teacher); `bootstrapMiddleware` chặn student (403 `ACCOUNT_STUDENT_ROLE`, không bootstrap); `requireStudent` chặn teacher trước match/provision (403 `ACCOUNT_TEACHER_ROLE`); `ACCOUNT_ERROR_CODES` trong contracts. Session seeded tay không được better-auth nhận diện → mint qua sign-up thật + flip role trong DB (đúng kịch bản stale-session). 5/5 role-gates test; server 314/314.
- **Phase 4**: web GET transport parse `reason = body.error ?? body.reason` (trước đây vứt body 403); `role-block.ts` single-flight flag + `AccountBlockedView` (chỉ Đăng xuất); bus seam `onRoleBlocked` 3 điểm; portal `StudentErrorView` nhánh teacher-role; login routes 2 app toast OAuth error params + strip; e2e `account-role-separation.spec.ts` (Test A login-rejection, Test B stale-cookie blocked view) 2/2; docs PDR + system-architecture.

## Verification

`pnpm check` ✓ · `pnpm check-types` 0 error · `pnpm test` xanh (auth 50, server 314, web 722) · `pnpm build` ✓ · e2e full suite 79 pass / 1 skip / 0 fail. Simplifier chạy scoped (4 file, giữ behavior).

## Chưa xử lý

- Runbook audit prod (query overlap) + post-deploy `count(role IS NULL) = 0` là bước operator trước/sau deploy (đã ghi trong phase 1 & 3).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
