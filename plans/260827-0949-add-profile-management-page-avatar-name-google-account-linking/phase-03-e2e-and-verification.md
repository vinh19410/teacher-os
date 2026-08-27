---
phase: 3
title: "E2E and verification"
status: pending       # pending | in-progress | completed
priority: P2
effort: "0.5d"
dependencies: [2]
---

# Phase 3: E2E and verification

## Overview
Playwright e2e cho profile page theo chiến lược "không mock auth": signup thật qua UI, rename + upload ảnh thật qua browser canvas, và trạng thái "Đã kết nối" verify qua **real `listAccounts`** bằng cách seed thẳng row `account` vào DB e2e. Chốt bằng CI xanh.

## Requirements
- Functional: spec `profile.spec.ts` cover đổi tên, đổi avatar, trạng thái Google (cả 2 nhánh), error-param branch.
- Non-functional: e2e chạy sequential trên `local.db` hiện có (boot shim `apps/e2e/src/boot.ts` — real better-auth + libsql); không stub auth.

## Architecture
- Boot e2e hiện tại: `pnpm run boot:api` → real better-auth trên libsql file `apps/e2e/local.db`, web :8001 (`playwright.config.ts:27-43`); signup qua UI thật (`specs/helpers.ts:6-19` `signUpViaUi`).
- **Seed account row** (kongming suggestion, red-team sửa SQL): mở `@libsql/client` `createClient({ url: "file:<repo>/apps/e2e/local.db" })` ngay trong test → sinh id bằng **JS** `crypto.randomUUID()` (SQLite/libsql KHÔNG có hàm `randomUUID()`), rồi bind tham số:
  ```sql
  INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
  VALUES (?, 'google-e2e-1', 'google', ?, ?, ?)  -- created_at/updated_at = Date.now()
  ```
  **Bắt buộc cung cấp `updated_at`**: cột này NOT NULL và KHÔNG có DB default — `$onUpdate` của drizzle chỉ chạy qua ORM, raw SQL bypass hoàn toàn (migration DDL `0000_mushy_amazoness.sql` — `updated_at integer NOT NULL` không DEFAULT; chỉ `created_at` có default). Lấy userId: `SELECT id FROM user WHERE email = ?` với email deterministic.
- Google OAuth thật không complete được trong CI → nhánh "Đã kết nối" cover bằng seed; nhánh click-connect chỉ assert redirect host `accounts.google.com` (optional, skip nếu env Google dummy).

## Related Code Files
- Modify: `apps/e2e/specs/helpers.ts` (thêm overload/param deterministic email cho `signUpViaUi`)
- Create: `apps/e2e/specs/profile.spec.ts`
- Create: `apps/e2e/src/account-seed.ts` (helper seed `account` row, dùng chung nếu cần)

## Implementation Steps
1. `helpers.ts`: thêm `signUpViaUi(page, opts?: { name?, email?, password? })` — mặc định giữ hành vi random hiện tại (không break specs cũ); trả về email đã dùng.
2. `account-seed.ts`: `seedGoogleAccount(email)` — connect libsql `file:apps/e2e/local.db` (resolve path từ `import.meta.url`/cwd theo cách boot.ts dùng), lookup user id, insert account row theo SQL ở Architecture (id từ JS, kèm created_at/updated_at); idempotent (delete-then-insert theo `account_id='google-e2e-1'`).
3. `profile.spec.ts` — test 1 "đổi tên": `signUpViaUi` email deterministic `profile-e2e+<ts>@test.local` → goto `/profile` → fill tên mới → submit → expect toast thành công + sidebar footer chứa tên mới (không reload).
4. Test 2 "đổi avatar": generate ảnh **≥400×400 px** trong test qua `page.evaluate` canvas (vẽ gradient + text để có chi tiết nén — không dùng buffer nhỏ: ảnh nhỏ hơn 192px khiến canvas upscale, không cover đường đi production downscale) → `setInputFiles` trên `input[data-testid="avatar-input"]` (testid Phase 2 đã đặt) → expect `img[data-testid="profile-avatar"]` có `src` startswith `data:image/jpeg;base64,` và encoded length ≤ 64KB (đọc thuộc tính src) và sidebar avatar render img.
5. Test 3 "Google đã kết nối": `seedGoogleAccount(email)` → `page.reload()` → expect text "Đã kết nối" hiển thị (đi qua real `/api/auth/list-accounts`).
6. Test 4 "chưa kết nối + error branch": user mới (chưa seed) → expect nút "Kết nối Google" hiển thị; goto `/profile?error=email_doesn't_match` → expect toast lỗi hiện → search param bị clear (URL không còn `error=`).
7. (Optional) Test 5: click "Kết nối Google" → `waitForURL(/accounts\.google\.com/)` — wrap `test.skip(!process.env.E2E_GOOGLE_OAUTH, ...)` để không fail CI khi Google env là dummy (boot shim dùng dummy creds — `boot.ts:44-45`). **Lưu ý trung thực coverage:** toàn bộ round-trip OAuth thật (consent → callback → account row) KHÔNG có coverage tự động — test 3 seed sẵn row; criterion này do manual checklist phase-02 bước 11 bảo đảm.
8. Chạy full local: `pnpm biome check . --fix` (hoặc script format repo), `pnpm test`, `pnpm check-types`, `pnpm build`, e2e local **`pnpm --filter e2e e2e`** (package e2e KHÔNG có script `test`). **CI chỉ chạy trên PR** — `.github/workflows/ci.yml:3-9` và `e2e.yml:3-8` trigger duy nhất trên push/pull_request với base `[main, develop]` (red-team session 2): push lên feature branch không kích hoạt job nào; "CI xanh" quan sát được sau khi mở PR về develop tại bước ship, không phải trước.

## Success Criteria
- [ ] 4 test e2e bắt buộc pass ổn định (chạy 2 lần liên tiếp không flake)
- [ ] Không mock auth/listAccounts trong e2e — nhánh connected đi qua seed DB thật
- [ ] CI xanh toàn bộ jobs (biome, vitest, check-types, build, Playwright)

## Risk Assessment
- **Lock contention giữa Playwright connection và boot-shim connection trên cùng file SQLite** (assumption: e2e chạy sequential 1 worker trên `local.db` — đã verify `workers: 1` trong `playwright.config.ts:11`, không shard trong e2e.yml). Tín hiệu: `SQLITE_BUSY` khi seed. Phản ứng: seed ngay sau khi page idle (không write song song), hoặc thêm `?_busy_timeout=5000`; tệ nhất chuyển seed vào `boot.ts` sau migrate. **Lưu ý:** nếu seed fail với `NOT NULL constraint failed: account.updated_at` — đó là thiếu cột trong INSERT (xem Architecture), không phải lock.
- **Avatar upload e2e phụ thuộc canvas browser resize** (browser thật có canvas — an toàn hơn jsdom; tín hiệu vỡ: img src không phải `data:image/jpeg`). Phản ứng: kiểm tra accept attribute input khớp mime của file test; nhánh "quá cap sau nén" đã được unit-test `pickQuality` cover ở Phase 1.
- Boot shim wipe DB mỗi lần chạy nhưng seed chạy sau boot (khi test chạy) — thứ tự an toàn.
