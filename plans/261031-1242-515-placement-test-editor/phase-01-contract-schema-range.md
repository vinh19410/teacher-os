---
phase: 1
title: "Contract, schema và Range cho kho audio"
status: completed
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

<!-- Updated: Red Team Review - bound string/id/uuid schemas, add extractReferencedAudioIds, add published_revision, clarify MediaStore range end index -->
1. Contract (`packages/api/src/placement-test-contracts.ts`), giữ đúng shape mà `grading.js` đang đọc:
   - `placementQuestionSchema`: `id` (`/^[a-zA-Z0-9_-]{1,64}$/`), `level` (trim, tối đa 20 ký tự), `prompt` (tối đa 1000 ký tự), `options` là tuple 4 chuỗi (mỗi chuỗi tối đa 300 ký tự), `answer` là số nguyên `0..3` hoặc `null`. Câu Vocab + Grammar có thêm `kind` (`grammar` | `vocab`).
   - `placementClipSchema`: `id` (`/^[a-zA-Z0-9_-]{1,64}$/`), `audioId` (`z.string().uuid().nullable()`), `maxPlays` nguyên `1..5` mặc định 2, `level` (tối đa 20 ký tự), `title` (tối đa 200 ký tự), `questions` (mảng câu hỏi).
   - `placementContentSchema`: `bands` (`min`, `max` nguyên không âm, `cefr` tối đa 20 ký tự, `course` chuỗi tối đa 64 ký tự, tối đa 8 ngưỡng) và `parts` là tuple đúng hai phần `vocab-grammar` (tối đa 100 câu), `listening` (tối đa 20 đoạn, mỗi đoạn tối đa 20 câu, tổng số câu toàn đề tối đa 100).
   - Schema chỉ kiểm shape và trần kích thước nên nháp dở vẫn lưu được.
2. `validatePlacementForPublish(content)` trả danh sách `{ path, message }` tiếng Việt: mỗi phần có ít nhất 1 câu; tổng số câu <= 100; `prompt` và 4 đáp án không rỗng, 4 đáp án trong một câu không trùng nhau (so sánh sau `trim()`); `answer` đã chọn (`0..3`); id câu và id đoạn duy nhất toàn đề; mỗi đoạn có `audioId` hợp lệ và ít nhất 1 câu; ngưỡng liên tục từ 0 đến tổng số câu (`bands[0].min === 0`, `bands[i].min <= bands[i].max`, `bands[i].min === bands[i-1].max + 1`, `bands[last].max === totalQuestions`), không hở không chồng; `course` thuộc `LEAD_COURSES`; `cefr` không rỗng. Server và web dùng chung hàm này.
3. `buildPlacementSnapshot(content, version)` dựng payload công khai: `version`, `bands` có thêm `courseLabel` lấy từ `LEAD_COURSE_LABELS`; mỗi đoạn có `src: /public/placement-test/audio/<audioId>`, bỏ `audioId`. Dựng theo allowlist field nên không có field lạ nào lọt ra. Thêm helper `extractReferencedAudioIds(draftJson: string | null, publishedJson: string | null): Set<string>` đọc cả `clip.audioId` trong `draft` lẫn `<audioId>` từ `clip.src` (`/public/placement-test/audio/<audioId>`) trong `published` để D11 dọn audio không xóa nhầm file đang phát hành.
4. Schema DB (`packages/db/src/schema/placement-test.ts`):
   - `placement_test`: `org_id` PK, FK `organization.id` cascade; `draft` text nullable; `published` text nullable; `revision` integer not null mặc định 0; `published_revision` integer nullable; `published_version` integer not null mặc định 0; `published_at` integer timestamp nullable, `published_by` text FK `user.id` set null, `updated_at` integer timestamp not null.
   - `placement_test_audio`: `id` text PK, `org_id` text not null FK `organization.id` cascade, `object_key` text not null, `name` text not null, `content_type` text not null, `size` integer not null, `created_at` integer timestamp not null; index `placement_test_audio_org_id_idx` theo `org_id`.
   - Xuất từ `packages/db/src/schema/index.ts` và sinh migration `0058_*.sql` bằng `pnpm db:generate`. `readiness.ts` tự nhận bảng mới.
5. `MediaStore.get(key, range?)` với `range?: { offset: number; length: number }`. `StoredMedia` có thêm `range?: { offset: number; length: number }`. Adapter R2 truyền `range ? { range } : undefined` vào `bucket.get` và trả kèm `range`; adapter FS (`apps/e2e/src/fs-media-store.ts`) dùng `createReadStream(pathFor(key), range ? { start: range.offset, end: range.offset + range.length - 1 } : undefined)` và trả kèm `range`.

## Verification

- Verify: `pnpm --filter @teacher-os/api test placement-test-contracts` exits 0 (kiểm ngưỡng hở, ngưỡng chồng, ngưỡng không tới tổng điểm, course lạ, đáp án trùng, thiếu `answer`, đoạn thiếu audio, snapshot không chứa `audioId`, `extractReferencedAudioIds` lấy đúng id từ cả `draft` và `published`).
- Verify: `pnpm check-types` exits 0; test adapter FS đọc đúng đoạn byte đầu, giữa, cuối.

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
