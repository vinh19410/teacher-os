---
title: "Trang quản trị profile: đổi avatar, tên và liên kết Google"
description: "Thêm route /profile dưới _auth: đổi avatar (client resize → data URL → updateUser), đổi tên (updateUser), xem trạng thái liên kết Google (listAccounts) + nút kết nối (linkSocial với callbackURL tuyệt đối). Thay card giả trong settings và hardcode Google trong sidebar."
status: completed
priority: P2
effort: 2d
issue: 94
branch: develop
tags: [web, ui, auth, feature, profile]
blockedBy: []
blocks: []
created: 2026-08-27
---

# Trang quản trị profile: đổi avatar, tên và liên kết Google

## Overview

Thêm trang **Hồ sơ** (`/_auth/profile`) cho phép user: (1) upload/đổi avatar, (2) đổi tên hiển thị, (3) xem trạng thái liên kết Google — đã đăng bằng Google thì badge "Đã kết nối", chưa thì nút "Kết nối Google" dẫn qua OAuth flow. Toàn bộ dùng API có sẵn của better-auth 1.6.27 (`updateUser`, `listAccounts`, `linkSocial`) — **không schema migration, không endpoint server mới, không infra mới**. Đồng thời dọn 2 phần tử giả hiện có: card "Thông tin giáo viên" tĩnh trong `settings.tsx` và nhãn "Google" hardcode trong sidebar footer.

## Scope Challenge (Step 0)

- **Existing code:** better-auth 1.6.27 đã mount tại `/api/auth` (`apps/server/src/app.ts:98`), Google provider + email/password bật (`packages/auth/src/index.ts:37-45`); cột `user.image` tồn tại nhưng chưa dùng (`packages/db/src/schema/auth.ts:11`); `Avatar` local chỉ render initials (`apps/web/src/components/ui/avatar.tsx`); Toaster sonner đã mount (`__root.tsx:41`); guard `_auth` truyền session qua route context (`routes/_auth/route.tsx:5-22`).
- **Requested scope:** trang profile với đổi avatar + đổi tên + trạng thái link Google + nút kết nối. Giao đủ, không thêm gì.
- **Complexity:** 18 file (12 create — nửa là test/policy/seed helper, 6 modify), 0 service/class mới, 3 phase → **HOLD SCOPE**, mode **hard** (chạm auth + 2 design fork cần research: lưu avatar và callbackURL redirect). *(red-team session 2: đếm lại từ Related Code Files của 3 phase sau khi thêm avatar-policy — bản cũ ghi ~10 file sai)*.

## Cross-Plan Dependencies

Không có. 4 plan chưa hoàn thành trong `plans/` (production-readiness, unblock-uat, merge-tabs, session-actions) đều không chạm auth/profile/web-layout — không overlap file, không blockedBy/blocks.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | User đổi được avatar (upload ảnh thật, client resize) | P1 |
| 2 | User đổi được tên hiển thị, sidebar/dashboard cập nhật ngay | P1 |
| 3 | Hiển thị đúng trạng thái liên kết Google; nút kết nối chạy được OAuth flow đầy đủ | P1 |
| 4 | Dọn dữ liệu giả: settings card tĩnh + sidebar hardcode "Google" | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Avatar infrastructure](./phase-01-avatar-infrastructure.md) | Pending |
| 2 | [Profile page and integration](./phase-02-profile-page-and-integration.md) | Pending |
| 3 | [E2E and verification](./phase-03-e2e-and-verification.md) | Pending |

## Design Decisions

1. **Avatar = data URL sau client-side resize** (canvas ≤192×192 center-crop, JPEG q≈0.78, hard cap 64KB encoded) → `authClient.updateUser({ image })` lưu thẳng cột `user.image`. Không R2/KV (infra hiện chỉ có D1, `alchemy.run.ts:59-82`), không endpoint upload (kernel POST middleware ép JSON-only 415, `routes/kernel.ts:113-124`). D1 row limit 2MB, session DB-backed với opaque cookie token → data URL không phình cookie. **Budget 192px/64KB** (kongming adjust + red-team verify): router bật `defaultPreload: "intent"` (`apps/web/src/main.tsx:12`) — hover/preload route `_auth` nào cũng chạy `beforeLoad` → fetch `get-session` kèm data URL; avatar càng nhỏ càng ít tốn mỗi lần fetch đó. Nếu tương lai payload thành vấn đề: strip `image` khỏi get-session bằng customSession plugin (follow-up, không scope này).
2. **Trạng thái Google** = `authClient.listAccounts()` rồi check `providerId === "google"` (session KHÔNG chứa linked providers — verified better-auth 1.6.27 source).
3. **Nút Kết nối** = `authClient.linkSocial({ provider: "google", callbackURL: <absolute web-origin URL>, errorCallbackURL: ... })`. **Bắt buộc absolute URL** (`window.location.origin + "/profile"`): prod deploy split-origin `app.<domain>` ↔ `api.<domain>` — callback đổ về api origin, relative `/profile` sẽ resolve thành `api.domain/profile` (404). Web origin đã nằm trong `trustedOrigins` (CORS_ORIGIN) nên absolute URL pass origin check. Không yêu cầu password trong 1.6.27.
4. **Form pattern**: theo auth form (`authClient.*` + `toast` sonner + refresh session bằng `router.invalidate()`), KHÔNG đưa qua kernel command bus — profile là better-auth user data, không phải org data. **Client better-auth không throw khi lỗi** — mọi call (`updateUser`, `linkSocial`) phải destructure `const { error } = ...`, có `error` → `toast.error` + dừng; pattern theo `google-oauth-button.tsx:42-54`. Sau thành công: `useSession()` atom tự refetch, nhưng route context session (sidebar/dashboard đọc) cần `router.invalidate()` để chạy lại `beforeLoad`.
5. **Tên chỉ sửa tại /profile.** Card "Thông tin giáo viên" giả trong `settings.tsx` (card `:61-89`, hardcode `useState("Trần Mai Lan")` ở `:17-19` kèm `phone`/`timezone` giả) → xóa card + 3 state đi kèm, thay bằng thông tin thật read-only + link sang /profile. **Giữ nguyên card "Gói dịch vụ" `:90-118` và state `unitPrice` của nó.** Tránh 2 nơi cùng ghi `user.name` và tránh biome `noUnusedVariables` đỏ.
6. **Sidebar footer** (`sidebar.tsx:256-299`) wrap user block trong `Link to="/profile"`; avatar slot render `user.image` (qua Avatar `src` mới); subtitle bỏ hardcode "Google" → hiển thị email (truthful, zero request).
7. **Avatar guard**: `isSafeAvatarSrc()` chỉ cho `data:image/(png|jpeg);base64,` hoặc `https://` (Google avatar là https `lh3.googleusercontent.com`). Render bằng `<img src>` thường — React escape + `<img>` không execute script trong SVG data URL.
8. **Nhánh lỗi OAuth**: better-auth **tự append** `?error=<code>&error_description=...` vào `errorCallbackURL` (dist `oauth2/errors.mjs` — không có param `linkError`). Vì vậy: `errorCallbackURL: ${window.location.origin}/profile` (không query); route `/profile` khai báo `validateSearch` cho `error?: string` (pattern `schedule.tsx:20-24`); `useEffect` đọc `error` → `toast.error` (map `email_doesn't_match`, `account_already_linked_to_different_user`) → clear bằng `router.navigate({ to: "/profile", search: {}, replace: true })`. **`to` nhận URL path, KHÔNG phải routeId**: `_auth` là pathless layout nên fullPath đăng ký là `/profile` — precedent `schedule.tsx:51`; dùng `"/_auth/profile"` sẽ không match route nào → not-found (red-team session 2). Router instance không có method `replace`. User hủy consent ở Google không được im lặng.
9. **Validate server-side cho updateUser** (red-team): signup là công khai (`login.tsx:9` render SignUpForm) nên premise "app 1 user" sai. **Cơ chế:** mọi request `/api/auth/*` bị `bootstrapMiddleware` bypass ngay đầu (`app.ts:46-48` `isAuthPath(pathname)` → `next()`) — bề mặt auth không qua middleware bootstrap/kernel nào khác (org được tạo ở request kernel authenticated đầu tiên, không phải lúc signup), nên validation phải sống trong better-auth hooks của `createAuth` (`packages/auth/src/index.ts`). Thêm `hooks.before` cho `/update-user` chỉ **delegate** sang pure validators exported từ module mới `packages/auth/src/avatar-policy.ts` (red-team session 2: hook inline trong closure `betterAuth({...})` không gọi/test trực tiếp được; pattern named-export thuần như `topology.test.ts`): `name` trim length **2–100** (đồng bộ rule client — session 2: chặn cả `""`/whitespace); `image` nếu có phải `dataUrl.length ≤ 65536` (**metric chốt: số ký tự chuỗi data URL — client và server đo như nhau**, tránh lệch base64 ~35% giữa chars/bytes) và match `SAFE_AVATAR_SRC_PATTERN` (`^data:image/(png|jpeg);base64,` hoặc `^https://`). Module này là **single source of truth**: `apps/web/src/lib/avatar-image.ts` import hằng/pattern/guards từ `@teacher-os/auth` (direction web→package hợp lệ; packages không bao giờ import ngược từ apps). Lỗi trả 400 message tiếng Việt. Mục đích: chặn ai đó curl nhồi chuỗi ~2MB vào `user.image` làm phình mọi get-session sau đó.

**Landmine ghi lại cho người kế thừa:** nếu tương lai bật `session.cookieCache`, avatar data URL (≤65536 chars) sẽ vượt cookie limit 4KB ngay lập tức — phân tích nằm trong plan research `researcher-01-better-auth-capabilities.md` mục cookieCache (`docs/system-architecture.md` chưa có mục session/cookies).

## Non-goals (pinned)

- Không nút xóa avatar (`updateUser({ image: null })` là follow-up nhỏ nếu cần)
- Không đổi email / đổi password / 2FA
- Không "Ngắt kết nối Google" (unlinkAccount cần fresh session < 24h + guard last-account)
- Không R2/upload endpoint/CDN
- Không avatar ở topbar
- Không bật email verification hay tắt `requireLocalEmailVerified` (auto-link implicit khi sign-in bằng Google cùng email bị chặn mặc định — nút Kết nối chính là giải pháp, không hack quanh nó)

## Success Criteria

- [ ] User credential upload ảnh (jpeg/png/webp) → avatar hiển thị ở profile + sidebar; ảnh lưu ≤64KB data URL trong `user.image`
- [ ] User đổi tên → toast thành công, sidebar footer + dashboard greeting cập nhật không cần F5
- [ ] Trạng thái linked render đúng: e2e seed account row → badge "Đã kết nối" qua real `listAccounts`; credential user thấy nút "Kết nối Google"
- [ ] **OAuth round-trip thật** (click → Google consent → quay về /profile "Đã kết nối", cả nhánh hủy consent/error-param): verify manual bằng Google account của dev theo checklist phase-02 **bước 11** — CI không cover được phần này (Google creds dummy trong boot shim)
- [ ] Settings không còn data giả; sidebar không còn nhãn "Google" sai
- [ ] CI xanh: biome + vitest + check-types + build + Playwright

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `beforeLoad`/preload `intent` fetch get-session kèm data URL avatar thường xuyên | Cap 192px/64KB (kongming + red-team verify `main.tsx:12`); JPEG fallback quality loop; follow-up: customSession strip image |
| callbackURL relative chết ở split-origin prod | Pin absolute URL + contract test regex chặn regression |
| jsdom không có canvas → unit test resize không chạy được | Unit test chỉ cover pure helpers (validate/guard/cap/pickQuality); full path do Playwright e2e (browser thật) |
| E2E không complete được Google OAuth thật | Trạng thái linked render = e2e seed DB thật qua `listAccounts`; **OAuth round-trip thật = manual checklist** (Google account dev) — không claim CI cover |
| updateUser không validate input + signup công khai → nhồi blob 2MB vào user.image | Server hook validate (DD#9) + client cap; đạt 2 tầng |
| Workers.dev preview: CORS_ORIGIN default `http://localhost:8001` (`alchemy.run.ts:55-57`) → linkSocial 403 ở preview deploy | Nhánh `{ error }` toast (DD#4) hiện lỗi thay vì chết im; note deploy cần set CORS_ORIGIN đúng (`trustedOrigins` derive từ nó tại `packages/auth/src/index.ts:36` — kongming checkpoint: prod bắt buộc set CORS_ORIGIN = **web origin**, không chỉ api origin) |
| Shared-device: ai cầm máy quên logout link được Google của họ | Chấp nhận (non-goal unlink); note manual fix `DELETE FROM account WHERE provider_id='google' AND user_id=...` |

## Open Questions

Không còn câu hỏi chặn. 2 quyết định nhỏ đã tự chốt theo evidence: (a) sidebar subtitle hiển thị email thay vì gọi listAccounts (tránh request thừa ở sidebar); (b) avatar output luôn JPEG (canvas vẽ nền trắng nếu source có alpha) — đơn giản hóa assert e2e.

## Research

- [researcher-01-better-auth-capabilities.md](./research/researcher-01-better-auth-capabilities.md) — better-auth 1.6.27 source-verified: updateUser/listAccounts/linkSocial shapes, linking defaults, security
- [researcher-02-codebase-and-avatar-storage.md](./research/researcher-02-codebase-and-avatar-storage.md) — codebase scan (file:line) + avatar storage option comparison
- Kongming advisory checkpoint (--advice): GO với 4 delta (giảm avatar target, seed DB cho e2e, error branch, absolute callbackURL) — đã áp dụng vào Design Decisions

## Red Team Review

### Session — 2026-08-27
**Findings:** 12 (12 accepted, 0 rejected) — 3 reviewer (Security Adversary, Assumption Destroyer, Failure Mode Analyst), tier Standard, tất cả findings đều qua evidence filter file:line
**Severity breakdown:** 2 Critical, 6 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Seed SQL fail: `updated_at` NOT NULL không DB default (raw SQL bypass `$onUpdate`) | Critical | Accept | Phase 3 |
| 2 | `randomUUID()` không phải hàm SQLite/libsql — sinh id bằng JS | Medium | Accept | Phase 3 |
| 3 | `linkError` là param ma; better-auth append `?error=`; thiếu `validateSearch`; `router.replace` không phải API | High | Accept | plan DD#8, Phase 2 |
| 4 | Client better-auth không throw — phải destructure `{ error }` cho updateUser + linkSocial (pattern `google-oauth-button.tsx:42-54`) | High | Accept | plan DD#4, Phase 2 |
| 5 | `hasImgError` không reset khi src đổi → khóa initials cả session; fix `key={src}` | High | Accept | Phase 1 |
| 6 | settings.tsx range sai: card giả là `:61-89` + state `:17-19`; giữ Gói dịch vụ `:90-118`; orphan state → biome đỏ | High | Accept | plan DD#5, Phase 2 |
| 7 | Signup công khai → premise "1 user" sai; cần server hook validate `/update-user` (name ≤100, image ≤64KB + allowlist) | High | Accept | plan DD#9, Phase 2 |
| 8 | data-testid lệch contract liên-phase; Avatar cần imgProps passthrough để đặt testid trên `<img>` | Medium | Accept | Phase 1, 2 |
| 9 | `pnpm --filter e2e test` không tồn tại — script thật là `e2e` | Medium | Accept | Phase 3 |
| 10 | OAuth round-trip thật không có coverage tự động — criterion phải nói trung thực (manual checklist) | High | Accept | plan criteria, Phase 2/3 |
| 11 | DD#1 rationale mâu thuẫn research; cơ chế thật: `defaultPreload: "intent"` fetch cả khi hover (`main.tsx:12`) | Medium | Accept | plan DD#1 |
| 12 | Fixture e2e mâu thuẫn về size; `pickQuality` phải tách pure function có unit test (không "nếu tách được") | Medium | Accept | Phase 1, 3 |

Reviewer cũng đã verify OK (không phải finding): `routeTitles` key đúng route ID; `@libsql/client` có trong e2e devDeps; 8 call site `<Avatar` tương thích ngược; 3 caller `signUpViaUi(page)` an toàn khi thêm opts; open-redirect qua callbackURL bị origin-check chặn; CSRF `/update-user` có Origin check toàn cục; XSS qua error param không phản chiếu raw; `workers: 1` sequential; vitest web env node — DOM API trong thân hàm an toàn khi import.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03
- Decision deltas checked: 12 (bảng trên)
- Reconciled stale references: 6 (`linkError`, `:59-119`, `router.replace`, `pnpm --filter e2e test`, "mỗi navigation" DD#1, "app cá nhân 1 user")
- Unresolved contradictions: 0

### Delivery Finalization — 2026-08-27 (ak:vibe --ship beta)
- Automated criteria verified pre-commit: unit 479 (auth 35 / web 307 / server 126 / infra 11), check-types, build, `biome check .` exit 0, Playwright 8 pass + 1 intentional skip, chạy ổn định 2 lần liên tiếp.
- Residual (documented, không chặn ship beta): OAuth round-trip thật = manual checklist phase-02 bước 11 với Google account của dev; e2e seed không busyTimeout và hook không generation counter chỉ an toàn dưới `workers:1` sequential.
- Ghi chú: `ak plan update --status` CLI lỗi "planstore: plan not found" trên MỌI plan (bug chung) nên dòng frontmatter status được ghi tay đúng biến thể của lệnh; linkage index lưu tại comment marker issue #94 id 5434408087 để phục hồi.

### Session 2 — 2026-08-27 (ak:vibe gate re-run: 3 reviewer độc lập: Security Adversary/Fact Checker, Assumption Destroyer/Scope Auditor, Failure Mode Analyst/Flow Tracer)
**Findings:** 16 raw → dedupe 14 (14 accepted, 0 rejected) — không lặp lại 12 findings session 1
**Severity breakdown:** 3 High, 11 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `router.navigate({ to: "/_auth/profile" })` dùng routeId thay vì URL path (`_auth` pathless layout) → not-found khi clear error OAuth (3 reviewer độc lập cùng bắt) | High | Accept | plan DD#8, Phase 2 #6/#10 |
| 2 | Hook inline trong closure `betterAuth({...})` không gọi/test trực tiếp được — phải extract pure validators exported | High | Accept | plan DD#9, Phase 1 #1, Phase 2 #1 |
| 3 | "Tái dùng regex `isSafeAvatarSrc`" vi phạm dependency direction (packages không import từ apps) → hoist policy vào `packages/auth/src/avatar-policy.ts` làm single source of truth | High | Accept | plan DD#9, Phase 1 |
| 4 | Contract test web leo sang `packages/auth` vỡ convention readFileSync cục bộ + duplicate guard | Medium | Accept | Phase 2 #10 (pin chuyển về colocated auth) |
| 5 | `useLinkedAccounts` nuốt error `listAccounts` → thẻ Google kẹt trắng vĩnh viễn khi request fail | Medium | Accept | plan Phase 2 Arch/#2/#6/#10 |
| 6 | Hidden file input không reset value → chọn lại cùng file không fire change | Medium | Accept | Phase 2 #4/#10 |
| 7 | Không xử lý EXIF orientation — ảnh portrait iPhone vào fallback HTMLImageElement bị xoay ngang vĩnh viễn | Medium | Accept | Phase 1 #2/Risk, Phase 2 #11(f) |
| 8 | Server validate `name` chỉ có trần không sàn (`""`/whitespace pass) — đồng bộ rule client 2–100 | Medium | Accept | plan DD#9, Phase 2 #1/#5 |
| 9 | 64KB hai bên thiếu đơn vị chung (chars vs binary, lệch base64 ~35%) → chốt `dataUrl.length ≤ 65536` cả client lẫn server | Medium | Accept | plan DD#9, Phase 1 hằng `AVATAR_MAX_IMAGE_CHARS` |
| 10 | CI chỉ trigger trên main/develop hoặc PR — "push branch xem CI xanh" vô nghĩa | Medium | Accept | Phase 3 #8 |
| 11 | DD#9 rationale sai cơ chế: bootstrap KHÔNG tạo org lúc signup — auth path bị bypass qua `isAuthPath` (`app.ts:46-48`) | Medium | Accept | plan DD#9 |
| 12 | Landmine trỏ `docs/system-architecture.md` không chứa cookieCache — nguồn thật là research file của plan | Medium | Accept | plan landmine |
| 13 | Success criteria trỏ "checklist bước 10" nhưng manual checklist là bước 11 | Medium | Accept | plan Success Criteria |
| 14 | Scope count "~10 file (4 create, 6 modify)" sai với inventory thật (18 files sau khi thêm avatar-policy) | Medium | Accept | plan Scope Challenge |

### Whole-Plan Consistency Sweep (sau Session 2)
- Decision deltas checked: 14 (bảng trên)
- Tìm stale terms toàn plan: không còn `to: "/_auth/profile"`; không còn `MAX_AVATAR_ENCODED_BYTES`; không còn citation cookieCache sai; reference "bước 11" thống nhất giữa plan.md và phase-02
- File inventory 3 phase đối chiếu lại scope line: 18 create+modify, khớp
- Unresolved contradictions: 0
