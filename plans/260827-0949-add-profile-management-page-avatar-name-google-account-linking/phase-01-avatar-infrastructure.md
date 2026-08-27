---
phase: 1
title: "Avatar infrastructure"
status: pending       # pending | in-progress | completed
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 1: Avatar infrastructure

## Overview
Nền tảng render + xử lý ảnh avatar trước khi có trang profile: mở rộng component `Avatar` hỗ trợ `src` (img + fallback initials) và tạo helper resize ảnh phía client thành data URL nhỏ gon.

## Requirements
- Functional: `Avatar` nhận thêm `src?: string` — render `<img>` khi src hợp lệ, fallback về initials khi không có src / src fail guard / onError; helper biến `File` ảnh → data URL JPEG ≤64KB.
- Non-functional: pure helpers test được trong vitest không cần canvas thật (jsdom không có canvas); full resize path được e2e cover ở Phase 3.

## Architecture
- `packages/auth/src/avatar-policy.ts` — **single source of truth** cho allowlist/cap/validators (red-team session 2: packages không import được ngược từ apps, nên hằng số phải sống ở package): export `AVATAR_TARGET_PX`, `AVATAR_MAX_IMAGE_CHARS = 64 * 1024` (đo **số ký tự chuỗi data URL**, cùng metric với server hook), `SAFE_AVATAR_SRC_PATTERN`, `isSafeAvatarSrc(src)`, `validateAvatarFileName(file)`-style pure helpers dùng chung + `validateUpdateUserName(name)` / `validateUpdateUserImage(image)` cho server hook. Export qua entry `@teacher-os/auth`.
- `lib/avatar-image.ts` tách 2 lớp: (a) pure — re-export guards/hằng từ `@teacher-os/auth` + `validateAvatarFile`, `pickQuality`; (b) DOM — `fileToAvatarDataUrl` (Image/canvas). Unit test chỉ pin lớp (a); contract + e2e pin lớp (b).
- `Avatar` giữ API cũ (`text`, `size`, `className`) — mọi caller hiện tại không đổi; thêm optional `src`.

## Related Code Files
- Create: `packages/auth/src/avatar-policy.ts` (shared validators + hằng số; unit test colocated ở phase-02 bước 1)
- Modify: `apps/web/src/components/ui/avatar.tsx` (thêm `src` prop + guard + onError fallback)
- Create: `apps/web/src/lib/avatar-image.ts`
- Create: `apps/web/src/lib/avatar-image.test.ts`
- Create: `apps/web/src/components/ui/avatar.contract.test.ts` (source-parse: pin src guard)

## Implementation Steps
1. Tạo `packages/auth/src/avatar-policy.ts`:
   ```ts
   export const AVATAR_TARGET_PX = 192;               // render tối đa w-14 (56px); 192 sắc nét @DPR3
   export const AVATAR_MAX_IMAGE_CHARS = 64 * 1024;   // đo chars của chuỗi data URL — client & server cùng metric
   export const SAFE_AVATAR_SRC_PATTERN = /^(data:image\/(png|jpeg);base64,|https:\/\/)/;
   export function isSafeAvatarSrc(src: string | null | undefined): boolean;
   export function validateUpdateUserName(name: unknown): string | null; // trim length 2–100, tiếng Việt message
   export function validateUpdateUserImage(image: unknown): string | null; // ≤AVATAR_MAX_IMAGE_CHARS + pattern
   ```
2. Tạo `apps/web/src/lib/avatar-image.ts`: import guards/hằng từ `@teacher-os/auth`; thêm:
   ```ts
   export function validateAvatarFile(file: File): string | null; // null = OK; trả message lỗi tiếng Việt; chấp nhận image/jpeg|png|webp, input ≤10MB
   export function pickQuality(tryIndex: number): number | null; // 0→0.78, 1→0.6, 2→0.45, ≥3→null (= throw "ảnh quá lớn sau khi nén") — PURE, bắt buộc tách hàm để unit-test
   export async function fileToAvatarDataUrl(file: File): Promise<string>;
   // fileToAvatarDataUrl: createImageBitmap(file, { imageOrientation: "from-image" }) — BẮT BUỘC để tôn trọng EXIF
   // orientation của ảnh iPhone/portrait (red-team session 2); fallback HTMLImageElement chỉ là last-resort
   // → canvas AVATAR_TARGET_PX×AVATAR_TARGET_PX center-crop vuông, nền trắng khi alpha,
   // loop pickQuality(i) + toDataURL("image/jpeg", q) đến khi dataUrl.length ≤ AVATAR_MAX_IMAGE_CHARS; hết vòng → throw
   // (kongming checkpoint: canvas cố định 192×192 ⇒ số px không đổi theo input — quality ladder 0.78/0.6/0.45
   // đủ hội tụ mọi File ≤10MB; KHÔNG cần thêm pixel-downscale guard)
   ```
3. Sửa `apps/web/src/components/ui/avatar.tsx`: thêm `src?: string` và `imgProps?: ComponentProps<"img">` (hoặc rest-spread xuống img — e2e cần đặt `data-testid` trên `<img>`). Render `<img key={src} src={src} ... onError={() => setHasImgError(true)} {...imgProps} />` khi `src && isSafeAvatarSrc(src) && !hasImgError`, ngược lại render span initials như cũ. **`key={src}` bắt buộc** (red-team): nếu không, `hasImgError` một lần bắn (Google avatar URL 404 thoáng qua) sẽ khóa initials cả session kể cả sau khi user upload ảnh mới — layout route không remount sidebar. Giữ `loading="lazy"` + `object-cover` + `alt=""`.
4. Viết `apps/web/src/lib/avatar-image.test.ts` (vitest, pure layer — KHÔNG test `fileToAvatarDataUrl`, jsdom không có canvas): matrix `isSafeAvatarSrc` qua re-export (`data:image/png;base64,` OK; `data:image/jpeg;base64,` OK; `https://lh3.googleusercontent.com/x` OK; `http://`, `javascript:`, `blob:`, `data:text/html`, `data:image/svg+xml` → false); `validateAvatarFile` đúng type/size; `pickQuality` trả đúng dãy quality và `null` ở vòng 3 (pin nhánh throw).
5. Viết `avatar.contract.test.ts` theo pattern source-parse của repo (tham khảo `lib/kernel-runtime.contract.test.ts`): assert `avatar.tsx` chứa `isSafeAvatarSrc` guard, `onError` fallback, và `key={src}` (cơ chế reset); assert `avatar-image.ts` dùng cap `AVATAR_MAX_IMAGE_CHARS` + target 192 + gọi `createImageBitmap` với `imageOrientation`.

## Success Criteria
- [ ] `Avatar` không có `src` render initials y như cũ (không regression caller hiện tại — grep mọi chỗ dùng `<Avatar`)
- [ ] `Avatar` có `src` hợp lệ render `<img>`; src rác → initials; **src mới sau khi từng lỗi → render lại img** (key={src})
- [ ] `pickQuality` là pure function có unit test riêng (kể cả nhánh null/throw)
- [ ] `packages/auth/src/avatar-policy.ts` export đủ guards + validators, không import gì từ apps
- [ ] `pnpm --filter web test` xanh; `pnpm check-types` xanh

## Risk Assessment
- **jsdom không có canvas** (assumption: vitest web chạy môi trường node/jsdom không polyfill canvas). Tín hiệu vỡ: test import helper DOM fail ngay `createImageBitmap is not defined`. Phản ứng đã định sẵn: giữ mọi DOM API trong `fileToAvatarDataUrl`, không unit-test hàm này — chỉ pure helpers + e2e.
- **EXIF orientation lệch giữa 2 code path** (red-team session 2): `createImageBitmap` mặc định áp EXIF còn canvas vẽ HTMLImageElement vẽ pixel raw. Phản ứng: luôn truyền `{ imageOrientation: "from-image" }`, coi fallback là last-resort; hướng ảnh kiểm tra bằng manual checklist phase-02 bước 11(f) với ảnh portrait thật.
- Source ảnh PNG trong suốt → JPEG mất alpha: vẽ nền trắng trước `toDataURL` — đã đưa vào spec bước 2.
