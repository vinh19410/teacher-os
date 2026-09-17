---
phase: 1
title: "Data layer + API — kind xuyên DB/contract/server"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Data layer + API — kind xuyên DB/contract/server

## Goal

`syllabus_lesson` có field `kind` (`lesson` | `midterm` | `final`, default
`lesson`) được preserve qua mọi write path: create bulk, replace-content,
add/edit lesson, copy template→lớp, và snapshot đọc ra.

## Context Links

- Plan gốc: [plan.md](./plan.md) — đặc tả data model & nhãn UI
- Scout: schema `packages/db/src/schema/syllabus.ts:80-103`; routes
  `apps/server/src/routes/kernel.ts` (POST /syllabi ~1276, replace-content
  ~1316, lessons add ~1553, edit ~1650, `buildImportBatch` ~229);
  `apps/server/src/routes/snapshot.ts` (mapping lesson ~147); contracts
  `packages/api/src/contracts.ts` (122-136, 188-196, 433-445).
- Migration mẫu: `packages/db/src/migrations/0009_syllabus_template_discriminator.sql`

## Requirements

- [x] Migration SQLite ADD COLUMN `kind` text NOT NULL DEFAULT 'lesson' (SQLite
      không ALTER ADD FK — không cần FK, value space do zod contract guarded).
- [x] `lessonUpsertSchema.kind`: optional enum — edit route preserve giá trị
      hiện tại khi vắng (mirror đúng pattern `status`).
- [x] `syllabusModuleContentSchema.lessons[].kind`: enum default `"lesson"` —
      payload create/replace luôn có kind.
- [x] `KernelSyllabusLessonRow` thêm `kind: "lesson" | "midterm" | "final" | string`
      (pattern `| string` forward-compat đang dùng cho status). Field
      **required** (mirror `status`) — test "snapshot không kind" ở phase 2
      viết bằng literal cast kèm comment version-skew, không làm kind optional.
- [x] Copy-on-import (`buildImportBatch`) giữ `kind: l.kind` — kind là nội dung
      giáo trình, KHÁCH `status` (vẫn reset `upcoming` như cũ).

## Implementation Steps

1. Sửa `packages/db/src/schema/syllabus.ts`: thêm
   `kind: text("kind").notNull().default("lesson")` vào `syllabusLesson`
   (đặt cạnh `status`, kèm docblock phân biệt kind=nội dung / status=tiến độ).
2. Chạy `pnpm db:generate` — commit migration `0014_*.sql` + meta snapshot
   được sinh ra; review file SQL là đúng 1 dòng ALTER TABLE ADD COLUMN.
3. Sửa `packages/api/src/contracts.ts` theo 4 Requirements ở trên.
4. Sửa `apps/server/src/routes/kernel.ts`:
   - POST `/syllabi` bulk insert lesson: thêm `kind: l.kind`.
   - POST `/syllabi/:id/replace-content`: insert lesson thêm `kind: l.kind`.
   - POST `.../lessons` (add): `kind: input.kind ?? "lesson"`.
   - POST `.../lessons/:lid` (edit): pre-read select thêm `kind`; set
     `kind: input.kind ?? lesson.kind` (mirror comment pattern của status).
   - `buildImportBatch`: thêm `kind: l.kind` vào insert.
5. Sửa `apps/server/src/routes/snapshot.ts`: push `kind: lesson.kind` vào
   lesson row của snapshot.
6. Test server (`apps/server/src/kernel.test.ts`) — thêm case:
   - Create syllabus kèm modules có lesson `kind: "midterm"` → snapshot trả
     đúng kind.
   - Edit lesson KHÔNG gửi kind → kind giữ nguyên; gửi `kind: "final"` → đổi.
   - Add lesson không kind → default `lesson`.
   - replace-content với kind mix (lesson/midterm/final) → snapshot đúng.
   - import-syllabus template có buổi thi → bản copy của lớp giữ kind, status
     vẫn reset `upcoming`.
7. Chạy regression: `pnpm --filter server test` (bao gồm
   `syllabus-template-migration.test.ts`) + `pnpm check-types`.

## Verification

- `pnpm check-types` xanh.
- `pnpm --filter server test` xanh, có assert mới cho kind ở cả 5 write path.
- (Vận hành, ngoài CI) target env dev/prod chạy `pnpm db:migrate:deploy` khi
  deploy — gate test dùng DB throwaway nên không phát hiện thiếu migrate ở
  target env (red-team #11).

## Risk Assessment

- Quên `buildImportBatch` → copy lớp mất kind (âm thầm, không lỗi) — test case
  6-b bắt buộc.
- Giá trị `kind` ngoài enum trong payload → zod `safeParse` 400 (readBody);
  key `kind` KHÔNG gửi → preserve. Lưu ý zod object non-strict **strip**
  unknown key chứ không 400 — hàng rào thực sự là enum trên giá trị, không
  phải strict-mode (red-team #7).
- Web gửi kind ở màn hình nào: màn hình syllabus (showKind=true) luôn gửi kind
  → kind trên màn hình này là **last-write-wins như title/objectives/materials**
  (app không có optimistic locking — snapshot stale có thể ghi đè kind của
  người khác, chấp nhận như special field còn lại; red-team #3). Màn hình lớp
  (showKind=false) phải KHÔNG gửi key → server preserve; guard test ở phase 2
  (unit payload) + phase 3 (e2e), red-team #6.

## Security Considerations

- Kind đi qua zod enum ở contract — không có injection path mới; không đổi auth
  (mọi route đã qua kernelCtx org guard).
