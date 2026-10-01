# Code review correctness/regression — Quên mật khẩu qua email (#292)

- Ngày: 2026-10-01
- Reviewer: code-reviewer (correctness/regression)
- Scope: `git diff develop..HEAD` — 6 commit, 41 file, +2443/−120
- Worktree: `personal/worktrees/teacher-os-vinh19410-feat-forgot-password-email-reset`
- Phương pháp: đọc toàn bộ diff + file nguồn ngoài diff; đối chiếu hợp đồng better-auth **v1.6.27** trên source GitHub tag `v1.6.27` (password.ts, origin-check.ts, create-context.ts, core/error/*); rerun các test vùng nghi ngờ.

## Kết luận tổng quan

Không tìm thấy bug Critical hay Important. Luồng forgot/reset-password khớp hợp đồng giữa các layer (auth config ↔ client call ↔ route ↔ worker ↔ e2e) ở mức kiểm chứng được bằng source. 3 finding Minor (1 không nhất quán UI web↔student, 2 lệch chữ plan). Các red-team finding F1–F14 đều được implements đúng; các claim then chốt về hành vi better-auth 1.6.27 đều xác nhận được trên source tag.

## Bằng chứng đối chiếu better-auth v1.6.27 (verbatim, GitHub tag)

| Claim trong diff | Bằng chứng source | Kết quả |
|---|---|---|
| Endpoint `POST /request-password-reset` nhận `{ email, redirectTo }` | `password.ts`: body schema `email: z.email()`, `redirectTo: z.string().optional()` | Khớp |
| `POST /reset-password` nhận `{ newPassword, token }` | body schema `newPassword: z.string()`, `token: z.string().optional()`; handler đọc `ctx.body.token \|\| ctx.query?.token` | Khớp |
| URL mail = `<api>/api/auth/reset-password/<token>?callbackURL=<encoded redirectTo>` | `const url = \`${ctx.context.baseURL}/reset-password/${verificationToken}?callbackURL=${callbackURL}\``; `authBaseURL()` (`packages/auth/src/topology.ts`) ghép `/api/auth` | Khớp — regex `boot.ts:44` và role gate đọc `searchParams.get("callbackURL")` đều đúng shape |
| GET callback: token hỏng → redirect `callbackURL?error=INVALID_TOKEN`; token tốt → `?token=...` | `redirectError(ctx, callbackURL, { error: "INVALID_TOKEN" })` / `redirectCallback(ctx, callbackURL, { token })` (searchParams.set) | Khớp — nhánh `error` của 2 route reset và e2e `?error=INVALID_TOKEN` |
| `error.code === "INVALID_TOKEN"` phía client | `BASE_ERROR_CODES.INVALID_TOKEN` qua `defineErrorCodes` biến thành `{ code: "INVALID_TOKEN", message: "Invalid token", toString }`; `APIError.from` copy `code` vào body JSON | Khớp — nhánh swap form của cả 2 app đúng hợp đồng |
| `advanced.backgroundTasks.handler` tồn tại; không có thì `await` | `create-context.ts`: `runInBackgroundOrAwait` dispatch qua `options.advanced?.backgroundTasks?.handler`, gắn sẵn `.catch` log; không có handler thì `await promise` | Khớp — `runInBackground: (p) => waitUntil(p)` hợp lệ và không tạo unhandled rejection trên Workers |
| `redirectTo` ngoài trustedOrigins bị từ chối | `origin-check.ts` throw 403 `INVALID_REDIRECT_URL` qua `use: [originCheck((ctx) => ctx.body.redirectTo)]` | Khớp — D2 chống open redirect đúng tiền đề |
| Response trung tính email có/không tài khoản | success body `{ status: true, message: "If this email exists…" }` trả ở cả 2 nhánh + nhánh email lạ giả lập 1 lần tra DB | Khớp (F2/F1) |
| `revokeSessionsOnPasswordReset` | handler gọi `deleteUserSessions(userId)` khi option bật | Khớp — test 1 chứng minh `get-session` null sau reset |

## Kiểm chứng 7 điểm yêu cầu

1. **Worker web trả SPA 200** — `apps/web/src/routes-matcher.ts:7-8` thêm `"/forgot-password"`/`"/reset-password"` vào `VALID_EXACT_ROUTES`; `worker.ts:106` dùng đúng `isValidAppRoute`; test trực tiếp có/không trailing slash + `?token=` (`routes-matcher.test.ts:51-58`) không lệ thuộc drift guard gitignored. Rerun: `routes-matcher.test.ts` + `worker.test.ts` = **67 passed**.
2. **Client gọi đúng API 1.6.27** — `requestPasswordReset({ email: value.email.trim(), redirectTo: window.location.origin + "/reset-password" })` ở cả 2 form; `resetPassword({ newPassword, token })` không gửi confirmPassword. Xử lý `{ error }`: 429 → copy riêng; INVALID_TOKEN → swap invalid-link; khác → toast + giữ form (token chưa tiêu thụ). Đếm ngược 60s: effect `setTimeout` 1s/giảm, cleanup clearTimeout, không khoá UI (form vẫn nhập được). Double-submit: nút `disabled={…isSubmitting}` + web có thêm guard `if (cooldown > 0) return` trong onSubmit. → Xác nhận, trừ 1 lệch nhỏ ở student (finding M1).
3. **Student reset không copy session redirect** — 2 route mới không import `useSession`/`Loader`/`useEffect` redirect (khác `apps/student/src/routes/login.tsx:42-48,71-73`); có test khóa bằng đọc source (`apps/student/test/reset-password-form.test.tsx:60-79`); e2e mở `?error=INVALID_TOKEN` với session live vẫn thấy câu invalid.
4. **routeTree** — `apps/student/src/routeTree.gen.ts` được commit, `FileRoutesByFullPath` có đủ `'/forgot-password'`, `'/reset-password'` (gen đúng chuẩn plugin, không sửa tay phần khác); `apps/web/src/routeTree.gen.ts` KHÔNG bị track (`git ls-files` rỗng, `.gitignore:12`).
5. **e2e** — sign-in cũ dùng `Promise.all` + `page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email"))` rồi assert `status()` (không phantom URL); assert thêm trường mật khẩu còn hiển thị. Mail poll 20×500ms filter `to` + `kind === "password-reset"`. URL student tuyệt đối `${STUDENT_ORIGIN}/...`, import từ `./origins`. Regex mail neo `/api/auth/reset-password/<token>?…` khớp URL better-auth phát hành (đã verify bằng source).
6. **Regression sign-in/preview** — mock `Link` thêm vào `sign-in-form.test.tsx` (web) và `login.test.tsx` (student), kèm assert link mới; `preview-email.ts` chỉ append preview reset, giữ nguyên `verification.html`; không file nào ngoài scope bị sửa (đối chiếu `git log --name-only` từng commit).
7. **Rerun vùng nghi ngờ** — `web`: 67 passed (matcher+worker); `server log-redaction`: 3 passed; `@teacher-os/auth auth-reset-password`: 6 passed.

## Findings

### Critical

Không có.

### Important

Không có.

### Minor

- **M1 — Student forgot form không chặn submit Enter trong cooldown (web thì có).**
  `apps/web/src/components/auth/forgot-password-form.tsx:43` có guard `if (cooldown > 0) return;` trong `onSubmit`; `apps/student/src/components/auth/forgot-password-form.tsx:54-77` chỉ disable nút, không có guard. Implicit submission (Enter trong input) bỏ qua nút submit bị disabled trên đa số trình duyệt, nên học viên có thể xin mail thứ hai trong cửa sổ 60s mà D9 chủ ý khoá. Biên cuối còn lại là rate limit server 3 req/60s/IP (production). Sửa: thêm cùng một guard `if (cooldown > 0) return;` vào onSubmit của student form cho nhất quán với web.
- **M2 — Spec e2e lệch chữ plan ở 2 chỗ (độ phủ đã bù bằng unit test).**
  Plan 3.2 bước 5 yêu cầu web mở `/reset-password?token=invalid` (đường submit → API trả INVALID_TOKEN → swap view); spec dùng `?error=INVALID_TOKEN` (`password-reset.spec.ts:196`), tức đường render-thẳng. Plan mục cuối bước 3 yêu cầu student mở link hỏng khi **chưa** đăng nhập rồi **đã** đăng nhập; spec chỉ kiểm khi có session (`password-reset.spec.ts:154-159`). Đường submit INVALID_TOKEN được phủ bởi `apps/web/src/components/auth/reset-password-form.test.tsx:60-73`; route không phụ thuộc session đã khóa bằng unit test nguồn + test web signed-in. Không phải bug hành vi, chỉ là khoảng cách plan↔spec — ghi nhận để lead quyết định có cần bù step không.
- **M3 — Token verify-email không được che trong access log (ngoài scope, ghi nhận).**
  `redactResetToken` chỉ xử lý `/api/auth/reset-password/<token>` (`apps/server/src/log-redaction.ts:1-5`). Dòng `<-- GET /api/auth/verify-email?token=…` vẫn in token verification nguyên văn — token one-time, hạn 1h, cùng họ nhạy cảm với reset token. Task 1.2b chỉ yêu cầu reset nên đây không phải regression của PR; đề xuất follow-up mở rộng regex cho cả `verify-email`.

### Ghi nhận đã xử đúng (không phải finding)

- F4 (`createLogMailer` in nguyên URL reset ở chế độ log-only): giữ nguyên theo plan; production bắt buộc `MAILER_IMPL=resend` đã được cảnh báo lúc khởi động.
- `getUserRole` throw/không tìm thấy user → `resolveUserRole(null)` = "teacher" (fail-safe theo migration 0024); callback ném lỗi bất kỳ đều bị `runInBackgroundOrAwait` catch + log, không crash worker (verify bằng `create-context.ts`).
- Token không render vào markup (test khóa ở cả 2 app), không ghi storage, bị strip khỏi URL bằng `navigate({ search: {}, replace: true })` ngay render đầu; e2e assert `not.toHaveURL(/token=/)` là assertion có retry (không phantom — URL thực sự chứa token tới khi replace chạy).

## Edge cases do scouting phát hiện và đã loại trừ

- URL `?token=&error=` rỗng/chỉ error → cả 2 app fail-closed về invalid-link view (web: `error ? undefined : token`; student: `!token || linkError`).
- `new URL(callbackURL)` parse fail → catch → `targetApp = null` → không gửi mail (không thể xảy ra qua UI vì originCheck chặn trước, chỉ ảnh hưởng caller API trực tiếp).
- Worker student phục vụ `/reset-password` qua SPA fallback cho HTML GET (`apps/student/src/worker.ts` bước 4) — mail link student không 404 ở production (e2e chạy vite dev, điểm này chỉ kiểm chứng được bằng đọc worker, không qua e2e).
- Deploy order (web/student trước server) đã ghi trong `plan.md §Deploy Order`; changelog nằm đúng mục `## 2026-10-01 ### Added`, không đụng mục cũ.

## Metrics

- Test rerun trong phiên: web matcher+worker 67/67; server log-redaction 3/3; auth reset 6/6.
- Gates khác (auth 67, web 1166, student 136, e2e 4 passed) theo báo cáo phase, không rerun toàn bộ vì không thấy vùng nghi ngờ mới.
- Type/lint: theo `pnpm check`/`check-types` đã chạy ở phase (không rerun; không thay đổi nào được đề xuất).

## Recommended Actions

1. (M1) Thêm guard cooldown vào onSubmit của `apps/student/src/components/auth/forgot-password-form.tsx` — 1 dòng, đúng chữ "giống task 2.2".
2. (M2) Tuỳ lead: bù 2 step e2e theo đúng chữ plan (`?token=invalid` khi signed-in trên web; link hỏng khi chưa đăng nhập trên student) hoặc chấp nhận ghi nhận độ phủ đã bù bằng unit test.
3. (M3) Follow-up riêng: mở rộng redaction cho `verify-email` token.

## Unresolved Questions

Không.
