# Scout Report: Student menu (admin/teacher) — nguồn gốc học viên

*Nguồn: 2 Explore agents song song, 2026-09-23. Các claim load-bearing đã được planner spot-check trực tiếp (ghi chú "verified" ở cuối).*

> **ĐÍNH CHÍNH (post-red-team):** Mục 5/7 của report này SAỚT ở một điểm: scout báo "`apps/student` KHÔNG tồn tại" và plan #254 pending — thực tế **PR #255 (commit `0972f99`) đã merge** trước lúc scout chạy: `apps/student` tồn tại (auth components, sign-up form), `apps/server/src/routes/student.ts` (bridge `requireStudent` fail-closed) và `apps/server/src/student.test.ts` đều có trong tree, `SessionUser` đã có `email`/`emailVerified`, `STUDENT_ERROR_CODES` ở `contracts.ts:918-922`. Planner đã tự xác nhận bằng `git log` + đọc trực tiếp các file. Mọi kết luận trong plan dựa trên trạng thái ĐÃ-merge này.

## 1. Trang "Học viên" + modal tạo học viên hiện tại

- `apps/web/src/routes/_auth/students/index.tsx` — route `/students`; nút **"+ Thêm học viên"** (L62) mở `AddStudentModal` (L134); empty state L64-77 (`data-testid="students-empty-state"`, text "Bấm '+ Thêm học viên'..."); `PageHead` lead "N học viên đang học" (L57-59); bảng `DataTable` headers `["Học viên", "Lớp học", "Tags"]` (L86-131).
- `apps/web/src/components/modals/add-student-modal.tsx` — `ModalMode = "existing" | "create"` (L12). Create mode: Họ tên (L220), SĐT digits-only (L227-241), Email required + help text "Dùng làm tài khoản đăng nhập cho học viên sau này" (L242-256), Phụ huynh (L257-263). Submit dispatch `add-student` kèm `{name, phone, email, parentName, classId}` (L124-133). Mode-switch 2 nút "Học viên có sẵn"/"Tạo học viên mới" khi có `classId` (L156-176); default mode = `existing` khi mở từ lớp (L57); picker `eligibleStudents` lọc học viên chưa enroll (L43-49, L177-217).
- Trang chi tiết `apps/web/src/routes/_auth/students/$studentId.tsx`: KHÔNG có edit/delete student — chỉ CreateReportModal (L276) + nút nhắn/report (L114-126).
- Nav: `sidebar.tsx:41-42` ("Học viên"), `app-shell.tsx:13-14`, `topbar.tsx:53,185` (global search type "student").

## 2. Enroll UI

- `apps/web/src/routes/_auth/classes/$classId.tsx` — import `AddStudentModal` (L17), mount (L408), roster tab (L242, L260-328).
- Mutations: `apps/web/src/lib/data-actions.ts` — `add-student` (L74), `enroll-student` (L86).
- `apps/web/src/lib/repos/kernel.ts` — `add-student` → `POST /api/students` (L39-51); `enroll-student` → `POST /api/classes/:id/enroll` body `{studentId}` (L52-59; kết quả #251).
- Optimistic reducer: `apps/web/src/lib/data-store-reducer.ts` — case `add-student` (L86-126), case `enroll-student` (L127-160).

## 3. Server routes + contracts (verified trực tiếp)

- `apps/server/src/routes/kernel.ts`:
  - `GET /students` L505-510 (trả `snapshot.students`).
  - `POST /students` L512-597 — validate `studentCreateSchema`, insert student (zalo derive từ phone L545, `parentPhone: ""`), nếu `classId` → batch enrollment + session_package (D1 derive từ lớp) + `generateScheduleLessons`; không lớp → không gói (D2). Trả 201 `{id}`.
  - `POST /classes/:id/enroll` L601-676 — 404 sai org, 409 đã enroll, package derive từ lớp.
  - KHÔNG có PATCH/DELETE /students.
- `packages/api/src/contracts.ts` — `studentCreateSchema` L9-19 (name min1, phone regex digits, email `z.email()` bắt buộc, parentName default, classId optional); `enrollStudentSchema` L25-30; `KernelStudentRow` L629-638.

## 4. DB schema

- `packages/db/src/schema/student.ts` L9-30: id, orgId (FK cascade), name, phone default "", **email default "" + docblock L18-21** ("danh tính đăng nhập tương lai… Chưa unique + chưa có user row — dành cho plan student-login sau này"), zalo, parentName, parentPhone, createdAt. Chỉ index `student_org_idx`. **Không unique/index trên email.**
- Migration `0021_slow_rhodey.sql` thêm cột email + normalize phone. Latest migration = 0021.
- `organization` có `created_at` (timestamp_ms, default now); `membership` unique (orgId,userId) — verified.

## 5. Auth / signup pipeline

- `packages/auth/src/index.ts` — `CreateAuthInput` có `db: AuthDatabase` (L24-41, **verified**); `emailAndPassword.enabled` (L60-62); Google (L54-59); `trustedOrigins: [input.corsOrigin]` (L53); KHÔNG có emailVerification config, KHÔNG có databaseHooks (grep 0 hit).
- `apps/server/src/app.ts` L43-85 `bootstrapMiddleware` (verified): mọi user có session chưa có membership → tự tạo org (name = userName) + membership `teacher`; "earliest org wins" re-read L76-84. Áp dụng `/api/*` (L132), skip auth paths + unauthenticated.
- Signup UI web: `apps/web/src/routes/login.tsx` (default mode "signup"), `sign-up-form.tsx` L40-45 `authClient.signUp.email` → redirect `/dashboard`. Người lạ signup = teacher org rỗng. Không có gate approval.
- `apps/server/src/session.ts` L3-6: `SessionUser` chỉ `{userId, userName}` — chưa có email/emailVerified (thuộc #254).
- Bridge/STUDENT_NOT_LINKED/AMBIGUOUS: chỉ tồn tại trong `plans/`, chưa có trong code. `apps/student` KHÔNG tồn tại.

## 6. Tests phụ thuộc create-qua-UI

- `apps/e2e/specs/helpers.ts:24-43` `createStudentViaUi` — dùng trong **13 spec files** (grep verified): student-row-detail, student-package-without-class, student-package-validation, create-invoice, class-operations, class-assign, class-roster-tuition-debt, global-search, projected-sessions, schedule-session-modal, session-occurrence, enroll-existing-student + helpers.ts.
- E2E boot: `apps/e2e/src/boot.ts` — server in-process qua `pnpm run boot:api` (webServer của playwright.config), libsql file `apps/e2e/local.db` (`DB_PATH = new URL("../local.db", import.meta.url)`), wipe + migrate mỗi run, `createAuth({db: libsql, ...})` — **spec chạy process riêng nhưng chung file DB**.
- Unit tests chạm add-student: `apps/web/src/lib/add-student-enroll.contract.test.ts`, `data-store-reducer.test.ts`, `kernel-runtime.contract.test.ts`, `repos/kernel.test.ts`, `repos/kernel-command.test.ts`, `apps/server/src/kernel.test.ts` (helper DB-seed `addStudent`).
- Pattern tests tham khảo: `apps/server/src/student-identity-migration.test.ts` (migration với existing data), `apps/server/src/auth-roundtrip.test.ts` (auth + libsql).

## 7. Plans liên quan (đều pending, chưa implement)

- `plans/260923-0641-student-portal-app` (#254): apps/student, login, bridge `requireStudent` (resolve qua `student.email` lower/trim, gate emailVerified, fail-closed ambiguous), bootstrap skip `/api/student/*`, multi-origin CORS.
- `plans/260923-0550-enrollment-invite-accept-flow` (#253): enrollment `invited`→`active`, accept endpoint dùng chung nút Kích hoạt + portal. Code hiện tại: `enrollment` chưa có cột status (grep verified).

## 8. Docs

- `docs/project-overview-pdr.md:23` — durable decision "A student is created with a required email and a required digits-only phone..." → sai sau plan này, phải thay.
- `docs/index.md` không nhắc student; cần sweep `codebase-summary.md`, `system-architecture.md`.

## 9. Rủi ro scout đã flag

1. POST /students là nơi DUY NHẤT ghi student.email — bỏ mà chưa có portal đăng ký thì không còn đường tạo học viên nào (→ blockedBy #254 theo quyết định user).
2. Không unique trên student.email — cần index khi portal đăng ký trở thành nguồn.
3. 13 e2e specs phụ thuộc createStudentViaUi — cần seed DB.
4. Picker enroll-existing sẽ rỗng nếu hết nguồn học viên — empty state cần ý nghĩa mới.
5. Empty state /students hướng dẫn bấm nút đã bị xoá.

## Spot-check của planner (verified tay 2026-09-23)

`packages/auth/src/index.ts` (toàn file), `apps/server/src/app.ts:40-90`, `packages/db/src/schema/organization.ts`, `packages/db/src/schema/membership.ts`, `apps/e2e/src/boot.ts:1-60`, `apps/e2e/specs/helpers.ts:1-60`, `apps/e2e/playwright.config.ts` (webServer boot:api, workers:1), `packages/api/src/contracts.ts:1-30`, `apps/server/src/routes/kernel.ts:500-600`, `apps/web/src/routes/_auth/students/index.tsx:55-80`, `ls packages/auth/src` (không có databaseHooks trước đây), `ls apps/server/src` (auth-roundtrip + student-identity-migration tests tồn tại).
