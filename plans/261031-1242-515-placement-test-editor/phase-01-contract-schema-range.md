---
phase: 1
title: "Contract, schema và Range cho kho audio"
status: pending
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 1: Contract, schema và Range cho kho audio

## Goal

Có contract dùng chung cho nháp và bản phát hành, hai bảng mới, và `MediaStore` đọc được một đoạn byte.

## Files to Create / Modify

- Create: `packages/api/src/placement-test-contracts.ts`, `packages/api/src/placement-test-contracts.test.ts`
- Create: `packages/db/src/schema/placement-test.ts`, migration `packages/db/src/migrations/0058_*.sql`
- Modify: `packages/db/src/schema/index.ts`, `packages/api/package.json` (export)
- Modify: `apps/server/src/lib/media-store.ts`, `apps/server/src/lib/r2-media-store.ts`, `apps/e2e/src/fs-media-store.ts`

## Tasks & Steps

1. Contract, giữ đúng shape mà `grading.js` đang đọc:
   - `placementQuestionSchema`: `id`, `level`, `prompt`, `options` là tuple 4 chuỗi, `answer` là `0..3` hoặc `null`. Câu Vocab + Grammar có thêm `kind` (`grammar` | `vocab`).
   - `placementClipSchema`: `id`, `audioId` hoặc `null`, `maxPlays` `1..5` mặc định 2, `level`, `title`, `questions`.
   - `placementContentSchema`: `bands` (`min`, `max`, `cefr`, `course`) và `parts` là tuple đúng hai phần `vocab-grammar`, `listening`.
   - Schema chỉ kiểm shape và trần kích thước (`prompt` tối đa 1000 ký tự, đáp án 300, tối đa 100 câu, 20 đoạn, 8 ngưỡng), nên nháp dở vẫn lưu được.
2. `validatePlacementForPublish(content)` trả danh sách `{ path, message }` tiếng Việt: mỗi phần có ít nhất 1 câu; `prompt` và 4 đáp án không rỗng, không trùng nhau; `answer` đã chọn; id câu và id đoạn duy nhất; mỗi đoạn có `audioId` và ít nhất 1 câu; ngưỡng liên tục từ 0 đến tổng số câu, không hở không chồng; `course` thuộc `LEAD_COURSES`; `cefr` không rỗng. Server và web dùng chung hàm này.
3. `buildPlacementSnapshot(content, version)` dựng payload công khai: `bands` có `courseLabel` lấy từ `LEAD_COURSE_LABELS`; mỗi đoạn có `src: /public/placement-test/audio/<audioId>`, bỏ `audioId`. Dựng theo allowlist field nên không có field lạ nào lọt ra.
4. Schema DB:
   - `placement_test`: `org_id` PK, FK `organization` cascade; `draft` text; `published` text nullable; `revision` integer; `published_version` integer mặc định 0; `published_at`, `published_by`, `updated_at`.
   - `placement_test_audio`: `id`, `org_id`, `object_key`, `name`, `content_type`, `size`, `created_at`; index theo `org_id`.
   - Sinh migration bằng `pnpm db:generate`. `readiness.ts` tự nhận bảng mới, không phải sửa.
5. `MediaStore.get(key, range?)` với `range: { offset, length }`. `StoredMedia` có thêm `range` tùy chọn. Adapter R2 truyền `{ range }` vào `bucket.get`; adapter FS dùng `createReadStream` có `start`, `end`. Store test dạng Map không cần sửa vì tham số là tùy chọn.

## Verification

- `pnpm --filter @teacher-os/api test placement-test-contracts`: ngưỡng hở, ngưỡng chồng, ngưỡng không tới tổng điểm, course lạ, đáp án trùng, thiếu `answer`, đoạn thiếu audio, snapshot không chứa `audioId`.
- `pnpm check-types` qua; adapter FS đọc đúng đoạn byte đầu, giữa, cuối.
