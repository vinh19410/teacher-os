# Red Team (Assumption Destroyer + Scope Auditor): forgot-password-email-reset

Plan: plans/261001-0336-forgot-password-email-reset/ (plan.md + 3 phase)
Ghi chú nguồn: node_modules bị hook chặn đọc, nên hành vi better-auth 1.6.27 được đối chiếu với source upstream tag v1.6.27 (`gh api`), cite là `better-auth@1.6.27 <path>:<line>`.

## Finding 1: `sendResetPassword` ném lỗi KHÔNG làm request-password-reset fail (D5 / RT3 / test 1.3.6 đều sai)
- **Severity:** Critical
- **Location:** Phase 1, Task 1.2 step 3 ("Không bọc try/catch... ném lỗi ra để better-auth trả lỗi cho client"); Task 1.3 step 6 (test `mailer rejection ... is not success`); plan.md D5, RT3
- **Flaw:** better-auth gọi callback qua `runInBackgroundOrAwait`, hàm này bọc `try/catch` và chỉ `logger.error`, không rethrow. Endpoint luôn trả `200 {status:true}` sau đó. Khác hẳn đường `/send-verification-email` mà plan lấy làm tiền lệ (`index.ts:129-131`, nơi better-auth rethrow thật).
- **Failure scenario:** Resend down/429: user thấy câu "nếu có tài khoản thì đã gửi", không có thư, không báo lỗi (đúng thứ RT3 nói là phải tránh). Test 1.3.6 assert status != 200 sẽ fail ngay khi chạy; implementer dính Failure Protocol hoặc sửa test cho xanh. D5 (đã khóa) không thể đạt bằng cấu hình plan mô tả.
- **Evidence:**
  - `better-auth@1.6.27 packages/better-auth/src/context/create-context.ts:408-426` (`runInBackgroundOrAwait` nuốt exception).
  - `better-auth@1.6.27 packages/better-auth/src/api/routes/password.ts:134-148` (gọi sendResetPassword qua wrapper rồi luôn `ctx.json({status:true})`).
  - `packages/auth/src/index.ts:129-131` (tiền lệ rethrow chỉ đúng cho send-verification-email).
  - `packages/auth/src/index.ts` không có `hooks.after`/`advanced.backgroundTasks` (grep).
- **Suggested fix:** Muốn giữ D5, phải có cơ chế mang lỗi ra: trong `sendResetPassword` bắt lỗi, lưu vào `WeakMap<Request, Error>` theo `request` (tham số thứ 2 callback), rồi thêm `hooks.after` cho path `/request-password-reset` ném `APIError("INTERNAL_SERVER_ERROR")` nếu có entry. Test 1.3.6 giữ nguyên expectation. Hoặc đưa D5 ra hỏi lại user (đổi thành "log + 200"), không được ghi RT3 là Accept khi không khả thi.

## Finding 2: Timing oracle liệt kê email, mâu thuẫn mục tiêu chống enumeration của D5
- **Severity:** High
- **Location:** Phase 1 Task 1.2 (await mailer trong callback); plan.md D5, Success Criteria bullet 3
- **Flaw:** Không có `advanced.backgroundTasks.handler` nên `await promise` chạy trọn vòng gửi thư khi user tồn tại. `createResendMailer` có `AbortSignal.timeout(10_000)` và retry sleep (429/5xx) trước khi trả. User không tồn tại chỉ chạy dummy DB lookup. Plan chỉ kiểm tra status HTTP giống nhau (test 1.3.5), không kiểm tra latency.
- **Failure scenario:** Kẻ tấn công đo thời gian: ~vài trăm ms+ (có tài khoản) so với ~vài ms (không tài khoản), liệt kê được email giáo viên/học viên. Test 1.3.5 vẫn xanh vì mock mailer tức thì.
- **Evidence:** `packages/auth/src/mail/mailer.ts:30-33` (timeout 10s) và `:48-60` (retry sleep); `better-auth@1.6.27 password.ts:104-119` (nhánh không có user chỉ làm dummy lookup, không gửi) so với `:134-143` (await send); `packages/auth/src/index.ts` không đặt `advanced.backgroundTasks`.
- **Suggested fix:** Dùng `advanced.backgroundTasks.handler` (Workers: `ctx.waitUntil`; boot e2e/test: handler no-op giữ promise) để gửi thư nền, kết hợp finding 1 (lỗi vẫn cần được ghi lại cho UI nếu D5 giữ). Nêu rõ trade-off này với user vì nó xung đột trực tiếp với "không nuốt lỗi".

## Finding 3: Đổi `button` thành `Link` làm vỡ hai test hiện có không có trong danh sách file
- **Severity:** High
- **Location:** Phase 2 Task 2.2 step 1, Task 2.4 step 1; "Files to Create / Modify"
- **Flaw:** `apps/web/src/components/sign-in-form.test.tsx` và `apps/student/test/login.test.tsx` mock `@tanstack/react-router` chỉ với `useSearch` rồi `renderToStaticMarkup(<SignInForm/>)`. Thêm `Link` (import từ react-router) khiến `Link` là `undefined` trong mock, render ném "Element type is invalid". Plan không nhắc hai file này, Verify của phase 2 cũng không chạy `student test`.
- **Failure scenario:** `pnpm --filter student test` và `pnpm --filter web test` đỏ ở test sign-in vốn đang xanh; Failure Protocol chỉ gắn vào các lệnh Verify liệt kê nên lỗi lọt qua phase, vỡ CI khi merge.
- **Evidence:** `apps/web/src/components/sign-in-form.test.tsx:4-12,15`; `apps/student/test/login.test.tsx:4-6,65`; `apps/web/src/components/sign-in-form.tsx:2` (hiện chỉ import `useSearch`).
- **Suggested fix:** Thêm hai file này vào Modify (mock thêm `Link: ({children, to}) => <a href={to}>{children}</a>`), thêm `pnpm --filter student test` và `pnpm --filter web test` vào Verify task 2.5.

## Finding 4: Test "mật khẩu cũ chết" ở e2e là assertion phủ định chạy ngay tại t=0 (phantom test)
- **Severity:** High
- **Location:** Phase 3 Task 3.2 step 2 (dòng cuối: "Expect không tới /dashboard và vẫn thấy #si-password") và step 3 (cuối: "Expect URL vẫn kết thúc bằng /login và #signin-password còn trên trang")
- **Flaw:** `expect(page).not.toHaveURL(/dashboard/)` và `toHaveURL(/\/login$/)` đạt ngay khi gọi, trước khi request sign-in kịp hoàn tất; không chờ toast lỗi hay response. Sign-in thành công sau 300ms vẫn có thể bị bỏ sót.
- **Failure scenario:** Nếu `revokeSessionsOnPasswordReset` hoặc đổi mật khẩu hỏng và mật khẩu cũ vẫn đăng nhập được, test vẫn xanh. Success criterion #1 ("không đăng nhập được bằng mật khẩu cũ") không thực sự được chứng minh ở tầng e2e. Ở tầng unit (1.3.4) cũng không có test nào xác nhận session cũ bị thu hồi dù Goal phase 1 và D3 đều hứa việc này.
- **Evidence:** `apps/web/src/components/sign-in-form.tsx:60-70` (success dẫn `window.location.assign`, lỗi chỉ `toast.error`, bất đồng bộ); `apps/e2e/specs/helpers.ts:23-25` (chính helper đã ghi cần 30s cho luồng này); `packages/auth/src/index.ts:123-125` (sau khi sửa mới có `revokeSessionsOnPasswordReset`, test nào cũng không đọc bảng session).
- **Suggested fix:** Chờ `page.waitForResponse(r => r.url().includes('/sign-in/email'))` và assert status 401, hoặc chờ toast lỗi hiển thị. Thêm test unit: đăng nhập lấy cookie session, reset mật khẩu, rồi `GET /api/auth/get-session` với cookie đó phải trả null.

## Finding 5: `apps/web/src/routeTree.gen.ts` không tồn tại và bị gitignore; drift guard im lặng bỏ qua
- **Severity:** High
- **Location:** Phase 2 "Files" (dòng Generated), Task 2.1 Verify, Task 2.5 Success criteria ("cả hai routeTree.gen.ts chứa ...")
- **Flaw:** Chỉ `apps/student/src/routeTree.gen.ts` được git track; bản web bị `.gitignore:12`, và hiện không có trong worktree. Drift guard `return` sớm nếu file thiếu, nên Task 2.1 (chạy vitest trước `check-types`) và mọi CI chạy test mà không build trước đều "xanh" mà không kiểm tra route nào. Thêm vào đó, route lạ trong web worker không trả 404 cứng: nhánh 4 vẫn phục vụ shell SPA với status 404 cho request `text/html`, nên RT2 ("sẽ 404") nặng hơn thực tế, nhưng cũng nghĩa là quên matcher chỉ lộ ở status code (không ai assert).
- **Failure scenario:** Quên một route trong matcher, drift guard bỏ qua, không test nào bắt (e2e chạy vite dev, không qua worker.ts). Production: `/reset-password?token=...` nhận HTTP 404 (kèm shell); crawler/email scanner/proxy coi link hỏng, một số client không render body 404.
- **Evidence:** `.gitignore:12`; `git ls-files` chỉ liệt kê `apps/student/src/routeTree.gen.ts`; `apps/web/src/routes-matcher.test.ts:83-88` (`if (!existsSync(routeTreePath)) return;`); `apps/web/src/worker.ts` nhánh "4. Unknown route (404)" trả `status: 404` cùng shell; `apps/web/src/routes-matcher.ts:4-6`; `apps/e2e/playwright.config.ts` (web chạy `vite --port`, không qua worker).
- **Suggested fix:** Task 2.1 thêm assertion tĩnh độc lập với gen file (test `isValidAppRoute("/forgot-password")` và `("/reset-password")` trực tiếp, plan nói có nhưng chưa là test riêng ngoài `validStaticRoutes`), thêm case vào `worker.test.ts` kiểm tra status 200. Ghi rõ student gen file phải commit, web gen file không. Sửa trích dẫn "routes-matcher.ts:3" (thực tế dòng 4).

## Finding 6: Test form web không chạy được như mô tả (env `node`, không jsdom, `Link` chưa mock); student không có test form nào
- **Severity:** Medium
- **Location:** Phase 2 Task 2.5 steps 1-3
- **Flaw:** `apps/web/vitest.config.ts` đặt `environment: "node"`. Test submit + chờ text cần docblock `// @vitest-environment jsdom` và Testing Library (như `answer-key-grid.test.tsx`); mẫu `sign-in-form.test.tsx` chỉ `renderToStaticMarkup`, không submit được. Plan không nói điều này. Form có `Link` "Back to sign in" cũng cần mock router. Student không có `@testing-library` hay jsdom nên bốn component student (và toàn bộ chuỗi tiếng Việt, `redirectTo` đúng origin student) chỉ được phủ bởi e2e.
- **Failure scenario:** Implementer bám Task 2.5 viết test với env node: `document`/submit không tồn tại. Họ sẽ "improvise", dễ rút gọn thành test render tĩnh phantom. Lỗi đặt nhầm text/schema ở student chỉ lộ ở e2e chậm.
- **Evidence:** `apps/web/vitest.config.ts` (`test.environment: "node"`); `apps/web/src/components/assignments/answer-key-grid.test.tsx:1-3` (docblock jsdom + RTL); `apps/web/src/components/sign-in-form.test.tsx:1-12`; `apps/student/package.json` (không có testing-library, jsdom, chỉ vitest); `apps/student/test/login.test.tsx:1,44,65` (toàn static markup).
- **Suggested fix:** Ghi trong 2.5: docblock jsdom, mock `Link`, dùng `fireEvent`/`waitFor`. Với student, thêm test static-markup tối thiểu (form render, link `/forgot-password`, copy VI) hoặc nêu rõ chấp nhận chỉ e2e.

## Finding 7: RT5 sai: reset password cho tài khoản chỉ có Google âm thầm tạo credential `password`
- **Severity:** Medium
- **Location:** plan.md RT5 ("UI không nhánh riêng... Không xây luồng 'tài khoản Google'"); Phase 1 Security Considerations
- **Flaw:** Với user chỉ có Google, `requestPasswordReset` vẫn gửi mail (user tồn tại), và `resetPassword` nhánh `!account` gọi `createAccount({providerId:"credential"})`. Tức là tính năng mới thêm một đường đăng nhập mật khẩu cho tài khoản OAuth, plan không ghi nhận, không test, không thông báo cho user.
- **Failure scenario:** Kẻ chiếm được hộp thư (hoặc người dùng nhầm) biến tài khoản Google-only thành có mật khẩu; sau đó đăng nhập bằng mật khẩu bỏ qua mọi bảo vệ phía Google (2FA của Google không còn áp dụng). Nhóm dev không có test để biết hành vi này tồn tại.
- **Evidence:** `better-auth@1.6.27 password.ts:303-311` (tạo credential account nếu chưa có); `packages/auth/src/index.ts:117-122` (Google là provider đang bật); `apps/web/src/components/sign-in-form.tsx` / `apps/student/src/components/auth/google-oauth-button.tsx` cho thấy đây là đường đăng nhập thực.
- **Suggested fix:** Ghi RT5 là chấp nhận có chủ đích kèm test hành vi (Google-only user reset thành công và sign-in bằng mật khẩu chạy), hoặc dùng `onPasswordReset`/hook chặn nếu user chưa có credential. Cần quyết định của user vì chạm D6 (phạm vi).

## Finding 8: Không có giới hạn tần suất hiệu quả cho "mail bombing", và e2e không bao giờ chạm rate limit
- **Severity:** Medium
- **Location:** Phase 1 Task 1.2 (bật endpoint công khai gửi mail tới email bất kỳ); chưa có mục Rate limiting trong plan
- **Flaw:** better-auth chỉ có luật 3 req/60s cho `/request-password-reset`, nhưng mặc định rate limit chỉ bật ở production và lưu bộ nhớ theo isolate; `createAuth` không cấu hình `rateLimit` (storage `secondary-storage`/database). Trên Cloudflare Worker nhiều isolate, giới hạn theo IP+path này lỏng, và key phụ thuộc header IP tin cậy. Plan không đề cập, không test.
- **Failure scenario:** Kẻ tấn công spam `POST /api/auth/request-password-reset` với email nạn nhân, gây ngập hộp thư và đốt quota Resend (mỗi lần gửi await 10s/retry). Ảnh hưởng domain reputation của sender dùng chung với mail xác thực.
- **Evidence:** `better-auth@1.6.27 api/rate-limiter/index.ts:513-541` (rule `/request-password-reset` 60s/3); `packages/auth/src/index.ts` không có khóa `rateLimit` (grep); `apps/server/src/index.ts:48-67` (không truyền cấu hình rate limit).
- **Suggested fix:** Thêm vào Phase 1: `rateLimit: { storage: "database" | "secondary-storage" }` hoặc rule theo email, kèm test; hoặc ghi Non-goal rõ ràng với lý do. 

## Path audit (Files to Create / Modify)
Không tồn tại, thuộc "Create" (ổn): packages/auth/src/mail/reset-password-email-template.ts; packages/auth/src/auth-reset-password.test.ts; apps/web/src/routes/{forgot-password,reset-password}.tsx; apps/web/src/components/auth/{forgot-password-form,reset-password-form}.tsx; apps/web/src/components/auth/forgot-password-form.test.tsx; apps/student/src/routes/{forgot-password,reset-password}.tsx; apps/student/src/components/auth/{forgot-password-form,reset-password-form}.tsx; apps/e2e/specs/password-reset.spec.ts.
Không tồn tại, bị liệt kê như file có sẵn ("Generated, không sửa tay"): `apps/web/src/routeTree.gen.ts` (gitignored, xem Finding 5). Không có path "Modify" nào sai (index.ts, mail.test.ts, preview-email.ts, sign-in-form.tsx x2, routes-matcher(.test).ts, boot.ts, helpers.ts, CHANGELOG.md, student routeTree.gen.ts đều tồn tại).
Thiếu khỏi danh sách (sẽ bị vỡ): apps/web/src/components/sign-in-form.test.tsx, apps/student/test/login.test.tsx (Finding 3), apps/web/src/worker.test.ts (nên thêm case route mới).

## Validation Log: kiểm tra file:line
- index.ts:123 emailAndPassword `enabled:true`: đúng. sign-in-form.tsx:97 notice: đúng. routes-matcher.test.ts:83 drift guard: đúng. helpers.ts:11 / :51: đúng. boot.ts:40 regex verify: đúng. index.ts:143 catch nuốt lỗi: đúng.
- routes-matcher.ts:3 (RT2): lệch, `VALID_EXACT_ROUTES` ở dòng 4 (dòng 3 là `*/`).
- Task 3.1 step 1 ghi regex `/verify-email?`: không đúng nguyên văn; regex thật ở boot.ts:40 là `/https?:\/\/[^\s]*\/verify-email\?[^\s]+/` (dấu `?` là literal, không phải quantifier). Implementer copy theo plan sẽ phá nhánh verify.
- Better-auth 1.6.27: endpoint `requestPasswordReset` (`/request-password-reset`) và `resetPassword` (`/reset-password`) tồn tại (password.ts:35, :229); client method `requestPasswordReset`/`resetPassword` sinh từ đó. Nhánh dự phòng `forgetPassword` của plan không cần.
- Mail regex Task 3.1 step 2 `/https?:\/\/\S*reset-password\S*/` khớp URL `.../api/auth/reset-password/<token>?callbackURL=...` (password.ts:133): đúng. URL mail trỏ origin API, rồi 302 sang origin đã xin, nên `page.goto(url)` ở student kết thúc ở STUDENT_ORIGIN: đúng.
