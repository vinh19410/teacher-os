---
phase: 3
title: "Phase 3: Bộ đề — API org & thư viện hệ thống"
status: completed
priority: P1
effort: "4h"
dependencies: [1, 2]
---

# Phase 3: Bộ đề — API org & thư viện hệ thống

## Goal

Cung cấp API CRUD bộ đề cho giáo viên (org), API quản lý bộ đề & bài tập thư viện hệ thống cho admin (`org_id IS NULL`), hàm `materializePrompts` idempotent để chuyển đề thư viện thành `assignment_prompt(ready)` của org mà không làm phình `KernelSnapshot`, và thao tác "Nhân bản về org".

## Files

- Create:
  - `apps/server/src/lib/study-pack-clone.ts`
  - `apps/server/src/lib/study-pack-clone.test.ts`
  - `apps/server/src/routes/study-pack.ts`
  - `apps/server/src/routes/study-pack.test.ts`
  - `apps/web/src/lib/repos/study-pack.ts`
- Modify:
  - `apps/server/src/routes/kernel.ts`
  - `apps/server/src/routes/admin-library.ts`
  - `apps/server/src/routes/admin-library.test.ts`

## Tasks

### Task 3.1 — Cài đặt `materializePrompts` và helper kiểm tra nguồn bài tập trong `apps/server/src/lib/study-pack-clone.ts`
- **Goal:** Chuyển đổi danh sách item của bộ đề (`org_prompt`, `library_test_part`, `library_exercise`) thành `promptId` thuộc `assignment_prompt(ready)` của `orgId` một cách idempotent và tuân thủ giới hạn bind của D1.
- **Target files:**
  - `apps/server/src/lib/study-pack-clone.ts`
  - `apps/server/src/lib/study-pack-clone.test.ts`
- **Steps:**
  1. Định nghĩa hằng số D1:
     - `D1_PROMPT_CLONE_INSERT_CHUNK = 4` (22 cột × 4 = 88 binds $\le 100$)
     - `D1_PACK_ITEM_INSERT_CHUNK = 10` (7 cột × 10 = 70 binds $\le 100$)
     - `D1_IN_ARRAY_CHUNK = 50`
  2. Viết hàm `validateStudyPackItems(db, orgId: string | null, items)`:
     - Nếu `orgId === null` (pack hệ thống): cấm `sourceKind === "org_prompt"` (trả lỗi 422 `"system pack cannot reference org_prompt"`).
     - Với `sourceKind === "org_prompt"`: truy vấn `assignmentPrompt` theo `orgId` và `inArray` (chunk 50); mọi đề phải tồn tại, `status === "ready"`, và `skill` thuộc `STUDY_PACK_SKILLS`.
     - Với `sourceKind === "library_test_part"`: truy vấn `libraryTestPart` `innerJoin` `libraryTest` (chunk 50); mọi part phải tồn tại, `libraryTest.status === "ready"`, và `libraryTest.skill === "reading"` (nếu `libraryTest.skill === "listening"` trả lỗi 422 `"listening library parts are not supported in study packs yet"` vì `assignment_prompt` chưa có audio streaming).
     - Với `sourceKind === "library_exercise"`: truy vấn `libraryExercise` (chunk 50); mọi bài phải tồn tại, `status === "ready"`, và `skill` thuộc `STUDY_PACK_SKILLS`.
  3. Viết hàm `materializePrompts(db, orgId: string, items)`:
     - Với `org_prompt`: xác thực thuộc `orgId` & `status === "ready"`, map thẳng `sourceId -> sourceId`.
     - Với `library_test_part` và `library_exercise`: tính `libraryRef = `${item.sourceKind}:${item.sourceId}``.
     - Khi chuyển `library_test_part` sang dòng `assignment_prompt`: nếu `groups` (JSON) có phần tử, flatten `group.type` vào từng câu hỏi (`q.type || group.type`), gộp `group.instruction` vào `intro`, lấy `optionBank` từ `groups` (nếu có), và lấy `title = part.title.trim() || `${test.title} — ${part.part.toUpperCase()}``.
     - Chèn các dòng `assignment_prompt` mới theo chunk `D1_PROMPT_CLONE_INSERT_CHUNK = 4` với `.onConflictDoNothing()`.
     - Sau khi chèn, chạy `SELECT id, library_ref FROM assignment_prompt WHERE org_id = ? AND library_ref IN (...)` (chunk 50) để lấy đúng `promptId` thực tế trong DB.
  4. Viết unit test trong `apps/server/src/lib/study-pack-clone.test.ts`: gọi `materializePrompts` 2 lần liên tiếp chỉ tạo 1 dòng `assignment_prompt`, flatten đúng `groups`/`optionBank` của `library_test_part`, từ chối `listening` `library_test_part` và `writing`/`speaking` `org_prompt`.
- **Success criteria:** `materializePrompts` idempotent, flatten đúng `groups`, không vượt 100 binds/câu lệnh.
- **Verify:** `pnpm --filter server test -- study-pack-clone` exits 0.

### Task 3.2 — Cài đặt API bộ đề cho giáo viên (`/api/study-packs*`) và admin (`/api/admin/library/packs*`, `/api/admin/library/exercises*`)
- **Goal:** Giáo viên CRUD được bộ đề của org, đọc và nhân bản được bộ đề hệ thống `ready`; admin CRUD được bài tập thư viện (`library_exercise`) và bộ đề hệ thống (`study_pack` với `org_id IS NULL`).
- **Target files:**
  - `apps/server/src/routes/study-pack.ts`
  - `apps/server/src/routes/study-pack.test.ts`
  - `apps/server/src/routes/kernel.ts`
  - `apps/server/src/routes/admin-library.ts`
  - `apps/web/src/lib/repos/study-pack.ts`
- **Steps:**
  1. Trong `apps/server/src/routes/study-pack.ts`, cài đặt `studyPackRoutes(deps)` và mount vào `apps/server/src/routes/kernel.ts` (`kernel.route("/", studyPackRoutes(deps))`):
     - Kiểm tra role gate: `canReviewGrade(ctx.role)` cho các route `GET`, `canPublishGrade(ctx.role)` cho các route `POST`/`PUT`/`DELETE` (chặn `ta` ghi với 403). Dùng `readBody(c, schema)` trả `415` khi thiếu `Content-Type: application/json` và `400` khi JSON/Zod lỗi.
     - `GET /api/study-packs`: trả về danh sách bộ đề của `ctx.orgId` (`scope: "org"`) cộng các bộ đề hệ thống có `org_id IS NULL AND status = 'ready'` (`scope: "system"`), kèm số ngày và tổng số bài.
     - `GET /api/study-packs/:id`: chỉ cho phép đọc khi `org_id === ctx.orgId` hoặc `(org_id === null && status === "ready")`; trả về chi tiết các `items` kèm thông tin tiêu đề/kỹ năng của từng bài.
     - `POST /api/study-packs` và `PUT /api/study-packs/:id`: chỉ cho phép tạo/sửa bộ đề của `ctx.orgId`; gọi `validateStudyPackItems`; khi `PUT`, xoá tường minh `study_pack_item` cũ và chèn mới theo chunk `D1_PACK_ITEM_INSERT_CHUNK = 10` trong `db.batch`.
     - `DELETE /api/study-packs/:id`: chỉ cho phép xoá bộ đề thuộc `ctx.orgId`; nếu tồn tại bất kỳ dòng `class_study_pack` nào tham chiếu `pack_id = id` (dù `active` hay `cancelled`), trả `409 Conflict` để bảo toàn lịch sử bài làm của lớp; nếu không, xoá tường minh `study_pack_item` và `study_pack` trong `db.batch`.
     - `POST /api/study-packs/:id/clone`: chỉ nhận bộ đề hệ thống (`org_id IS NULL AND status = 'ready'`); tạo bản sao `study_pack` thuộc `ctx.orgId` (`source_pack_id = id`, giữ nguyên `study_pack_item` trỏ tới nguồn thư viện để không làm phình `snapshot.assignmentPrompts` cho tới khi gán vào lớp).
  2. Trong `apps/server/src/routes/admin-library.ts` (dưới middleware `createRequireAdmin` + kiểm tra `adminOrigins` + `Content-Type: application/json` có sẵn):
     - Thêm CRUD `/exercises` (`GET/POST/PUT/DELETE /api/admin/library/exercises*`) cho `library_exercise`.
     - Thêm CRUD `/packs` (`GET/POST/PUT/DELETE /api/admin/library/packs*`) cho `study_pack` hệ thống (`org_id IS NULL`).
  3. Tạo client repo `apps/web/src/lib/repos/study-pack.ts` cho các endpoint `/api/study-packs*` và `/api/classes/:classId/study-packs*`.
- **Success criteria:** Đầy đủ test phân quyền (`ta` 403, org khác 404, draft system pack không lộ sang org), validation skill, clone idempotent, và chặn xoá pack đã gán lớp (409).
- **Verify:** `pnpm --filter server test -- study-pack admin-library` exits 0 and `pnpm check-types` exits 0.

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
