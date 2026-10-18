# Scout Report — Built-in Vocabulary Courses (Library + Clone-on-Assign)

Ngày: 2026-10-18 · Mode: hard · Nguồn: Explore agent scan codebase + phân tích CSV `raw-data/`

## 1. Master data (`raw-data/`, untracked, ~4MB)

| File | Rows | Ghi chú |
|---|---|---|
| `courses.csv` | 20 | cột: `id, courseName, courseDescription, courseTarget, order, createdAt, updatedAt` |
| `lessons.csv` | 968 | cột: `id, lessonName, lessonDescription, image, order, courseId, ...` — image là URL remote mochidemy |
| `lesson_details.csv` | 10.160 | cột: `id, lessonDetailId, content (word), phonetic (IPA), position (n/v/adj/phrase), trans, sentenceVi, sentenceEn, picture (URL), audio (URL), lessonId, courseId, ...` |

Thống kê (python csv parse chuẩn, có quoting):
- Referential integrity hoàn hảo: 0 orphan detail, 0 lesson trống, 0 course lạ.
- Từ/lesson: max 16, median 10, p95 12 → clone 1 lesson luôn < cap 500 nodes của precedent syllabus.
- Lessons/course: max 130 (course 15 PHRASAL VERB & IDIOM) → UI chọn lesson cần search/scroll.
- Audio: 100% từ có audio URL (remote `mochien3.1-api.mochidemy.com`, public, không auth).
- Picture: 7017/10160 thiếu (69%) → picture là optional, không được倚 làm UI bắt buộc.
- Toàn bộ 20 courses: 1000 TỪ CƠ BẢN, IELTS CƠ BẢN, CỤM TỪ IELTS CƠ BẢN, IELTS NÂNG CAO, NEW TOEIC, PHRASAL VERB & IDIOM, CỤM TỪ ÔN THI THPT QG, TIẾNG ANH 11/12 MỚI, TIẾNG ANH LỚP 6-12, TIẾNG ANH CÔNG SỞ, TIẾNG ANH DU LỊCH, TIẾNG ANH CNTT.

⚠️ CSV chứa giá trị có dấu phẩy trong quotes (`"Thực hiện, thể hiện"`) — mọi parser phải dùng CSV chuẩn, không awk/naive split.

## 2. Vocab SRS hiện trạng (vừa ship #359)

Schema `packages/db/src/schema/vocab.ts`:
- `vocab_deck` (:21): `orgId` **NOT NULL** FK organization (cascade), `classId` **NOT NULL** FK class (cascade), `title`, `lang` default "en". Không có unique constraint.
- `vocab_word` (:52): `deckId` FK cascade, `word`, `ipa` nullable, `translation`, `audioKey` nullable (R2, server sinh `vocab/{orgId}/{wordId}/{uuid}` khi teacher upload), `sortOrder`.
- `vocab_card` (:85): SRS state/student, UNIQUE `(studentId, wordId)`.
- `vocab_review_log` (:124): PK = clientLogId, snapshot word/translation, không FK.

Migrations: `packages/db/src/migrations/` — mới nhất **`0036_bored_infant_terrible.sql`** (tạo 4 bảng vocab). Generate qua `pnpm db:generate` trong packages/db.

Teacher API `apps/server/src/routes/vocab-teacher.ts` (mount `/api/kernel/vocab`, kernel.ts:2109):
- GET `/decks/:deckId/words` :71 · POST `/decks` :121 (bắt buộc `classId`) · `/decks/rename` :161 · `/decks/delete` :198 (db.batch) · `/words/upsert` :249 · `/words/remove` :309 · PUT `/words/:wordId/audio` :343 (upload R2) · GET audio :430.

Org-scoping = query filter thủ công, không middleware/RLS: `kernelCtx = {orgId, userId}` do `bootstrapMiddleware` set (app.ts:83–141). Mọi query `and(eq(deck.id), eq(deck.orgId, ctx.orgId))`.

Snapshot read-path teacher: snapshot.ts:311–318, 590–596 — chỉ `vocabDecks` + `wordCount`; words đọc per-deck.

Student: routes bên trong `studentRoutes()` (student.ts:1845, mount `/api/student`): routes/vocab.ts — GET `/vocab/overview` :171, `/vocab/decks/:deckId/session-data` :362, POST `/vocab/answer` :382, `/vocab/learn-commit` :509, GET `/vocab/audio/:wordId` :625. Học sinh vào deck qua enrollment check + lazy provision `ensureDeckCards` (apps/server/src/lib/vocab-provision.ts:29–60).

UI:
- Teacher: `apps/web/src/routes/_auth/classes/$classId.tsx:289` tab "Từ vựng" (`<VocabDeckList classId>`); components `apps/web/src/components/vocab/vocab-deck-list.tsx`, `vocab-deck-editor.tsx`, `vocab-word-row.tsx`; mutations `apps/web/src/lib/repos/kernel.ts:278–303`.
- Student: `apps/student/src/routes/_auth/vocab/index.tsx`, `$deckId.tsx`, `$deckId.session.tsx`; components minigame `prompt-*`; client `apps/student/src/lib/repos/vocab.ts` (:29 :45 :62 :80 :100).
- Contracts zod: `packages/api/src/contracts.ts`. SRS engine `packages/api/src/srs/`. E2E: `apps/e2e/specs/vocab-srs.spec.ts`.

## 3. Precedents tái dùng

- **Syllabus template (#79)**: `classId` nullable = template dùng chung (`syllabus_class_unique` partial unique, schema/syllabus.ts:34–47), `sourceTemplateId` provenance :40. Template vẫn **org-scoped** — KHÔNG tồn tại cơ chế content global xuyên org nào trong repo → phải tạo mới.
- **Clone-on-import**: POST `/classes/:id/import-syllabus` (kernel.ts:774) → `buildImportBatch` (kernel.ts:236–300): deep-copy UUID mới trong 1 `db.batch`, reset status, guard `MAX_IMPORT_NODES = 500` (kernel.ts:227).
- **CSV parse client-side**: `apps/web/src/lib/syllabus-import.ts` (`parseSyllabusFile` :227, cap 500 :12).
- **Data trong migration**: precedent `0009_syllabus_template_discriminator.sql` (INSERT backfill nhỏ). Không có seed script/boot-seed — nạp 10k rows là cơ chế mới.
- **Dev endpoint wrapper precedent**: `POST /dev/bank-hub/mock-transaction` (9eb84db).

## 4. Rủi ro chính (đã xác minh)

1. `vocab_deck.orgId` + `classId` đều NOT NULL → catalog global **không thể** nhét vào `vocab_deck` mà không nullable hóa 2 cột + sửa rải rộng mọi query org-scoped (rủi ro cao trên flow đã ship #359, IDOR surface). → Nên dùng **bảng library riêng**.
2. Audio/picture là URL remote CDN mochidemy; `vocab_word.audioKey` là key R2 org-scoped. Minigame `listeningChoice` chỉ eligible khi có `audioKey` → nếu clone không giải quyết audio thì built-in deck mất hoàn toàn minigame nghe. Cần nhánh audio-URL (proxy qua server hoặc client load trực tiếp) hoặc tải R2 lúc seed.
3. Org-scoping thuần query filter — endpoint library mới phải tự bảo đảm: catalog read cho mọi org (yêu cầu đề), clone viết vào đúng org của caller + class thuộc org đó.
4. Seed 10.160 rows: migration SQL 4MB khó maintain; cần script idempotent (deterministic PK) chạy local (sqlite `.alchemy/local`) + prod (D1 — infra dùng alchemy, packages/infra).

## 5. Quyết định kiến trúc cần planner chốt (đã có khuyến nghị)

1. **Global catalog = bảng riêng** `vocab_library_course` / `vocab_library_deck` / `vocab_library_word` (không orgId) — khuyến nghị mạnh, lý do mục 4.1. Không sửa anything trên query vocab hiện có.
2. **Clone granularity**: teacher chọn 1 hoặc nhiều lesson-deck thêm vào class; "thêm cả khóa" = bulk nhiều deck. Deck clone là `vocab_deck` thường (orgId + classId của caller), students học như deck thường.
3. **Provenance**: thêm `vocab_deck.sourceLibraryDeckId` (nullable) — badge UI + chống import trùng lặp nhầm.
4. **Audio strategy**: thêm cột remote URL vào library word + vocabulary clone; eligibility listeningChoice tính cả audioKey || audioUrl. Chi tiết exact mechanism (proxy vs direct) planner đọc routes/vocab.ts:625 + session-data để chốt.
5. **Word fields**: `vocab_word` mở rộng cột nullable (pos, sentenceVi, sentenceEn, pictureUrl, audioUrl) chỉ nếu minigames/UI tiêu thụ; giữ data đủ ở library để dùng sau.
6. **Seed mechanism**: script Node idempotent đọc CSV từ repo; runbook local + prod (D1 REST / wrangler). Planner khảo sát packages/infra để chốt phương án prod.
