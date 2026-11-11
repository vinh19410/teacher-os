---
phase: 1
title: "Phase 1: TDD Red Non-ASCII Path Guard for Server Tests"
status: pending
priority: P1
effort: "20m"
dependencies: []
---

# Phase 1: TDD Red Non-ASCII Path Guard for Server Tests

<!-- Updated: Red Team Session 1 - TypeScript AST scanner across all apps/server/src/**/*.ts, destructuring/element-access coverage, NO_COLOR + mktemp trap + OFFENDING_COUNT=88 TDD Red assertion -->

## Goal

Viết bài test canh cổng `apps/server/src/non-ascii-path-guard.test.ts` trước khi sửa mã nguồn test hiện hữu để (1) chứng minh bằng runtime thật rằng `migrate()` của Drizzle thất bại với `.pathname` nhưng thành công với `fileURLToPath` trên đường dẫn chứa ký tự tiếng Việt ngay cả khi máy CI đặt repo ở đường dẫn ASCII, và (2) dùng bộ phân tích AST TypeScript (`ts.createSourceFile`) xác lập trạng thái TDD Red bắt chính xác toàn bộ `88` file `.test.ts` đang lấy `.pathname` từ `URL(..., import.meta.url)` trong `apps/server/src`.

## Files to Create / Modify

- Create: `apps/server/src/non-ascii-path-guard.test.ts`

## Handover Note

Plan này được viết theo hợp đồng bàn giao `--advice` + `--tdd` cho executor. Executor chỉ đọc `plan.md` và các file `phase-NN-*.md`, thực thi tuần tự từng Task, đối chiếu kết quả lệnh `Verify` bằng phép so sánh cơ học và tuân thủ tuyệt đối khối `Failure Protocol` ở cuối file nếu bất kỳ `Verify` nào không khớp điều kiện đạt. Chú ý ở Task 1.1 (pha TDD Red): việc lệnh `vitest run` thoát mã khác `0` do đúng `1` bài kiểm quét AST bắt được `OFFENDING_COUNT=88` file vi phạm **chính là điều kiện đạt**; nếu lệnh `vitest run` lại thoát `0` hoặc lệch số `88` khi chưa sửa file nào thì phải dừng ngay theo `Failure Protocol`. Khi chuyển tiếp output lên GitHub công khai, luôn ẩn đường dẫn tuyệt đối nội bộ của máy trạm.

## Tasks & Steps

### Task 1.1 — Tạo `apps/server/src/non-ascii-path-guard.test.ts` (AST scanner + runtime repro) và xác minh trạng thái TDD Red (`OFFENDING_COUNT=88`)

- **Goal:** Tạo bài test canh cổng hồi quy kiểm tra cả hành vi runtime `migrate()` trên đường dẫn tiếng Việt lẫn bộ quét AST `ts.createSourceFile` trên toàn bộ `apps/server/src/**/*.ts`, rồi chứng minh trạng thái TDD Red bắt đúng `88` file vi phạm hiện có mà không tự bắt nhầm string literal trong chính file guard test.
- **Target files and symbols:**
  - `apps/server/src/non-ascii-path-guard.test.ts` (hàm `findImportMetaUrlPathnameViolations(source: string, fileName?: string): string[]` dùng `ts.createSourceFile` từ `"typescript"`, và `3` bài `test(...)` trong `describe("server test suite non-ASCII workspace path guard (#656)", ...)`)
- **Steps:**
  1. Tạo file `apps/server/src/non-ascii-path-guard.test.ts` import `mkdirSync`, `mkdtempSync`, `readdirSync`, `readFileSync`, `rmSync`, `symlinkSync` từ `"node:fs"`, `tmpdir` từ `"node:os"`, `join`, `relative` từ `"node:path"`, `fileURLToPath`, `pathToFileURL` từ `"node:url"`, `createClient` từ `"@libsql/client"`, `* as schema` từ `"@teacher-os/db/schema/index"`, `drizzle` từ `"drizzle-orm/libsql"`, `migrate` từ `"drizzle-orm/libsql/migrator"`, `ts` từ `"typescript"`, và `{ describe, expect, test }` từ `"vitest"`.
  2. Định nghĩa hằng `SERVER_SRC_DIR = fileURLToPath(new URL(".", import.meta.url))` và `REAL_MIGRATIONS_DIR = fileURLToPath(new URL("../../../packages/db/src/migrations", import.meta.url))` (tuyệt đối không dùng `.pathname`).
  3. Cài đặt hàm `findImportMetaUrlPathnameViolations(source: string, fileName = "sample.ts"): string[]` bằng `ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)`:
     - Nhận diện biểu thức `isImportMetaUrlExpr(node)`: `PropertyAccessExpression` có dạng `import.meta.url` (kể cả bọc trong `ParenthesizedExpression`).
     - Nhận diện `isImportMetaFileUrlNewExpr(node)`: `NewExpression` có `expression` là định danh `URL` và có ít nhất một đối số là `isImportMetaUrlExpr(arg)` (bắt cả `new URL(rel, import.meta.url)` lẫn 1 đối số `new URL(import.meta.url)`).
     - Thu tập định danh biến `urlIdentSet` từ mọi `VariableDeclaration` có `initializer` (bỏ ngoặc đơn ngoài nếu có) thỏa `isImportMetaFileUrlNewExpr`:
       - Nếu `declaration.name` là `Identifier`, ghi nhận tên biến vào `urlIdentSet`.
       - Nếu `declaration.name` là `ObjectBindingPattern` destructuring thuộc tính `pathname` (ví dụ `const { pathname } = new URL(..., import.meta.url)` hoặc `const { pathname: dir } = new URL(..., import.meta.url)`), ghi nhận ngay vi phạm kèm số dòng `1-based`.
     - Duyệt toàn bộ cây AST (vì duyệt trên AST thực sự nên comment `//`, `/* */` và mọi string/template literal như `"http://localhost:8001"`, `"/api/student/*"`, hay các đoạn mã mẫu truyền dưới dạng chuỗi trong Test 1 tự động không phải `NewExpression`/`PropertyAccessExpression` thực thi):
       - Bắt truy cập thuộc tính trực tiếp `.pathname` (`PropertyAccessExpression`) hoặc `["pathname"]` (`ElementAccessExpression` với string/template literal `"pathname"`) trên `isImportMetaFileUrlNewExpr` hoặc trên bất kỳ `Identifier` nào thuộc `urlIdentSet`.
       - Bắt destructuring gián tiếp `const { pathname } = <ident>` khi `initializer` là `Identifier` thuộc `urlIdentSet`.
     - Trả về mảng chuỗi mô tả từng vị trí vi phạm `L<line>:<col>` theo thứ tự xuất hiện.
  4. Viết `3` bài `test` trong `apps/server/src/non-ascii-path-guard.test.ts`:
     - **Test 1 (AST detector unit contract):** Kiểm chứng `findImportMetaUrlPathnameViolations` bắt đúng:
       - mẫu trực tiếp một dòng và nhiều dòng có dấu phẩy cuối (`new URL("...", import.meta.url,).pathname`),
       - mẫu 1 đối số (`new URL(import.meta.url).pathname`),
       - mẫu truy cập ngoặc vuông (`new URL("...", import.meta.url)["pathname"]`),
       - mẫu destructuring trực tiếp và đổi tên (`const { pathname: dir } = new URL("...", import.meta.url)`),
       - mẫu biến gián tiếp (`const p = new URL("...", import.meta.url); readFileSync(p.pathname)`),
       - mẫu kết hợp chuỗi gây nhiễu `const route = "/api/student/*"; /* block comment */ const origin = "http://localhost:8001"; const d = new URL("../m", import.meta.url).pathname;`;
       đồng thời trả mảng rỗng `[]` cho `fileURLToPath(new URL("...", import.meta.url))`, `new URL("...", import.meta.url).href`, HTTP URL `new URL(c.url).pathname`, `const { pathname } = new URL(req.url)`, và string literal chứa chữ `new URL("x", import.meta.url).pathname`.
     - **Test 2 (Runtime Drizzle `migrate()` trên đường dẫn tiếng Việt thật):** Tạo thư mục tạm bằng `mkdtempSync(join(tmpdir(), "Pick-tài-liệu-ở-page-tạo-buổi-học-"))`, tạo cây con `apps/server/src` và `packages/db/src`, gắn `symlinkSync(REAL_MIGRATIONS_DIR, join(vnRoot, "packages/db/src/migrations"), "dir")`, tạo `fakeTestFileUrl = pathToFileURL(join(vnRoot, "apps/server/src/holidays.test.ts")).href`:
       - Chứng minh `new URL("../../../packages/db/src/migrations", fakeTestFileUrl).pathname` chứa chuỗi mã hóa `%C3%A0` và truyền vào `migrate()` trên `createClient({ url: "file::memory:" })` bị reject với `/Can't find meta\/_journal\.json file/`.
       - Chứng minh `fileURLToPath(new URL("../../../packages/db/src/migrations", fakeTestFileUrl))` giải mã nguyên vẹn tên tiếng Việt và `await migrate(drizzle(client, { schema }), { migrationsFolder })` thành công không lỗi.
       - Luôn `client.close()` và `rmSync(vnRoot, { recursive: true, force: true })` trong khối `finally`.
     - **Test 3 (Static AST guard trên toàn bộ `apps/server/src/**/*.ts`):** Đệ quy duyệt toàn bộ file `*.ts` dưới `SERVER_SRC_DIR` (cả `.test.ts`, test helper lẫn runtime `.ts`), chuẩn hóa đường dẫn tương đối bằng dấu `/` (`relative(SERVER_SRC_DIR, fullPath).split("\\").join("/")`), thu danh sách `offendingFiles` (mỗi phần tử dạng `${relPath} (${violations.join(", ")})` hoặc mảng tên file `relPath` sắp xếp tăng dần), và gọi:
       `expect(offendingFiles, \`OFFENDING_COUNT=\${offendingFiles.length}\\n\${offendingFiles.join("\\n")}\`).toEqual([]);`
       để không bao giờ bị Chai cắt ngắn số đếm khi in thông báo lỗi.
  5. Định dạng riêng file vừa tạo bằng `pnpm exec biome check --write apps/server/src/non-ascii-path-guard.test.ts`.
  6. Chạy kiểm chứng TDD Red trong subshell có `mktemp` + `trap` và `--no-color`: Test 1 và Test 2 phải pass, riêng Test 3 phải fail với đúng `OFFENDING_COUNT=88` (không tự bắt `non-ascii-path-guard.test.ts` và không bắt nhầm `95` file runtime `.ts` hay `bank-hub-client.test.ts`).
- **Success criteria:** `biome check` trên `apps/server/src/non-ascii-path-guard.test.ts` thoát mã `0`; khi chạy `vitest run --no-color src/non-ascii-path-guard.test.ts`, lệnh thoát mã khác `0` với `1 failed | 2 passed (3)`, in `OFFENDING_COUNT=88`, có chứa cả `lead-catalog-drift.test.ts` lẫn `routes/holidays.test.ts`, không chứa `non-ascii-path-guard.test.ts` trong danh sách vi phạm, và file log tạm được tự động xóa sạch.
- **Verify:** `pnpm exec biome check apps/server/src/non-ascii-path-guard.test.ts && (LOG="$(mktemp "${TMPDIR:-/tmp}/656-tdd-red.XXXXXX.log")"; trap 'rm -f "$LOG"' EXIT; if NO_COLOR=1 FORCE_COLOR=0 pnpm --filter server exec vitest run --no-color src/non-ascii-path-guard.test.ts > "$LOG" 2>&1; then exit 1; fi; grep -Fq "1 failed | 2 passed (3)" "$LOG" && grep -Fq "OFFENDING_COUNT=88" "$LOG" && grep -Fq "lead-catalog-drift.test.ts" "$LOG" && grep -Fq "routes/holidays.test.ts" "$LOG")` thoát mã `0`.

## Todo

- [ ] Task 1.1: Tạo `apps/server/src/non-ascii-path-guard.test.ts` (AST scanner + runtime repro) và xác minh trạng thái TDD Red (`OFFENDING_COUNT=88`)

## Verification

- `pnpm exec biome check apps/server/src/non-ascii-path-guard.test.ts` thoát mã `0`.
- Lệnh `Verify` của Task 1.1 thoát mã `0` (xác nhận `vitest run --no-color src/non-ascii-path-guard.test.ts` ở cuối Phase 1 thoát khác `0` với `1 failed | 2 passed (3)` và `OFFENDING_COUNT=88`, đồng thời dọn sạch log tạm qua `trap`).

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
