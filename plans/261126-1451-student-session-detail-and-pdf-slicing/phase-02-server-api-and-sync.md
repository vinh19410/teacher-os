---
phase: 2
title: "Server API Routes, Curriculum Mapping & Date-Move Sync"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Server API Routes, Curriculum Mapping & Date-Move Sync

## Goal

Cập nhật toàn bộ API giáo viên và học viên trong `apps/server`: hỗ trợ phân loại `lecture`/`homework` và metadata trang sách gốc cho tài liệu buổi, hỗ trợ liên kết `sessionDate` khi giao bài tập tương tác và đồng bộ `sessionDate` khi buổi dời/nghỉ lễ/xóa/đổi ngày khai giảng, làm giàu `GET /api/student/classes/:classId` với cây giáo trình + bộ đếm buổi (không N+1), và thêm `GET /api/student/classes/:classId/sessions/:date`.

## Files to Create / Modify

- Modify: `apps/server/src/routes/materials.ts` — cập nhật `loadSessionMaterials`, `POST /classes/:classId/sessions/:date/materials`, `PUT /classes/:classId/sessions/:date/materials/files` (query `category`, `title`, `sourceTitle`, `pageStart`, `pageEnd`), thêm `POST /classes/:classId/sessions/:date/materials/links` và `PATCH /classes/:classId/sessions/:date/materials/:materialId`.
- Modify: `apps/server/src/routes/kernel.ts` — nhận & validate `sessionDate` trong `POST /classes/:id/assignments`; đồng bộ `classAssignment.sessionDate` khi `sessions/:date/edit` (`moveDate`) và set `null` khi `DELETE /classes/:id/sessions/:date`.
- Modify: `apps/server/src/routes/holidays.ts` — đồng bộ `classAssignment.sessionDate` khi shift holiday và undo holiday shift (song song với `lessonMaterial`).
- Modify: `apps/server/src/routes/enrollment-activation.ts` — đồng bộ `classAssignment.sessionDate` trong `newShifts` và nhánh `scheduleShifted` song song với `materialMoveStatements`. <!-- Red-Team RT-2 -->
- Modify: `apps/server/src/lib/class-start-date-reschedule.ts` — đồng bộ `classAssignment.sessionDate` xuyên suốt cả 3 pha (Step A unwind, Step B 2-pha `SHIFT_DATE_PREFIX` theo `DATE_ONLY_REMAP_CHUNK = 30` + set `null` cho `surplusOldDates`, Step C re-apply `newShifts`) cùng CAS count guard và `needsRescheduleBatch`. <!-- Red-Team RT-1 -->
- Modify: `apps/server/src/routes/snapshot.ts` — chiếu `sessionDate` trong `classAssignments`.
- Modify: `apps/server/src/lib/session-curriculum-materials.ts` — thêm `loadClassCurriculumSummary` và `resolveSessionCurriculumEntry` (batch query không N+1).
- Modify: `apps/server/src/routes/student-class.ts` — chiếu `sessionDate` trong `loadClassAssignmentItems`.
- Modify: `apps/server/src/routes/student-materials.ts` — chiếu `category`, `sourceTitle`, `sourcePageStart`, `sourcePageEnd` trên `GET /classes/:classId/sessions/:date/materials`.
- Modify: `apps/server/src/routes/student.ts` — làm giàu `GET /classes/:classId` (syllabus modules + lesson metadata + counts) và thêm route `GET /classes/:classId/sessions/:date` (được bảo vệ bởi `requireStudent`).
- Modify / Create tests: `apps/server/src/routes/materials.test.ts`, `apps/server/src/routes/student-session-detail.test.ts`, `apps/server/src/edit-class.test.ts` / `apps/server/src/routes/holidays.test.ts`.

## Tests Before (TDD)

1. Tạo `apps/server/src/routes/student-session-detail.test.ts` kiểm tra:
   - `GET /api/student/classes/:classId` trả `syllabus` (modules) và gắn đúng `moduleId`, `moduleTitle`, `syllabusTitle`, `objectives`, `lectureCount`, `homeworkCount`, `assignmentCount` cho từng buổi (loại buổi `holiday` khỏi đếm teaching index); lớp không có giáo trình trả `syllabus: null`.
   - `GET /api/student/classes/:classId/sessions/:date`:
     - IDOR & auth guards: chưa đăng nhập → 401; giáo viên → 403; học viên org khác / chưa ghi danh / enrollment `invited` / ngày không thuộc lớp → 404.
     - Trả đúng `lectures` (gồm direct `lecture` + curriculum materials đã dedupe, direct ưu tiên, không trùng với item đã gắn làm `homework`), `homeworkMaterials` (direct `homework`), `assignments` (chỉ bài của học viên gắn `sessionDate === date` và qua `visibleAssignmentFilter`), `prevSessionDate`, `nextSessionDate`.
     - Không rò rỉ cột teacher-only (`objectKey`, `createdBy`, `folderId`, `attendanceNote`).
     - Buổi `holiday` / `cancelled`: vẫn trả trạng thái buổi nhưng `lectures: []`, `homeworkMaterials: []`, không lộ link Zoom/tài liệu.
     - File download `/api/student/classes/:classId/sessions/:date/materials/:materialId/file` hoạt động cho cả file `lecture` (bao gồm file cắt PDF) và file `homework`.
2. Bổ sung test trong `apps/server/src/routes/materials.test.ts` kiểm tra:
   - Upload file trước buổi học (upcoming) và sau buổi học (completed/past) với `?category=lecture` (kèm `title`, `sourceTitle`, `pageStart`, `pageEnd`) và `?category=homework`.
   - Reject `category` lạ → 400, `pageStart > pageEnd` hoặc `pageStart <= 0` → 400 `INVALID_PAGE_RANGE`.
   - `POST /classes/:classId/sessions/:date/materials/links` tạo link lưu ngân hàng + gắn vào buổi với `category`, chặn buổi holiday 409.
   - `PATCH /classes/:classId/sessions/:date/materials/:materialId` đổi qua lại `lecture` ↔ `homework`, chặn buổi holiday 409, chặn TA 403.
   - `POST /api/classes/:id/assignments` với `sessionDate`: chấp nhận ngày buổi hợp lệ, từ chối ngày không tồn tại hoặc holiday → 400; đồng bộ `sessionDate` khi `moveDate`, `holiday shift/undo`, `delete session` (set null), và `reschedule startDate`.

## Implementation Steps

1. **Materials teacher routes (`apps/server/src/routes/materials.ts`):**
   - Trong `loadSessionMaterials`, select thêm `category: lessonMaterial.category`, `sourceTitle: lessonMaterial.sourceTitle`, `sourcePageStart: lessonMaterial.sourcePageStart`, `sourcePageEnd: lessonMaterial.sourcePageEnd`.
   - Trong `POST /classes/:classId/sessions/:date/materials`, nhận `category`, `sourceTitle`, `sourcePageStart`, `sourcePageEnd` từ `lessonMaterialAttachSchema`.
   - Trong `PUT /classes/:classId/sessions/:date/materials/files`: **validate toàn bộ query params TRƯỚC khi gọi `storeUpload`** (nếu lỗi thì gọi `await c.req.raw.body?.cancel().catch(() => undefined)` trước khi trả 400): `category` (`lecture` | `homework`, default `lecture`), `title` (optional trimmed 1..200, cấm `/[\p{Cc}\p{Cf}]/u`), `sourceTitle` (optional trimmed <= 200, cấm `/[\p{Cc}\p{Cf}]/u`), `pageStart` & `pageEnd` (nếu có 1 phải có cả 2, nguyên dương `1..10000`, `pageStart <= pageEnd`, chỉ cho phép khi `Content-Type` chuẩn là `application/pdf`). Ghi đồng thời trong `db.batch`. <!-- Red-Team RT-8 -->
   - Thêm `POST /classes/:classId/sessions/:date/materials/links` dùng `lessonMaterialLinkCreateSchema` + holiday guard (`isShiftedHolidayBucket` + `holidayBucketDateGuard` + map race catch sang `409 SESSION_HOLIDAY`). <!-- Red-Team RT-8 -->
   - Thêm `PATCH /classes/:classId/sessions/:date/materials/:materialId` dùng `lessonMaterialUpdateSchema` + `resolveSession(..., { rejectHoliday: true })` + `isShiftedHolidayBucket` + guard SQL `holidayBucketDateGuard` nguyên tử trong `UPDATE` (`SET category = ..., date = holidayBucketDateGuard(...)`, catch race trả `409 SESSION_HOLIDAY`, `.returning()` rỗng trả `404 NOT_ATTACHED`). <!-- Red-Team RT-8 -->
2. **Class assignments session linkage & date sync:**
   - `apps/server/src/routes/kernel.ts`:
     - Trong `POST /classes/:id/assignments`: chặn vai trò `ta` trả `403` (giữ `role === undefined` cho test harness giống `canManageClassStatusInKernel`); khi `input.sessionDate` có giá trị, validate `parseStartDateStrict(input.sessionDate)`, kiểm tra buổi tồn tại (`lesson` hoặc `class_session`), không phải all-holiday/shifted-holiday/cancelled; gắn SQL CASE guard nguyên tử lên cột `NOT NULL` (`title`) ngay trong `INSERT classAssignment` trong `db.batch` để chống TOCTOU với holiday shift/xóa buổi (rollback batch và trả 409/400). <!-- Red-Team RT-2 -->
     - Trong `POST /classes/:id/sessions/:date/edit` (khi `moveDate` đổi ngày): thêm statement update `classAssignment.sessionDate = moveDateISO` kèm điều kiện `bucketMoved` giống `lessonMaterial`. <!-- Red-Team RT-2 -->
     - Trong `DELETE /classes/:id/sessions/:date`: thêm statement update `classAssignment.sessionDate = null` where `(orgId, classId, sessionDate = dateISO)`.
   - `apps/server/src/routes/holidays.ts`: trong cả apply shift (`originalDate` → `makeupDate`) và undo shift (`makeupDate` → `originalDate`), cập nhật `classAssignment.sessionDate` trong cùng `db.batch`.
   - `apps/server/src/routes/enrollment-activation.ts`: đồng bộ `classAssignment.sessionDate` song song với `materialMoveStatements` ở cả nhánh `newShifts` và nhánh `scheduleShifted`. <!-- Red-Team RT-2 -->
   - `apps/server/src/lib/class-start-date-reschedule.ts`: đếm `sessionLinkedAssignmentCount` (`sessionDate IS NOT NULL`) đưa vào `casGuardSql` và `needsRescheduleBatch`; đồng bộ `classAssignment.sessionDate` qua đủ 3 pha: Step A unwind (`makeupDate → originalDate`), Step B 2-pha `SHIFT_DATE_PREFIX` chia chunk `DATE_ONLY_REMAP_CHUNK = 30` + `SET session_date = NULL` cho `surplusOldDates`, Step C re-apply `newShifts` (`originalDate → makeupDate`). <!-- Red-Team RT-1 -->
   - `apps/server/src/routes/snapshot.ts`: trả `sessionDate: row.sessionDate ?? null` trong `classAssignments`.
3. **Curriculum batch mapping & Student routes:**
   - `apps/server/src/lib/session-curriculum-materials.ts`:
     - Trích xuất hàm dùng chung `loadClassCurriculumTree(db, orgId, classId)` và `buildTeachingDateIndexMap(lessonDateRows)` để chia sẻ giữa `findCurriculumLessonForDate` và hàm mới `loadClassCurriculumSummary(db, orgId, classId)`.
     - `loadClassCurriculumSummary` trả về `{ syllabus: { name, description, modules } | null, byDate: Map<string, { moduleId, moduleTitle, syllabusLessonId, title, objectives, kind, bankMaterialIds: string[] }> }` (tuyệt đối KHÔNG chiếu `syllabusLesson.materials` hay `syllabusLesson.status` sang student). <!-- Red-Team RT-9 -->
   - `apps/server/src/routes/student-class.ts`: thêm `sessionDate: classAssignment.sessionDate` vào `loadClassAssignmentItems`; lọc `recordingUrl` qua `isSafeMaterialUrl`. <!-- Red-Team RT-11 -->
   - `apps/server/src/routes/student-materials.ts`: nâng cấp `resolveSession` kiểm tra toàn bộ dòng `lesson` của `(orgId, enrollmentId, classId, date)` — nếu tất cả đều `holiday` hoặc `cancelled` thì `GET .../materials` trả `{ items: [], curriculumMaterials: [] }` và `GET .../materials/:materialId/file` trả `404`; trả kèm `category`, `sourceTitle`, `sourcePageStart`, `sourcePageEnd` trên `items`. <!-- Red-Team RT-6 -->
   - `apps/server/src/routes/student.ts` (**CẢNH BÁO `student-projection-lock.test.ts`**: tuyệt đối KHÔNG viết bất kỳ từ cấm nào về điểm danh ghi chú trong toàn bộ file `student.ts`, kể cả trong comment! <!-- Red-Team RT-11 -->):
     - Truyền `now` vào `loadClassAssignmentItems(db, orgId, s.id, row.id, now)` ở cả `GET /classes/:classId` lẫn `GET /classes/:classId/sessions/:date`. <!-- Red-Team RT-9 -->
     - Trong `GET /classes/:classId`: tải song song `loadClassCurriculumSummary` + `lessonMaterial` (chỉ select `date`, `materialId`, `category`) cho lớp; với buổi `holiday` hoặc `cancelled` ép `lectureCount = 0`, `homeworkCount = 0` (và `assignmentCount = 0` với `holiday`; giữ đếm bài tập giao cho buổi `cancelled` nếu còn tồn tại để khớp chi tiết buổi); với buổi thường tính chính xác `lectureCount` (dedupe direct `lecture` ∪ `curriculum` \ direct `homework`), `homeworkCount`, `assignmentCount`, và gắn `moduleId`, `moduleTitle`, `syllabusTitle`, `objectives`, `lessonKind` vào mỗi buổi, cộng `syllabus` trên response. <!-- Red-Team RT-6 -->
     - Đăng ký `router.use("/classes/:classId/sessions/:date", requireStudent)` và triển khai `GET /classes/:classId/sessions/:date`: `:date` sai định dạng `parseStartDateStrict` trả `404`; lấy toàn bộ dòng `lesson` của `(orgId, enrollmentId, classId, date)`, ưu tiên chọn dòng non-holiday/non-cancelled khi cùng ngày có nhiều ca; tính `prevSessionDate`/`nextSessionDate` chỉ từ danh sách distinct ngày non-holiday đã sort của chính `enrollmentId` này; trả đúng `StudentSessionDetailResponse`. <!-- Red-Team RT-6, RT-9 -->

## Tests After

1. Chạy toàn bộ server test liên quan (`student-session-detail.test.ts`, `materials.test.ts`, `student.test.ts`, `student-class.test.ts`, `holidays.test.ts`, `edit-class.test.ts`, `session-curriculum-materials.test.ts`).

## Regression Gate

```bash
pnpm --filter server check-types && pnpm --filter server exec vitest run src/routes/student-session-detail.test.ts src/routes/materials.test.ts src/student.test.ts src/routes/holidays.test.ts src/edit-class.test.ts src/lib/session-curriculum-materials.test.ts
```

## Todo

- [ ] Viết bộ test TDD cho server routes (student session detail, material categories, assignment sessionDate & sync).
- [ ] Cập nhật `materials.ts` (categories, metadata trang sách gốc, link buổi, patch category).
- [ ] Cập nhật `kernel.ts`, `holidays.ts`, `class-start-date-reschedule.ts`, `snapshot.ts` cho `sessionDate`.
- [ ] Cập nhật `session-curriculum-materials.ts`, `student-class.ts`, `student-materials.ts`, `student.ts`.
- [ ] Chạy regression gate Phase 2 xanh.
