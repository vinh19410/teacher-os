---
phase: 2
title: "Phase 2: Assignment Target Scope, Activation Backfill, Migration & Supplemental Sync (TDD)"
status: pending
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Assignment Target Scope, Activation Backfill, Migration & Supplemental Sync (TDD)

## Goal
Giải quyết tận gốc nguyên nhân mẫu số tỉ lệ nộp `0/1` thay vì `0/2` bằng cách lưu `target_scope` (`"class" | "selected"`) trên `class_assignment`, tách 2 migration `0095` (DDL) + `0096` (DML bảo thủ idempotent kèm snapshot chain đầy đủ), tự động bù target bài thường còn hạn khi kích hoạt thật học viên (`activateEnrollment(..., now)`), đóng kín cửa sổ TOCTOU ở `POST /classes/:id/assignments`, thêm endpoint `POST /classes/:id/assignments/:assignmentId/targets` (có `409 CLASS_PAUSED`, RBAC `canPublishGrade`, atomic `db.batch` `.returning()`), và cập nhật UI `AssignClassPromptModal` + `ClassAssignmentsTab`.

## Files to Create / Modify
<!-- Updated: Validation Session 1 - Tách 0095 DDL + 0096 DML + meta/0095_snapshot.json + meta/0096_snapshot.json + student.ts + class-assignments.test.ts (Red-Team F1, F2, F9, F10) -->
- Modify: `packages/db/src/schema/class-assignment.ts`
- Create: `packages/db/src/migrations/0095_class_assignment_target_scope.sql`
- Create: `packages/db/src/migrations/0096_backfill_class_assignment_targets.sql`
- Create: `packages/db/src/migrations/meta/0095_snapshot.json`
- Create: `packages/db/src/migrations/meta/0096_snapshot.json`
- Modify: `packages/db/src/migrations/meta/_journal.json`
- Create: `apps/server/src/class-assignment-target-scope-migration.test.ts`
- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/routes/enrollment-activation.ts`
- Modify: `apps/server/src/routes/kernel.ts`
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/routes/snapshot.ts`
- Create: `apps/server/src/routes/class-assignment-targets.test.ts`
- Modify: `apps/web/src/lib/mock-data.ts`
- Modify: `apps/web/src/lib/repos/class-assignments.ts`
- Modify: `apps/web/src/lib/repos/class-assignments.test.ts`
- Modify: `apps/web/src/lib/data-actions.ts`
- Modify: `apps/web/src/lib/data-store-reducer.ts`
- Modify: `apps/web/src/lib/repos/kernel.ts`
- Modify: `apps/web/src/lib/repos/kernel-command.test.ts`
- Modify: `apps/web/src/components/classes/assign-class-prompt-modal.tsx`
- Modify: `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx`
- Modify: `apps/web/src/components/classes/class-assignments-tab.tsx`
- Modify: `apps/web/src/components/classes/class-assignments-tab.test.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx`

## Tasks & Steps

### Task 2.1 — TDD Red + Green: DB schema `target_scope`, migration `0095` (DDL) + `0096` (DML idempotent) & snapshot chain
<!-- Updated: Validation Session 1 - Áp dụng Red-Team F1, F2, F3 (tách DDL+DML, snapshots 0095/0096 với prevId & when đơn điệu tăng, UPDATE selected cho bài chọn lọc cũ, sp.created_at <= deadlineMs, join class active, lọc demo-student:%) -->
- **Goal:** Thêm cột `target_scope` (`DEFAULT 'class' NOT NULL`) vào bảng `class_assignment` bằng migration DDL riêng `0095`, tạo migration DML idempotent riêng `0096` hạ `'selected'` cho bài chọn lọc lịch sử và bù bảo thủ `class_assignment_target`, kèm đầy đủ `meta/0095_snapshot.json` và `meta/0096_snapshot.json` để pass `study-pack-migration.test.ts:283-302`.
- **Target files and symbols:**
  - `packages/db/src/schema/class-assignment.ts` (`classAssignment.targetScope`)
  - `packages/db/src/migrations/0095_class_assignment_target_scope.sql`
  - `packages/db/src/migrations/0096_backfill_class_assignment_targets.sql`
  - `packages/db/src/migrations/meta/0095_snapshot.json`
  - `packages/db/src/migrations/meta/0096_snapshot.json`
  - `packages/db/src/migrations/meta/_journal.json` (entries `idx: 95` & `idx: 96`, `when` đơn điệu tăng `> 1795650000000`)
  - `apps/server/src/class-assignment-target-scope-migration.test.ts`
- **Steps:**
  1. Tạo `apps/server/src/class-assignment-target-scope-migration.test.ts` (theo mẫu `assignment-prompt-groups-backfill-migration.test.ts`: chạy migration tới `0094_*`, seed dữ liệu kiểm chứng, chạy `0095_*`, chạy `0096_*` lần 1, rồi chạy lại `0096_*` lần 2 kiểm idempotency, đồng thời kiểm `when` tăng dần và chuỗi `prevId`):
     - Case 1 (late-enrolled before deadline): lớp `active` có 1 HV active khi giao bài, HV thứ 2 ghi danh active sau `ca.created_at` và trước `due_at` → `0096` bù target cho HV thứ 2 (`target_scope` giữ `'class'`, tổng 2 target).
     - Case 2 (invited-then-activated after assignment, BEFORE deadline): HV thứ 2 có `enrollment.created_at < ca.created_at` (mời trước) và `session_package.created_at >= ca.created_at` VÀ `session_package.created_at <= deadlineMs` → `0096` bù target cho HV thứ 2.
     - Case 2b (invited before deadline, activated AFTER deadline): HV có `enrollment.created_at < ca.created_at` nhưng `session_package.created_at > deadlineMs` → `0096` KHÔNG tự bù (tránh gắn cờ quá hạn oan).
     - Case 3 (legacy `due_at IS NULL` dùng `due` yyyy-mm-dd cuối ngày giờ VN `16:59:59.999 UTC`): kiểm tra ranh giới `<= 23:59:59.999+07:00` được bù, quá hạn không bị bù.
     - Case 4 (post-deadline joiner): HV ghi danh sau hạn (`enrollment.created_at > deadlineMs`) → KHÔNG tự bù.
     - Case 5 (intentional historical partial assignment): HV thứ 2 đã có `enrollment.created_at < ca.created_at` và `session_package.created_at < ca.created_at` (hoặc không có `session_package` mới hơn `ca.created_at`) khi bài được giao chỉ cho HV1 → Statement 1 của `0096` hạ `ca.target_scope = 'selected'`, KHÔNG bù cho HV2 và KHÔNG bù cho HV3 ghi danh sau `ca.created_at`.
     - Case 6 (guards): KHÔNG bù cho enrollment `invited`, KHÔNG bù cho lớp `paused`, KHÔNG bù cho `demo-student:%`, KHÔNG bù cho `class_study_pack_id IS NOT NULL`, KHÔNG rò rỉ chéo org (INF-03), giữ nguyên `submitted_at` của target cũ và idempotent khi chạy lại `0096` lần 2.
  2. Chạy test xác nhận **Red** (file migration 0095/0096 chưa tồn tại).
  3. Thêm cột `targetScope: text("target_scope").notNull().default("class")` vào `classAssignment` trong `packages/db/src/schema/class-assignment.ts`.
  4. Tạo `packages/db/src/migrations/0095_class_assignment_target_scope.sql` (thuần DDL):
     `ALTER TABLE \`class_assignment\` ADD \`target_scope\` text DEFAULT 'class' NOT NULL;`
     và `packages/db/src/migrations/meta/0095_snapshot.json` (sao từ `0094_snapshot.json`, gán UUID `id` mới, `prevId: "bdae74aa-9173-46df-961c-a0cdfb6b4d68"`, bổ sung cột `target_scope` vào `tables.class_assignment.columns`).
  5. Tạo `packages/db/src/migrations/0096_backfill_class_assignment_targets.sql` (thuần DML idempotent):
     - Statement 1: `UPDATE \`class_assignment\` SET \`target_scope\` = 'selected' WHERE \`class_study_pack_id\` IS NULL AND \`target_scope\` = 'class' AND EXISTS (SELECT 1 FROM \`enrollment\` e INNER JOIN \`student\` s ON s.\`id\` = e.\`student_id\` AND s.\`org_id\` = \`class_assignment\`.\`org_id\` WHERE e.\`org_id\` = \`class_assignment\`.\`org_id\` AND e.\`class_id\` = \`class_assignment\`.\`class_id\` AND e.\`status\` = 'active' AND s.\`id\` NOT LIKE 'demo-student:%' AND e.\`created_at\` < \`class_assignment\`.\`created_at\` AND NOT EXISTS (SELECT 1 FROM \`session_package\` sp WHERE sp.\`enrollment_id\` = e.\`id\` AND sp.\`org_id\` = \`class_assignment\`.\`org_id\` AND sp.\`created_at\` >= \`class_assignment\`.\`created_at\`) AND NOT EXISTS (SELECT 1 FROM \`class_assignment_target\` t WHERE t.\`org_id\` = \`class_assignment\`.\`org_id\` AND t.\`assignment_id\` = \`class_assignment\`.\`id\` AND t.\`student_id\` = e.\`student_id\`));`
     - `--> statement-breakpoint`
     - Statement 2: `INSERT OR IGNORE INTO \`class_assignment_target\` (\`id\`, \`org_id\`, \`assignment_id\`, \`student_id\`, \`submitted_at\`)` chọn từ `class_assignment ca` `INNER JOIN class c ON c.id = ca.class_id AND c.org_id = ca.org_id AND c.status = 'active'` `INNER JOIN enrollment e ON e.org_id = ca.org_id AND e.class_id = ca.class_id AND e.status = 'active'` `INNER JOIN student s ON s.id = e.student_id AND s.org_id = ca.org_id AND s.id NOT LIKE 'demo-student:%'` với `ca.class_study_pack_id IS NULL AND ca.target_scope = 'class'`, `deadlineMs IS NOT NULL`, và `((e.created_at >= ca.created_at AND e.created_at <= deadlineMs) OR EXISTS (SELECT 1 FROM session_package sp WHERE sp.enrollment_id = e.id AND sp.org_id = ca.org_id AND sp.created_at >= ca.created_at AND sp.created_at <= deadlineMs))`, `id = 'cat_bf_' || ca.id || '_' || e.student_id`, `submitted_at = NULL`.
     - Tạo `packages/db/src/migrations/meta/0096_snapshot.json` (UUID `id` mới, `prevId` trỏ `0095_snapshot.json.id`, cấu trúc schema giữ nguyên từ `0095_snapshot.json`).
  6. Đăng ký entry `idx: 95` (`when: 1795660000000`) và `idx: 96` (`when: 1795660001000`) vào `packages/db/src/migrations/meta/_journal.json`.
  7. Chạy test xác nhận **Green** cùng `src/study-pack-migration.test.ts`.
- **Success criteria:** Migration 0095 + 0096 chạy sạch qua Drizzle `migrate(...)`, pass cả 7 kịch bản, idempotent trên `0096`, và `study-pack-migration.test.ts` pass 100%.
- **Verify:**
  - Red phase: `pnpm --filter server exec vitest run src/class-assignment-target-scope-migration.test.ts` exits non-zero.
  - Green phase: `pnpm --filter server exec vitest run src/class-assignment-target-scope-migration.test.ts src/study-pack-migration.test.ts` exits 0.

### Task 2.2 — TDD Red + Green: API contracts, `backfillClassAssignmentTargetsForStudent` trên `activateEnrollment`, khóa TOCTOU và endpoint bổ sung target
<!-- Updated: Validation Session 1 - Áp dụng Red-Team F3, F4, F5, F6, F7, F9 (bỏ backfill khỏi nhánh replay active, join classTable active + error boundary, truyền deps.now vào activateEnrollment từ 4 caller, không tin mù targetScope="class" + SQL TOCTOU guard, thêm 409 CLASS_PAUSED + RBAC canPublishGrade + atomic db.batch .returning()) -->
- **Goal:** Lưu/trả `targetScope` an toàn (không tin mù client, đóng TOCTOU), tự động bù target cho học viên mới kích hoạt thật (`'invited' -> 'active'`) trên các bài thường còn hạn (`target_scope = 'class'`, lớp `active`, dùng đồng hồ DI `now`), và mở endpoint `POST /api/classes/:id/assignments/:assignmentId/targets` có đầy đủ guard `409 CLASS_PAUSED`, RBAC `canPublishGrade`, atomic `db.batch` `.returning()` và thông báo idempotent.
- **Target files and symbols:**
  - `packages/api/src/contracts.ts` (`CLASS_ASSIGNMENT_TARGET_SCOPES`, `ClassAssignmentTargetScope`, `classAssignmentCreateSchema`, `classAssignmentAddTargetsSchema`, `KernelClassAssignmentRow`)
  - `apps/server/src/routes/enrollment-activation.ts` (`backfillClassAssignmentTargetsForStudent`, `activateEnrollment`)
  - `apps/server/src/routes/kernel.ts` (`POST /classes/:id/assignments`, `POST /classes/:id/assignments/:assignmentId/targets`, callers `activateEnrollment` lines 754, 1762, 1825)
  - `apps/server/src/routes/student.ts` (caller `activateEnrollment` line 1724 truyền `getNow()`)
  - `apps/server/src/routes/snapshot.ts` (`loadSnapshot` → `classAssignments[].targetScope`)
  - `apps/server/src/routes/class-assignment-targets.test.ts`
- **Steps:**
  1. Tạo `apps/server/src/routes/class-assignment-targets.test.ts` kiểm chứng:
     - `POST /api/classes/:id/assignments`:
       - Lưu `targetScope = "class"` khi chọn đủ toàn bộ active roster; lưu `"selected"` khi chỉ chọn 1 phần hoặc gửi rõ `"selected"`.
       - Khi client gửi `targetScope: "class"` nhưng `roster` vừa tăng thêm 1 học viên active mới (≤ 100 HV), server mở rộng chèn target cho đủ `roster` (đóng stale modal snapshot race); nếu client gửi `targetScope: "class"` mà `studentIds` cố tình thiếu HV khi `roster.size > 100`, hạ `"selected"`.
       - Trả `targetScope` trong `GET /api/kernel`.
     - `activateEnrollment` (kiểm với `buildApp({ now: () => fixedDate })` qua `POST /api/students`, `POST /api/classes/:id/enroll` `activateNow: true`, `POST /api/enrollments/:id/accept`, và `POST /api/student/enrollments/:id/accept`):
       - Kích hoạt thật `'invited' -> 'active'` trên lớp `active`: bài thường `targetScope = "class"` còn hạn (`dueAt > now` hoặc `dueAt == null && due >= todayVN`) → tự tạo target cho học viên thứ 2 (`0/2`), học viên thứ 2 mở `GET /api/student/assignments/:id/quiz` nhận `200`.
       - Bài `targetScope = "selected"` → KHÔNG tự bù.
       - Bài `targetScope = "class"` đã quá hạn (`dueAt <= now` hoặc `dueAt == null && due < todayVN`, kiểm theo đồng hồ DI `deps.now`) → KHÔNG tự bù.
       - Replay `POST /api/student/enrollments/:id/accept` trên enrollment ĐÃ `active` → KHÔNG tự chèn thêm target (chặn authorization bypass & không ghi lên lớp `paused`).
       - Bài Study Pack (`classStudyPackId IS NOT NULL`) → không bị đụng bởi hàm mới.
     - `POST /api/classes/:id/assignments/:assignmentId/targets`:
       - Thêm học viên `active` còn thiếu vào bài thường (kể cả bài đã quá hạn như GrammarI) → `200 { id, added: N }`, tạo `class_assignment_target` mới, phát `assignment_published` chỉ cho học viên thực sự vừa được chèn (`.returning()`), và tự cập nhật `targetScope = "class"` trong cùng `db.batch` khi phủ đủ active roster.
       - Idempotent nếu học viên đã có target (`added: 0`, giữ nguyên `submittedAt`, không bắn thêm notification).
       - Từ chối `409 CLASS_PAUSED` khi lớp đang `paused`; `403` cho role `ta`; `400` khi danh sách rỗng/trùng/vượt 100/chứa học viên không `active` trong lớp; `404` khi khác org, sai `classId`, hoặc là bài Study Pack (`classStudyPackId IS NOT NULL`); `401` khi chưa đăng nhập; `403/415` theo CSRF guard của `kernel`.
  2. Chạy test xác nhận **Red**.
  3. Cập nhật `packages/api/src/contracts.ts`:
     - Export `CLASS_ASSIGNMENT_TARGET_SCOPES = ["class", "selected"] as const`, `type ClassAssignmentTargetScope`.
     - Thêm `targetScope: z.enum(CLASS_ASSIGNMENT_TARGET_SCOPES).optional()` vào `classAssignmentCreateSchema`.
     - Export `classAssignmentAddTargetsSchema = z.object({ studentIds: z.array(z.string().trim().min(1)).min(1).max(100) }).strict()`.
     - Thêm `targetScope?: ClassAssignmentTargetScope` vào `KernelClassAssignmentRow`.
  4. Cập nhật `apps/server/src/routes/enrollment-activation.ts` & `apps/server/src/routes/student.ts`:
     - Viết `export async function backfillClassAssignmentTargetsForStudent(db, orgId, classId, studentId, now = new Date()): Promise<number>`:
       - Truy vấn `classAssignment` `INNER JOIN classTable ON eq(classTable.id, classAssignment.classId) AND eq(classTable.orgId, orgId) AND eq(classTable.status, "active")` với `eq(classAssignment.orgId, orgId)`, `eq(classAssignment.classId, classId)`, `isNull(classAssignment.classStudyPackId)`, `eq(classAssignment.targetScope, "class")`, và điều kiện chưa quá hạn: `or(and(isNotNull(classAssignment.dueAt), gt(classAssignment.dueAt, now)), and(isNull(classAssignment.dueAt), gte(classAssignment.due, vietnamTodayISO(now))))`.
       - Chèn `classAssignmentTarget` theo chunk ≤ 15 row/insert và ≤ 50 statement/batch (`D1_TARGET_INSERT_CHUNK = 15`, `D1_BATCH_STATEMENT_LIMIT = 50`) với `id: \`cat_ca_${a.id}_${studentId}\``, `submittedAt: null`, `.onConflictDoNothing()`.
     - Thêm tham số `now: Date = new Date()` vào `activateEnrollment(db, orgId, enrollmentId, now = new Date())`, truyền `now` vào `backfillStudyPackTargetsForStudent` và `backfillClassAssignmentTargetsForStudent`.
     - **KHÔNG** gọi `backfillClassAssignmentTargetsForStudent` tại nhánh early-return `existingEnrollment.status === "active"` (line 728); chỉ gọi tại nhánh kích hoạt thật line 852 (bọc try/catch log cảnh báo để lỗi thoáng qua không biến kích hoạt đã commit thành 500) và nhánh race winner line 817 chỉ khi `clsAfter[0].status === "active"`.
     - Truyền `deps.now ? deps.now() : new Date()` tại `kernel.ts:754, 1762, 1825` và `getNow()` tại `student.ts:1724`.
  5. Cập nhật `apps/server/src/routes/kernel.ts` và `apps/server/src/routes/snapshot.ts`:
     - Trong `POST /classes/:id/assignments`:
       - Nếu `input.targetScope === "selected"` → `resolvedTargetScope = "selected"`, `effectiveStudentIds = input.studentIds`.
       - Nếu `input.targetScope === "class"` → nếu `roster.size <= 100` thì mở rộng `effectiveStudentIds = [...roster]` và `resolvedTargetScope = "class"`; ngược lại `resolvedTargetScope = "selected"`, `effectiveStudentIds = input.studentIds`.
       - Nếu `input.targetScope === undefined` → `effectiveStudentIds = input.studentIds`, `resolvedTargetScope = input.studentIds.length === roster.size ? "class" : "selected"`.
       - Khi `resolvedTargetScope === "class"`, thêm 1 câu cuối trong `db.batch`: `INSERT OR IGNORE INTO class_assignment_target (id, org_id, assignment_id, student_id, submitted_at) SELECT 'cat_ca_' || ... FROM enrollment e WHERE e.org_id = ? AND e.class_id = ? AND e.status = 'active'` (đóng kín cửa sổ TOCTOU với `activateEnrollment` chạy song song; dùng chunk ≤ 15 cho `effectiveStudentIds` hoặc insert từng row khi ≤ 50, bảo đảm không vượt D1 limits).
     - Thêm route `POST /classes/:id/assignments/:assignmentId/targets`:
       - Kiểm `ctx` (`401`), kiểm RBAC `if (ctx.role !== undefined && !canPublishGrade(ctx.role)) return c.json({ error: "forbidden" }, 403)`, đọc body `classAssignmentAddTargetsSchema` (`400`/`415`).
       - Kiểm `cls = await findClass(db, classId, ctx.orgId)` (`404`), `if (cls.status !== "active") return classPausedResponse(c)` (`409`).
       - Kiểm `ca` thuộc `(assignmentId, classId, orgId)` và `isNull(classAssignment.classStudyPackId)` (`404`).
       - Kiểm không trùng `input.studentIds` (`400`) và tải toàn bộ active `enrollment` của lớp `(orgId, classId, status='active')` (không dùng `inArray(studentIds)` để tránh chạm 100 bind D1), kiểm mọi `studentId` nằm trong `roster` (`400`).
       - Gộp thành 1 `db.batch` nguyên tử: (a) các chunk `INSERT INTO class_assignment_target ... ON CONFLICT DO NOTHING RETURNING student_id` (chunk ≤ 15, thêm guard trạng thái lớp `status = 'active'` qua statement 0 hoặc re-check), và (b) 1 câu `UPDATE class_assignment SET target_scope = 'class' WHERE id = ? AND org_id = ? AND EXISTS (SELECT 1 FROM class WHERE id = ? AND org_id = ? AND status = 'active') AND NOT EXISTS (SELECT 1 FROM enrollment e WHERE e.org_id = ? AND e.class_id = ? AND e.status = 'active' AND NOT EXISTS (SELECT 1 FROM class_assignment_target t WHERE t.org_id = ? AND t.assignment_id = ? AND t.student_id = e.student_id))`.
       - Lấy `actuallyAddedIds` từ kết quả `.returning()` của batch, gọi `notify(ctx.orgId, assignmentPublishedEvents(...))` chỉ khi `actuallyAddedIds.length > 0`, trả `200 { id: assignmentId, added: actuallyAddedIds.length }`.
     - Trong `snapshot.ts`: map thêm `targetScope: row.targetScope === "selected" ? "selected" : "class"` vào mỗi phần tử `classAssignments`.
  6. Chạy test xác nhận **Green** (cùng `study-pack.test.ts`, `study-pack-assign.test.ts`, `class-status.test.ts` để đảm bảo 0 hồi quy).
- **Success criteria:** Toàn bộ test mới và test hồi quy server pass 100%.
- **Verify:**
  - Red phase: `pnpm --filter server exec vitest run src/routes/class-assignment-targets.test.ts` exits non-zero.
  - Green phase: `pnpm --filter server exec vitest run src/routes/class-assignment-targets.test.ts src/lib/study-pack-assign.test.ts src/routes/study-pack.test.ts src/class-status.test.ts` exits 0.

### Task 2.3 — TDD Red + Green: Web command bus, cảnh báo `invited` trong `AssignClassPromptModal`, và `"Giao X/Y HV"` + `"Giao bổ sung"` trên `ClassAssignmentsTab`
<!-- Updated: Validation Session 1 - Áp dụng Red-Team F6, F7, F10 (thêm class-assignments.test.ts, parseWriteEnvelope added, cắt lô <= 100 HV, công thức activeTargetedCount, ẩn nút cho role không có canPublishGrade, thống nhất prop run) -->
- **Goal:** Đưa `targetScope`, `added` và action `add-class-assignment-targets` qua command bus, cảnh báo học viên đang chờ xác nhận trong modal giao bài, và hiển thị phạm vi giao rõ ràng (`"Giao X/Y HV"`) + nút `"Giao bổ sung"` trên `ClassAssignmentsTab`.
- **Target files and symbols:**
  - `apps/web/src/lib/mock-data.ts` (`ClassAssignment.targetScope`)
  - `apps/web/src/lib/repos/class-assignments.ts` (`mapClassAssignments`)
  - `apps/web/src/lib/repos/class-assignments.test.ts`
  - `apps/web/src/lib/data-actions.ts` (`KernelAction` → `assign-class-prompt` có `targetScope?`, thêm `add-class-assignment-targets`)
  - `apps/web/src/lib/data-store-reducer.ts` (case `"add-class-assignment-targets"` trả `state`)
  - `apps/web/src/lib/repos/kernel.ts` (`kernelCommand`, `KernelWriteEnvelope.added`, `parseWriteEnvelope`)
  - `apps/web/src/lib/repos/kernel-command.test.ts`
  - `apps/web/src/components/classes/assign-class-prompt-modal.tsx`
  - `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx`
  - `apps/web/src/components/classes/class-assignments-tab.tsx`
  - `apps/web/src/components/classes/class-assignments-tab.test.tsx`
  - `apps/web/src/routes/_auth/classes/$classId.tsx` (truyền `run`, `isPending`, `busy` vào `ClassAssignmentsTab`)
- **Steps:**
  1. Thêm / cập nhật unit tests (Red):
     - `apps/web/src/lib/repos/class-assignments.test.ts`: kiểm tra `mapClassAssignments` giữ đúng `targetScope` khi snapshot có field này và mặc định không làm gãy fixture cũ không truyền `targetScope`.
     - `apps/web/src/lib/repos/kernel-command.test.ts`: kiểm tra `assign-class-prompt` forward `targetScope` khi có, và `add-class-assignment-targets` ánh xạ tới `POST /api/classes/:classId/assignments/:assignmentId/targets` (encode URI) với `{ studentIds }`.
     - `apps/web/src/components/classes/assign-class-prompt-modal.test.tsx`:
       - Khi `classGroup.invitedStudentIds` có 1 học viên: hiển thị thông báo `"Còn 1 học viên đang chờ xác nhận — sẽ tự nhận bài khi kích hoạt trước hạn nộp."`
       - Khi giao đủ tất cả học viên active gửi `targetScope: "class"`; khi bỏ tick 1 học viên gửi `targetScope: "selected"`.
     - `apps/web/src/components/classes/class-assignments-tab.test.tsx`:
       - Khi một bài chỉ có 1 target (`st-1`) trong lớp 2 học viên active (`st-1`, `st-2`): header hiện `"0/1 đã nộp"` kèm `"Giao 1/2 HV"`; khi mở accordion hiện dải thông báo `"Còn 1 học viên chưa được giao"` (kèm tên `Trần Thị B`) và nút `"Giao bổ sung"` (hiển thị khi `run` được truyền, lớp không `paused`, và viewer không phải `ta`).
       - Bấm `"Giao bổ sung"` gọi `run` với `(key, { type: "add-class-assignment-targets", classId: "cl-1", assignmentId: ca.id, studentIds: ["st-2"] }, expect.any(String))`.
       - Khi lớp có > 100 học viên active còn thiếu: bấm `"Giao bổ sung"` chỉ gửi tối đa 100 `studentIds` mỗi lần.
       - Khi `data.viewer?.role === "ta"` hoặc `classGroup.status === "paused"`: ẩn nút `"Giao bổ sung"`.
       - Khi bài đã giao đủ 2/2 học viên active: KHÔNG hiển thị `"Giao 2/2 HV"` thừa và KHÔNG hiển thị nút `"Giao bổ sung"`.
  2. Chạy test xác nhận **Red**.
  3. Triển khai code trên các file target ở trên:
     - `mock-data.ts` & `repos/class-assignments.ts`: thêm `targetScope?: ClassAssignmentTargetScope` (chỉ gắn khi `row.targetScope !== undefined` để không phá `.toEqual` của snapshot cũ, kèm test cho cả có và không có `targetScope`).
     - `data-actions.ts`, `data-store-reducer.ts`, `repos/kernel.ts`: thêm `targetScope?` trên `assign-class-prompt`, thêm action `add-class-assignment-targets` → `POST /api/classes/${encodeURIComponent(action.classId)}/assignments/${encodeURIComponent(action.assignmentId)}/targets`, và mở rộng `KernelWriteEnvelope` / `parseWriteEnvelope` hỗ trợ `added?: number`.
     - `assign-class-prompt-modal.tsx`: gửi `targetScope: allSelectableSelected && enrolledStudents.length <= MAX_STUDENTS_PER_ASSIGN ? "class" : "selected"`; nếu `(classGroup.invitedStudentIds?.length ?? 0) > 0` render banner cảnh báo màu `--warn` (`border-warn/40 bg-warn-soft`) trong phần `"Học viên nhận bài"`.
     - `class-assignments-tab.tsx`: nhận thêm optional props `run?: DirectKernelAction["run"]`, `isPending?: DirectKernelAction["isPending"]`, `busy?: boolean`; kiểm `canSupplement = Boolean(run) && classGroup.status !== "paused" && (data.viewer?.role === undefined || canPublishGrade(data.viewer.role))`; tính `activeStudentIds = classGroup.studentIds`, `missingActiveStudentIds = activeStudentIds.filter(id => !targetIds.has(id))`, `activeTargetedCount = activeStudentIds.length - missingActiveStudentIds.length`; hiển thị `" · Giao ${activeTargetedCount}/${activeStudentIds.length} HV"` khi `missingActiveStudentIds.length > 0`; trong `.sub-list`, khi `missingActiveStudentIds.length > 0`, render footer row hiển thị danh sách học viên chưa được giao và nút `Button` `variant="outline" size="sm"` `"Giao bổ sung"` (nếu `missingActiveStudentIds.length > 100` dùng `batchIds = missingActiveStudentIds.slice(0, 100)` và nhãn `"Giao bổ sung (100 HV)"`; disabled khi `busy || isPending?.(\`add-targets-${ca.id}\`)`; ẩn khi `!canSupplement`).
     - `apps/web/src/routes/_auth/classes/$classId.tsx`: truyền `run={run}`, `isPending={isPending}`, `busy={busy}` vào `<ClassAssignmentsTab />`.
  4. Chạy lại toàn bộ tests liên quan xác nhận **Green**.
- **Success criteria:** Mọi test cũ và mới trong `class-assignments.test.ts`, `kernel-command.test.ts`, `assign-class-prompt-modal.test.tsx`, `class-assignments-tab.test.tsx` pass 100%, không vỡ assertion `"2/6 đã nộp"` hay `aria-expanded`.
- **Verify:**
  - Red phase: `pnpm --filter web exec vitest run src/lib/repos/class-assignments.test.ts src/lib/repos/kernel-command.test.ts src/components/classes/assign-class-prompt-modal.test.tsx src/components/classes/class-assignments-tab.test.tsx` exits non-zero.
  - Green phase: `pnpm --filter web exec vitest run src/lib/repos/class-assignments.test.ts src/lib/repos/kernel-command.test.ts src/components/classes/assign-class-prompt-modal.test.tsx src/components/classes/class-assignments-tab.test.tsx` exits 0.

## Verification
- `pnpm --filter server exec vitest run src/class-assignment-target-scope-migration.test.ts src/study-pack-migration.test.ts src/routes/class-assignment-targets.test.ts src/lib/study-pack-assign.test.ts src/routes/study-pack.test.ts src/class-status.test.ts` exits 0.
- `pnpm --filter web exec vitest run src/lib/repos/class-assignments.test.ts src/lib/repos/kernel-command.test.ts src/components/classes/assign-class-prompt-modal.test.tsx src/components/classes/class-assignments-tab.test.tsx` exits 0.

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
