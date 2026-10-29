# Phase 1 — DB Migration 0040, Seed & Contracts (deck description)

> Mục tiêu: lesson card kiểu mochivocab cần tên bài tiếng Việt đánh số ("84.Nhận thức của con người") bên dưới tên EN. CSV đã có cột `lessonDescription` nhưng `vocab_library_deck` chưa có cột tương ứng.

## 1.1 Schema (`packages/db/src/schema/vocab-library.ts`)

Thêm cột vào `vocabLibraryDeck` (sau `title`, trước `imageUrl`):

```ts
title: text("title").notNull(),
description: text("description"),
imageUrl: text("image_url"),
```

Additive 1 chiều — không recreate bảng, không đụng dữ liệu đang có (precedent `0039` là recreate vì gỡ FK; ở đây chỉ ADD COLUMN).

## 1.2 Migration `0040`

- Sinh migration bằng `pnpm --filter @teacher-os/db db:generate` (drizzle-kit, `meta/_journal.json` tự update; migration cuối là `0039_ambiguous_prowler.sql` → 0040 là số kế tiếp), nội dung bản chất:
  ```sql
  ALTER TABLE vocab_library_deck ADD COLUMN description text;
  ```
- Kiểm tra migration applies sạch trên DB local đang có dữ liệu library (`PRAGMA foreign_keys = ON`) và trên DB trống.

## 1.3 Seed (`packages/db/src/seed/vocab-library.ts`)

- Row-mapping deck hiện tại (~dòng 200–205): thêm `description: nullIfEmpty(row.lessonDescription)` (cột CSV `lessonDescription` — mapping cột đã đọc `lessonName`, `image` tại ~165–166, cần thêm `"lessonDescription"` nếu chưa có trong danh sách cột đọc).
- INSERT statement (~dòng 319–324): thêm `description` vào danh sách cột + tuple + `ON CONFLICT ... DO UPDATE SET ... description = excluded.description`.
- Verify counts không đổi (description không ảnh hưởng id-set). Re-seed là **bắt buộc** sau migration để đổ description (upsert idempotent, an toàn chạy lại).

## 1.4 Contracts (`packages/api/src/contracts.ts`)

`.strict()` additive 1 chiều — runtime strict-parse ở client (`apps/student/src/lib/repos/vocab.ts` gọi `.parse()`), nên server + client **phải cùng release train**:

- `vocabLibraryDeckSchema` (teacher, ~dòng 2317): thêm `description: z.string().nullable()` (sau `title`).
- `vocabStudentLibraryDeckSchema` (~dòng 2416): thêm `description: z.string().nullable()` (sau `title`).

## 1.5 Server producers

Chỉ có đúng 2 producer (đã xác nhận red-team), cả hai đều `db.select().from(vocabLibraryDeck)` select toàn cột → cột mới tự flow, chỉ cần thêm vào object map response:

- `apps/server/src/routes/vocab.ts:548` (route `GET /vocab/library/courses/:courseId/decks`, def tại :444) — student payload map.
- `apps/server/src/routes/vocab-library.ts:135` — teacher library decks payload map.

## 1.6 Test fixtures sẽ đỏ (biết trước, sửa cùng PR)

- `packages/api/src/vocab-contracts.test.ts:291-299` + `:587-607` — safeParse fixture thiếu `description`.
- `apps/server/src/routes/vocab-library.test.ts:291-309` — `toEqual` exact shape.
- `apps/server/src/routes/vocab.test.ts:1310-1331` — `toEqual` exact shape.

## 1.7 Local reseed + verify

```bash
# tìm file DB local (.alchemy/local, tên file sqlite hash-dài — memory vocab-library-local-seed)
npx -y tsx packages/db/scripts/seed-vocab-library.ts --file <local-db> --verify
```

Spot-check: `SELECT id, title, description, image_url FROM vocab_library_deck WHERE course_id='libcourse-1' ORDER BY sort_order LIMIT 5;` — kỳ vọng description = "1.Trường học"… **giữ nguyên chuỗi CSV nguyên văn (đã chứa prefix số "N.")** — UI render nguyên văn như mochivocab, tuyệt đối KHÔNG thêm prefix `sortOrder.` khi render (tránh nhân đôi số — finding B1).

## Success Criteria

- [x] Migration 0040 apply sạch cả 2 trường hợp (DB có sẵn / DB trống), `PRAGMA foreign_keys = ON` không lỗi.
- [x] Re-seed local: verify counts OK; `description` khác NULL cho deck có CSV `lessonDescription`.
- [x] `pnpm --filter @teacher-os/api test` pass sau khi cập nhật 2 fixture ở §1.6.
- [x] `pnpm --filter server test` pass sau khi cập nhật 2 fixture ở §1.6; response `GET /api/student/vocab/library/courses/libcourse-1/decks` chứa `description` mỗi deck.
- [x] `pnpm --filter @teacher-os/db test` pass (thêm assertion description nếu suite seed có test).

## Files Owned

- `packages/db/src/schema/vocab-library.ts`
- `packages/db/src/migrations/0040_*.sql` + `meta/_journal.json`
- `packages/db/src/seed/vocab-library.ts`
- `packages/db/scripts/seed-vocab-library.ts` (nếu cần đổi CLI flag — kỳ vọng không)
- `packages/api/src/contracts.ts`
- `packages/api/src/vocab-contracts.test.ts` (2 fixture §1.6)
- `apps/server/src/routes/vocab.ts`, `apps/server/src/routes/vocab-library.ts`
- `apps/server/src/routes/vocab.test.ts`, `apps/server/src/routes/vocab-library.test.ts` (2 fixture §1.6)
