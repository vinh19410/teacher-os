---
phase: 1
title: "Trang xác nhận email trên web"
status: completed
priority: P2
effort: 3h
dependencies: []
---

# Phase 1: Trang xác nhận email trên web

## Goal

Sau khi bấm link xác thực trong email, teacher landing trên trang `/verify-email` của cổng web (tiếng Anh, khung `BrandPanel`) với card trạng thái đúng nghĩa thay vì response trần trên origin API. Sign-up form truyền `callbackURL` để better-auth biết chỗ để redirect.

## Context

- Báo cáo scout: `plans/reports/scout-261001-1335-verify-email-flow.md` (hành vi dist better-auth 1.6.27: thành công redirect nguyên vẹn, lỗi append `?error=`, cookie session set trước redirect).
- Better-auth redirect: thành công → `WEB/verify-email?verified=1`; token hết hạn → thêm `&error=TOKEN_EXPIRED`; token sai → `&error=INVALID_TOKEN`.

## Files to Create / Modify

- Create: `apps/web/src/routes/verify-email.tsx`
- Create: `apps/web/src/components/verify-email-view.tsx`
- Create: `apps/web/src/components/verify-email-view.test.tsx`
- Modify: `apps/web/src/components/sign-up-form.tsx` (thêm `callbackURL` cho `signUp.email`)
- Modify: `apps/web/src/routes-matcher.ts` (`VALID_EXACT_ROUTES`)
- Modify: `apps/web/src/routes-matcher.test.ts` (`validStaticRoutes`)
- Generated, không sửa tay: `apps/web/src/routeTree.gen.ts` (sinh qua `check-types` = `vite build && tsc --noEmit`)

## Tasks & Steps

### Task 1.1 — View component đọc trạng thái từ query

- Goal: một component thuần hiển thị đúng 3 nhánh trạng thái, không gọi API để kết luận thành công/bại.
- Target files: `apps/web/src/components/verify-email-view.tsx`, `apps/web/src/components/verify-email-view.test.tsx`.
- Props: `{ verified?: string; error?: string }` (route decode xong mới truyền vào).
- Steps:
  1. Logic nhánh: `error` có giá trị → error card; ngược lại `verified === "1"` → success card; còn lại (direct-nav thiếu param) → error card với cùng copy nhánh lỗi.
  2. Success card: icon `MailCheck` (lucide-react), heading `Email verified`, copy `Your email address has been confirmed. You're all set.`, một `Button` `Go to workspace` — handler `window.location.assign("/")` (full page load qua kernel load gate với session vừa được `autoSignInAfterVerification` set, giống `sign-up-form.tsx:66`). Không auto-redirect, không đếm ngược.
  3. Error card: icon `CircleAlert`, heading `This link didn't work`, copy `The verification link is invalid, already used, or has expired. Request a new one, or sign in and continue.` Không hiển thị giá trị thô của `error` — copy tĩnh che cả `TOKEN_EXPIRED`, `INVALID_TOKEN` và link đã dùng (token là JWT single-use).
  4. Trong error card, block phục hồi: dùng `authClient.useSession()`; nếu có session **và** `user.emailVerified === false` → nút `Send a new link` gọi `authClient.sendVerificationEmail({ email: user.email, callbackURL: \`${window.location.origin}/verify-email?verified=1\` })` theo đúng precedent `apps/student/src/components/overview/student-error-view.tsx:44-47` (kể cả nhánh `EMAIL_ALREADY_VERIFIED` → reload). Không session hoặc đã verified → chỉ hiện `Link` "Back to sign in" tới `/login`.
  5. Sau khi resend thành công: đổi nút thành câu `We've sent a new verification email.` và ẩn nút gửi (không toast thành công đôi lúc sai lệch trạng thái card).
  6. Test (`verify-email-view.test.tsx`): `vi.mock("@/lib/auth-client")` trả session `null`. Case 1 render `{ verified: "1" }` → expect heading `Email verified` + nút `Go to workspace`. Case 2 render `{ error: "TOKEN_EXPIRED" }` → expect heading `This link didn't work`, **không** thấy chuỗi `TOKEN_EXPIRED` nào trong DOM. Case 3 render `{}` → heading error card. Case 4: mock session `{ user: { email: "t@school.edu", emailVerified: false } }` + `{ error: "INVALID_TOKEN" }` → expect nút `Send a new link`; click → expect mock `sendVerificationEmail` gọi với email đúng và `callbackURL` chứa `/verify-email?verified=1`.
- Success criteria: 4 case test xanh; component không chứa chuỗi tiếng Việt; không ghi token/param ra console hay storage.
- Verify: `pnpm --filter web exec vitest run src/components/verify-email-view.test.tsx`

### Task 1.2 — Route `/verify-email` khung BrandPanel

- Goal: route public decode search param và bọc view trong khung trang như login.
- Target files: `apps/web/src/routes/verify-email.tsx`.
- Steps:
  1. `createFileRoute("/verify-email")` với `validateSearch` theo đúng pattern `apps/web/src/routes/login.tsx:20-30`: chỉ giữ `verified` và `error` khi là string, bỏ mọi key khác.
  2. Layout: copy khung `main`/`BrandPanel`/cột phải từ `apps/web/src/routes/login.tsx:73-99`, bỏ `AuthTabs`, `GoogleOAuthButton`, divider "or use email". Heading cột: `Verify your email`. Không đặt dưới `_auth` — trang public như `/login` (người bấm link có thể chưa từng có session).
  3. Render `<VerifyEmailView verified={verified} error={error} />`.
- Success criteria: điều hướng thẳng `/verify-email` không crash; navigate với `?verified=1` hiển thị success card.
- Verify: task 1.4 (routeTree + check-types + matcher test).

### Task 1.3 — Đăng ký route với worker SPA allowlist

- Goal: worker web serve shell SPA cho `/verify-email`, không 404.
- Target files: `apps/web/src/routes-matcher.ts`, `apps/web/src/routes-matcher.test.ts`.
- Steps:
  1. Thêm `"/verify-email": true` vào `VALID_EXACT_ROUTES` cạnh `"/login"`.
  2. Thêm `"/verify-email"` vào mảng route tĩnh trong `routes-matcher.test.ts` (cùng chỗ `"/login"`). Drift guard so `FileRoutesByFullPath` sẽ tự bắt lệch nếu route file chưa sinh vào `routeTree.gen.ts`.
- Success criteria: `isValidAppRoute("/verify-email")` true (có/không trailing slash).
- Verify: `pnpm --filter web exec vitest run src/routes-matcher.test.ts`

### Task 1.4 — Sign-up form truyền callbackURL + sinh route tree

- Goal: email verify của teacher mang callback về trang mới; router công nhận route.
- Target files: `apps/web/src/components/sign-up-form.tsx`; generated `routeTree.gen.ts`.
- Steps:
  1. Trong `onSubmit` của `sign-up-form.tsx`, đổi call thành `authClient.signUp.email({ email: value.email, password: value.password, name: value.name, callbackURL: \`${window.location.origin}/verify-email?verified=1\` })`. Không đọc bất kỳ URL/redirect nào từ query người dùng gõ.
  2. Chạy `pnpm --filter web check-types` để `vite build` sinh `routeTree.gen.ts` chứa `/verify-email`. Không sửa tay file gen, không commit `dist/`.
- Success criteria: `routeTree.gen.ts` chứa `'/verify-email'` trong `FileRoutesByFullPath`; source sign-up có đúng một chỗ truyền `callbackURL`.
- Verify: cả bốn lệnh exit 0:
  - `pnpm --filter web exec vitest run src/routes-matcher.test.ts src/components/verify-email-view.test.tsx`
  - `pnpm --filter web check-types`
  - `pnpm check` (từ repo root)
  - `pnpm check-types` (từ repo root)

Nếu `check-types` fail sau khi `/verify-email` đã xuất hiện trong `routeTree.gen.ts` và lỗi nằm ngoài file phase này tạo, dán log vào báo cáo phase và STOP theo Failure Protocol. Nếu `/verify-email` chưa xuất hiện trong gen file, đó cũng là fail.

## Security Considerations

- `callbackURL` chỉ ghép từ `window.location.origin` — không nhận từ query (chống open redirect; better-auth originCheck với `trustedOrigins` là lớp thứ hai).
- Trang public, chỉ render từ query params, không PII, không đọc/ghi storage, không log token.
- Copy lỗi tĩnh — không echo `error`/`error_description` tùy ý ra UI (theo precedent whitelist `ROLE_MISMATCH` ở `login.tsx:48-58`).
- Resend chỉ hiện khi có session chưa verify; dùng endpoint chuẩn của better-auth, không tự phát hành token.

## Failure Protocol

If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
