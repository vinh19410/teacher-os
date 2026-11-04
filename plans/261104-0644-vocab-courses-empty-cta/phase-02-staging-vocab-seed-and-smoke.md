---
phase: 2
title: "Phase 2: Staging-Only Vocab Library Seed & CI Guards"
status: pending
priority: P1
effort: 1.5h
dependencies: [1]
---

# Phase 2: Staging-Only Vocab Library Seed & CI Guards

<!-- Updated: Red-Team Session 1 - tsx + check-types in @teacher-os/db, fail-closed D1_DATABASE_ID + prod guard + total_count pagination, SHA-256 content parity, column-0 add-mask + redaction + timeout/429 retry, post-/readyz seed without student-polluting curl -->

## Goal

Tự động hóa việc nạp và kiểm chứng 1-1 (tập ID + SHA-256 toàn bộ nội dung) thư viện từ vựng built-in trên Cloudflare D1 của riêng môi trường `staging` (fail-closed, không tạo dữ liệu học viên rác, tương thích cả staging trắng `0` org) kèm khóa cơ học bảo vệ Production trên cả `seed-vocab-library.ts`, `deploy.yml` và `alchemy.run.ts`.

## Files to Create / Modify

- Modify: `packages/db/package.json` — thêm `"check-types": "tsc --noEmit"` vào `scripts` và `"tsx": "4.23.12"` vào `devDependencies` (khớp phiên bản đã dùng trong `packages/auth` và `apps/e2e`, không dùng `npx -y`).
- Modify: `pnpm-lock.yaml` — cập nhật lockfile cho `@teacher-os/db` qua `pnpm install`.
- Modify: `packages/db/src/seed/vocab-library.ts` — mở rộng `SqlRunner` với `queryRows?(sql)`, thêm `verifyContentParity` (SHA-256 nội dung 3 bảng, phân trang `vocab_library_word` theo lô `4000` dòng), `resolveStagingD1DatabaseId`, `assertNonProdD1Database`, và `ensureVocabLibrarySeeded`.
- Modify: `packages/db/scripts/seed-vocab-library.ts` — bọc `main()` bằng guard `isDirectExecution`, export `parseArgs`, `createD1RestRunner` và `runSeedCli`; bổ sung `--d1-stage <stage>` và `--if-needed`, cấm trộn `D1_DATABASE_ID` + `--d1-stage`, chặn `teacher-os-database-prod-*` trên `--d1`, ghi `::add-mask::<id>\n` ở cột 0 dòng riêng trước mọi request/log, redact `databaseId` + `apiToken` khỏi mọi error message, gắn `AbortSignal.timeout(20_000)` và retry kèm backoff ngắn cho cả `5xx` lẫn `429`.
- Modify: `packages/db/src/seed/vocab-library.test.ts` — viết unit/CLI tests cho toàn bộ nhánh fail-closed, SHA-256 content drift, retry `429`, error redaction, và smoke subprocess `tsx scripts/seed-vocab-library.ts --help`.
- Modify: `.github/workflows/deploy-staging.yml` — thêm bước `"Seed built-in vocab library (staging only)"` ngay sau `"Smoke check API readiness (/readyz)"` với đúng 2 biến `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN` (không chạm bước auth smoke và không gọi `/api/student/*` để tránh bơm dòng `student` rác hoặc lỗi `403` trên staging trắng `0` org).
- Modify: `scripts/ci-workflow.test.mjs` — khóa thứ tự step và least-privilege `env:` trong `deploy-staging.yml`, cấm `npx -y` trên workflows, cấm `/seed-vocab-library|seedVocabLibrary|vocab_library/` trong `deploy.yml` (sau `stripComments`), và cấm `importFiles` trong `packages/infra/alchemy.run.ts`.
- Modify: `packages/db/scripts/README-seed-vocab-library.md` — cập nhật runbook phản ánh bước tự động seed trên `deploy-staging.yml`, lệnh `pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --d1 --d1-stage staging --if-needed --verify`, và giữ nguyên cảnh báo chặn Production.

## Tasks & Steps

### Task 2.1 — Khai báo `tsx` + `check-types` cho `@teacher-os/db` và viết failing tests (TDD Red)
- **Goal**: Thiết lập môi trường chạy `tsx` / `check-types` chuẩn lockfile cho `@teacher-os/db` và tạo bộ test đỏ cho toàn bộ logic D1 staging fail-closed, SHA-256 content parity, redaction/retry, và CI workflow guards.
- **Target files and symbols**:
  - `packages/db/package.json` & `pnpm-lock.yaml`
  - `packages/db/src/seed/vocab-library.test.ts`
  - `scripts/ci-workflow.test.mjs`
- **Steps**:
  1. Trong `packages/db/package.json`: thêm `"check-types": "tsc --noEmit"` vào `"scripts"` và `"tsx": "4.23.12"` vào `"devDependencies"`, sau đó chạy `pnpm install` để cập nhật `pnpm-lock.yaml`.
  2. Trong `packages/db/src/seed/vocab-library.test.ts`, import các symbol mới (`resolveStagingD1DatabaseId`, `assertNonProdD1Database`, `ensureVocabLibrarySeeded`, `verifyContentParity` từ `./vocab-library` và `parseArgs`, `runSeedCli` từ `../../scripts/seed-vocab-library`) và viết các test:
     - `resolveStagingD1DatabaseId`:
       - Từ chối mọi `stage !== "staging"` (`"prod"`, `"production"`, `""`).
       - Trả đúng `uuid` khi response `GET .../d1/database?name=teacher-os-database-staging-&per_page=100` có đúng 1 bản ghi khớp `^teacher-os-database-staging-[a-z2-7]{16}$` và không bị cắt trang (`total_pages <= 1` và `total_count <= result.length`).
       - Ném lỗi fail-closed khi `0` bản ghi khớp, `>1` bản ghi khớp, tên là `teacher-os-database-prod-abcdefghijklmnop`, hoặc `result_info.total_count > result.length` (kể cả khi `total_pages` là `undefined`).
     - `assertNonProdD1Database` & `runSeedCli`:
       - Ném lỗi khi truyền đồng thời `D1_DATABASE_ID` trong env và `--d1-stage staging`.
       - Khi truyền `--d1` với `D1_DATABASE_ID` trực tiếp mà API metadata trả tên `teacher-os-database-prod-abcdefghijklmnop`, chặn cứng với lỗi Gate Giấy phép trước khi chạy bất kỳ lệnh SQL nào.
       - Khi `GITHUB_ACTIONS === "true"`, ghi `::add-mask::<uuid>\n` ở đầu dòng riêng biệt trước mọi log khác, và khi request `/query` ném lỗi có chứa `<uuid>` hoặc `<apiToken>`, thông báo lỗi cuối cùng đã được thay thế thành `[REDACTED]`.
       - Khi request D1 trả HTTP `429` ở lần thử đầu rồi `200` ở lần retry, runner tự động retry thành công.
     - `ensureVocabLibrarySeeded` (`--if-needed` + SHA-256 content parity):
       - Trên DB libsql đã seed bộ `data` mẫu: gọi `ensureVocabLibrarySeeded(client, { data, ifNeeded: true })` trả `{ seeded: false, statementsExecuted: 0, counts: { course: 1, deck: 1, word: 1 } }`.
       - Khi giữ nguyên toàn bộ khóa chính `id` nhưng sửa `audio_url` (hoặc `description`) của 1 dòng trong DB: `verifyCounts` vẫn thấy đủ ID nhưng `ensureVocabLibrarySeeded(client, { data, ifNeeded: true })` phát hiện lệch SHA-256 nội dung, tự động chạy upsert (`seeded: true`) và khôi phục đúng giá trị cột theo `data`.
     - Subprocess CLI smoke: chạy `execFileSync("pnpm", ["--filter", "@teacher-os/db", "exec", "tsx", "scripts/seed-vocab-library.ts", "--help"])` trả exit `0` và in hướng dẫn có `--d1-stage` và `--if-needed`.
  3. Trong `scripts/ci-workflow.test.mjs`:
     - Trong test `"staging deploy workflow deploys only from staging and gates deploy on uncached quality"`: dùng `splitJobSteps(deployJob)` kiểm tra bước `"Seed built-in vocab library (staging only)"` đứng **sau** `"Smoke check API readiness (/readyz)"`, chạy `pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --d1 --d1-stage staging --if-needed --verify`, khối `env:` của bước đó chỉ truyền `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN` (không có `D1_DATABASE_ID`), và toàn bộ `deploy-staging.yml` không dùng `npx -y`.
     - Trong test `"prod deploy is gated on uncached quality only (e2e runs locally before shipping)"`: kiểm tra trên `code = stripComments(raw)` rằng `deploy.yml` không khớp `/seed-vocab-library|seedVocabLibrary|vocab_library/` và không dùng `npx -y`; đồng thời đọc `packages/infra/alchemy.run.ts` (đã strip comment) khẳng định không khớp `/\bimportFiles\s*:/`.
- **Success criteria**: Cả `pnpm --filter @teacher-os/db test` và `node --test scripts/ci-workflow.test.mjs` đều thoát mã khác `0` do code mới chưa được cài đặt.
- **Verify**: `pnpm --filter @teacher-os/db test` thoát mã khác `0` VÀ `node --test scripts/ci-workflow.test.mjs` thoát mã khác `0` (Red phase — passing test ở bước này bị coi là thất bại).

### Task 2.2 — Cài đặt logic D1 staging fail-closed, SHA-256 content parity và CLI `seed-vocab-library.ts` (TDD Green phần DB)
- **Goal**: Hoàn thiện các hàm trong `packages/db/src/seed/vocab-library.ts` và CLI `packages/db/scripts/seed-vocab-library.ts` để vượt qua toàn bộ unit test và `check-types`.
- **Target files and symbols**:
  - `packages/db/src/seed/vocab-library.ts` (`SqlRunner.queryRows`, `verifyContentParity`, `resolveStagingD1DatabaseId`, `assertNonProdD1Database`, `ensureVocabLibrarySeeded`).
  - `packages/db/scripts/seed-vocab-library.ts` (`parseArgs`, `createD1RestRunner`, `runSeedCli`, `main`).
- **Steps**:
  1. Trong `packages/db/src/seed/vocab-library.ts`:
     - Thêm `queryRows?(sql: string): Promise<Array<Record<string, unknown>>>;` vào `SqlRunner` và cài đặt trong `createLibsqlRunner` (`const res = await client.execute(sql); return res.rows as Array<Record<string, unknown>>;`).
     - Viết `export async function verifyContentParity(runnerOrClient: SqlRunner | Client, options?: { dataDir?: string; data?: ParsedVocabLibraryData }): Promise<boolean>`: dùng `node:crypto` `createHash("sha256")` băm định dạng chuẩn hóa của toàn bộ dòng `courses` (sắp xếp theo `id`), `decks` (sắp xếp theo `id`), và `words` (sắp xếp theo `id`, truy vấn DB theo lô `SELECT id, deck_id, word, ipa, pos, translation, sentence_vi, sentence_en, picture_url, audio_url, sort_order FROM vocab_library_word ORDER BY id ASC LIMIT 4000 OFFSET <offset>` cho tới khi lô trả `< 4000` dòng) rồi so sánh với SHA-256 tính từ `data`.
     - Viết `export async function resolveStagingD1DatabaseId(options: { stage: string; accountId: string; apiToken: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<string>`:
       - Chặn cứng nếu `options.stage !== "staging"`.
       - Gọi `GET https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database?name=teacher-os-database-staging-&per_page=100` với `signal: AbortSignal.timeout(options.timeoutMs ?? 20_000)`.
       - Kiểm tra phân trang bằng cả `(payload.result_info?.total_pages ?? 1) > 1` lẫn `typeof payload.result_info?.total_count === "number" && payload.result_info.total_count > resultList.length` → nếu vượt trang thì throw lỗi fail-closed.
       - Lọc theo regex `/^teacher-os-database-staging-[a-z2-7]{16}$/`; yêu cầu `matches.length === 1`, trả `matches[0].uuid`.
     - Viết `export async function assertNonProdD1Database(options: { accountId: string; databaseId: string; apiToken: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<void>`: gọi `GET .../d1/database/${encodeURIComponent(databaseId)}`, nếu `result.name` khớp `/^teacher-os-database-prod-/i` (hoặc request thất bại) thì throw lỗi fail-closed chặn ghi Production.
     - Viết `export async function ensureVocabLibrarySeeded(runnerOrClient: SqlRunner | Client, options?: { dataDir?: string; data?: ParsedVocabLibraryData; prune?: boolean; ifNeeded?: boolean; verify?: boolean; maxChunkBytes?: number })`:
       - Nạp `data = options?.data ?? loadVocabLibraryCsvData(options?.dataDir)` và tính `expectedCounts = { course: data.courses.length, deck: data.decks.length, word: data.words.length }`.
       - Nếu `options?.ifNeeded && !options?.prune`: chạy `const precheck = await verifyCounts(runnerOrClient, { data });`; nếu `precheck.ok` là `true` và `await verifyContentParity(runnerOrClient, { data })` cũng là `true`, trả `{ seeded: false, statementsExecuted: 0, counts: expectedCounts, verification: precheck }`.
       - Ngược lại: chạy `seedVocabLibrary(runnerOrClient, { data, prune: options?.prune, maxChunkBytes: options?.maxChunkBytes })`, rồi nếu `options?.verify || options?.ifNeeded` thì chạy `verifyCounts(runnerOrClient, { data })` và trả kết quả.
  2. Trong `packages/db/scripts/seed-vocab-library.ts`:
     - Bổ sung `--d1-stage <stage>` và `--if-needed` vào `parseArgs` (yêu cầu `--d1` khi có `--d1-stage`, cấm kết hợp `--if-needed` với `--prune`, cấm `stage !== "staging"`).
     - Viết helper `redactSensitive(text: string, secrets: readonly string[]): string` thay mọi chuỗi khớp secret/UUID bằng `[REDACTED]`.
     - Trong `runSeedCli(argv, deps?)`:
       - Nếu nhánh `--d1`: kiểm tra nếu cả `env.D1_DATABASE_ID?.trim()` lẫn `args.d1Stage` cùng có mặt → throw lỗi xung đột fail-closed.
       - Nếu `args.d1Stage === "staging"`, giải mã `databaseId` qua `resolveStagingD1DatabaseId`; ngược lại lấy `D1_DATABASE_ID` từ env và gọi `assertNonProdD1Database` trước khi chạy SQL.
       - Ngay khi có `databaseId`, nếu `env.GITHUB_ACTIONS === "true"`, ghi `stdout.write(\`::add-mask::\${databaseId}\\n\`)` ở đầu dòng riêng biệt trước mọi log/request tiếp theo; sau đó mới log `[vocab-library-seed] target D1 database verified (staging)`.
       - Trong `createD1RestRunner`: cài đặt cả `queryRows` và `queryIds`, dùng `AbortSignal.timeout(20_000)`, cho phép retry kèm backoff ngắn (`250ms` ở test/env override hoặc `1000ms` mặc định) khi `res.status >= 500 || res.status === 429`, parse JSON an toàn cho non-JSON body, và redact `databaseId` + `apiToken` trên mọi lỗi ném ra.
     - Chỉ chạy `main()` khi `process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href`.
- **Success criteria**: Toàn bộ test và kiểm tra kiểu của `@teacher-os/db` đều pass.
- **Verify**: `pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/db check-types` thoát mã `0`.

### Task 2.3 — Gắn bước seed vào `deploy-staging.yml` và cập nhật runbook (TDD Green phần Workflow)
- **Goal**: Tự động nạp + kiểm chứng thư viện trên `deploy-staging.yml` ngay sau `/readyz` và cập nhật tài liệu vận hành.
- **Target files and symbols**:
  - `.github/workflows/deploy-staging.yml` (job `deploy`).
  - `packages/db/scripts/README-seed-vocab-library.md` (mục 2 và mục 4).
- **Steps**:
  1. Trong `.github/workflows/deploy-staging.yml`, ngay **sau** bước `- name: Smoke check API readiness (/readyz)` và **trước** bước `- name: Smoke check auth (sign-up → get-session)` (giữ nguyên vẹn tên và nội dung bước auth smoke!), thêm bước:
     ```yaml
     - name: Seed built-in vocab library (staging only)
       timeout-minutes: 5
       env:
         CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
         CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
       run: pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts --d1 --d1-stage staging --if-needed --verify
     ```
  2. Trong `packages/db/scripts/README-seed-vocab-library.md`:
     - Đổi các lệnh mẫu từ `npx -y tsx packages/db/scripts/seed-vocab-library.ts ...` sang `pnpm --filter @teacher-os/db exec tsx scripts/seed-vocab-library.ts ...` (dùng binary `tsx` đã khóa trong workspace).
     - Ở mục 4, ghi rõ `.github/workflows/deploy-staging.yml` nay tự động chạy `--d1 --d1-stage staging --if-needed --verify` sau `/readyz` trên mỗi lần deploy nhánh `staging` (kiểm tra cả tập ID lẫn SHA-256 nội dung), đồng thời ghi rõ nhánh `--d1` hiện chặn cứng DB `teacher-os-database-prod-*` và `scripts/ci-workflow.test.mjs` chặn `deploy.yml` cho tới khi Gate Giấy phép được chủ dự án mở.
- **Success criteria**: Cả `scripts/ci-workflow.test.mjs` và `scripts/topology-drift.test.mjs` đều xanh.
- **Verify**: `node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs` thoát mã `0`.

### Task 2.4 — Chạy toàn bộ cổng kiểm chứng local (Biome, Types, Unit Tests, Playwright E2E + 3 Viewports)
- **Goal**: Xác minh toàn diện không có lỗi hồi quy trên toàn monorepo và trên trình duyệt thật qua Playwright E2E (port 8100/8101/8103).
- **Target files and symbols**:
  - Toàn bộ workspace (`biome`, `turbo check-types`, `pnpm test`, `apps/e2e/specs/vocab-library-clone.spec.ts`).
- **Steps**:
  1. Chạy `pnpm exec biome check .` (nếu có lệch format ở file vừa sửa thì chạy `pnpm check:fix` rồi chạy lại `pnpm exec biome check .`).
  2. Chạy `pnpm check-types` và `pnpm test` trên toàn repo (đã bao gồm `test:ci-workflow`, `test:topology-drift`, `test:devserver-watchdog`, `test:design-compare`).
  3. Đảm bảo các cổng `8100`, `8101`, `8103`, `8104`, `8105` trống, sau đó chạy Playwright E2E cho luồng thư viện từ vựng:
     `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/vocab-library-clone.spec.ts`
- **Success criteria**: Mọi lệnh kiểm chứng trả exit code `0`, E2E xác nhận CTA hiển thị `"Thư viện từ vựng · 20 khóa · 968 bài"` và catalog đạt chuẩn ở cả 3 viewport (`1440×900`, `768×1024`, `375×812`).
- **Verify**: `pnpm exec biome check . && pnpm check-types && pnpm test && E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/vocab-library-clone.spec.ts` thoát mã `0`.

## Todo

- [ ] Task 2.1: Thêm `tsx` + `check-types` vào `@teacher-os/db` và viết failing tests (TDD Red) trong `vocab-library.test.ts` + `ci-workflow.test.mjs`
- [ ] Task 2.2: Cài đặt `resolveStagingD1DatabaseId`, `assertNonProdD1Database`, `verifyContentParity`, `ensureVocabLibrarySeeded` và CLI `runSeedCli`
- [ ] Task 2.3: Thêm bước seed vào `deploy-staging.yml` sau `/readyz` và cập nhật `README-seed-vocab-library.md`
- [ ] Task 2.4: Chạy toàn bộ cổng kiểm chứng local (`biome`, `check-types`, `pnpm test`, Playwright E2E)

## Verification

- `pnpm --filter @teacher-os/db test && pnpm --filter @teacher-os/db check-types` exits `0`
- `node --test scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs` exits `0`
- `pnpm exec biome check . && pnpm check-types && pnpm test` exits `0`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e exec playwright test specs/vocab-library-clone.spec.ts` exits `0`

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
