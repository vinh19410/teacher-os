---
phase: 3
title: "Phase 3: Bộ đề — API org & thư viện hệ thống"
status: pending
priority: P1
effort: "4h"
dependencies: [1, 2]
---

# Phase 3: Bộ đề — API org & thư viện hệ thống

## Goal

CRUD bộ đề cho giáo viên (org), danh mục bộ đề thư viện hệ thống đọc được bởi mọi org, admin quản lý bộ đề hệ thống, và thao tác "nhân bản về org".

## Files

- Create: `apps/server/src/routes/study-pack.ts` (+ `.test.ts`), `apps/server/src/lib/study-pack-clone.ts` (+ test)
- Modify: `apps/server/src/routes/kernel.ts` (mount, theo mẫu mount của route `self-study-plan` đã có), `apps/server/src/routes/admin-library.ts` hoặc file admin mới (route ghi hệ thống, theo `require-admin.ts`)
- Create (nếu chọn nguồn `library_exercise`): bảng thư viện bài grammar/vocabulary cho admin (cùng cột subset `assignment_prompt`, không `org_id`) — thêm vào migration 0060 của phase 1 trước khi merge
- Create: `apps/admin/src/routes/_auth/library/packs/*` (form + import JSON), `apps/web/src/lib/repos/study-pack.ts`

## API

- Org (role gate `canPublishGrade` cho ghi, `canReviewGrade` cho đọc; `readBody` 415/400 như mẫu cũ):
  - `GET /api/study-packs` (pack org + pack hệ thống `ready`, có `scope`), `GET /api/study-packs/:id`
  - `POST /api/study-packs`, `PUT /api/study-packs/:id`, `DELETE /api/study-packs/:id` (chặn xoá khi còn `class_study_pack` active)
  - `POST /api/study-packs/:id/clone` (pack hệ thống → pack org, dùng `clone` ở dưới)
- Admin: ghi `study_pack` với `org_id IS NULL`, mọi item phải `ready`.
- Validation chung: item chỉ `reading|listening|grammar|vocabulary`; `org_prompt` phải thuộc org và `ready`; tối đa `MAX_PACK_ITEMS_PER_DAY`/ngày, `MAX_PACK_DAYS` ngày; pack `ready` cần ≥ 1 item.

## Clone (`study-pack-clone.ts`)

- Hàm thuần `materializePrompts(db, orgId, items)`: với mỗi item thư viện → insert `assignment_prompt(ready)` vào org với `library_ref = "<kind>:<id>"`, `onConflictDoNothing` trên unique `(org_id, library_ref)`, trả map `item → promptId`. Dùng lại ở phase 4 khi gán trực tiếp pack hệ thống.
- **Xác minh audio listening trước khi code**: đọc `admin-library-audio` + `getLibraryAudioStore` để biết có copy được audio key sang org không; nếu không thì item listening hệ thống bị chặn với lỗi rõ và ghi lại ở câu hỏi mở.

## Tests

Quyền (ta/giáo viên/org khác), tenant isolation, từ chối writing/speaking, clone idempotent (gọi 2 lần → 1 prompt), pack hệ thống không sửa được từ route org.

## Verify

`pnpm --filter server test -- study-pack`, `pnpm --filter admin test`, `pnpm check-types`.
