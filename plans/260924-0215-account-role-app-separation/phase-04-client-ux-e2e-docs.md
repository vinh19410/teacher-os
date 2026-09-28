---
title: "Phase 4: UX 2 phía + E2E regression + docs"
status: completed
priority: P2
effort: "5h"
dependencies: [3]
---

# Phase 4: UX 2 phía + E2E regression + docs

## Goal

Khi gate server trả 403 role, cả 2 app hiển thị màn chặn rõ ràng thay vì treo/whitespace; E2E khoá 2 kịch bản then chốt (login-rejection UI + stale-session cookie reuse); docs cập nhật đúng luật bootstrap/role mới.

## Context Links

- Phase 3 — mã lỗi `ACCOUNT_STUDENT_ROLE` / `ACCOUNT_TEACHER_ROLE`
- `apps/web/src/lib/query-client.ts` — `QueryCache.onError` xử lý 401 toàn cục (mẫu để thêm 403 role)
- `apps/web/src/lib/repos/kernel.ts:448-450` — GET snapshot **không đọc body** khi `!res.ok` (phải sửa — Red-team High #6)
- `apps/web/src/lib/repos/kernel.ts:371-379` — write path có `parseErrorReason` (chỉ đọc field `reason`)
- `apps/student/src/lib/repos/student.ts:28-29` — precedent portal: `code = body.code ?? body.error`
- `apps/student/src/components/overview/student-error-view.tsx` — view lỗi portal theo `code`
- `apps/e2e/specs/student-portal-provisioning.spec.ts` — pattern e2e seed DB + assert; `apps/server/src/kernel.test.ts:99-104` — pattern seed session row

## Key Insights

- **Read-path web hiện vứt body 403**: `fetchKernelSnapshot` throw `HttpError(res.status, "GET /api/kernel failed: ...")` không parse body → `QueryCache.onError` không thể thấy `ACCOUNT_STUDENT_ROLE`. Bắt buộc mở rộng transport GET đọc `body.error ?? body.reason` vào `reason` của `HttpError` (mirror write-path + precedent portal).
- Trigger theo `reason === "ACCOUNT_STUDENT_ROLE"` — KHÔNG match theo status 403 chung chung (sẽ nhầm với 403 cũ `"no membership after bootstrap"` tại `app.ts:85`).
- **E2E không thể login-UI vào blocked view**: Phase 2 chặn sign-in student-role ngay tại form (không có session) → blocked view chỉ tới được bằng **session cũ hợp lệ** (kịch bản stale-session cookie reuse — đúng cảnh боя nhất của plan). E2E mô phỏng bằng: sign-up API từ origin web (teacher) → flip role xuống student trong DB → cookie cũ vẫn hợp lệ → mở app.
- Portal có sẵn `StudentErrorView` map theo `code` → thêm 1 nhánh là xong; login bị chặn từ Phase 2 đã hiện toast qua `authErrorMessage` (email) và error-params (Google) — Phase này không đụng form.

## Requirements

### Web (teacher app)

- Component mới `AccountBlockedView` (full-screen, cùng ngôn ngữ thiết kế `kernel-load-error`): tiêu đề "Đây là tài khoản học viên", mô tả tài khoản học viên dùng cổng học viên, nút "Đăng xuất" (`authClient.signOut()` rồi `window.location.assign("/login")`) — **không có** link chéo sang portal (user chốt 2026-09-24).
- Error plumbing:
  - `repos/kernel.ts` GET path: khi `!res.ok`, parse body một lần (`res.json()` best-effort) → `reason = body.error ?? body.reason ?? "GET /api/kernel failed: {status}"` → throw `HttpError(res.status, reason)`.
  - `query-client.ts`: `QueryCache.onError` thêm nhánh `isHttpError(error) && error.status === 403 && error.reason === ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP` → `markRoleBlocked()`.
  - Write-path (bus): 403 role đi qua cùng seam — nếu bus có error hook riêng (`onAuthLost` pattern), gọi cùng `markRoleBlocked()` exit.
- `data-provider.tsx`: `isRoleBlocked()` → render `AccountBlockedView` thay AppShell (blocking error path hiện có), không retry query.

### Student portal

- `StudentErrorView`: nhánh `ACCOUNT_TEACHER_ROLE` — title "Đây là tài khoản giáo viên", description "Tài khoản này thuộc hệ thống giáo viên, không đăng nhập được cổng học viên…", icon `ShieldAlert`, giữ nút Đăng xuất có sẵn.
- Route index portal đã truyền `code` từ response 403 vào view (cơ chế `STUDENT_*` hiện có) — mở rộng mapping, không đổi route logic.

### E2E (`apps/e2e/specs/account-role-separation.spec.ts`)

Boot shim Phase 2 đã có `corsOrigin` 2 origin + `studentOrigins`. Hai test:

- **Test A — login rejection tại form** (khoá Phase 2 end-to-end):
  1. Sign-up qua API (`request.post` tới shim, không cần header Origin đặc biệt) tạo user teacher + credential.
  2. `UPDATE user SET role='student'` qua `@libsql/client` vào `apps/e2e/local.db`.
  3. Mở web app → login UI với tài khoản đó → expect toast/message "Tài khoản học viên không thể đăng nhập vào trang giáo viên…", vẫn ở `/login`.
  4. Assert DB: 0 row `session` cho user.
- **Test B — stale-session cookie reuse → blocked view** (kịch bản core D6/D7):
  1. Sign-up qua API (role teacher, nhận `set-cookie` từ response).
  2. `UPDATE user SET role='student'` trong DB (session cũ vẫn hợp lệ — stale session).
  3. `context.addCookies(...)` với cookie session vừa lấy (tên cookie theo seam test — mind prefix nếu có).
  4. Mở web app → expect `AccountBlockedView` ("Đây là tài khoản học viên") hiển thị.
  5. Assert DB: không phát sinh `organization`/`membership` cho user.
- Regression: teacher signup thường (spec provisioning hiện có) vẫn xanh.

### Docs

- `docs/project-overview-pdr.md`: dòng 14 (bootstrap rule) sửa thành "teacher-role mới được bootstrap org+membership; student-role nhận 403 `ACCOUNT_STUDENT_ROLE`"; bổ sung 1 dòng durable contract: "Accounts carry an app role (`user.role`): student-portal sign-ups are `student` and cannot sign in on the teacher app; teacher accounts cannot sign in on the student portal (403 `ACCOUNT_TEACHER_ROLE`)."
- `docs/system-architecture.md`: mục auth — nêu 3 lớp chặn (sign-up gán role theo origin + server-side OAuth stamping, session-create rejection, API middleware gate) + shared cookie zone là lý do phải có lớp 3.

## Files to Create / Modify

- Create: `apps/web/src/components/account-blocked-view.tsx`, `apps/web/src/lib/role-block.ts`
- Modify: `apps/web/src/lib/repos/kernel.ts` (GET path parse body — Red-team bắt buộc), `apps/web/src/lib/kernel-load-state.ts` (nếu cần mở rộng `HttpError`), `apps/web/src/lib/kernel.transport.test.ts` (test transport mới), `apps/web/src/lib/query-client.ts`, `apps/web/src/lib/data-provider.tsx`
- Modify: `apps/student/src/components/overview/student-error-view.tsx`
- Create: `apps/e2e/specs/account-role-separation.spec.ts`
- Modify: `docs/project-overview-pdr.md`, `docs/system-architecture.md`

## Implementation Steps

1. `role-block.ts` — cờ module-scoped `markRoleBlocked()` / `isRoleBlocked()` (single-flight giống `reauth`).
2. `repos/kernel.ts`: GET path parse body → `reason` (mirror precedent portal `body.error ?? body.reason`); cập nhật `kernel.transport.test.ts`.
3. `query-client.ts`: onError thêm nhánh 403 + `reason === ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP` → `markRoleBlocked()`; bus write-path gọi cùng exit nếu có error hook.
4. `data-provider.tsx`: `isRoleBlocked()` → render `AccountBlockedView`.
5. Tạo `AccountBlockedView` (nút Đăng xuất + về `/login`).
6. Portal: thêm nhánh `ACCOUNT_TEACHER_ROLE` vào `StudentErrorView`.
7. E2E Test A + Test B như Requirements.
8. Cập nhật 2 docs.
9. `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm build`; `pnpm --filter e2e e2e` xanh.

## Todo

- [x] `role-block.ts` + GET transport parse `reason` + transport test
- [x] Nhánh 403 trong `query-client.ts` (+ bus seam nếu có)
- [x] `AccountBlockedView` + render trong `data-provider`
- [x] Portal `StudentErrorView` nhánh `ACCOUNT_TEACHER_ROLE`
- [x] E2E Test A (login rejection) + Test B (stale session)
- [x] Docs PDR + system-architecture
- [x] Full check + e2e xanh

## Success Criteria

- Student-role login teacher app (UI) bị chặn tại form với message đúng; KHÔNG có session row.
- Student-role với session cũ (stale cookie) mở teacher app → blocked view; DB không sinh org/membership.
- Teacher-role mở portal → error view `ACCOUNT_TEACHER_ROLE` đúng; không sinh student row (server test Phase 3).
- Các 403 khác không bị nhận nhầm thành blocked view (transport test khẳng định `reason`).
- E2e suite cũ không regression.

## Risk Assessment

- **Cookie name/prefix khi addCookies**: boot shim prod-posture (không prefix); nếu thay đổi, đọc từ `set-cookie` response thay vì hard-code.
- **Toast portal không hiện error_description** (Google path không e2e được): chấp nhận như #257 (dummy Google creds); unit/roundtrip đã assert redirect URL.
- **403 role đến từ write-path mà chỉ cắm read-path**: bước 3 bắt buộc rà bus seam (`grep onAuthLost apps/web/src`).

## Security Considerations

- Blocked view không lộ email/role chi tiết hơn cần thiết; sign-out xóa cookie-zone chung (best-effort như StudentErrorView hiện có).
