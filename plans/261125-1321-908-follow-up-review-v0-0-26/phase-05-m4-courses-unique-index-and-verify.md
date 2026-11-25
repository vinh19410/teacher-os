---
phase: 5
title: "Phase 5: M4 — Course Catalog Unique Indexes, Migration 0091 & Full Verification"
status: completed
priority: P2
effort: 1.5h
dependencies: [1, 2, 3, 4]
---

# Phase 5: M4 — Course Catalog Unique Indexes, Migration 0091 & Full Verification

## Goal

Thêm expression unique index ở tầng DB cho `course_category` (`(org_id, lower(trim(name)))`) và `course` (`(org_id, category_id, lower(trim(name)))`) kèm migration `0091` khử trùng an toàn bằng `rowid` (2 lượt bảo hiểm, khớp chuỗi cắt ngắn), catch `isSqliteUniqueError` trả `409` ở cả 4 endpoint ghi trong `courses.ts` (và bỏ kiểm trùng thừa khi `PATCH /items/:id` chỉ đổi `isActive`), sau đó chạy đầy đủ bộ kiểm chứng cuối cùng (lint, typecheck, unit tests, `/readyz`, 7 spec E2E lẻ).

## Files to Create / Modify

- Modify: `packages/db/src/schema/course-catalog.ts`
- Create: `packages/db/src/migrations/0091_<generated_slug>.sql` + cập nhật `packages/db/src/migrations/meta/_journal.json` và `packages/db/src/migrations/meta/0091_snapshot.json`
- Modify: `apps/server/src/routes/courses.ts` (4 write handlers: `POST /categories`, `PATCH /categories/:id`, `POST /items`, `PATCH /items/:id`)
- Modify: `apps/server/src/routes/courses.test.ts` (thêm test DB unique index enforcement, 409 race mapping trên 4 write handler, toggling `isActive` không bị 409 giả, và migration rehearsal với dữ liệu trùng sẵn gồm ID `${orgId}:cat:*`, `"Name (2)"`, và 2 cặp tên dài sát 80/120 ký tự chung tiền tố)

## Tests Before (TDD Red Phase)

### Task 5.1 — Viết failing tests cho DB unique index, 409 catch và migration rehearsal trong `apps/server/src/routes/courses.test.ts`
<!-- Updated: Red Team Session 1 - add migration rehearsal stress case with ${orgId}:cat:* IDs, pre-existing "Name (2)", and two 80/120-char shared-prefix duplicate pairs; add PATCH /items/:id isActive-only test -->
- **Goal:** Chứng minh trước khi thêm unique index, DB vẫn cho chèn hai dòng trùng `(org_id, lower(trim(name)))` hoặc `(org_id, category_id, lower(trim(name)))` trực tiếp (race window) và route chưa map lỗi `UNIQUE` thành `409`.
- **Target files and symbols:** `apps/server/src/routes/courses.test.ts` (`describe("courses master data routes (/api/courses)")`).
- **Steps:**
  1. Thêm test `"DB unique index chặn chèn trùng tên không phân biệt hoa/thường ASCII cho course_category và course, cho phép trùng tên khác org/khác nhóm"`:
     - Insert trực tiếp `schema.courseCategory` với cùng `orgId` và `name: "  ielts  "` -> kỳ vọng bị SQLite reject (`isSqliteUniqueError(err) === true`).
     - Insert trực tiếp `schema.course` với cùng `(orgId, categoryId)` và `name: "  FOUNDATION "` -> kỳ vọng bị SQLite reject (`isSqliteUniqueError(err) === true`).
     - Insert trực tiếp `schema.course` cùng tên `"Foundation"` vào nhóm khác cùng org -> thành công.
  2. Thêm test `"cả 4 endpoint ghi trả 409 khi gặp lỗi SQLITE UNIQUE ở tầng DB (race condition sau pre-SELECT)"`: dùng proxy/wrapper `db` mô phỏng `db.insert`/`db.update` ném `SQLITE_CONSTRAINT_UNIQUE` trên `POST /categories`, `PATCH /categories/:id`, `POST /items`, `PATCH /items/:id` (khi pre-SELECT vừa qua) -> assert `409` với đúng `code` (`COURSE_CATEGORY_DUPLICATE` / `COURSE_DUPLICATE`).
  3. Thêm test `"PATCH /items/:id chỉ đổi isActive không kiểm trùng tên khi không đổi tên/chuyển nhóm"`: xác nhận cập nhật `isActive: false` thành công ngay cả khi có bản ghi legacy cùng `normalizeCourseNameKey` (ví dụ khác chữ hoa tiếng Việt / khoảng trắng kép ngoài phạm vi `lower()` của SQLite).
  4. Thêm test migration rehearsal `0091`: chạy migrations `0000..0090` trên SQLite in-memory, chèn sẵn dữ liệu trùng phức tạp:
     - `course_category`: ID dạng `${orgId}:cat:toeic` (`"TOEIC"`), `${orgId}:cat:toeic-2` (`"toeic"`), `"TOEIC (2)"`, cộng 2 cặp tên dài 80 ký tự có 76 ký tự đầu giống hệt nhau (mỗi tên 2 bản ghi trùng).
     - `course`: ID dạng `${orgId}:course:level-1` (`"Level 1"`), `${orgId}:course:level-1-dup` (`"level 1"`), `"Level 1 (2)"`, cộng 2 cặp tên dài 120 ký tự chung tiền tố 115 ký tự (kèm 1 `placement_test_submission` tham chiếu vào bản ghi `course` trùng để chứng minh không bị xóa/mất FK).
     - Chạy file SQL `0091` -> assert không lỗi, giữ nguyên toàn bộ số row & FK, mọi tên đều `<= 80` / `<= 120` ký tự và duy nhất theo `lower(trim(name))`, và 2 index `course_category_org_name_uq` + `course_org_category_name_uq` tồn tại trong `sqlite_master`.
- **Success criteria:** Test chạy và thất bại do chưa có unique index / migration `0091` / catch `isSqliteUniqueError` trong `courses.ts`.
- **Verify:** `pnpm --filter server exec vitest run src/routes/courses.test.ts` exits non-zero with assertion failure; passing test is a failure.

## Tasks & Steps

### Task 5.2 — Khai báo 2 expression unique index trong `packages/db/src/schema/course-catalog.ts` và sinh migration `0091`
<!-- Updated: Red Team Session 1 - replace substr(id, 1, 6) with SQLite rowid; compute truncated candidate inside CTE before EXISTS check; add second insurance UPDATE pass using (#rowid) so CREATE UNIQUE INDEX can never collide -->
- **Goal:** Khai báo 2 index chuẩn Drizzle để `/readyz` tự động kiểm chứng, và sinh migration `0091` khử trùng 2 lượt bằng `rowid` đảm bảo không bao giờ va chạm khi `CREATE UNIQUE INDEX`.
- **Target files and symbols:**
  - `packages/db/src/schema/course-catalog.ts` (`courseCategory`, `course`)
  - `packages/db/src/migrations/0091_*.sql`, `packages/db/src/migrations/meta/_journal.json`, `packages/db/src/migrations/meta/0091_snapshot.json`
- **Steps:**
  1. Trong `packages/db/src/schema/course-catalog.ts`:
     - Import `uniqueIndex` từ `drizzle-orm/sqlite-core`.
     - Thêm `uniqueIndex("course_category_org_name_uq").on(table.orgId, sql\`lower(trim(${table.name}))\`)` vào `courseCategory` kèm comment nêu rõ giới hạn ASCII-only của SQLite `lower()` (tầng ứng dụng vẫn giữ `normalizeCourseNameKey` cho Unicode tiếng Việt & gom khoảng trắng).
     - Thêm `uniqueIndex("course_org_category_name_uq").on(table.orgId, table.categoryId, sql\`lower(trim(${table.name}))\`)` vào `course`.
  2. Chạy `pnpm --filter @teacher-os/db db:generate` để sinh migration `0091_*.sql`, snapshot `meta/0091_snapshot.json`, và cập nhật `meta/_journal.json`.
  3. Kiểm tra kỹ file `0091_*.sql` (cảnh giác lỗi `drizzle-kit@0.31.10` như `0066_class_materials.sql`), viết chuẩn 2 lượt prelude khử trùng non-destructive bằng `rowid` cho từng bảng trước 2 lệnh `CREATE UNIQUE INDEX`:
     - **Lượt 1 (`course_category`, max 80 ký tự):** Trong CTE `ranked`, đánh `rn = ROW_NUMBER() OVER (PARTITION BY org_id, lower(trim(name)) ORDER BY sort_order ASC, created_at ASC, id ASC)`, tính sẵn `cand1 = rtrim(substr(trim(name), 1, 80 - length(' (' || rn || ')'))) || ' (' || rn || ')'` và `cand2 = rtrim(substr(trim(name), 1, 80 - length(' (#' || rowid || ')'))) || ' (#' || rowid || ')'`. Cập nhật bản ghi `rn > 1` thành `cand1` nếu `NOT EXISTS` bản ghi khác trong cùng `org_id` có cùng `lower(trim(name))` với `cand1`, ngược lại dùng `cand2`.
     - **Lượt 2 bảo hiểm (`course_category`):** Nếu 2 nhóm dài 80 ký tự bị cắt ngắn vô tình rơi vào cùng `cand1`, chạy thêm 1 lệnh `UPDATE` cho mọi bản ghi vẫn còn `rn > 1` sau Lượt 1 sang `rtrim(substr(trim(name), 1, 80 - length(' (#' || rowid || ')'))) || ' (#' || rowid || ')'` — vì `rowid` duy nhất tuyệt đối theo bảng SQLite, không thể phát sinh trùng!
     - **Lượt 1 & Lượt 2 tương tự cho `course` (max 120 ký tự, partition theo `(org_id, category_id, lower(trim(name)))`).**
     - Dùng `--> statement-breakpoint` giữa các câu lệnh.
     - Hai lệnh tạo index:
       ```sql
       CREATE UNIQUE INDEX IF NOT EXISTS `course_category_org_name_uq` ON `course_category` (`org_id`, lower(trim(`name`)));
       --> statement-breakpoint
       CREATE UNIQUE INDEX IF NOT EXISTS `course_org_category_name_uq` ON `course` (`org_id`, `category_id`, lower(trim(`name`)));
       ```
- **Success criteria:** Migration chạy sạch từ `0000` đến `0091` cả trên DB trống lẫn DB có dữ liệu trùng phức tạp, và `apps/server/src/readiness.test.ts` pass (`REQUIRED_OBJECTS` chứa 2 index mới, `/readyz` trả 200).
- **Verify:** `pnpm --filter @teacher-os/db test && pnpm --filter server exec vitest run src/readiness.test.ts` exits 0.

### Task 5.3 — Bọc `try/catch (isSqliteUniqueError)` trong 4 write handlers & guard `PATCH /items/:id` của `apps/server/src/routes/courses.ts`
<!-- Updated: Red Team Session 1 - skip duplicate name check in PATCH /items/:id when neither name nor categoryId changed (matches PATCH /categories/:id) -->
- **Goal:** Đảm bảo race condition đụng unique index ở DB luôn trả về `409` đúng contract (`COURSE_CATEGORY_DUPLICATE` / `COURSE_DUPLICATE`), không rơi ra `500`, và `PATCH /items/:id` chỉ kiểm trùng khi đổi tên hoặc chuyển nhóm.
- **Target files and symbols:** `apps/server/src/routes/courses.ts` (`POST /categories`, `PATCH /categories/:id`, `POST /items`, `PATCH /items/:id`), import `isSqliteUniqueError` từ `../lib/course-catalog`.
- **Steps:**
  1. Import `isSqliteUniqueError` từ `../lib/course-catalog`.
  2. Tách helper nhỏ nội bộ `categoryDuplicateResponse(c)` (`409 COURSE_CATEGORY_DUPLICATE`) và `courseDuplicateResponse(c)` (`409 COURSE_DUPLICATE`) để DRY cho cả pre-`SELECT` lẫn `catch`.
  3. Trong `PATCH /items/:id` (`courses.ts:603-618`), chỉ kiểm tra `duplicate` khi `body.data.name !== undefined || categoryChanged` (khớp logic `PATCH /categories/:id:232` để không khóa nút bật/tắt `isActive`).
  4. Bọc `try/catch` quanh:
     - `db.insert(courseCategory)...returning()` trong `POST /categories` -> `if (isSqliteUniqueError(err)) return categoryDuplicateResponse(c); throw err;`.
     - `db.update(courseCategory)...returning()` trong `PATCH /categories/:id` -> `if (isSqliteUniqueError(err)) return categoryDuplicateResponse(c); throw err;`.
     - `db.insert(course)...returning()` trong `POST /items` -> `if (isSqliteUniqueError(err)) return courseDuplicateResponse(c); throw err;`.
     - `db.update(course)...returning()` trong `PATCH /items/:id` -> `if (isSqliteUniqueError(err)) return courseDuplicateResponse(c); throw err;`.
- **Success criteria:** Toàn bộ test trong `apps/server/src/routes/courses.test.ts` (bao gồm DB unique index, 409 race mapping, `isActive`-only patch và migration rehearsal) pass.
- **Verify:** `pnpm --filter server exec vitest run src/routes/courses.test.ts src/readiness.test.ts` exits 0 with 0 failures.

### Task 5.4 — Gate kiểm chứng tổng hợp toàn bộ 5 hạng mục (không chạy full E2E local)
- **Goal:** Xác minh lint, typecheck, unit/integration tests toàn bộ các bề mặt bị chạm và 7 spec E2E lẻ liên quan đều xanh.
- **Target files and symbols:** Toàn bộ workspace thay đổi.
- **Steps:**
  1. Chạy `pnpm exec biome check .` (read-only lint/format) và `pnpm check-types`.
  2. Chạy các suite unit/integration tests liên quan: `@teacher-os/auth`, `@teacher-os/db`, `@teacher-os/api`, `lms`, `server` (`auth-role-roundtrip`, `role-gates`, `student-auth-provisioning`, `confirm-opening`, `courses`, `readiness`), `web` (`reauth`, `query-client`, `confirm-opening-modal`), `admin` (`query-client`), `student` (`wrong-role-redirect`, `student-org-recovery`).
  3. Chạy 7 spec E2E lẻ liên quan với port override theo `AGENTS.md`:
     `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/lms-unified-domain.spec.ts specs/signup-ui-smoke.spec.ts specs/web-email-verification.spec.ts specs/placement-lead-org-drift.spec.ts specs/admin-auth.spec.ts specs/account-role-separation.spec.ts specs/student-wrong-role-redirect.spec.ts`
- **Success criteria:** Tất cả các lệnh kiểm chứng đều thoát mã 0, 0 failed tests, 0 Biome errors, 0 TS errors.
- **Verify:** All commands above exit 0.

## Tests After & Regression Gate

- `pnpm exec biome check .` exits 0.
- `pnpm check-types` exits 0.
- `pnpm --filter @teacher-os/auth test && pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/api test && pnpm --filter lms test` exits 0.
- `pnpm --filter server exec vitest run src/auth-role-roundtrip.test.ts src/role-gates.test.ts src/routes/student-auth-provisioning.test.ts src/confirm-opening.test.ts src/routes/courses.test.ts src/readiness.test.ts` exits 0.
- `pnpm --filter web exec vitest run src/lib/reauth.test.ts src/lib/query-client.test.ts src/components/modals/confirm-opening-modal.test.tsx && pnpm --filter admin exec vitest run src/lib/query-client.test.ts && pnpm --filter student exec vitest run test/wrong-role-redirect.test.ts test/student-org-recovery.test.ts` exits 0.
- 7 targeted E2E specs pass with port override `8100..8105`.

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
