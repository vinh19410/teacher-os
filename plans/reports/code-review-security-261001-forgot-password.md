# Security review — Quên mật khẩu qua email (#292)

- **Người review:** code-reviewer (subagent)
- **Ngày:** 2026-10-01
- **Scope:** `git diff develop..HEAD` (6 commit) tại worktree `teacher-os-vinh19410-feat-forgot-password-email-reset` — 41 file, +2443/−120
- **Phương pháp:** đọc toàn bộ diff + source ngữ cảnh; đối chiếu better-auth **v1.6.27** trên GitHub tag (`api/routes/password.ts`, `api/middlewares/origin-check.ts`, `context/create-context.ts`) vì hook chặn đọc `node_modules` — mức tin cậy: cao (source chính chủ của đúng tag trong catalog); chạy full gate local trong worktree.

## Kết luận tổng quan

Không có finding Critical hay Important. Cả 6 acceptance criterion đều đạt dựa trên code (không dựa vào claim trong plan). Chất lượng implementation khớp các quyết định D1–D9; test là hành vi thật (libsql + migrations thật, e2e đủ 4 kịch bản), không có phantom test nào được phát hiện.

## Bảng findings

| # | Severity | Finding | Vị trí | Xử lý đề xuất |
|---|----------|---------|--------|----------------|
| S1 | Minor | Form forgot-password student thiếu guard `if (cooldown > 0) return` trong `onSubmit` (bản web có tại dòng 36). Nút đã disable nhưng submit bằng Enter khi cooldown > 0 vẫn gọi API → dính 429 → hiện copy "thử quá nhiều lần". Không ảnh hưởng security (server rate-limit chặn trước, response trung tính), chỉ lệch hành vi giữa hai app và UX. | `apps/student/src/components/auth/forgot-password-form.tsx:42-44` | Thêm guard giống web, hoặc bỏ guard ở web để thống nhất — một trong hai. |
| S2 | Minor | Lỗi mailer được log nguyên `error.message` từ Resend (`resend send failed: <status> <errorText>`). Error body Resend có thể chứa địa chỉ email đích trong một số lỗi validation, lọt log server. Không lộ token; PII mức thấp, log nội bộ. Test hiện mock error không chứa email nên assertion `not.toContain(email)` không phủ được path này. | `packages/auth/src/mail/mailer.ts:66-69`, log tại `packages/auth/src/index.ts:166-170` | Log tách bạch `status` và chỉ giữ message đã sanitize, hoặc assertion test thêm case error-message-chứa-email. |
| S3 | Minor (đã được plan chấp nhận — F4) | `MAILER_IMPL=log` in nguyên URL reset (kèm token) ra log qua `input.text`. Plan đã accept với startup warning; hạ tầng đã pass env (`packages/infra/alchemy.run.ts:123`, commit develop `a0f4bc6`/`1e87ea9`). Rủi ro chỉ thực thi nếu môi trường nhận mail thật quên đặt `MAILER_IMPL=resend`. | `packages/auth/src/mail/mailer.ts:12-23`, cảnh báo `apps/server/src/index.ts:37-41` | Không sửa code. Đảm bảo checklist deploy giữ mục mail env (đã ghi trong plan Deploy Order). |
| I1 | Info | Timing residual: nhánh email tồn tại ghi DB (createVerificationValue) trong nhánh không tồn tại chỉ đọc dummy (better-auth tự cân bằng + mail đã nằm ngoài request qua `waitUntil`). Chênh lệch còn lại cỡ ms, thấp hơn network jitter — không phải oracle thực dụng. | better-auth `api/routes/password.ts` v1.6.27 | Không cần sửa. |
| I2 | Info | Role gate có unit test chiều teacher-account + redirect-student-origin; chiều ngược (student account + redirect teacher origin) chưa có test riêng dù logic so sánh `!==` đối xứng. E2E student flow cover chiều khớp role. | `packages/auth/src/auth-reset-password.test.ts:235-255` | Tuỳ chọn bổ sung 1 test chiều ngược. |

## Verdict từng acceptance criterion

### 1. Response `request-password-reset` trung tính, không timing oracle — ĐẠT

- Better-auth v1.6.27 `api/routes/password.ts`: nhánh không có user trả cùng body `{status: true, message: "If this email exists..."}` và tự làm dummy work (`generateId(24)` + `findVerificationValue("dummy-verification-token")`) để cân bằng timing — xác nhận trên source tag v1.6.27.
- Gửi nền: `apps/server/src/index.ts:1,65` truyền `runInBackground: (promise) => waitUntil(promise)`; `packages/auth/src/index.ts:276-279` gắn vào `advanced.backgroundTasks.handler`. Better-auth v1.6.27 `context/create-context.ts` xác nhận `runInBackgroundOrAwait` dùng handler này (fire-and-forget, tự `.catch` + `logger.error`) — mail nằm ngoài đường request.
- Bằng chứng test: `packages/auth/src/auth-reset-password.test.ts:209-233` đo `elapsed < 150ms` với mailer treo 300ms; test `165-180` so sánh status + body known/unknown; e2e `password-reset.spec.ts:155-191` (cùng copy, không mail cho unknown, neo theo F9: chờ mail thật tới trước khi assert).

### 2. Token không xuất hiện trong log server — ĐẠT (với điều kiện prod chạy `MAILER_IMPL=resend`)

- `apps/server/src/app.ts:109-111` bọc mọi dòng Hono logger qua `redactResetToken`; regex `apps/server/src/log-redaction.ts:1` che segment token trong path, dừng đúng tại `?`/whitespace (Hono logger chỉ in `c.req.path`, không in query — nên `callbackURL`/`token=` query không vào log).
- Callback `sendResetPassword` log đúng `{userId, message}` (`packages/auth/src/index.ts:166-170`) — không url/token/email; test `auth-reset-password.test.ts:182-207` assert log không chứa `reset-password/`, `token`, email.
- Điều kiện: `MAILER_IMPL=log` sẽ in nguyên URL reset (S3, plan F4 đã chấp nhận kèm startup warning). Hạ tầng deploy đã pass `RESEND_API_KEY`/`MAILER_IMPL`/`MAIL_FROM` (`packages/infra/alchemy.run.ts:123`).

### 3. Role gate theo `callbackURL` — ĐẠT

- `packages/auth/src/index.ts:140-155`: parse `callbackURL` từ url reset → `resolveRequestApp({origin: new URL(callbackURL).origin, ...})` (exact-match theo `studentOrigins`/`teacherOrigins`, `role.ts:17-50`) → so với `resolveUserRole(await getUserRole(user.id))`; lệch thì `return` không gửi, response vẫn trung tính 200.
- Fail-closed ở mọi nhánh mép: callbackURL vắng → `targetApp = null` ≠ mọi role → không gửi; callbackURL hỏng (relative/garbage) → `new URL()` throw → catch → `targetApp = null` → không gửi; DB lỗi trong `getUserRole` → exception rơi vào catch của `runInBackgroundOrAwait` (chỉ log, không token).
- `redirectTo`/`callbackURL` còn bị better-auth chặn trước ở tầng middleware: `originCheck` v1.6.27 trả 403 `INVALID_REDIRECT_URL`/`INVALID_CALLBACK_URL` cho origin ngoài `trustedOrigins` — không có đường open-redirect/token-redirect sang origin lạ.
- Test: `auth-reset-password.test.ts:235-255` (teacher + redirect student → 0 mail; redirect teacher → 1 mail).

### 4. Trang reset xóa token khỏi URL lần đầu, không storage/session — ĐẠT

- Web `apps/web/src/routes/reset-password.tsx:11-17,24,28-30`: `validateSearch` chỉ giữ `token`/`error` string; token capture một lần bằng `useState` initializer (dòng 24, `error` ưu tiên → fail-closed); `navigate({to, search: {}, replace: true})` trong effect đầu. Token chỉ tồn tại trong React state — không localStorage/sessionStorage/console; grep không thấy chỗ nào ghi.
- Student `apps/student/src/routes/reset-password.tsx:7-11,21-22,24-26`: cùng pattern.
- Không `useSession`, không `beforeLoad` redirect; cả hai route nằm ở root route, không dưới `_auth` (xác nhận trong `apps/student/src/routeTree.gen.ts` diff — `getParentRoute: rootRouteImport`).
- E2E: `not.toHaveURL(/token=/)` ở cả hai cổng (`password-reset.spec.ts:81,133`); session sống vẫn xem được trang và link chết hiện invalid-view (`149-153`, `193-205`).

### 5. `redirectTo` chỉ ghép từ `window.location.origin` — ĐẠT

- Grep toàn `apps/web/src` + `apps/student/src`: đúng 2 chỗ xây `redirectTo`, đều là `` `${window.location.origin}/reset-password` `` (`apps/web/src/components/auth/forgot-password-form.tsx:43`, `apps/student/src/components/auth/forgot-password-form.tsx:40`); không chỗ nào đọc search param để ghép redirect.
- Test web assert payload `redirectTo === origin + "/reset-password"` (`forgot-password-form.test.tsx:67-70`). Lớp phòng thủ hai: `originCheck` của better-auth từ chối origin lạ với 403.

### 6. `revokeSessionsOnPasswordReset: true`, `resetPasswordTokenExpiresIn: 3600` — ĐẠT

- `packages/auth/src/index.ts:136-137`: đúng hai giá trị theo D3.
- Test `auth-reset-password.test.ts:124-162`: mật khẩu cũ chết, mật khẩu mới sống, `get-session` với cookie cũ trả `null` sau reset (không phải phantom `not.toHaveURL` — assert response thật).

## Đối chiếu better-auth v1.6.27 (ngoài node_modules, GitHub tag)

| Claim trong code/plan | Kết quả |
|---|---|
| `sendResetPassword` được bọc, lỗi không tới client | Đúng — chạy qua `runInBackgroundOrAwait`, không try/catch tại route; handler bọc `.catch(logger.error)` |
| Response trung tính + dummy timing work | Đúng — `api/routes/password.ts` v1.6.27 |
| `redirectTo`/`callbackURL` bị chặn theo trustedOrigins | Đúng — `originCheck` middleware (403 + `INVALID_REDIRECT_URL`/`INVALID_CALLBACK_URL`), áp cho cả POST body và GET query |
| `backgroundTasks.handler` = gửi nền | Đúng — `context/create-context.ts` dùng handler khi có, `await` khi không |

## Gates đã chạy trong worktree (đều xanh)

| Gate | Kết quả |
|---|---|
| `pnpm --filter @teacher-os/auth test` | 6 file / 67 test pass |
| `pnpm --filter server test` + `check-types` | 27 file / 448 test pass; tsc sạch |
| `pnpm --filter web test` | 109 file / 1166 test pass |
| `pnpm --filter student test` | 16 file / 136 test pass |
| `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e --grep "Password reset"` | 4/4 pass |
| `pnpm check` | pass (1 info biome migrate — có sẵn, không liên quan diff) |

## Khuyến nghị

1. (Minor) S1 — thống nhất guard cooldown giữa web/student.
2. (Minor) S2 — sanitize/narrow log lỗi Resend.
3. (Ops) Giữ mục "đặt `MAILER_IMPL=resend` ở môi trường nhận mail thật" trong checklist deploy (S3).
4. Không có gì chặn merge từ góc độ security.
