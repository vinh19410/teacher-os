# Phase 2 — Schema, migration và contract thư viện đề

## Context

`assignment_test` + `assignment_test_part` + `assignment_prompt` (org-scoped) hiện chứa mô hình đề. Thư viện toàn hệ thống theo precedent `vocab_library_*` (`packages/db/src/schema/vocab-library.ts`): không `orgId`, id do server sinh, bảng chỉ admin ghi. Contract câu hỏi/optionBank/type đã chuẩn hóa trong `packages/api/src/contracts.ts` (`ASSIGNMENT_PART_TYPES`, `ASSIGNMENT_TEST_PRESETS`, `assignmentPromptBaseSchema`).

## Requirements

### Bảng `library_test`
`id`, `title` (not null), `description`, `skill` (`reading`|`listening`, immutable sau tạo), `timeLimitSeconds` (default 3600), `collection`, `testGroup`, `status` (`draft`|`ready`, default `draft`), `createdBy` (user id, không FK cứng để xóa user không xóa đề), `createdAt`, `updatedAt`. Index `(skill, status)`.

### Bảng `library_test_part`
`id`, `testId` (FK cascade), `part` (`p1..p3` | `s1..s4`), `type`, `title`, `band`, `source`, `intro`, `passage`, `transcript`, `imageUrl`, `questions` (JSON text, default `[]`), `optionBank` (JSON text, default `[]`), `note`, audio: `audioKey`, `audioName`, `audioContentType`, `audioSize`, `audioUploadedAt` (đều nullable), `updatedAt`. Unique `(testId, part)`.

Ghi chú: cột giống `assignment_prompt` để clone sau này map 1-1; không copy các cột chỉ dùng cho Writing/Speaking (`task`, `genre`, `cueTopic`, `cuePoints`, `prompt`).

### Contract (`packages/api/src/library-contracts.ts`, file mới)
- `libraryTestCreateSchema` / `libraryTestUpdateSchema` (strict; `skill` chỉ có ở create).
- `libraryPartUpsertSchema`: tái dùng schema câu hỏi, `optionBank`, `imageUrl` đã có. Cần **export** `assignmentQuestionSchema` (hiện inline trong `assignmentPromptBaseSchema`) và hằng liên quan từ `contracts.ts`, KHÔNG nhân bản.
- Quy tắc chung `validatePartForReady(skill, part)`: reading cần passage + ≥ 1 câu có stem; listening cần ≥ 1 câu + audio; dạng image-based cần `imageUrl` + pin mọi câu; optionBank khớp dạng bankable. Hàm thuần, dùng cả server lẫn UI để `canSave` không lệch 400.
- `validateTestReady(skill, parts)`: đủ slot theo `ASSIGNMENT_TEST_PRESETS[skill]` (3 hoặc 4) và từng part qua `validatePartForReady`.
- DTO: `LibraryTestListItem` (kèm `partCount`, `questionCount`, `hasAllAudio`), `LibraryTestDetail`, `LibraryPartDto` (không lộ `audioKey`, chỉ `audio: {name,type,size,uploadedAt} | null`).
- `LIBRARY_AUDIO_MAX_BYTES` = 50MB; `LIBRARY_AUDIO_MIME` allowlist (mp3, m4a/mp4, wav, ogg, webm) tách từ map MIME audio có sẵn của Speaking (contracts ~dòng 1860–1880) để không lệch.
- `LIBRARY_ERROR_CODES` (`TEST_NOT_FOUND`, `PART_NOT_FOUND`, `NOT_READY`, `INVALID_AUDIO`, `AUDIO_TOO_LARGE`, ...).

## Files

Sửa: `packages/db/src/schema/index.ts` (export mới), `packages/api/src/contracts.ts` (chỉ thêm `export`), `packages/api/package.json` nếu export map cần entry `./library-contracts`.
Tạo: `packages/db/src/schema/library-test.ts`, `packages/db/src/migrations/0043_*.sql` (do `pnpm db:generate` sinh, tên theo drizzle), `packages/api/src/library-contracts.ts` + `library-contracts.test.ts`, `apps/server/src/library-test-migration.test.ts` (theo mẫu `syllabus-template-migration.test.ts`).

## Steps

1. Test đỏ cho `validatePartForReady`/`validateTestReady` (reading/listening, image-based, thiếu audio, thiếu slot).
2. Export `assignmentQuestionSchema` từ `contracts.ts` mà không đổi hành vi; chạy test contracts hiện có.
3. Viết schema Drizzle, chạy `pnpm db:generate`, đọc SQL sinh ra (chỉ `CREATE TABLE`/`CREATE INDEX`, không `ALTER` bảng cũ).
4. Viết `library-contracts.ts` + test.
5. Migration test: áp toàn bộ migration lên DB trống, chèn test+part, kiểm cascade và unique `(testId, part)`.

## Validation

```bash
pnpm --filter @teacher-os/api test
pnpm --filter server exec vitest run src/library-test-migration.test.ts
pnpm check-types && pnpm check
```

Pass khi: migration thuần cộng thêm, không đụng bảng cũ; mọi test contracts hiện có vẫn xanh; schema `ready` từ chối đúng các ca thiếu.

## Risks / Rollback

- Migration D1 chỉ `CREATE TABLE`, nên không cần backup dữ liệu cũ; vẫn dump DB local trước khi chạy `db:generate` theo rule an toàn dữ liệu.
- Rollback: `DROP TABLE library_test_part; DROP TABLE library_test;` ở một migration mới (bảng không bị bảng nào tham chiếu).
- Rủi ro lệch khi `contracts.ts` đổi sau này: đã chốt dùng một nguồn sự thật bằng export, không copy.
