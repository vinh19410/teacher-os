---
title: "Phase 3: Trang login học viên"
status: todo
priority: P1
effort: 5h
dependencies: [1, 2]
---

# Phase 3: Trang login học viên

## Context Links

- `reports/scout-report.md` (mục 3, 4 — login blueprint web, auth client, guard pattern)
- Blueprint: `apps/web/src/routes/login.tsx`, `apps/web/src/components/auth/*` (auth-tabs, brand-panel, auth-field, notices, submit-button), `apps/web/src/components/{sign-in-form,sign-up-form,google-oauth-button}.tsx`
- Design: `open-design/student-portal-prompt.md` (ngôn ngữ copy VN, style Apple-minimal)

## Overview

- Priority: P1 · Status: todo
- Thay placeholder `/login` của apps/student bằng trang đăng nhập học viên thật: Google OAuth + email/password (đăng nhập chính, đăng ký phụ) dùng đúng backend Better-Auth hiện có. Sau login thành công → redirect `/` (tổng quan). Guard `_auth` dùng session thật.

## Key Insights

- `authClient` (đã tạo Phase 1) trỏ `{VITE_SERVER_URL}/api/auth` — session cookie cross-subdomain SameSite=None đã có sẵn (issue #125), học viên đã login ở app giáo viên cùng domain sẽ có sẵn session.
- **Google callbackURL phải là ABSOLUTE URL trên trustedOrigin** — KHÔNG dùng relative "/": better-auth redirect Location thô, browser resolve theo URL API callback (`api.<domain>/...`) nên relative sẽ đá học viên về trang "OK" của API. Blueprint web ghi rõ: "Must be an absolute URL on a server trustedOrigin" (`apps/web/src/components/google-oauth-button.tsx:44-48`). Copy đúng pattern: `callbackURL: \`${window.location.origin}${validateReturnUrl(returnUrl)}\``. Điều kiện chạy được: origin student ∈ trustedOrigins (Phase 2).
- Web login có cơ chế `returnUrl` + `validateReturnUrl` chống open redirect — copy nguyên tắc, KHÔNG hardcode theo dõi.
- Sau login, user có thể KHÔNG khớp student nào → không chặn ở login (chưa biết), mà để Phase 4 xử lý các trạng thái STUDENT_* khi gọi `/api/student/me`.
- **Prereq dev local**: origin `http://localhost:8003` phải nằm trong CORS_ORIGIN/trustedOrigins — nhánh dev default của alchemy chỉ có `:8001` cho tới khi Phase 5 merge (`packages/infra/alchemy.run.ts:52-58`). Chạy thử tay ở phase này cần Phase 5 đã merge (hoặc tạm set `CORS_ORIGIN=http://localhost:8001,http://localhost:8003` trong `packages/infra/.env`). Server dev chạy qua `pnpm dev` (alchemy dev) — `apps/server` KHÔNG có script `dev` riêng.

## Requirements

- [ ] `/login` hiển thị: Google button + tabs Đăng nhập/Đăng ký (email/password), copy tiếng Việt, brand "Teacher OS · Học viên"
- [ ] Login thành công → redirect về `returnUrl` an toàn hoặc `/`
- [ ] `_auth/route.tsx` beforeLoad dùng `authClient.getSession()` thật, redirect `/login?returnUrl=...` khi chưa có session
- [ ] Lỗi hiển thị inline (email/mật khẩu sai, user chưa tồn tại...) không crash

## Architecture

```
apps/student/src/
├── routes/login.tsx                  # compose BrandPanel + tabs + forms; validateSearch returnUrl; Loader khi useSession pending
├── routes/_auth/route.tsx            # guard thật (thay placeholder Phase 1)
└── components/auth/
    ├── brand-panel.tsx               # thích ứng từ web, panel trái: brand học viên (không chép nguyên visual web — tông "Học viên")
    ├── auth-tabs.tsx                 # 2 tab Đăng nhập / Đăng ký (persist localStorage như web)
    ├── sign-in-form.tsx              # @tanstack/react-form + authClient.signIn.email
    ├── sign-up-form.tsx              # authClient.signUp.email
    └── google-oauth-button.tsx       # authClient.signIn.social({provider:"google", callbackURL: `${window.location.origin}${validateReturnUrl(returnUrl)}`}) — ABSOLUTE, xem google-oauth-button.tsx:44-48
```

## Related Code Files

- Create: các file nêu trên trong `apps/student/src/`
- Modify: `apps/student/src/routes/_auth/route.tsx`, `apps/student/src/routes/index.tsx` (nếu placeholder cần đổi redirect)
- Modify (test): `apps/student/test/` — test theo ĐÚNG pattern của web: `renderToStaticMarkup` (react-dom/server) + `vi.mock("@/lib/auth-client")`, môi trường node (`apps/web/src/components/sign-in-form.test.tsx:1-13` là reference). KHÔNG thêm testing-library/jsdom (repo không có, thêm là vi phạm "không thêm dependency ngoài catalog") — assert trên markup tĩnh + unit test thuần cho logic submit handler tách riêng.

## Implementation Steps

1. Copy 5 component auth từ apps/web, đổi text sang tiếng Việt ("Đăng nhập", "Đăng ký", "Tiếp tục với Google", brand "Teacher OS · Học viên"); giữ nguyên flow error handling của form (reset-field-errors pattern). Google button giữ nguyên cơ chế absolute callbackURL của web (`window.location.origin` + `validateReturnUrl`).
2. Viết lại `routes/login.tsx`: validateSearch `returnUrl`, redirect đã-login → `/`, compose components; Storage key đổi thành `teacher-os-student-auth-tab`.
3. Bật guard thật trong `_auth/route.tsx` (copy `apps/web/src/routes/_auth/route.tsx:5-20` giữ comment returnUrl).
4. Test theo pattern web: static markup assert (renderToStaticMarkup + vi.mock auth-client) cho form/tabs render đúng; unit test thuần cho `validateReturnUrl` + handler submit tách riêng; guard redirect test. `pnpm --filter student test`.
5. Thử tay (cần Phase 5 đã merge hoặc set tạm `CORS_ORIGIN` gồm :8003 — xem Key Insights): `pnpm dev` (alchemy: server :8000 + web :8001 + student :8003) — login Google local (redirect URI `http://localhost:8000/api/auth/callback/google` đã cấu hình sẵn trong repo) và email/password; xác nhận sau OAuth học viên đáp về `http://localhost:8003/` (KHÔNG phải trang "OK" của API — dấu hiệu callbackURL sai) và cookie dùng được từ origin `localhost:8003`.

## Todo

- [ ] 5 component auth copy + bản địa hóa VN
- [ ] routes/login.tsx + guard _auth thật
- [ ] Unit test form + guard
- [ ] Thử tay login Google + email/password trên :8003 (server :8000)

## Success Criteria

- Học viên (user có email verified trùng `student.email`) login xong đang đứng ở `/` (placeholder tổng quan Phase 1/4); sau Google OAuth browser đáp về đúng origin :8003.
- User đã login mở `/login` bị đưa về `/`; truy cập `/` chưa login bị đá về `/login?returnUrl=%2F`.

## Risk Assessment

- Localhost cross-port cookie: :8003 và :8000 cùng host localhost nên cookie per-host vẫn gửi được (port không tách cookie) — đã được web :8001 chứng minh; nếu vướng SameSite trên trình dev, kiểm tra `defaultCookieAttributes` của createAuth (đã SameSite=None Secure).
- Google callback: nếu origin student chưa vào trustedOrigins (Phase 2/5 chưa merge) → better-auth 403 INVALID_ORIGIN ngay khi bấm nút; thứ tự merge phase: 2 → 3, và thử tay cần nhánh dev CORS của Phase 5 (hoặc env tạm).
- Account email/password chưa verified login được nhưng Phase 4 sẽ hiện "chưa xác thực email" (STUDENT_EMAIL_UNVERIFIED) — kỳ vọng này phải được truyền đạt, không phải bug.

## Security Considerations

- Không tự xử lý mật khẩu — mọi flow qua better-auth endpoint; không log token.
- `validateReturnUrl` chỉ nhận path bắt đầu `/` (chống open redirect) — copy test tương ứng từ web nếu có.

## Next Steps

- Phase 4 thay placeholder `/` bằng tổng quan thật + màn hình "chưa liên kết".
