---
phase: 2
title: "Phase 2: Bảo toàn item ID khi sửa, đóng băng nhánh reused & chặn race hủy/gán"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Bảo toàn item ID khi sửa, đóng băng nhánh reused & chặn race hủy/gán

<!-- Updated: Red Team RT-1, RT-2, RT-5, RT-6 -->

## Goal

Chặn triệt để lỗi nhân đôi `class_assignment` và `class_assignment_target` khi sửa bộ đề (của trung tâm hoặc thư viện admin) rồi gán lại cùng lịch (`reused: true`), đồng thời loại bỏ hoàn toàn cửa sổ race hai chiều giữa `cancelClassStudyPack` và `assignStudyPackToClass` (kể cả dưới `PRAGMA foreign_keys = ON` của D1 và cập nhật thông báo `409` trên UI lớp học) theo quy trình TDD.

## Files to Create / Modify

- Modify:
  - `apps/server/src/lib/study-pack-clone.ts`
  - `apps/server/src/routes/study-pack.ts`
  - `apps/server/src/routes/admin-library.ts`
  - `apps/server/src/lib/study-pack-assign.ts`
  - `apps/server/src/lib/study-pack-assign.test.ts`
  - `apps/server/src/routes/study-pack.test.ts`
  - `apps/server/src/routes/admin-library.test.ts`
  - `apps/web/src/components/classes/class-study-pack-section.tsx`
  - `apps/web/src/components/classes/class-study-pack-section.test.tsx`

## Tasks & Steps

### Task 2.1 — Viết test TDD (Red) cho kịch bản "sửa rồi reuse", race hủy/gán trên DB bật FK, và thông báo `409` trên UI
- **Goal:** Viết trước các bài test tái hiện chính xác lỗi nhân đôi bài giao khi sửa bộ đề rồi reuse, lỗi rò rỉ bài (kể cả bài Ngày 1 `available_at <= cancelledAt`) và lỗi FK khi `cancelClassStudyPack` xen giữa `assignStudyPackToClass` dưới `PRAGMA foreign_keys = ON`, cùng xử lý lỗi `409 "study pack was cancelled"` trên `ClassStudyPackSection`.
- **Target files and symbols:**
  - `apps/server/src/lib/study-pack-assign.test.ts`
  - `apps/server/src/routes/study-pack.test.ts`
  - `apps/server/src/routes/admin-library.test.ts`
  - `apps/web/src/components/classes/class-study-pack-section.test.tsx`
- **Steps:** <!-- Updated: Red Team RT-1, RT-2, RT-5, RT-6 -->
  1. Bật `await client.execute("PRAGMA foreign_keys = ON")` trong `apps/server/src/lib/study-pack-assign.test.ts` (sau `createClient`, dòng 44–47) và `apps/server/src/routes/admin-library.test.ts` (sau `createClient`, dòng 1251–1255) để bắt mọi lỗi `FOREIGN KEY constraint failed` giống hệt Cloudflare D1.
  2. Trong `apps/server/src/routes/study-pack.test.ts` (`describe("study pack routes & student scheduled visibility (#533)")`):
     - Thêm test gán bộ đề org 2 ngày (lịch trong tương lai để cả 2 ngày có `due_at > now`) cho lớp -> gọi `PUT /api/study-packs/:id` sửa tiêu đề, giữ lại bài ngày 1 (kiểm chứng `items[0].id` được giữ nguyên), đổi bài ngày 2 sang bài khác và thêm bài ngày 3 (hoặc chuyển org pack sang `status: "draft"`) -> thêm học viên mới active vào lớp -> gọi lại `POST /api/classes/:classId/study-packs` cùng `(startDate, releaseTime, dueTime)`:
       - Khẳng định response trả `200`, danh sách `assignments` của `class_study_pack` giữ nguyên đúng 2 bài ban đầu (không nhân đôi, không chèn thêm bài ngày 3), và `targetsTotal` tăng lên đủ cho học viên mới ở các bài còn hạn (`due_at > now`), đồng thời KHÔNG backfill các bài đã hết hạn (`due_at <= now`) cho học viên vào muộn.
  3. Trong `apps/server/src/routes/admin-library.test.ts` (`describe("admin library exercises & study packs (#533)")`):
     - Thêm test kiểm tra `PUT /api/admin/library/packs/:id` bảo toàn `study_pack_item.id` cho tuple `(dayIndex, sourceKind, sourceId)` giữ nguyên, chỉ cấp UUID mới cho tuple mới, xóa tuple bị gỡ; và nếu admin thu hồi system pack về `status: "draft"`, `assignStudyPackToClass` trả `404` ngay cả khi lớp đang có bản gán cũ (bảo toàn hiệu lực thu hồi của admin và chống dò ID).
  4. Trong `apps/server/src/lib/study-pack-assign.test.ts`:
     - Thêm test mô phỏng race hủy xen giữa lượt gán mới (`!reused`, `startDate` hôm nay với bài Ngày 1 có `available_at <= thời điểm hủy` và bài Ngày 2 có `available_at > thời điểm hủy`): kích hoạt `cancelClassStudyPack` ngay trước hoặc giữa các chunk `db.batch` của `assignStudyPackToClass` -> khẳng định `assignStudyPackToClass` không nổ lỗi `500 FOREIGN KEY`, trả `{ ok: false, status: 409, error: "study pack was cancelled" }`, `class_study_pack.status` là `"cancelled"`, và **cả bài Ngày 1 lẫn bài Ngày 2** (chưa có `quiz_attempt`) đều bị xóa sạch (`0` dòng `class_assignment` và `0` dòng `class_assignment_target` rò rỉ).
     - Thêm test mô phỏng race hủy xen giữa lượt `reused = true` (đọc xong `existingAssignments` rồi bị `cancelClassStudyPack` xóa bài chưa mở ngay trước khi ghi `class_assignment_target` dưới `PRAGMA foreign_keys = ON`): khẳng định không nổ `FOREIGN KEY constraint failed` mà trả `{ ok: false, status: 409, error: "study pack was cancelled" }`.
     - Thêm test gọi lại `cancelClassStudyPack` tại thời điểm `t2` (sau giờ mở của một bài rò rỉ `available_at` nằm giữa `cancelledAt` gốc `t1` và `t2`, chưa có `quiz_attempt`): khẳng định `cancelClassStudyPack` dùng mốc `packRow.cancelledAt` (`t1`) xóa sạch bài rò rỉ đó và giữ nguyên `cancelledAt = t1`.
  5. Trong `apps/web/src/components/classes/class-study-pack-section.test.tsx`:
     - Thêm test khi `assignStudyPackToClass` ném lỗi `Object.assign(new Error("study pack was cancelled"), { status: 409, studyPackErrorCode: "study pack was cancelled" })`: khẳng định giao diện hiển thị thông báo bộ đề vừa bị hủy (không báo nhầm `"Bộ đề này đang chạy trên lớp với lịch khác."`) và gọi lại `fetchClassStudyPacks`.
- **Success criteria:** Các bài test mới chạy và fail ở các hành vi chưa được cài đặt.
- **Verify:** `pnpm --filter server exec vitest run src/lib/study-pack-assign.test.ts src/routes/study-pack.test.ts src/routes/admin-library.test.ts && pnpm --filter web exec vitest run src/components/classes/class-study-pack-section.test.tsx` thoát khác `0` với lỗi assertion (test pass ở bước này là thất bại của pha Red).

### Task 2.2 — Bảo toàn `study_pack_item.id` trong `PUT /study-packs/:id` và `PUT /api/admin/library/packs/:id`
- **Goal:** Giữ nguyên `study_pack_item.id` khi cập nhật bộ đề đối với mọi phần tử có cùng bộ khóa `(dayIndex, sourceKind, sourceId)` với dữ liệu hiện có của bộ đề đó.
- **Target files and symbols:**
  - `apps/server/src/lib/study-pack-clone.ts` (thêm `buildPackItemTupleKey`, mở rộng `buildStudyPackItemInsertStatements` tại dòng 893)
  - `apps/server/src/routes/study-pack.ts` (`routes.put("/study-packs/:id", ...)` trước `const statements` tại dòng 185)
  - `apps/server/src/routes/admin-library.ts` (`router.put("/packs/:id", ...)` trước `const statements` tại dòng 1122)
- **Steps:**
  1. Trong `apps/server/src/lib/study-pack-clone.ts`:
     - Export helper `buildPackItemTupleKey(dayIndex: number, sourceKind: string, sourceId: string): string` trả về `${dayIndex}:${sourceKind}:${sourceId}` (duy nhất theo `study_pack_item_pack_day_source_uq`).
     - Mở rộng `buildStudyPackItemInsertStatements(db, packId, items, existingIdByTuple?: ReadonlyMap<string, string>)`: với mỗi `item`, đặt `id: existingIdByTuple?.get(buildPackItemTupleKey(item.dayIndex, item.sourceKind, item.sourceId)) ?? crypto.randomUUID()`.
  2. Trong `apps/server/src/routes/study-pack.ts` (`PUT /study-packs/:id`, trước dòng 185) và `apps/server/src/routes/admin-library.ts` (`PUT /packs/:id`, trước dòng 1122): truy vấn các dòng hiện có của `studyPackItem` theo `eq(studyPackItem.packId, id)`, dựng `existingIdByTuple = new Map(...)` bằng `buildPackItemTupleKey`, và truyền vào `buildStudyPackItemInsertStatements` trong cùng `db.batch([update(studyPack), delete(studyPackItem), ...insertStatements])`.
- **Success criteria:** Các mục giữ nguyên `(dayIndex, sourceKind, sourceId)` bảo toàn nguyên vẹn `id` sau `PUT`, cập nhật đúng `position` và `note` mới; mục bị gỡ bị xóa; mục mới nhận UUID mới.
- **Verify:** `no verification needed` (kiểm chứng cơ học gộp ở Task 2.4).

### Task 2.3 — Đóng băng `class_assignment` ở nhánh `reused` và khóa nguyên tử race hủy/gán trong `study-pack-assign.ts`
- **Goal:** Đóng băng tập `class_assignment` ở cả nhánh `existingActive` lẫn `raced`, chỉ backfill `class_assignment_target` cho các bài còn hạn (`due_at IS NULL OR due_at > now`), và khóa chặt cả hai chiều race hủy/gán dưới `PRAGMA foreign_keys = ON`.
- **Target files and symbols:**
  - `apps/server/src/lib/study-pack-assign.ts` (`assignStudyPackToClass`, `cancelClassStudyPack`, helper `buildCleanupCancelledPackStatements`)
- **Steps:** <!-- Updated: Red Team RT-1, RT-2, RT-5 -->
  1. Trong `apps/server/src/lib/study-pack-assign.ts`, viết helper nội bộ `buildCleanupCancelledPackStatements(db: Db, orgId: string, classId: string, classPackId: string, cutoff: Date | null): [BatchItem<"sqlite">, BatchItem<"sqlite">]`:
     - Khi `cutoff !== null` (dùng khi hủy một pack đã từng kích hoạt: xóa các bài mở sau `cutoffMs = cutoff.getTime()` chưa có `quiz_attempt`):
       - Câu 1: xóa `classAssignmentTarget` có `org_id = orgId` và `assignment_id IN (SELECT ca.id FROM class_assignment ca WHERE ca.org_id = ${orgId} AND ca.class_id = ${classId} AND ca.class_study_pack_id = ${classPackId} AND ca.available_at > ${cutoffMs} AND NOT EXISTS (SELECT 1 FROM quiz_attempt qa WHERE qa.org_id = ${orgId} AND qa.assignment_id = ca.id))`.
       - Câu 2: xóa `classAssignment` có `org_id = orgId`, `class_id = classId`, `class_study_pack_id = classPackId`, `gt(classAssignment.availableAt, cutoff)` và `NOT EXISTS (SELECT 1 FROM quiz_attempt qa WHERE qa.org_id = ${orgId} AND qa.assignment_id = ${classAssignment.id})`.
     - Khi `cutoff === null` (dùng khi một lượt gán mới `createdFresh === true` bị hủy xen kẽ giữa chừng trước khi hoàn tất kích hoạt — phải xóa TẤT CẢ bài vừa lỡ chèn chưa có `quiz_attempt`, kể cả bài Ngày 1 có `available_at <= cancelledAt`):
       - Tương tự 2 câu lệnh trên nhưng **bỏ điều kiện `available_at > cutoff`**.
  2. Cập nhật `cancelClassStudyPack`:
     - Đọc `packRow` theo `(id, orgId, classId)` -> trả `404` nếu không tồn tại.
     - Tính `const effectiveCutoff = packRow.cancelledAt ?? now;` (không return sớm khi `packRow.status === "cancelled"`, để gọi lại luôn dọn sạch mọi bài rò rỉ tính từ thời điểm hủy gốc `cancelledAt` mà không ghi đè `cancelledAt`).
     - Thực thi **1 lệnh `await db.batch([updateStmt, ...buildCleanupCancelledPackStatements(db, orgId, classId, classPackId, effectiveCutoff)])` duy nhất**, trong đó `updateStmt` đặt `status: "cancelled"` và `cancelledAt: sql`COALESCE(${classStudyPack.cancelledAt}, ${now.getTime()})``.
  3. Cập nhật `assignStudyPackToClass(db, params)` (thêm trường tùy chọn `now?: Date` trong `AssignStudyPackParams`, mặc định `new Date()`):
     - **Thứ tự kiểm tra rõ ràng, không mơ hồ:**
       1) Kiểm tra `cls` thuộc `orgId` (`404` nếu thiếu).
       2) Đọc `pack`: nếu `!pack || (pack.orgId !== null && pack.orgId !== orgId) || (pack.orgId === null && pack.status !== "ready")` -> trả `404 "study pack not found"` ngay lập tức (chống dò ID system pack `draft` và đảm bảo admin thu hồi system pack về `draft` có hiệu lực tức thì).
       3) Tra `existingActive` trên `class_study_pack`: nếu có mà khác `(startDate, releaseTime, dueTime)` -> trả `409 "study pack already active on class"`. Nếu khớp lịch -> đặt `classPackId = existingActive.id; reused = true; createdFresh = false`.
       4) Viết helper nội bộ `loadExistingPackAssignments(classPackId)` trả các dòng `{ id, dueAt }` của `classAssignment` thuộc `(orgId, classId, classPackId)`. Nếu `reused === true`, gọi `loadExistingPackAssignments(classPackId)` **TRƯỚC khi kiểm tra `pack.status !== "ready"` (cho org pack), `itemRows`, và `materializePrompts`**: nếu `existingAssignments.length > 0`, chuyển thẳng sang nhánh **chỉ backfill target** cho các bài có `assignment.dueAt === null || assignment.dueAt.getTime() > now.getTime()` với `activeStudentIds`.
       5) Nếu `!reused` hoặc `existingAssignments.length === 0`: kiểm tra `if (pack.status !== "ready") return { ok: false, status: 422, error: "study pack is not ready" }`, đọc `itemRows` (`422` nếu rỗng), chạy `materializePrompts`. Nếu `!reused`, chạy `insert(classStudyPack)...onConflictDoNothing().returning({ id })`:
          - Nếu `inserted.length > 0`: `createdFresh = true`, dựng `assignmentValues` + `targetValues` từ `itemRows`.
          - Nếu `inserted.length === 0` (`raced`): đọc lại `raced` active pack; nếu không khớp lịch -> trả `409 "study pack already active on class"`; nếu khớp lịch -> đặt `classPackId = raced.id; reused = true; createdFresh = false`, gọi `loadExistingPackAssignments(classPackId)` — nếu `existingAssignments.length > 0` thì dùng nhánh **chỉ backfill target** (`dueAt === null || dueAt > now`), ngược lại mới dựng `assignmentValues` + `targetValues` từ `itemRows`.
     - **Thực thi batch an toàn với FK + hậu kiểm hủy xen kẽ:**
       - Bọc `await executeBatchedStatements(db, statements)` trong `try { ... } catch (batchErr) { ... }`: nếu bắt được lỗi (ví dụ `FOREIGN KEY constraint failed` trên D1 do `cancelClassStudyPack` vừa xóa bài giao cha xen giữa các chunk), kiểm tra `latestPack` bên dưới — nếu `!latestPack || latestPack.status === "cancelled"` thì dọn dẹp và trả `409 "study pack was cancelled"`, ngược lại `throw batchErr`.
       - Ngay cả khi `executeBatchedStatements` không ném lỗi, luôn đọc lại `[latestPack]` từ `classStudyPack` theo `(classPackId, orgId, classId)`. Nếu `!latestPack || latestPack.status === "cancelled"`, chạy `await db.batch(buildCleanupCancelledPackStatements(db, orgId, classId, classPackId, createdFresh ? null : (latestPack?.cancelledAt ?? now)))` và trả `{ ok: false, status: 409, error: "study pack was cancelled" }`.
- **Success criteria:** Mọi kịch bản "sửa rồi reuse", học viên vào muộn (`due_at > now`), thu hồi system pack `draft`, và race hủy/gán dưới `PRAGMA foreign_keys = ON` đều xử lý chính xác.
- **Verify:** `pnpm --filter server exec vitest run src/lib/study-pack-assign.test.ts src/lib/study-pack-clone.test.ts src/routes/study-pack.test.ts src/routes/admin-library.test.ts` thoát `0`.

### Task 2.4 — Cập nhật xử lý lỗi `409 "study pack was cancelled"` trong `ClassStudyPackSection` (Green)
- **Goal:** Phân biệt mã lỗi `409 "study pack was cancelled"` với `"study pack already active on class"` trên UI lớp học để thông báo đúng nguyên nhân và làm mới danh sách bộ đề của lớp.
- **Target files and symbols:**
  - `apps/web/src/components/classes/class-study-pack-section.tsx` (hàm `handleAssignSubmit`, dòng 190–199)
- **Steps:** <!-- Updated: Red Team RT-6 -->
  1. Trong `apps/web/src/components/classes/class-study-pack-section.tsx` tại khối `catch (err)` của `handleAssignSubmit` (dòng 190–199), đọc thêm `errorCode = err && typeof err === "object" && "studyPackErrorCode" in err ? err.studyPackErrorCode : null`.
  2. Nếu `status === 409 && errorCode === "study pack was cancelled"`, đặt `setFormError("Bộ đề này vừa bị huỷ. Vui lòng kiểm tra lại danh sách.")` và gọi `fetchClassStudyPacks(classId).then((fresh) => { setAssignedPacks(fresh.packs); setHolidays(fresh.holidays); }).catch(() => {})`; giữ nguyên thông báo `"Bộ đề này đang chạy trên lớp với lịch khác."` cho các lỗi `409` còn lại.
- **Success criteria:** Test frontend `class-study-pack-section.test.tsx` và toàn bộ test backend Phase 2 đều xanh.
- **Verify:** `pnpm --filter web exec vitest run src/components/classes/class-study-pack-section.test.tsx && pnpm --filter server exec vitest run src/lib/study-pack-assign.test.ts src/routes/study-pack.test.ts src/routes/admin-library.test.ts` thoát `0`.

## Todo

- [ ] Task 2.1 — Viết test TDD (Red) cho "sửa rồi reuse", race hủy/gán với FK ON, và UI 409
- [ ] Task 2.2 — Bảo toàn `study_pack_item.id` trong `PUT /study-packs/:id` và `PUT /api/admin/library/packs/:id`
- [ ] Task 2.3 — Đóng băng `class_assignment` ở nhánh `reused`/`raced` và khóa nguyên tử race hủy/gán
- [ ] Task 2.4 — Cập nhật xử lý lỗi `409 "study pack was cancelled"` trong `ClassStudyPackSection` (Green)

## Success Criteria

- Sửa bộ đề (org hoặc admin) rồi gán lại cùng lịch giữ nguyên tập `class_assignment` ban đầu và chỉ backfill `class_assignment_target` cho các bài còn hạn (`due_at > now`).
- `cancelClassStudyPack` chạy nguyên tử 1 `db.batch` theo `packRow.cancelledAt ?? now` và tự phục hồi khi gọi lại trên pack đã hủy.
- `assignStudyPackToClass` bắt gọn lỗi FK khi hủy xen kẽ trên D1 (`PRAGMA foreign_keys = ON`), xóa sạch toàn bộ bài chưa làm của lượt gán mới bị hủy giữa chừng (kể cả Ngày 1) và trả `409`, hiển thị đúng thông báo trên UI.

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
