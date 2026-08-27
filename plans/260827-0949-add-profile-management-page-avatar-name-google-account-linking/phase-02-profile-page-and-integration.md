---
phase: 2
title: "Profile page and integration"
status: pending       # pending | in-progress | completed
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 2: Profile page and integration

## Overview
Tạo route `/profile` với 2 card (Thông tin cá nhân, Liên kết tài khoản Google), nối entry point từ sidebar footer, và dọn 2 chỗ data giả (settings card, sidebar hardcode "Google").

## Requirements
- Functional: đổi tên + đổi avatar (persist qua `authClient.updateUser`, UI phản ánh ngay); xem trạng thái Google link; nút "Kết nối Google" chạy OAuth full-page redirect quay về `/profile`; nhánh lỗi hiển thị toast.
- Non-functional: theo auth form pattern (`authClient.*` + sonner toast), KHÔNG qua kernel command bus; name editable duy nhất tại `/profile`.

## Architecture
- Route `/_auth/profile` kế thừa guard `_auth` (`routes/_auth/route.tsx` beforeLoad) — session lấy từ `useRouteContext({ from: "/_auth" })` (pattern như `dashboard.tsx:33`). URL thật là `/profile` (`_auth` pathless layout) — mọi `navigate`/`Link` dùng `/profile`.
- `useLinkedAccounts()` hook: gọi `authClient.listAccounts()` → check `a.providerId === "google"`; client trả `{ data, error }` — **error không được nuốt** (red-team session 2): set state error để UI render nhánh lỗi + retry. Gọi trên mount và sau khi quay về từ OAuth (component remount → mount effect chạy lại là đủ).
- Sau `updateUser` thành công: `toast.success` + `router.invalidate()` (re-run beforeLoad → route context/session mới cho sidebar/dashboard). `useSession()` atom tự broadcast đã handle các tab khác.

## Related Code Files
- Create: `apps/web/src/routes/_auth/profile.tsx`
- Create: `apps/web/src/lib/use-linked-accounts.ts`
- Create: `apps/web/src/components/profile/avatar-section.tsx`
- Create: `apps/web/src/components/profile/google-link-card.tsx`
- Create: `apps/web/src/lib/profile.contract.test.ts`
- Modify: `packages/auth/src/index.ts` (server hook validate `/update-user` delegate sang `avatar-policy.ts` — Design Decision #9)
- Modify: `apps/web/src/components/layout/app-shell.tsx` (thêm `"/_auth/profile": "Hồ sơ"` vào `routeTitles` — không có thì topbar mất tiêu đề)
- Modify: `apps/web/src/components/layout/sidebar.tsx` (footer user block)
- Modify: `apps/web/src/routes/_auth/settings.tsx` (xóa card giả `:61-89` + state giả `:17-19`, giữ card Gói dịch vụ `:90-118`)

## Implementation Steps
1. **Server hook validate** (làm trước — đỏ/test trước UI): tạo colocated unit test `packages/auth/src/avatar-policy.test.ts` — gọi **trực tiếp các pure validators** đã export từ phase-01 (`validateUpdateUserName`: accept "Nguyễn Văn A", reject `""`, `"  "` (trim < 2), >100 ký tự; `validateUpdateUserImage`: accept data URL PNG/JPEG trong cap, https URL, reject chuỗi vượt `AVATAR_MAX_IMAGE_CHARS` (chars), `data:image/svg+xml;base64,`, `http://`). Trong `createAuth` (`packages/auth/src/index.ts`) thêm `hooks.before` cho path `/update-user` — **hook chỉ delegate** gọi 2 validator trên với body và trả lỗi 400 message tiếng Việt khi có `string | null` khác null. (red-team session 2: hook inline nằm trong closure `betterAuth({...})` không gọi/test trực tiếp được — pure validators mới là bề mặt test, đúng pattern named-export của `topology.test.ts`; contract source-parse pin hook delegate cũng đặt trong file test này, KHÔNG pin từ web.)
2. **`lib/use-linked-accounts.ts`**: hook như mô tả Architecture; return `{ googleLinked: boolean | null, reload, loading, error: string | null }` (`null` = đang load, phân biệt với `false`). (red-team session 2: KHÔNG nuốt error của `listAccounts` — client better-auth trả `{ data, error }`; set `error` khi fail để card render nhánh lỗi + nút thử lại, tránh thẻ kẹt trắng vĩnh viễn khi request tạm fail.)
3. **`routes/_auth/profile.tsx`**: `PageHead` "Hồ sơ" + layout Card 2 phần theo pattern `settings.tsx`; đọc session từ route context. **Khai báo `validateSearch`** cho param lỗi OAuth (pattern `schedule.tsx:20-24`): `validateSearch: (search) => ({ error: typeof search.error === "string" ? search.error : undefined })`.
4. **`components/profile/avatar-section.tsx`**: `Avatar size="lg"` với `src={user.image}` và `imgProps={{ "data-testid": "profile-avatar" }}` (Phase 1 đã thêm prop passthrough); nút "Đổi ảnh" (`data-testid="avatar-change-btn"`) mở hidden `<input type="file" accept="image/jpeg,image/png,image/webp" data-testid="avatar-input">`; flow: `validateAvatarFile` → `fileToAvatarDataUrl` → `const { error } = await authClient.updateUser({ image: dataUrl })` → **có `error` → `toast.error` + dừng; không lỗi → `toast.success` + `router.invalidate()`** (client better-auth không throw — pattern `google-oauth-button.tsx:42-54`); disable nút khi đang xử lý. **Reset `input.value = ""` ngay sau khi đọc file** (dù thành công hay throw) — nếu không, chọn lại cùng một file (đè lên file cũ cùng tên) sẽ không fire `change` event và UI chết im (red-team session 2).
5. **Form đổi tên** (trong profile.tsx hoặc section riêng): `useState` khởi tạo từ `user.name`, trim + 2–100 ký tự client-side (đồng bộ rule `validateUpdateUserName`); submit → `const { error } = await authClient.updateUser({ name })` → cùng pattern error/success + `router.invalidate()` như bước 4.
6. **`components/profile/google-link-card.tsx`**:
   - `useLinkedAccounts()`: `error !== null` → dòng cảnh báo + Button "Thử lại" gọi `reload()`; `googleLinked === true` → row Google + Badge xanh "Đã kết nối"; `=== false` → Button "Kết nối Google":
     ```ts
     const base = `${window.location.origin}/profile`;
     const { error } = await authClient.linkSocial({
       provider: "google",
       callbackURL: base,        // ABSOLUTE — Design Decision #3 (split-origin)
       errorCallbackURL: base,   // KHÔNG thêm query — better-auth tự append ?error=<code>
     });
     if (error) { toast.error(...); setIsRedirecting(false); } // client không throw; không redirect khi lỗi
     ```
   - Trong `profile.tsx` thêm `useEffect` đọc search param **`error`** (đã có `validateSearch` bước 3 — KHÔNG có param `linkError`, đó là param ma red-team đã bắt): nếu có → `toast.error` map code (`email_doesn't_match` → "Email Google không khớp email tài khoản", `account_already_linked_to_different_user` → "Google này đã thuộc tài khoản khác", còn lại → lỗi chung) → clear bằng `router.navigate({ to: "/profile", search: {}, replace: true })`. **`to` là URL path `/profile`, KHÔNG phải routeId `/_auth/profile`** — `_auth` là pathless layout; precedent `schedule.tsx:51` (red-team session 2: dùng routeId văng user ra not-found).
7. **`sidebar.tsx` footer** (`:256-299`): wrap block user (avatar + tên + subtitle) trong `Link to="/profile"` (giữ nút sign-out ngoài Link — không lồng interactive); avatar span → `<Avatar src={user.image} text={initials} />`; `<div>Google</div>` hardcode (`:268`) → `{user.email}` truncate.
8. **`settings.tsx`**: xóa card "Thông tin giáo viên" giả (`:61-89`) **và** 3 state giả `name`/`phone`/`timezone` (`:17-19`) — không xóa thì biome `noUnusedVariables` đỏ; **giữ nguyên card "Gói dịch vụ" (`:90-118`) và state `unitPrice`**. Thay card đã xóa bằng card read-only: tên + email từ session + link "Chỉnh sửa tại Hồ sơ" → `/profile`.
9. **`app-shell.tsx`**: thêm `"/_auth/profile": "Hồ sơ"` vào `routeTitles` (`:7-22`).
10. **`lib/profile.contract.test.ts`** (source-parse, pattern `*.contract.test.ts` hiện có — chỉ pin file **trong apps/web**, không leo sang packages/): pin `profile.tsx` dùng `useRouteContext`, `authClient.updateUser`, `validateSearch`; nhánh clear search dùng `to: "/profile"` (regex chặn chuỗi `to: "/_auth/` — red-team session 2); `google-link-card.tsx` chứa `linkSocial`, `provider: "google"`, callbackURL absolute (`window.location.origin`) — regex chặn relative `callbackURL: "/`, **và nhánh `if (error)` sau cả `updateUser` lẫn `linkSocial`**; `avatar-section.tsx` chứa reset `value = ""` sau đọc file; `use-linked-accounts.ts` set state error khi call fail; `sidebar.tsx` chứa `to="/profile"` và không còn chuỗi hardcode cũ; `settings.tsx` không còn "Trần Mai Lan"/state phone giả và có link `/profile`.
11. Chạy local: `pnpm dev`, **manual checklist bằng Google account thật của dev**: (a) đổi tên; (b) upload avatar; (c) credential user click "Kết nối Google" → consent → quay về /profile thấy "Đã kết nối"; (d) hủy consent giữa chừng → về /profile có toast lỗi, vẫn đứng ở trang profile (không not-found); (e) đăng nhập lại bằng Google → avatar tự thay vẫn được giữ; (f) upload ảnh portrait EXIF từ iPhone/camera → avatar hiển thị đúng hướng (không xoay ngang). Ghi kết quả vào PR description.

## Success Criteria
- [ ] `/profile` render dưới guard `_auth`; topbar hiện tiêu đề "Hồ sơ"
- [ ] Đổi tên → toast + sidebar/dashboard cập nhật không F5; lỗi updateUser → toast lỗi, không toast thành công giả
- [ ] Upload ảnh → avatar mới ở profile + sidebar; ảnh trong DB là data URL ≤64KB; server hook chặn input trái phép (curl test thủ công)
- [ ] Google user: badge "Đã kết nối"; credential user: nút "Kết nối Google" (OAuth round-trip = manual checklist bước 11; contract pin absolute URL + nhánh error)
- [ ] Settings card thật (không còn "Trần Mai Lan"/phone giả, giữ Gói dịch vụ); sidebar subtitle là email
- [ ] `pnpm --filter web test` + `pnpm check-types` + `pnpm build` xanh (validateSearch giúp `useSearch` typecheck)

## Risk Assessment
- **callbackURL relative chết ở prod split-origin** (assumption: deploy dùng `app.<domain>`/`api.<domain>` với cross-subdomain cookies — suy từ `crossSubDomainCookies` trong auth config). Tín hiệu vỡ: prod redirect về `api.<domain>/profile` 404. Phản ứng: absolute URL bắt buộc + contract test pin — nếu plan review phát hiện deploy thực tế same-origin thì risk giảm nhưng vẫn giữ absolute (vô hại).
- **Workers.dev preview deploy**: `CORS_ORIGIN` default `http://localhost:8001` (`packages/infra/alchemy.run.ts:55-57`) → origin check từ chối callbackURL của preview URL với 403. Tín hiệu: nút chết ở preview. Phản ứng: nhánh `if (error)` toast hiện rõ (không im lặng); deploy đúng cần set CORS_ORIGIN.
- **route context session stale sau updateUser** (assumption: `router.invalidate()` re-run beforeLoad đủ — đã verify router-core `invalidate()` load lại mọi match; nếu không, sidebar giữ tên cũ). Tín hiệu: manual bước 11 thấy sidebar không đổi. Phản ứng: fallback full reload như login flow (`sign-in-form.tsx:41-46`).
- Người dùng Google-only có sẵn `user.image` là https URL → `isSafeAvatarSrc` phải cho `https://` (đã cover Phase 1); URL Google avatar có thể 404 thoáng qua → `key={src}` reset đã cover Phase 1; đổi avatar của user này không bị Google re-login ghi đè (`updateUserInfoOnLink` default false — verified).
