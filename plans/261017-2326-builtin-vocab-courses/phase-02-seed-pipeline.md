---
title: "Phase 2: Seed Pipeline"
status: todo
priority: P1
effort: 6h
dependencies: ["phase-01"]
---

# Phase 2: Seed Pipeline

## Overview

Script idempotent nạp 3 CSV master data (20 courses / 968 lessons / 10.160 words) vào 3 bảng library, chạy được ở 3 môi trường: sqlite local của alchemy dev, libsql của e2e boot, và D1 staging/prod qua REST API. Core seed sống trong `packages/db/src/seed/` để cả CLI lẫn `apps/e2e/src/boot.ts` import chung một code path — e2e luôn chạy đúng logic seed như prod.

## Context Links

- Scout report mục 1 (CSV stats) và mục 4.4 (rủi ro seed 10k rows).
- CSV columns (verify bằng `head -1`): `raw-data/courses.csv` (`id,courseName,courseDescription,courseTarget,order,createdAt,updatedAt`), `raw-data/lessons.csv` (`id,lessonName,lessonDescription,image,order,courseId,...`), `raw-data/lesson_details.csv` (`id,lessonDetailId,content,phonetic,position,trans,sentenceVi,sentenceEn,picture,audio,lessonId,courseId,...`).
- Giá trị CSV có dấu phẩy trong quotes (scout: `"Thực hiện, thể hiện"`) — parser phải RFC4180.
- Export map `packages/db/package.json` (`./*` → `./src/*.ts`) nên seed core đặt ở `packages/db/src/seed/vocab-library.ts` sẽ import được dạng `@teacher-os/db/seed/vocab-library` (e2e đã depend `@teacher-os/db` — `apps/e2e/package.json`).
- CLI precedent không cần dep mới: `npx -y tsx` theo usage comment `apps/server/scripts/backfill-date.ts:16`.
- `papaparse` ^5.7.0 đã có trong `apps/web/package.json:31` — parser RFC4180 đã được repo tin dùng.
- Prod auth: `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` là secret chuẩn của operator (`docs/production-release-runbook.md:77-78`); D1 database id nằm ở dashboard/alchemy state (cùng tài liệu, dòng "D1 database IDs"). Repo KHÔNG có wrangler (grep toàn bộ package.json).

## Key Insights

- **Một core, ba transport**: hàm seed nhận một `SqlRunner` (interface `run(statements: string[]): Promise<void>`) nên cùng bộ SQL chạy trên `@libsql/client` (local + e2e) và D1 REST `/query` (prod). Thiết kế mặc định là **1 HTTP call = 1 statement** (mỗi chunk một INSERT duy nhất): drizzle-kit `d1-http` migrate cũng loop per-statement sau khi split theo `--> statement-breakpoint` (drizzle-kit 0.31.10 `bin.cjs:79488-79550`) — không có căn cứ để assum multi-statement per call. Hệ quả: seed prod là chuỗi commit per-chunk, KHÔNG atomic — chạy lại được nhờ idempotent upsert; `--verify` exit 0 là điều kiện hoàn tất (browse trả rỗng an toàn khi thư viện chưa xong). <!-- Updated: Red Team Session 1 - bỏ claim multi-statement sai -->
- **Escaped literals thay vì bound params**: D1 giới hạn bound params per query (~100); 10.160 dòng × 7 cột qua param sẽ phải chunk 12 dòng/statement (~850 HTTP calls). Inline literal escape `'` → `''` cho phép statement 100-200 dòng (~30-60KB, dưới limit 100KB/statement) → vài chục calls. Data do CSV trong repo kiểm soát, vẫn escape chuẩn.
- **Idempotency = deterministic PK + upsert**: `INSERT INTO ... ON CONFLICT(id) DO UPDATE SET` các cột nội dung. Chạy lại cập nhật mô tả/audio mới mà không đổi id → deck đã clone (`sourceLibraryDeckId` trỏ vào) không đứt tham chiếu.
- **Chunk theo byte, không theo dòng**: chia statement đến khi vượt ~50KB rồi cắt — an toàn với dòng dài (sentence dài, URL dài).
- **Boot e2e tự seed**: `apps/e2e/src/boot.ts:75-85` wipe `local.db` rồi migrate thật; chèn 1 lệnh gọi seed core ngay sau migrate → mọi run e2e có thư viện deterministic, đồng thời test liên tục code seed thật (thay vì mini-seed song song sẽ trôi).
- **CSV vào repo**: copy 3 file sang `packages/db/seed-data/vocab-library/` và commit (seed phải tái lập được từ clone git). `raw-data/` hiện untracked và KHÔNG bị ignore (`git status` → `?? raw-data/`); thêm `raw-data/` vào `.gitignore` để tránh ai đó vô tình commit bản trùng 4MB.

## Requirements

- [ ] Seed core `packages/db/src/seed/vocab-library.ts`: parse 3 CSV (papaparse), assert cột bắt buộc tồn tại **và uniqueness key** (`new Set(ids).size === rows.length` cho cả 3 CSV — throw với message nêu rõ cột key), build deterministic rows, sinh SQL upsert chunked, expose `seedVocabLibrary(runner)` + `verifyCounts(runner)`.
- [ ] `verifyCounts` so **id-set** (SELECT id per bảng, đối chiếu tập id từ CSV), không chỉ tổng count — bắt được re-export vừa thêm vừa xoá cùng số row. <!-- Updated: Red Team Session 1 - verify theo id-set -->
- [ ] CLI `packages/db/scripts/seed-vocab-library.ts`: cờ `--file <sqlite-path>` (libsql), `--d1` (REST qua env), `--prune` (DELETE theo prefix `libcourse-`/`libdeck-`/`libword-` trước insert — gỡ row đã xoá khỏi CSV mới), `--verify` (in bảng đối chiếu expected vs actual), exit non-zero khi lệch.
- [ ] `papaparse` thêm vào `packages/db` devDependencies; KHÔNG thêm dep parser nào khác.
- [ ] **vitest vào packages/db** (hiện chưa có — `packages/db/package.json` không có devDep vitest hay script `test`): thêm `vitest` + `@teacher-os/config` (tsconfig) + script `"test": "vitest run"` theo pattern `packages/api/package.json:11,20`; không có script này thì root `pnpm test` (turbo) bỏ qua seed test mãi mãi. <!-- Updated: Red Team Session 1 - vitest gate -->
- [ ] 3 CSV committed tại `packages/db/seed-data/vocab-library/`; `.gitignore` thêm `raw-data/`.
- [ ] Test unit cho parser/upsert (sqlite tmp): quoted commas, idempotency chạy 2 lần, counts đúng, uniqueness key.
- [ ] Runbook local + prod viết trong README ngắn `packages/db/scripts/README-seed-vocab-library.md`; **runbook prod có gate giấy phép**: seed `--d1` vào PROD chỉ chạy sau khi Open Question 1 của plan.md (xác nhận quyền dùng nội dung mochidemy) được owner resolves — staging tự do. <!-- Updated: Red Team Session 1 - license gate -->

## Architecture

```
packages/db/
  seed-data/vocab-library/   courses.csv, lessons.csv, lesson_details.csv (committed)
  src/seed/vocab-library.ts  export { seedVocabLibrary, verifyCounts, EXPECTED_COUNTS }
  scripts/seed-vocab-library.ts  CLI: arg parse + transport chọn runner
  scripts/README-seed-vocab-library.md  runbook
```

Mapping CSV → bảng:

| CSV | Bảng | Mapping chính |
|---|---|---|
| courses.csv | vocab_library_course | id → `libcourse-{id}`, courseName → name, courseDescription → description, courseTarget → target, order → sortOrder |
| lessons.csv | vocab_library_deck | id → `libdeck-{id}`, courseId → `libcourse-{courseId}`, lessonName → title, image → imageUrl, order → sortOrder |
| lesson_details.csv | vocab_library_word | **`id` → `libword-{id}`** (KHÔNG dùng `lessonDetailId` — cột này KHÔNG unique: 8.728/10.160, đo 2026-10-18; `id` unique đủ 10.160), lessonId → `libdeck-{lessonId}`, content → word, phonetic → ipa, position → pos, trans → translation, sentenceVi/sentenceEn/picture/audio → sentenceVi/sentenceEn/pictureUrl/audioUrl, order → sortOrder |

Verify expected: `{ course: 20, deck: 968, word: 10160 }`.

## Related Code Files

- Create: `packages/db/seed-data/vocab-library/*.csv` (copy từ `raw-data/`), `packages/db/src/seed/vocab-library.ts`, `packages/db/scripts/seed-vocab-library.ts`, `packages/db/scripts/README-seed-vocab-library.md`, `packages/db/src/seed/vocab-library.test.ts`.
- Modify: `packages/db/package.json` (devDep papaparse + @types/papaparse + vitest + @teacher-os/config, script `test`), `.gitignore` (thêm `raw-data/`), `apps/e2e/src/boot.ts` (gọi seed sau migrate — chỉnh nhỏ, owner phase này; Phase 5 chỉ tiêu thụ).
- Đọc thôi: `apps/server/scripts/backfill-date.ts` (CLI precedent), `docs/production-release-runbook.md`.

## Implementation Steps

1. Copy CSV: `mkdir -p packages/db/seed-data/vocab-library && cp raw-data/*.csv packages/db/seed-data/vocab-library/`. Kiểm tra `git check-ignore packages/db/seed-data/vocab-library/courses.csv` phải KHÔNG bị ignore.
2. Thêm `papaparse` + `@types/papaparse` vào devDependencies của `packages/db/package.json` (catalog version khớp apps/web nếu có), chạy `pnpm install`.
3. Viết seed core: parse bằng papaparse (`header: true, skipEmptyLines: true`), assert cột bắt buộc tồn tại + uniqueness id (cả 3 CSV), build 3 mảng rows theo mapping, sinh SQL `INSERT INTO ... VALUES (...), (...) ON CONFLICT(id) DO UPDATE SET ...` chunk ≤ 50KB — **mỗi chunk đúng 1 statement** (tương thích D1 REST single-statement), escape `'` → `''`. Export `EXPECTED_COUNTS` và `verifyCounts` (SELECT COUNT(*) + SELECT id đối chiếu id-set với CSV).
4. Viết CLI: `--file` dùng `createClient({ url: "file:" + path })` + `client.batch(statements, "write")`; `--d1` đọc `CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN` từ env, POST `https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{id}/query` với `{ sql }` **per chunk (1 statement)**, check `success: true` trong response, retry 1 lần khi 5xx/network rồi mới fail; `--prune` chạy DELETE theo prefix id; `--verify` chỉ chạy counts + id-set và in bảng đối chiếu, exit 1 khi lệch. Usage header comment theo `backfill-date.ts:5-17`.
5. Setup vitest cho packages/db: script `"test": "vitest run"`, devDeps `vitest` + `@teacher-os/config`, vitest.config.ts theo pattern `packages/api`. Test unit với libsql tmp file (`:memory:` không hỗ trợ batch session tốt — dùng tmp dir như e2e): seed 2 lần liên tiếp counts không đổi; dòng CSV có dấu phẩy trong quotes giữ nguyên giá trị; sai thiếu cột → throw message rõ; id trùng trong CSV → throw.
6. Chạy thật local: `npx -y tsx packages/db/scripts/seed-vocab-library.ts --file <sqlite-alchemy-local> --verify`. Path sqlite local: `find packages/infra/.alchemy/local -path "*d1/*" -name "*.sqlite" ! -name "metadata.sqlite"` — CÂY THƯ MỤC CÓ 5 file `.sqlite` (metadata của alchemy/miniflare, R2 index, cache) nhưng chỉ file hash dưới `d1/` là DB thật; chọn nhầm sẽ ghi hỏng state dev stack. Trước khi seed, verify schema: `SELECT name FROM sqlite_master WHERE type='table' AND name='organization'` phải trả 1 row. Chạy khi dev stack đang tắt để tránh khóa sqlite. <!-- Updated: Red Team Session 1 - pin đúng sqlite file -->
7. Viết runbook: local (bước 6), e2e (tự động qua boot), prod/staging (bước `--d1` sau khi `pnpm deploy` áp migration 0037, kèm lệnh verify và cảnh báo không commit database id). **Runbook prod mở đầu bằng gate: "Open Question 1 (giấy phép) đã được owner xác nhận" — chưa xác nhận thì dừng ở staging.** Smoke test `--d1` trên staging là bước bắt buộc trước khi ghi runbook prod là hoàn chỉnh.
8. Sửa `apps/e2e/src/boot.ts`: sau `await migrate(...)` (boot.ts:85) gọi `seedVocabLibrary` với runner libsql của boot; giữ fail-loud nhưng log message chỉ đường rõ ràng (`[vocab-library-seed] failed — every spec will fail; check CSV/EXPECTED_COUNTS first`) vì boot chết làm cả suite đỏ, không chỉ spec vocab. <!-- Updated: Red Team Session 1 - blast radius log -->

## Todo

- [ ] CSV committed + `.gitignore` raw-data
- [ ] Seed core + parser test pass
- [ ] CLI `--file` / `--d1` / `--verify` chạy được
- [ ] Runbook + boot e2e seed

## Success Criteria

- `pnpm --filter @teacher-os/db test` pass (idempotency + quoted commas + uniqueness key) — script `test` tồn tại và được root turbo chạy.
- Chạy seed `--file` 2 lần: `--verify` lần 2 in `course 20/20, deck 968/968, word 10160/10160` + id-set khớp, exit 0.
- Ids deterministic: `SELECT id FROM vocab_library_word LIMIT 1` trả dạng `libword-<số>` khớp CSV id (test assert).
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e` boot xong có thư viện (spec Phase 5 đếm lại).
- Runbook ghi rõ gate: seed `--d1` PROD bị chặn tới khi Open Question 1 (giấy phép) resolved. <!-- Updated: Red Team Session 1 -->

## Risk Assessment

- **Seed prod không atomic (per-chunk commit)** (likelihood chắc chắn, impact trung): token hết hạn/5xx giữa chừng → library partial; browse vẫn trả list thiếu, clone được deck thiếu từ. Mitigation: idempotent upsert + chạy lại; `--verify` exit 0 là điều kiện "hoàn tất" ghi trong runbook; smoke staging bắt buộc trước prod.
- **CSV id không ổn định giữa các lần re-export từ hệ nguồn** (likelihood không biết, impact trung): assumption tải trọng của idempotency — nếu id đổi, upsert tạo row mới trùng nội dung. Mitigation: `--prune` + verify id-set; ghi assumption này vào runbook.
- **CSV lớn làm boot e2e chậm** (likelihood trung, impact thấp): parse 4MB + ~11k inserts vào sqlite local ước tính vài giây, một lần mỗi run (workers=1); đo khi làm — nếu vượt 10s thì gom insert vào ít batch hơn (libsql batch đã là 1 transaction).
- **Path sqlite alchemy local đổi giữa các version alchemy** (likelihood thấp, impact thấp): runbook dùng `find` pin theo `*d1/*` + loại `metadata.sqlite` (bước 6) thay vì hard-code path.
- **Mirror audio sang R2 ngay từ đầu** (quyết định chưa chốt): hiện chỉ lưu URL; nếu Open Question 2 của plan.md chốt mirror, thêm bước tải 10.160 file vào R2 trong script này — tách phase riêng, không gói vào đây.

## Security Considerations

- `CLOUDFLARE_API_TOKEN` chỉ đọc từ env operator, KHÔNG bao giờ log hay ghi vào file output; error response của REST in ra không kèm header auth.
- Database id là identifier (runbook :77 quy ước) nhưng vẫn không commit — truyền bằng env.
- SQL escape literals chặn injection từ nội dung CSV (dấu `'` trong text là case thật, ví dụ tên bài học).

## Next Steps

Phase 3 đọc EXPECTED_COUNTS để test library API trên dữ liệu seed; Phase 5 dựa vào boot e2e đã seed để viết spec clone mà không cần seed thủ công.
