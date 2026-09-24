---
phase: 3
title: "Portal — màn hình chờ xác thực + nút Gửi lại email"
status: todo
priority: P1
effort: 2h
dependencies: [2]
---

# Phase 3: Portal — màn hình chờ xác thực + nút Gửi lại email

## Goal

Ngay sau đăng ký, học viên được đưa về portal và thấy màn hình "chờ xác thực email" (tái dùng view `EMAIL_UNVERIFIED` đã có, nâng cấp copy + nút "Gửi lại email" gọi `authClient.sendVerificationEmail`). Không tạo route mới — flow mềm vẫn có session nên route `_auth/index` là nơi tự nhiên hiển thị trạng thái chờ.

Điểm load-bearing: ở trạng thái user mới (0 hồ sơ), `meQuery` luôn error nên **nhánh render thật là `meQuery.error` tại `_auth/index.tsx:35-39` — nhánh này hiện KHÔNG truyền `userEmail`** (chỉ nhánh `overviewQuery.error` dòng 41-52 mới truyền). Do đó việc lấy email từ session và truyền xuống view là **thay đổi bắt buộc**, không phải "kiểm tra nếu cần".

## Files to Create / Modify

- Modify: `apps/student/src/components/auth/sign-up-form.tsx` (thêm `callbackURL` vào signUp.email + sửa copy notice thành công)
- Modify: `apps/student/src/components/overview/student-error-view.tsx` (nhánh `EMAIL_UNVERIFIED` dòng 30-34: copy mới + nút Gửi lại + nút "Tôi đã xác thực" + nút Đăng xuất)
- Modify: `apps/student/src/routes/_auth/index.tsx` (**bắt buộc** — lấy session email từ route context, truyền `userEmail` cho `StudentErrorView` ở CẢ HAI nhánh error)
- Modify: `apps/student/test/overview.test.tsx` (cập nhật assertion nhánh EMAIL_UNVERIFIED — test hiện tại assert chữ "Google" tại dòng 149-156 sẽ vỡ khi đổi copy)

## Tasks & Steps

### Task 3.1 — sign-up-form truyền `callbackURL`
- Goal: link xác thực trong email, sau khi click (kèm auto sign-in), redirect về portal thay vì trả JSON. Better-Auth tự nhúng `callbackURL` từ body sign-up vào URL verify (BA `sign-up.mjs:244-245`) — KHÔNG cần rewrite URL phía server.
- Target files: `apps/student/src/components/auth/sign-up-form.tsx`, call `authClient.signUp.email` (dòng 36-40).
- Steps:
  1. Thêm vào object tham số: `callbackURL: \`${window.location.origin}/login\``.
  2. Sửa `NoticeOk` thành công (dòng 86-90): title giữ "Tài khoản đã tạo", description thêm câu: "Chúng tôi đã gửi liên kết xác thực đến email của bạn. Vui lòng xác thực trước khi sử dụng portal."
  3. Sau khi signUp thành công vẫn giữ hành vi hiện tại: `window.location.assign(validateReturnUrl(returnUrl))` → user về `/` và thấy màn chờ xác thực (nhờ Phase 2 trả `EMAIL_UNVERIFIED`).
- Success criteria: sau sign-up, email nhận được link có `callbackURL` trỏ về origin portal `/login`.
- Verify: `pnpm --filter student check-types` → exit 0. (Hành vi runtime do Phase 4 e2e gate.)

### Task 3.2 — Nâng cấp view `EMAIL_UNVERIFIED` thành màn chờ xác thực
- Goal: học viên thấy rõ: email nào đang chờ xác thực, đã gửi mail ở đâu, cách gửi lại, cách tự kiểm tra lại sau khi verify ở tab khác.
- Target files: `apps/student/src/components/overview/student-error-view.tsx`; `apps/student/src/routes/_auth/index.tsx`.
- Steps:
  1. Giữ icon `MailCheck` + title "Email chưa được xác thực". Đổi description thành (khi có `userEmail`):
     "Chúng tôi đã gửi liên kết xác thực đến {email}. Mở email và nhấn nút “Xác thực email” để kích hoạt hồ sơ học viên. Nếu không thấy, hãy kiểm tra mục Spam hoặc gửi lại liên kết."
     Khi `userEmail` rỗng: dùng copy không nhắc email cụ thể nhưng vẫn hiển thị 3 nút ở bước 2/4/5.
  2. Thêm nút "Gửi lại email": onClick gọi `authClient.sendVerificationEmail({ email: userEmail, callbackURL: \`${window.location.origin}/login\` })`; state cục bộ 3 nhánh — idle / sending (disable + nhãn "Đang gửi…") / sent (nhãn "Đã gửi lại — kiểm tra hộp thư", style success tương tự `NoticeOk`); error → hiển thị thông báo lỗi ngắn style `NoticeInfo`. **Đặc biệt: nếu message lỗi chứa `EMAIL_ALREADY_VERIFIED` (user đã verify nhưng tab cũ chưa biết) thì không hiện lỗi — thay vào đó tự gọi `window.location.reload()`.**
  3. Khi `userEmail` rỗng → ẩn nút Gửi lại, còn lại 2 nút ở bước 4/5.
  4. Thêm nút "Tôi đã xác thực — Kiểm tra lại": onClick `window.location.reload()` — portal query client tắt mọi auto-refetch (`query-client.ts`: `retry:false`, `refetchOnWindowFocus:false`) nên tab mở từ trước không tự cập nhật sau khi user verify ở tab khác; nút này là lối ra chủ đích.
  5. Giữ/đảm bảo có nút "Đăng xuất" như nhánh `NOT_LINKED` đang có (điều hướng về `/login` sau signOut — đối chiếu code nhánh NOT_LINKED cùng file, dùng đúng handler hiện có).
  6. Style theo token portal hiện có (`bg-accent-soft`, `text-fg`, `text-muted-fg`, `var(--radius-lg)`…) — đối chiếu `notices.tsx` và các nút cùng file, KHÔNG thêm dependency UI mới.
  7. **Bắt buộc** trong `apps/student/src/routes/_auth/index.tsx`: lấy email từ route context (beforeLoad của `_auth/route.tsx:6-15` đã return session — dùng `useRouteContext()` theo pattern TanStack Router đang có trong app, lấy `context.session.data.user.email` hoặc path tương ứng thực tế trong file), truyền `userEmail` vào `<StudentErrorView>` ở **cả hai** nhánh error (`meQuery.error` dòng 35-39 và `overviewQuery.error` dòng 41-52).
- Success criteria: vào portal bằng tài khoản mới chưa verify (0 hồ sơ) → thấy màn chờ xác thực KÈM địa chỉ email và nút Gửi lại (không được phép rơi vào trạng thái ẩn nút); bấm Gửi lại → có phản hồi UI rõ.
- Verify: `pnpm --filter student check-types` → exit 0.

### Task 3.3 — Cập nhật component test `overview.test.tsx`
- Goal: test hiện có phản ánh copy mới; thêm gate cho hành vi load-bearing.
- Target files: `apps/student/test/overview.test.tsx` (assertion nhánh EMAIL_UNVERIFIED tại dòng 149-156 — hiện `expect(html).toContain("Google")`).
- Steps:
  1. Bỏ assertion "Google" (copy mới không còn khuyên dùng Google).
  2. Thêm assertion: render view EMAIL_UNVERIFIED với `userEmail` → html chứa "Gửi lại email", chứa "Tôi đã xác thực", chứa email được truyền.
  3. Nếu file test render view không truyền `userEmail` → thêm 1 case truyền `userEmail="test@example.com"`.
- Success criteria: toàn bộ test của apps/student pass.
- Verify: `pnpm --filter student test` → exit 0.

### Task 3.4 — Smoke dev thủ công
- Goal: trải nghiệm end-to-end chạy được trên máy dev trước khi viết e2e.
- Target files: không sửa — chỉ chạy.
- Steps:
  1. `pnpm dev` (server 8000 + portal 8003, `MAILER_IMPL=log` trong `packages/infra/.env`). Lưu ý: KHÔNG tự đặt `CORS_ORIGIN` thủ công trong dev `.env` — dev default của alchemy đã gồm cả 8001 và 8003 (`alchemy.run.ts:56-61`), đặt thiếu 8003 sẽ tự làm hỏng portal.
  2. Đăng ký tài khoản mới ở `http://localhost:8003/login` → về `/` thấy màn chờ xác thực kèm email + 3 nút.
  3. Console server có 2 dòng: `[mail:log]` (sign-up gửi mail) và lần 2 khi bấm "Gửi lại email".
  4. Mở URL verify lấy từ console → redirect về `/login` → tự sang `/` → overview load bình thường (đã được provision). Đây cùng cơ chế cookie với google callback hiện có (`email-verification.mjs:295-314`: setSessionCookie rồi redirect) — nếu gặp trở ngại KHÔNG tự "sửa" cookie config.
- Success criteria: 4 bước trên đều đúng.
- Verify: chủ quan — ghi kết quả từng bước vào mô tả PR; gate tự động thay bằng e2e ở Phase 4.

## Verification (cả phase)

- `pnpm check-types` → exit 0.
- `pnpm --filter student test` → exit 0.
- `pnpm check` → exit 0.

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
