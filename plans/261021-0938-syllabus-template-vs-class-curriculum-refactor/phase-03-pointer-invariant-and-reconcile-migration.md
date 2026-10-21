---
title: "Phase 3: Bất biến con trỏ và migration đối soát"
status: completed
---

# Phase 3: Bất biến con trỏ và migration đối soát

## Goal

Biến `syllabus.class_id` thành nguồn sự thật duy nhất của quan hệ lớp ↔ giáo trình, gom mọi lệnh ghi `class.syllabus_id` vào `lib/syllabus-curriculum.ts`, và chữa dữ liệu lệch bằng migration `0042` không xoá dòng nào.

## Context

- Design: D2, D3 trong [design-decisions.md](./reports/design-decisions.md).
- **Điều kiện bắt đầu:** `reports/phase-01-anomaly-report.md` đã có và Q1b đã có quyết định của user. Nếu chưa, STOP và hỏi user.
- Hành vi quan sát được phải giữ nguyên: test "matrix 8" (gỡ giáo trình xoá cây copy và đặt con trỏ null; gọi lần hai là no-op) và "matrix 9" (gỡ khi con trỏ trỏ vào template chỉ đặt con trỏ null, không xoá template) trong `kernel.test.ts` khối "import syllabus + remove curriculum (issue #79)" vẫn phải qua mà không sửa.
- `class.syllabus_id` là FK thật (NO ACTION): thứ tự batch khi xoá cây là "đặt con trỏ null trước, rồi xoá lesson, module, syllabus". Khi insert lớp kèm copy: copy trước, lớp sau cùng.
- 0041 cảnh báo `DROP TABLE` trên D1 cascade qua FK; phase này không rebuild bảng.

## Files

- Modify: `apps/server/src/lib/syllabus-curriculum.ts`
- Modify: `apps/server/src/routes/syllabus.ts`
- Modify: `apps/server/src/kernel.test.ts` (chỉ thêm khối `describe` mới ở cuối nhóm syllabus; không sửa test cũ)
- Create: `packages/db/src/migrations/0042_syllabus_class_pointer_reconcile.sql` (tên do drizzle-kit sinh có thể khác phần sau số thứ tự; dùng đúng tên nó sinh)
- Create (tự sinh bởi drizzle-kit): `packages/db/src/migrations/meta/0042_snapshot.json` và dòng mới trong `packages/db/src/migrations/meta/_journal.json`
- Create: `apps/server/src/syllabus-pointer-reconcile-migration.test.ts`

## Tasks

### Task 3.1: Thêm hàm truy vấn và hàm ghi con trỏ vào service

- **Goal:** ba hàm đọc và hai hàm ghi con trỏ, tất cả trong `lib/syllabus-curriculum.ts`.
- **Target files:** `apps/server/src/lib/syllabus-curriculum.ts`.
- **Steps:**
  1. Thêm `findClassCurriculum(db, classId, orgId)`: `select().from(syllabus).where(and(eq(syllabus.classId, classId), eq(syllabus.orgId, orgId)))`, trả `row | undefined`.
  2. Thêm `findTemplate(db, id, orgId)`: như `findSyllabus` nhưng thêm `isNull(syllabus.classId)`; import `isNull` từ `drizzle-orm`.
  3. Thêm `setClassCurriculumPointer(db, classId, orgId, copyId: string | null): BatchItem<"sqlite">` trả `db.update(classTable).set({ syllabusId: copyId }).where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)))` (không `await`; để đưa vào batch).
  4. Thêm `clearPointersTo(db, syllabusId, orgId): BatchItem<"sqlite">` trả `db.update(classTable).set({ syllabusId: null }).where(and(eq(classTable.syllabusId, syllabusId), eq(classTable.orgId, orgId)))`.
  5. Import `classTable` từ `@teacher-os/db/schema/class`.
- **Success criteria:** bốn hàm được export.
- **Verify:** `pnpm --filter server check-types` exits 0.

### Task 3.2: Viết lại import và gỡ giáo trình trên `findClassCurriculum`

- **Goal:** conflict và gỡ dựa vào bản copy, không dựa vào con trỏ; không còn nhánh "con trỏ lệch" riêng.
- **Target files:** `apps/server/src/routes/syllabus.ts` (handler `POST /classes/:id/import-syllabus` và `POST /classes/:id/remove-curriculum`), `apps/server/src/routes/kernel.ts` (`POST /classes` chỉ import hàm mới nếu cần).
- **Steps:**
  1. Import: thay `cls.syllabusId !== null` bằng `const existing = await findClassCurriculum(db, classId, ctx.orgId); if (existing) return c.json({ error: "Lớp đã có giáo trình" }, 409);`. Vẫn gọi `findClassPointer` trước để trả 404 khi lớp không tồn tại.
  2. Import: cuối `statements` dùng `setClassCurriculumPointer(db, classId, ctx.orgId, copyId)` thay cho `db.update(classTable)...` viết tay. Khối `catch` kiểm tra lại bằng `findClassCurriculum` thay cho kiểm tra `after?.syllabusId`.
  3. Gỡ: `const copy = await findClassCurriculum(...)`. Nếu `!copy`: chạy `await db.batch([setClassCurriculumPointer(db, classId, ctx.orgId, null)])` rồi trả `{ ok: true }` (không bao giờ xoá dòng mà con trỏ cũ trỏ tới). Nếu có `copy`: batch gồm `setClassCurriculumPointer(..., null)` đầu tiên, rồi ba lệnh `delete` (lesson, module, syllabus) y hệt cũ, mọi lệnh có `orgId`.
  4. Xoá nhánh "Legacy anomaly" và truy vấn `copy` cũ có điều kiện `eq(syllabus.id, cls.syllabusId)`.
  5. `POST /syllabi/:id/remove`: thay `db.update(classTable).set({ syllabusId: null })...` bằng `clearPointersTo(db, id, ctx.orgId)`; giữ nguyên thứ tự batch.
  6. `POST /classes`: không đổi (con trỏ đi cùng lệnh insert lớp qua `imported?.copyId`).
- **Success criteria:** `rg "set\(\{ syllabusId" apps/server/src --glob '!*.test.*'` chỉ còn khớp trong `lib/syllabus-curriculum.ts`.
- **Verify:** `rg -l "set\(\{ syllabusId" apps/server/src --glob '!*.test.*'` prints exactly `apps/server/src/lib/syllabus-curriculum.ts`; then `pnpm --filter server test` exits 0 with `0 failed` (test cũ matrix 8 và 9 không sửa).

### Task 3.3: Test bất biến con trỏ

- **Goal:** test bắt được mọi lần con trỏ và copy lệch nhau.
- **Target files:** `apps/server/src/kernel.test.ts` (thêm một khối `describe("class curriculum pointer invariant (class_id is source of truth)", ...)` ngay sau khối "import syllabus + remove curriculum (issue #79)").
- **Steps:**
  1. Trong khối mới dùng cùng cách khởi tạo như khối "import syllabus + remove curriculum" (`createTestApp`, session, tạo template qua API, tạo lớp).
  2. Viết helper cục bộ `expectPointerInvariant()` đọc trực tiếp DB bằng drizzle (cách các khối khác trong file đọc `classTable` và `syllabusLesson`): với mọi lớp, nếu tồn tại `syllabus` có `classId = lớp.id` thì `classTable.syllabusId` bằng id của copy đó; nếu không tồn tại thì `classTable.syllabusId` là `null`.
  3. Viết các test (mỗi test kết thúc bằng `await expectPointerInvariant()`):
     - tạo lớp kèm `templateId`;
     - tạo lớp trống rồi import;
     - import lần hai trả 409 và invariant vẫn đúng;
     - import rồi gỡ (copy biến mất, con trỏ null);
     - xoá template khi lớp khác còn giữ copy (copy và con trỏ giữ nguyên);
     - **con trỏ cũ trỏ vào template cùng org** (cập nhật `classTable.syllabusId` thẳng bằng DB sang id của template): `GET` snapshot cho thấy lớp chưa có copy; import thành công (201), con trỏ trỏ vào copy mới và template không đổi;
     - **con trỏ cũ trỏ vào template cùng org rồi gỡ**: trả `{ ok: true }`, con trỏ null, template vẫn còn;
     - **xoá template đang được con trỏ của lớp không có copy trỏ vào** (đặt thẳng bằng DB): `clearPointersTo` đặt null trước nên xoá thành công, không 500;
     - **canary FK**: kiểm tra test DB có bật `foreign_keys`; chèn con trỏ tới id không tồn tại phải bị từ chối. Nếu không bị từ chối, FK không được thực thi trong test và các test xoá ở trên không chứng minh gì: dừng và hỏi kongming.
- **Success criteria:** mọi test mới xanh và test cũ không đổi.
- **Verify:** `pnpm --filter server exec vitest run src/kernel.test.ts -t "pointer invariant"` exits 0 and prints `9 passed` (hoặc đúng số test bạn viết; `skipped` phải bằng 0 và số test chạy phải ≥ 9, nếu `-t` không khớp sẽ in `0 tests`: dừng).

### Task 3.4: Sinh migration `0042` và viết SQL

**Điều kiện:** chỉ làm task này (và test migration) khi báo cáo phase 1 có Q2 > 0 hoặc user đã đồng ý NULL hoá Q1b. Ngược lại ghi "không cần migration" vào `reports/phase-03-deploy-notes.md` và bỏ qua Task 3.4-3.5. Nội dung SQL bên dưới chỉ gồm các câu lệnh tương ứng với quyết định đó (bỏ câu NULL hoá Q1b nếu user không đồng ý).

- **Goal:** migration chữa con trỏ lệch, idempotent, không xoá dòng.
- **Target files:** thư mục `packages/db/src/migrations/`.
- **Steps:**
  1. Chạy `pnpm --filter @teacher-os/db exec drizzle-kit generate --custom --name=syllabus_class_pointer_reconcile`. Lệnh tạo `0042_syllabus_class_pointer_reconcile.sql` rỗng, snapshot và dòng journal.
  2. Dán đúng nội dung sau vào file `.sql` (một câu lệnh, không có `PRAGMA`):
     ```sql
     -- Chữa con trỏ lớp ↔ giáo trình: syllabus.class_id là nguồn sự thật. Lớp có bản copy cùng org
     -- mà con trỏ null hoặc trỏ chỗ khác thì trỏ về copy. Không xoá dòng nào; con trỏ mồ côi
     -- (không có copy) được giữ nguyên vì code mới không đọc con trỏ để tìm giáo trình.
     UPDATE `class` SET `syllabus_id` = (
       SELECT s.`id` FROM `syllabus` s WHERE s.`class_id` = `class`.`id` AND s.`org_id` = `class`.`org_id`
     )
     WHERE EXISTS (
       SELECT 1 FROM `syllabus` s WHERE s.`class_id` = `class`.`id` AND s.`org_id` = `class`.`org_id`
     )
     AND (`syllabus_id` IS NULL OR `syllabus_id` <> (
       SELECT s.`id` FROM `syllabus` s WHERE s.`class_id` = `class`.`id` AND s.`org_id` = `class`.`org_id`
     ));
     ```
  3. **Chỉ khi** `phase-01-anomaly-report.md` ghi user đồng ý đặt NULL cho con trỏ mồ côi, thêm `--> statement-breakpoint` rồi câu lệnh `UPDATE \`class\` SET \`syllabus_id\` = NULL WHERE \`syllabus_id\` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \`syllabus\` s WHERE s.\`class_id\` = \`class\`.\`id\` AND s.\`org_id\` = \`class\`.\`org_id\`);`. Nếu không có ghi nhận đồng ý, KHÔNG thêm câu này.
  4. Không sửa bất kỳ file migration cũ nào (công cụ deploy bỏ qua file đã áp dụng theo tên; sửa file cũ sẽ không có hiệu lực, từng gây sự cố 0008).
- **Success criteria:** có đúng một file `0042_*.sql` mới, một snapshot mới và một mục journal mới; không file cũ đổi.
- **Verify:** `git status --porcelain packages/db/src/migrations` lists only `?? ...0042_syllabus_class_pointer_reconcile.sql`, `?? ...meta/0042_snapshot.json` and ` M ...meta/_journal.json`. Then `pnpm --filter @teacher-os/db db:generate` prints `No schema changes` and `git status --porcelain packages/db/src/migrations` is unchanged from the previous output.

### Task 3.5: Test migration

- **Goal:** chứng minh migration đúng trên dữ liệu giống pilot, idempotent, không mất dòng.
- **Target files:** `apps/server/src/syllabus-pointer-reconcile-migration.test.ts` (mới), mô phỏng `apps/server/src/syllabus-template-migration.test.ts` (đọc nó trước: `migrationFiles`, `statements`, `applyFile`, `applyThrough`, `seedPilotLike`).
- **Steps:**
  1. Copy các helper `migrationFiles`, `statements`, `applyFile`, `applyThrough` (hoặc import nếu file gốc đã export chúng; nếu không, copy ngắn gọn, không refactor file cũ).
  2. Khởi tạo libsql in-memory, `applyThrough(client, "0041_known_ink.sql")`.
  3. Seed (INSERT trực tiếp bằng SQL, đủ cột NOT NULL theo schema): org `o1`, `o2`; template `t1` của `o1` (class_id NULL); lớp `cA` (`o1`) có copy `sA` (`class_id = 'cA'`, `source_template_id = 't1'`) nhưng `syllabus_id` NULL; lớp `cB` (`o1`) có copy `sB` và `syllabus_id = 't1'`; lớp `cC` (`o1`) có copy `sC` và `syllabus_id = 'sC'` (đã đúng); lớp `cD` (`o1`) có `syllabus_id = 't1'` và không có copy; lớp `cE` (`o2`) và copy `sE` có `class_id = 'cE'` nhưng `org_id = 'o1'` (khác org với lớp); mỗi copy có một module và một lesson.
  4. Đếm hàng trước: `syllabus`, `syllabus_module`, `syllabus_lesson`, `class`.
  5. Áp file `0042_*.sql` (tìm theo tiền tố `0042_`).
  6. Kiểm: `cA.syllabus_id = 'sA'`; `cB.syllabus_id = 'sB'`; `cC.syllabus_id = 'sC'` (không đổi); `cD.syllabus_id = 't1'` (giữ nguyên, trừ khi user đã đồng ý bước NULL, khi đó là NULL và test phải phản ánh đúng); `cE.syllabus_id` không đổi (khác org); số hàng bốn bảng bằng đếm trước.
  7. Áp lại file `0042_*.sql` lần hai: toàn bộ giá trị `class.syllabus_id` giống hệt sau lần một.
- **Success criteria:** test xanh; không có `skipped`.
- **Verify:** `pnpm --filter server exec vitest run src/syllabus-pointer-reconcile-migration.test.ts` exits 0 and prints `passed` with `0 failed`.

### Task 3.6: Chạy toàn bộ và bàn giao bước deploy cho user

- **Goal:** phase xanh; bước chạm production nằm ở user.
- **Steps:**
  1. `pnpm --filter server test`, `pnpm --filter server check-types`, `pnpm exec biome check apps packages`.
  2. Ghi vào `reports/phase-03-deploy-notes.md` (thư mục plan) các bước user phải làm, theo `docs/production-release-runbook.md`: (a) `wrangler d1 time-travel info teacher-os-db` và lưu bookmark; (b) apply migration trên staging trước, chạy lại Q1-Q4 từ `phase-01-anomaly-queries.sql`, kỳ vọng Q2 = 0 và Q3, Q4 không đổi; (c) lặp lại trên prod ngoài giờ cao điểm.
  3. Agent KHÔNG chạy `wrangler` trên staging hay prod.
- **Success criteria:** ba lệnh xanh; file ghi chú deploy tồn tại.
- **Verify:** `pnpm --filter server test` exits 0 with `0 failed`; `pnpm exec biome check apps packages` exits 0; `ls plans/261021-0938-syllabus-template-vs-class-curriculum-refactor/reports/phase-03-deploy-notes.md` exits 0.

## Success Criteria

- [ ] Chỉ `lib/syllabus-curriculum.ts` chứa `set({ syllabusId`.
- [ ] Test bất biến con trỏ xanh; test cũ không sửa vẫn xanh.
- [ ] Migration `0042` xanh trên dữ liệu giả lập, chạy lại không đổi gì, không mất hàng nào.
- [ ] `db:generate` báo `No schema changes`.

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
