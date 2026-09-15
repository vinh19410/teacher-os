---
phase: 3
title: "Parser import v3 — 4 cột + preview dùng chung"
status: todo
priority: P1
effort: "4h"
dependencies: []
---

# Phase 3: Parser import v3 — 4 cột + preview dùng chung

## Goal

Import Excel/CSV bỏ cột "Trạng thái": parser chuẩn hóa 4 cột, file mẫu 4 cột, file v2 cũ (5 cột có header "Trạng thái") bị từ chối với thông báo hành động. Phần UI preview (bảng + danh sách lỗi + nút gỡ file) được tách thành component dùng chung để Phase 4 tái dùng ở màn hình detail.

## Context Links

- Scout report: `reports/scout-report.md` (mục 1, 2, 4)
- Quyết định D3, D6 trong `plan.md`
- Parser hiện tại: `apps/web/src/lib/syllabus-import.ts`; 15 luật v2 là hợp đồng forensic của plan `260915-1108-syllabus-import-v2` — thay đổi này supersede luật liên quan cột status

## Files to Create / Modify

- Modify: `apps/web/src/lib/syllabus-import.ts`
- Modify: `apps/web/src/lib/syllabus-import.test.ts`
- Create: `apps/web/src/components/syllabus/import-preview.tsx`
- Modify: `apps/web/src/components/modals/add-syllabus-modal.tsx`
- Modify: `apps/e2e/fixtures/syllabus-import.sample.csv`
- Create: `apps/e2e/scripts/regen-syllabus-import-fixture.mjs`
- Modify: `apps/e2e/specs/syllabus-excel-csv-import.spec.ts`
- Modify: `apps/e2e/package.json` (devDependency `exceljs`)

## Tasks & Steps

### Task 3.1 — Parser về 4 cột, chặn template v2
- Goal: `rowsToModules` đọc đúng 4 cột; file 5 cột (v2) và 6 cột (v1) đều bị chặn kèm thông báo rõ ràng.
- Target files: `apps/web/src/lib/syllabus-import.ts`.
- Steps:
  1. Xóa `STATUS_MAP` (dòng 19–27) và hàm `mapStatus` (dòng 56–71).
  2. `normalizeRow` (dòng 38–54): đổi vòng `for (let i = 0; i < 5; i++)` thành `i < 4`; cập nhật doc comment "đúng 4 cột".
  3. Trong khối detect header của `rowsToModules` (dòng 84–100), THÊM phát hiện v2 **trước** khi gọi `normalizeRow` cho row đầu (vì normalize cắt về 4 cột làm mất ô thứ 5):
     ```ts
     if (rows.length > 0) {
       const rawFifth = String(rows[0]?.[4] ?? "")
         .trim()
         .toLowerCase();
       if (rawFifth === "trạng thái" || rawFifth === "status") {
         return {
           ok: false,
           errors: [
             'File dùng template cũ (cột "Trạng thái" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.',
           ],
         };
       }
       // ... phần detect v1 ("buổi học" ở col2) và skip header giữ nguyên
     }
     ```
  4. **Luật cột dư (khóa file v2 đã xóa header)**: trong vòng lặp dòng chính, TRƯỚC khi `normalizeRow`, kiểm tra ô thứ 5 của raw row — nếu khác rỗng thì push lỗi dòng và `continue`:
     ```ts
     if (String(rows[i]?.[4] ?? "").trim() !== "") {
         errors.push(
           `Dòng ${i + 1}: file có cột dữ liệu thừa ở cột thứ 5 — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.`,
         );
         continue;
     }
     ```
     (Header detection ở bước 3 bắt bản có header; bước này bắt bản không header — cả hai đều không bỏ ngầm cột 5.)
  5. `hasLessonContent` (dòng 151–152): đổi thành `const hasLessonContent = cells[2] !== "" || cells[3] !== "";`.
  6. Block tạo lesson (dòng 153–180): xóa phần gọi `mapStatus` (dòng 168–172). **KHÔNG bỏ field `status`** — type `SyllabusModuleContent` là zod output type nên `status` là trường bắt buộc (`contracts.ts:131` có `.default("upcoming")` ⇒ output required). Push lesson kèm hằng số:
     ```ts
     currentModule?.lessons.push({
       title: `Buổi ${lessonOrdinal}`,
       objectives: cells[2],
       materials: cells[3],
       status: "upcoming",
     });
     ```
     (Giá trị hằng — format v3 không còn cột status; server-side đây là default của import mới.)
  7. Cập nhật doc comment đầu file: "4 cột (không còn cột Trạng thái)".
  8. `buildSampleCsv` (dòng 248–255): bỏ cột thứ 5 ở header và mọi dòng data:
     ```ts
     export function buildSampleCsv(): string {
       return [
         "\uFEFFModule,Mô tả module,Mục tiêu,Tài liệu",
         "Module 1 — Nền tảng,Làm quen format đề,Hiểu cấu trúc đề,Cambridge 18",
         ",,Viết introduction,File mẫu 2",
         "Module 2 — Thực hành,,Viết body paragraph,",
       ].join("\r\n");
     }
     ```
- Success criteria: file 4 cột parse đúng 2 module/3 buổi như cũ (mọi lesson status `"upcoming"`); file 5 cột có header "Trạng thái" trả đúng 1 lỗi hướng dẫn; file 5 cột KHÔNG header (dòng data có ô thứ 5) bị lỗi dòng ở đúng số dòng; mọi hành vi khác (numbering, cap, length, BOM, delimiter `;`) giữ nguyên.
- Verify: Task 3.2.

### Task 3.2 — Cập nhật unit tests parser
- Goal: bộ test phản ánh hợp đồng 4 cột và khóa 2 luật chặn template cũ.
- Target files: `apps/web/src/lib/syllabus-import.test.ts`.
- Steps (đọc file trước khi sửa; map theo tên test hiện có):
  1. Test "auto-numbering..." (dòng 103): bỏ part status trong mô tả — objectives/materials map cột 2/3; nếu test đang assert `status` trên lesson, đổi kỳ vọng sang `status: "upcoming"` (hằng số mới của parser); input rows bỏ cột thứ 5.
  2. Test "trạng thái: đã dạy/done..." (dòng 256): xóa, thay bằng 2 test mới:
     - "template v2 5 cột ('Trạng thái'/'status' ở ô thứ 5 của header) → đúng 1 lỗi tường minh" (input header `Module,Mô tả module,Mục tiêu,Tài liệu,Trạng thái` + 1 dòng data; kỳ vọng lỗi chứa `File dùng template cũ`).
     - "file v2 KHÔNG header (dòng data có ô thứ 5 khác rỗng) → lỗi ở đúng dòng, không parse" (input không header, dòng `M1,,o,m,đã dạy`; kỳ vọng lỗi chứa `cột dữ liệu thừa`).
  3. Test "row ngắn... pad về 5 cột" (dòng 415): đổi thành "pad về 4 cột" — kỳ vọng cells dài 4; row dài hơn 4 cột: ô thứ 5 rỗng thì OK (bị cắt), khác rỗng thì lỗi theo luật mới.
  4. Test "dòng có Module nhưng cột 2/3/4 trống..." (dòng 286): đổi mô tả/kỳ hoạch sang "cột 2/3 trống" (module-only row).
  5. Test `buildSampleCsv` (dòng 546): header 4 cột, không "Trạng thái".
  6. Các test dùng dữ liệu 5 cột (header/data) — bỏ cột thứ 5 trong input literal.
  7. Các test khác (v1 6-cột dòng 67, numbering, kế thừa module, consecutive, cap 500, length mirror, no-data, Date cell, delimiter `;`, BOM, .xls, 2MB, quote) giữ nguyên kỳ vọng.
- Success criteria: toàn bộ file test pass và mô tả đúng hành vi mới.
- Verify: `pnpm --filter web exec vitest run src/lib/syllabus-import.test.ts` exit 0.

### Task 3.3 — Component preview dùng chung
- Goal: bảng preview + danh sách lỗi + nút gỡ file tách ra 1 component, dùng lại được ở cả popup create (phase này) và màn hình detail (Phase 4); bỏ cột Trạng thái.
- Target files: Create `apps/web/src/components/syllabus/import-preview.tsx`; Modify `apps/web/src/components/modals/add-syllabus-modal.tsx`.
- Steps:
  1. Tạo `import-preview.tsx` export `SyllabusImportPreview` với props:
     ```ts
     {
       result: SyllabusImportResult | null;
       onRemove: () => void;
       disabled?: boolean;
     }
     ```
     Nội dung chuyển nguyên từ `add-syllabus-modal.tsx`: nút gỡ file X (dòng 157–170, đổi `setImportResult(null)` → gọi `onRemove`, dùng `disabled` prop), nhánh `result?.ok` (summary "X module · Y buổi học" + bảng, dòng 252–319) và nhánh lỗi (dòng 320–343). Bảng dùng `PREVIEW_HEADERS = ["#", "Module", "Mục tiêu", "Tài liệu"]` (bỏ "Trạng thái"), xóa cột td Tag status và helper `lessonNumber` chuyển vào component (nguyên code dòng 143–153).
  2. Trong `add-syllabus-modal.tsx`: xóa `STATUS_LABELS` (dòng 30–34), `PREVIEW_HEADERS` (36), `lessonNumber` (143–153), phần JSX preview/lỗi (252–343); thay bằng `<SyllabusImportPreview result={importResult} onRemove={() => setImportResult(null)} disabled={saving || parsing} />`. Giữ nguyên logic `onFileChange`, guard `importBlocked`, `parsing`, `downloadSample`.
  3. Xóa import `Tag` khỏi `add-syllabus-modal.tsx` nếu không còn dùng.
- Success criteria: popup create hiển thị preview 4 cột, hành vi gỡ file/lỗi/giữ-state như cũ.
- Verify: `pnpm check-types` exit 0; `pnpm --filter web test` exit 0.

### Task 3.4 — Fixtures e2e + spec cũ
- Goal: fixture CSV/XLSX 4 cột; e2e hiện có pass với format mới.
- Target files: `apps/e2e/fixtures/syllabus-import.sample.csv`, Create `apps/e2e/scripts/regen-syllabus-import-fixture.mjs`, `apps/e2e/package.json`, `apps/e2e/specs/syllabus-excel-csv-import.spec.ts`, regenerate `apps/e2e/fixtures/syllabus-import.sample.xlsx`.
- Steps:
  1. Sửa `syllabus-import.sample.csv` cùng nội dung `buildSampleCsv()` (có BOM + CRLF, 4 cột, 2 module/3 buổi).
  2. Thêm `exceljs` vào khối `catalog` của `pnpm-workspace.yaml`, rồi thêm `"exceljs": "catalog:"` vào `devDependencies` của `apps/e2e/package.json` (mọi devDep của e2e đều dùng protocol `catalog:` — không ghi version literal). Chạy `pnpm install` ở root. **Commit kèm `pnpm-lock.yaml`** — CI e2e chạy `pnpm install --frozen-lockfile` (`.github/workflows/e2e.yml:29`), lockfile thiếu mục exceljs sẽ làm CI chết ở bước install.
  3. Tạo `apps/e2e/scripts/regen-syllabus-import-fixture.mjs`. Script PHẢI anchor đường dẫn output theo vị trí chính nó (chạy được từ mọi cwd):
     ```js
     import { writeFileSync } from "node:fs";
     import { fileURLToPath } from "node:url";
     import ExcelJS from "exceljs";

     const outPath = fileURLToPath(
       new URL("../fixtures/syllabus-import.sample.xlsx", import.meta.url),
     );
     // ... dựng workbook 1 sheet, 4 dòng (header + 3 dòng data) y hệt CSV,
     // mọi cell là string, rồi workbook.xlsx.writeBuffer()
     // Sau khi ghi: đọc lại file bằng exceljs, assert số dòng + 4 cột đầu khớp
     // dữ liệu nguồn — sai thì process.exit(1).
     ```
  4. Chạy `node apps/e2e/scripts/regen-syllabus-import-fixture.mjs` — phải exit 0 và file `apps/e2e/fixtures/syllabus-import.sample.xlsx` đổi (kiểm tra `ls -la` mtime). Commit script + binary + lockfile.
  5. Spec `syllabus-excel-csv-import.spec.ts`: cập nhật comment dòng 43–44 (không còn card "Buổi hiện tại" sau Phase 2 — assertion `getByText("Buổi 3", { exact: true })` giờ match title buổi học, vẫn đúng 1 element, giữ assertion và sửa comment); các assertion khác ("2 module · 3 buổi học", cột #, giữ-state, gỡ file) không đổi kỳ vọng.
- Success criteria: 3 test e2e cũ pass với fixture mới; script tự verify nội dung trước khi exit 0.
- Verify: `pnpm --filter e2e e2e` exit 0 (chạy từ `apps/e2e`; cần môi trường Playwright đã `pnpm install` ở root).

## Verification (regression gate toàn phase)

1. `pnpm --filter web test` → exit 0
2. `pnpm --filter server test` → exit 0
3. `pnpm check-types` → exit 0
4. `pnpm check` → exit 0
5. `pnpm --filter e2e e2e` → exit 0

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
