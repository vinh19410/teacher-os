---
phase: 1
title: "Parser core & contract"
status: completed
priority: P1
effort: 5h
dependencies: []
---

# Phase 1: Parser core & contract

## Goal

Thêm dependency parse, mở rộng contract zod cho `modules`, và xây parser thuần (core + browser adapter) với unit test đầy đủ — tất cả chạy được trong vitest env node của `apps/web`.

**Format contract forensic**: đọc và làm đúng theo mục "Định dạng file nhập" trong [plan.md](./plan.md) — 13 luật deterministic ở đó là requirement bắt buộc của parser core.

## Files to Create / Modify

- Modify: `apps/web/package.json` (thêm 3 deps)
- Modify: `packages/api/src/contracts.ts` (schema `modules` cho `syllabusCreateSchema`)
- Create: `apps/web/src/lib/syllabus-import.ts`
- Create: `apps/web/src/lib/syllabus-import.test.ts`

## Key Insights

- Vitest `apps/web` chạy environment **node** (`apps/web/vitest.config.ts:8`) → core + `normalizeRow` phải thuần (không đụng DOM). `read-excel-file/browser` cần FileReader → **không** unit-test nhánh xlsx (e2e Phase 3 phủ). Papaparse parse từ string chạy tốt trong node.
- `read-excel-file` 9.x **không có entry gốc `.`** — import bắt buộc `read-excel-file/browser`; `readSheet` **reject** với `InvalidSpreadsheetError` khi file zip hỏng → adapter phải try/catch (luật 13).
- `read-excel-file` trả `Date` cho cell định dạng ngày (`CellValue` gồm `Date`) → `normalizeRow` phải bắt và báo lỗi dòng, không `String(date)` (luật 2).
- **Thứ tự khai báo schema**: `syllabusModuleContentSchema` phải nằm **TRƯỚC** `syllabusCreateSchema` trong file contracts — `z.object` evaluate tham chiếu ngay khi module chạy, khai báo sau nơi sử dụng là TDZ/TS2448.
- Dynamic import cả hai lib trong adapter để tách chunk khỏi bundle chính.
- `readBody` server trả 400 opaque `invalid body` khi zod fail → client parser là nguồn duy nhất của error message hiển thị; schema server chỉ là backstop (nhưng vẫn cần `.max()` string để chặn body khổng lồ pass zod).

## Tasks & Steps

### Task 1.1 — Cài dependencies parse

- Goal: `apps/web` có papaparse + read-excel-file + types.
- Target files: `apps/web/package.json`.
- Steps:
  1. Từ repo root chạy: `pnpm --filter web add papaparse@^5.7.0 read-excel-file@^9.3.10`
  2. Chạy: `pnpm --filter web add -D @types/papaparse@^5.3.16`
- Success criteria: `apps/web/package.json` có 3 entries mới; lockfile cập nhật.
- Verify: `pnpm --filter web ls papaparse read-excel-file @types/papaparse` exits 0 và in ra cả 3 package (version ≥ 5.7.0 / 9.3.10 / 5.3.x).

### Task 1.2 — Mở rộng contract zod

- Goal: `POST /api/syllabi` chấp nhận optional `modules` (mảng module kèm lessons), cap tổng nodes ≤ 500 và cap độ dài string phía server.
- Target files and symbols: `packages/api/src/contracts.ts` — chèn schema mới **TRƯỚC `syllabusCreateSchema` (dòng 117)** (ví dụ ngay sau khối `classNotesSchema`, dòng ~115); sau đó sửa `syllabusCreateSchema` (117–146).
- Steps:
  1. Chèn **trước** `syllabusCreateSchema` (thứ tự bắt buộc — tránh TDZ):
     ```ts
     /**
      * Bulk content cho syllabus create (Excel/CSV import).
      * Mirror moduleUpsertSchema/lessonUpsertSchema + import-only caps
      * (server-side bound: client 2MB file cap không áp dụng cho caller trực tiếp).
      */
     export const syllabusModuleContentSchema = z.object({
     	title: z.string().min(1).max(500),
     	description: z.string().max(10_000).default(""),
     	lessons: z
     		.array(
     			z.object({
     				title: z.string().min(1).max(500),
     				objectives: z.string().max(10_000).default(""),
     				materials: z.string().max(10_000).default(""),
     				status: z.enum(["done", "current", "upcoming"]).default("upcoming"),
     			}),
     		)
     		.default([]),
     });
     export type SyllabusModuleContent = z.infer<typeof syllabusModuleContentSchema>;
     ```
  2. Trong `syllabusCreateSchema`, thêm field: `modules: z.array(syllabusModuleContentSchema).optional(),`
  3. Trong `superRefine` hiện có của schema đó, thêm kiểm tra cap:
     ```ts
     if (input.modules) {
     	const nodes =
     		input.modules.length +
     		input.modules.reduce((sum, m) => sum + m.lessons.length, 0);
     	if (nodes > 500) {
     		ctx.addIssue({
     			code: "custom",
     			path: ["modules"],
     			message: "Tổng số module và buổi học vượt giới hạn 500",
     		});
     	}
     }
     ```
  4. Giữ schema **không** `.strict()` (như hiện trạng).
- Success criteria: type `SyllabusCreate["modules"]` tồn tại; schema chấp nhận body có/không `modules`, từ chối > 500 nodes và string quá max.
- Verify: `pnpm check-types` exits 0.

### Task 1.3 — Parser core + browser adapter + file mẫu

- Goal: `syllabus-import.ts` xuất `normalizeRow`, `rowsToModules`, `parseSyllabusFile`, `buildSampleCsv` implement đúng 13 luật trong plan.md.
- Target files: Create `apps/web/src/lib/syllabus-import.ts`.
- Steps:
  1. Đầu file: `import type { SyllabusModuleContent } from "@teacher-os/api/contracts";`
  2. Export constants: `export const IMPORT_MAX_NODES = 500;` và `export const IMPORT_FILE_MAX_BYTES = 2 * 1024 * 1024;`
  3. Export type kết quả:
     ```ts
     export type SyllabusImportResult =
     	| { ok: true; modules: SyllabusModuleContent[]; lessonCount: number }
     	| { ok: false; errors: string[] };
     ```
  4. `export function normalizeRow(row: unknown[]): { ok: true; cells: string[] } | { ok: false; error: string }` — thuần, xử lý 1 row: nếu bất kỳ cell nào `instanceof Date` → `{ ok: false, error: "Dòng {n}: ô dạng ngày tháng không hỗ trợ — hãy định dạng ô thành Text" }` (n truyền vào lúc gọi); else pad/cắt về đúng 6 cột, mỗi cell `String(cell ?? "").trim()`.
  5. Core thuần `export function rowsToModules(rows: unknown[][]): SyllabusImportResult` — với mỗi row: gọi `normalizeRow` (lỗi → gom lỗi, bỏ qua row đó), sau đó áp dụng lần lượt luật 4–11 (header skip, dòng trống, kế thừa module, consecutive grouping, status mapping, module-không-lesson + luật 9 lỗi content-mà-thiếu-tên-buổi, cap 500, rỗng → lỗi). Số dòng = index trong mảng rows + 1 (khớp file gốc vì adapter không skip dòng nào).
  6. Adapter `export async function parseSyllabusFile(file: File): Promise<SyllabusImportResult>` — **toàn thân bọc trong try/catch**; catch → trả `{ ok: false, errors: ["Không đọc được file. Kiểm tra file Excel/CSV hợp lệ."] }` (luật 13):
     - Đuôi từ `file.name` (lowercase): `.csv` → nhánh CSV; `.xlsx` → nhánh XLSX; khác (kể cả `.xls`) → `{ ok: false, errors: ["Chỉ nhận file .csv hoặc .xlsx."] }`.
     - `file.size > IMPORT_FILE_MAX_BYTES` → `{ ok: false, errors: ["File vượt giới hạn 2 MB."] }`.
     - CSV: `const Papa = (await import("papaparse")).default;` → `const result = Papa.parse<string[]>(await file.text())` (KHÔNG truyền `delimiter`, KHÔNG truyền `skipEmptyLines`) → nếu `result.errors.length > 0` → `{ ok: false, errors: result.errors.map((e) => \`Dòng ${(e.row ?? 0) + 1}: cú pháp CSV không hợp lệ\`) }` → strip BOM ở cell đầu dòng đầu → `rowsToModules(result.data)`.
     - XLSX: `const { readSheet } = await import("read-excel-file/browser");` → `const rows = await readSheet(file);` → `rowsToModules(rows)` (readSheet trả `(string|number|boolean|Date|null)[][]` — normalizeRow xử lý).
  7. `export function buildSampleCsv(): string` — trả chuỗi bắt đầu bằng `"\uFEFF"`, dòng nối bằng `"\r\n"`:
     ```csv
     Module,Mô tả module,Buổi học,Mục tiêu,Tài liệu,Trạng thái
     Module 1 — Nền tảng,Làm quen format đề,Buổi 1,Hiểu cấu trúc đề,Cambridge 18,sắp tới
     ,,Buổi 2,Viết introduction,File mẫu 2,đã dạy
     Module 2 — Thực hành,,Buổi 3,Viết body paragraph,,đang học
     ```
- Success criteria: 4 exports dùng được từ test; production code không import tĩnh papaparse/read-excel-file (chỉ dynamic).
- Verify: `pnpm check-types` exits 0.

### Task 1.4 — Unit tests cho core + adapter CSV + file mẫu

- Goal: phủ gần đủ logic parse trong env node.
- Target files: Create `apps/web/src/lib/syllabus-import.test.ts`.
- Steps — viết `describe("rowsToModules")` với các `test` (dùng đúng tên này):
  1. `"bỏ header khi cột Buổi học là 'Buổi học' hoặc 'Lesson'; data row chứa chữ Lesson trong tên module không bị skip"`
  2. `"cột Module rỗng kế thừa module dòng trước; dòng data đầu thiếu module là lỗi"`
  3. `"nhóm consecutive cùng tên module; trùng tên không liền kề là 2 module; mô tả lấy từ dòng đầu nhóm"`
  4. `"trạng thái: đã dạy/done, đang học/current, sắp tới/upcoming/rỗng → upcoming; giá trị lạ là lỗi dòng"`
  5. `"dòng có Module, Buổi học rỗng, cột 3–5 trống → module không có lesson; có nội dung cột 3/4/5 → lỗi dòng"`
  6. `"dòng trống hoàn toàn bị bỏ qua; dòng trống xen giữa không làm lệch số dòng của lỗi sau nó"`
  7. `"tổng modules + lessons > 500 → lỗi kèm số lượng"`
  8. `"không có dòng data → lỗi 'Không có dòng dữ liệu.'"`
  9. `"row ngắn (thiếu cột) được pad về 6 cột, không crash; row dài hơn 6 cột bị cắt"`
  10. `describe("normalizeRow")`: `"cell Date → lỗi dòng; number/boolean/null → string"` (dùng `new Date(...)` trực tiếp — chạy được trong node).
  11. `describe("parseSyllabusFile (CSV)")` dùng `new File([csvText], "x.csv")`: delimiter `;` parse đúng; BOM bị strip; đuôi `.xls` bị từ chối; `size` vượt 2 MB bị từ chối; **quote chưa đóng → lỗi 'cú pháp CSV không hợp lệ'**.
  12. `test("buildSampleCsv có BOM, CRLF, 4 dòng; dòng 3 có Module rỗng")`.
- Success criteria: tất cả test xanh; KHÔNG test nhánh xlsx của adapter (browser-only, e2e phủ).
- Verify: `pnpm --filter web test -- syllabus-import` exits 0 và output chứa `passed` cho `syllabus-import.test.ts`.

## Verification (cổng cuối phase)

- `pnpm --filter web ls papaparse read-excel-file @types/papaparse` → exit 0, đủ 3 versions.
- `pnpm check-types` → exit 0.
- `pnpm --filter web test -- syllabus-import` → exit 0, output chứa `passed`.

## Risk Assessment

- **Giả định "read-excel-file/browser không chạy được trong vitest node"** (kongming, confidence cao): nếu executor phát hiện ngược lại, KHÔNG đổi kiến trúc — vẫn để e2e phủ xlsx; ghi nhận vào phase journal.
- Dynamic import papaparse trong vitest node hoạt động bình thường; nếu test CSV adapter fail vì lý do import, đổi thành import tĩnh **chỉ trong file test** (không đổi production code).
- `e.row` của papaparse có thể `undefined` với một số error code — đã dùng `(e.row ?? 0) + 1`.

## Security Considerations

- Cap 2 MB / 500 nodes / `.max()` string là **ranh giới UX + backstop**, không phải biên giới bảo vệ tuyệt đối: file nén 2 MB có thể giải nén thành XML khổng lồ (zip bomb qua `fflate` trong `read-excel-file`), parse trong main thread có thể treo tab của chính người upload. Threat model là self-harm (teacher upload file của mình), file không bao giờ tới server. Follow-up (ngoài scope): parse trong Web Worker có timeout.
- Cell chỉ lưu string và render text node React — không innerHTML, không thực thi formula.
- Server `.max()` (Task 1.2) chặn caller trực tiếp API gửi body khổng lồ pass zod.

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
