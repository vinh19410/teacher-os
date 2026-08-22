# Research: App flows for the E2E "class operations" scenario

Worktree: `feat/59-e2e-class-operations` @ ea8301f. All paths relative to repo root.

## 1. AUTH / LOGIN

- better-auth client: `apps/web/src/lib/auth-client.ts:39-43` — `createAuthClient({ baseURL: new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL)) })`; fallback `http://localhost:8000` (line 37). Session cookie `better-auth.session_token` httpOnly.
- Login page `/login` (`apps/web/src/routes/login.tsx:14`). Default tab = **signup** (lines 27-34) unless localStorage `teacher-os-auth-tab` = "signin" → fresh Playwright context always lands on "Create account" (deterministic).
- Sign-up form (`apps/web/src/components/sign-up-form.tsx`): fixed input ids `su-name`, `su-email`, `su-password`; button "Create account" (spinning "Creating account…"); calls `authClient.signUp.email` (line 33). Password min 8 chars. **No email verification** → session immediate.
- Sign-in form: ids `si-email`, `si-password`; button "Sign in". Tabs: `role="tab"` ids `tab-signin`/`tab-signup` (`apps/web/src/components/auth/auth-tabs.tsx:41-74`).
- Google OAuth exists but email+password fully enabled: `packages/auth/src/index.ts` `emailAndPassword: { enabled: true }`.
- After success: `window.location.assign(validateReturnUrl(returnUrl))` → `/dashboard`.
- **Org bootstrap is automatic**: `bootstrapMiddleware` (`apps/server/src/app.ts:40-82`) creates organization + `teacher` membership on first authenticated request, idempotent. No UI step needed.
- Route guard: `apps/web/src/routes/_auth/route.tsx:7-21` — `beforeLoad` calls `authClient.getSession()`, redirects to `/login?returnUrl=...`.

## 2. CLASS CREATION

- Host route `/classes` (`apps/web/src/routes/_auth/classes/index.tsx`). Open modal button **"+ Tạo lớp"** (line 42). Class row click → `/classes/$classId`.
- Modal `AddClassModal` (`apps/web/src/components/modals/add-class-modal.tsx:141-275`), title "Tạo lớp mới". Fields (label → control):
  - "Tên lớp *" — Input, placeholder "VD: IELTS Writing 7.0 — Nhóm tối", required
  - "Loại lớp" — ChipMulti: "IELTS" / "Giao tiếp" (`CLASS_TYPE_LABELS`, `apps/web/src/lib/mock-data.ts:159-162`)
  - "Trình độ" — Select: Band 5.5/6.0/6.5/7.0(default)/7.5+
  - "Hình thức" — Select: Online(default)/Offline
  - "Kỹ năng *" — ChipMulti, only when type=ielts: Writing/Speaking/Reading/Listening — required ≥1 for IELTS
  - "Syllabus" — Select "— Chưa gán —" (default)
  - "Ngày học *" — ChipMulti chips "T2","T3","T4","T5","T6","T7","CN" (dayNames, mock-data.ts:156), ≥1 required
  - "Giờ bắt đầu" input[type=time] default 19:00; "Giờ kết thúc" default 20:30 (auto = start+90min)
  - "Tổng số buổi" input[type=number] default 12, max 52
  - "Ngày bắt đầu" input[type=date] default & min = tomorrow (machine-local)
- Buttons "Hủy" / **"Tạo lớp"** (line 268). Validation errors in `<p role="alert">` (246-249): "Vui lòng nhập tên lớp.", "Chọn ít nhất một kỹ năng.", "Chọn ít nhất một ngày học.", "Giờ kết thúc phải khác giờ bắt đầu."
- Zod `classCreateSchema` (`packages/api/src/contracts.ts:33-83`): `schedule: { days: number 0-6 (0=Monday) unique ≥1, start/end regex HH:MM, start ≠ end }`; ielts needs ≥1 skill; `sessionsTotal` 0–52 default 12. Server stores schedule as JSON string (`apps/server/src/routes/kernel.ts:347-350`).
- API `POST /api/classes` (kernel.ts:324-358) → `{id}` 201.

## 3. SESSION GENERATION — CRITICAL FACT

**Lessons are NOT generated at class creation.** They are generated when a student is added to the class: `POST /api/students` with `classId` (kernel.ts:242-309) — one batch: student + enrollment + sessionPackage + `sessionsTotal` lesson rows via `generateScheduleLessons` (kernel.ts:81-104): `day = days[i % days.length] + 1` (1=Monday), `time = start`, `dur = end−start`, `type "1:1"`, `status "upcoming"`, `topic ""`.

⇒ E2E MUST include: class detail → **"+ Thêm học viên"** button (`apps/web/src/routes/_auth/classes/$classId.tsx:101-103`) → `AddStudentModal` **with classId** (lines 257-262). The modal from `/students` page has no classId → no lessons.

- `AddStudentModal` (`apps/web/src/components/modals/add-student-modal.tsx`), title "Thêm học viên mới": "Họ tên học viên *" (required, placeholder "Nguyễn Văn A"), "SĐT / Zalo" (optional), "Phụ huynh (nếu có)", "Số buổi gói" (default 10), "Đơn giá (VND)" (default 400000), "Hình thức". Buttons "Hủy" / **"Lưu"**.

Where sessions appear:
1. **`/schedule` ("Lịch dạy")** — `apps/web/src/routes/_auth/schedule.tsx:28-86`: 7-column week grid by dayNames; each lesson is `<button class="lesson-block">` containing time, student name, "1:1 · {topic}". Completed → `opacity-60` + name line-through (54-75). Click → LessonModal. Empty column shows "—".
2. **`/classes/$classId` tab "Lịch học"** — `$classId.tsx:184-218`: DataTable headers ["Ngày","Giờ","Học viên","Chủ đề","Trạng thái"], badges "Sắp tới" / "Đã học" / "Đã hủy". Tab labels: "Học viên" / "Giáo trình" / "Lịch học" / "Ghi chú" (120-129).
3. `/dashboard` "Lịch hôm nay" — only when lesson.day matches today's weekday → NOT reliable for E2E.

**No `data-testid` anywhere in the flow** — use getByLabel/role/text. `Field` connects label↔input via htmlFor+useId → `getByLabel("Tên lớp *")` works (`apps/web/src/components/ui/field.tsx:17-51`).

## 4. CHECK-IN

- Primary UI: LessonModal on `/schedule` (`apps/web/src/components/schedule/lesson-modal.tsx`): click lesson-block → modal title `"{student} — 1:1"`, shows Thời gian/Chủ đề/Trạng thái. Upcoming lesson has "Hủy buổi" and **"Điểm danh"** buttons (68-92). Click → action → **modal closes immediately** → toast "Đã điểm danh." (line 87; Toaster in `__root.tsx:41`).
- Dashboard check-in depends on today's weekday → avoid.
- API `POST /api/lessons/{id}/check-in`, body exactly `{}` (`lessonActionSchema` strict, contracts.ts:154) → `upcoming → completed` (kernel.ts:413-457); 409 if not upcoming; 404 wrong org/id. Client: `apps/web/src/lib/repos/kernel.ts:80-83`.
- **CSRF**: middleware on `/api/*` (kernel.ts:112-123): every POST requires `Origin === CORS_ORIGIN` + `Content-Type: application/json`. Real browser satisfies it, but web MUST run at exactly `http://localhost:8001` (using `127.0.0.1:8001` → 403 on every POST).

## 5. DATA PERSISTENCE (hard reload)

- Writes go through serialized command bus (`apps/web/src/lib/repos/kernel.ts:333-414`): POST success → refetch query key `["kernel"]` → modal closes only after refresh applied.
- QueryClient: `staleTime: Infinity`, `retry: false`, no refetch on focus (`apps/web/src/lib/query-client.ts:13-39`). Single data source `GET /api/kernel` (`data-provider.tsx:60-75`); load gate renders `null` while pending (152-154).
- ⇒ `page.reload()` = fresh document, empty cache, `GET /api/kernel` refetch; httpOnly session cookie survives → still authed. **Reload assertion is meaningful**: passes only if `lesson.status='completed'` was actually persisted server-side.

## 6. DEV TOPOLOGY & SERVER BOOT

- Standard: `pnpm dev` → `packages/infra` `alchemy dev`: server worker (workerd, `nodejs_compat`) port 8000 strictPort, web vite port 8001 strictPort (`apps/web/vite.config.ts:6-9`).
- Web→server: `VITE_SERVER_URL` (`packages/env/src/web.ts`) used in auth-client + data-provider.
- Server CORS: `apps/server/src/app.ts:88-96` `cors({ origin: corsOrigin, credentials: true })`; dev default `CORS_ORIGIN=http://localhost:8001`.
- Server env needs (bindings): `DB` (D1), `CORS_ORIGIN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `COOKIE_DOMAIN` ("" dev), `GOOGLE_CLIENT_ID/SECRET`. Cookies `SameSite=None; Secure` (`packages/auth/src/index.ts:30-35`) — OK on `http://localhost` with Chromium (trustworthy origin).
- **Node boot (E2E path)**: `packages/env/src/server.ts` re-exports `env` from `cloudflare:workers` → any module importing `@teacher-os/env/server` fails to load under plain node. `createDb()` (`packages/db/src/index.ts`) uses `drizzle(env.DB)` (d1 driver) → workerd-bound. BUT `buildApp(deps)` (`apps/server/src/app.ts:84-106`) is fully dependency-injected: `getDb()`, `corsOrigin`, `getSessionUser(headers)`, `authHandler(req)`.
- Existing in-process pattern: `apps/server/src/readiness.test.ts:22-52` + `kernel.test.ts:46-96` — `createClient({ url: "file::memory:" })` (@libsql/client, already devDep 0.17.4) + `drizzle-orm/libsql` + `migrate(libsql, { migrationsFolder: packages/db/src/migrations })` + cast `as unknown as Db`. These tests stub authHandler; real better-auth has never run under node yet.
- Auth tables exist since migration 0000 (`account`, `session`, `user`, `verification` in `packages/db/src/migrations/0000_mushy_amazoness.sql`).
- Blockers for real auth under node (E2E must fix):
  1. `createAuth()` (`packages/auth/src/index.ts:8`) takes no args: internally `createDb()` + top-level `import { env } from "@teacher-os/env/server"` → module unloadable under node.
  2. `getSessionUser` (`apps/server/src/session.ts:12-21`) constructs `createAuth()` per request.
  3. Composition root `apps/server/src/index.ts:11-16` passes `createAuth().handler` and `getSessionUser`.

## 7. EXISTING TEST UTILS

- `apps/web/test/fixtures/mock-data.ts` — static seed for unit tests only; no render helpers, no msw, no jsdom (`vitest.config.ts`: `environment: "node"`).
- `apps/server` vitest `include: src/**/*.test.ts`. `kernel.test.ts` is the best API-level harness (libsql in-memory + migrate + `app.request()` + cookie header + explicit `origin` header).
- No Playwright/e2e deps anywhere (verified via grep of all package.json + lock).

## 8. FRAGILE / FAKE UI REMAINING

- `classes/index.tsx:39` — `PageHead lead="3 lớp đang hoạt động"` hardcoded → don't assert on it.
- `sidebar.tsx:262-268` — "PRO" badge + "Google" label fixed (decorative).
- `topbar.tsx:82` search placeholder mentions hóa đơn but only searches students.
- Dashboard greeting "Chào buổi sáng, {name}" fixed "sáng"; lead shows weekday + date (vi-VN locale) → not a stable assertion.
- LessonModal **closes immediately on "Điểm danh"** — success only visible via toast (auto-hides) or post-refresh DOM. **Assert post-refresh DOM state instead of toast.**
- Kernel load gate renders `null` while loading (`data-provider.tsx:152-154`) → every step must `await` content.
- Strict Origin check + strictPort 8000/8001: the E2E stack must use exactly this origin pair; parallel stacks would need per-instance CORS_ORIGIN override.

## FEASIBLE E2E SCENARIO (evidence-based)

1. Fresh context → `/login` → signup tab default → fill `#su-name`, `#su-email`, `#su-password` → "Create account" → wait for `/dashboard` (sidebar "Lớp học" visible = org bootstrapped via `GET /api/kernel`).
2. Nav "Lớp học" (`/classes`) → "+ Tạo lớp" → fill "Tên lớp *", chip "Writing", chips "T2" "T4", keep defaults → "Tạo lớp" → modal closes, new class row visible (assert by class name + "0/12 buổi").
3. Click row → `/classes/{id}` → "+ Thêm học viên" → fill "Họ tên học viên *" → "Lưu" → StatCard "0/12" buổi đã học, student visible in tab "Học viên".
4. Tab "Lịch học" → assert 12 rows "Sắp tới" (Ngày alternating T2/T4).
5. Nav "Lịch dạy" (`/schedule`) → click lesson-block (time 19:00, student name) → modal → "Điểm danh" → modal closes.
6. `page.reload()` on `/schedule` → that lesson-block dimmed + line-through (or `/classes/{id}` → "Lịch học" → badge "Đã học") → **persisted via server**.
