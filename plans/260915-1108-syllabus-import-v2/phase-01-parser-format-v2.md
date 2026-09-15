---
phase: 1
title: "Parser format v2 + template + fixtures"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Parser format v2 + template + fixtures

## Goal

Parser Excel/CSV chuyển sang format 5 cột (bỏ cột "Buổi học"), thứ tự buổi học tự động theo dòng (`Buổi {n}`), file mẫu + fixtures e2e khớp format mới, file template cũ nhận lỗi tường minh.

## Files to Create / Modify

- Modify: `apps/web/src/lib/syllabus-import.ts` (hàm `normalizeRow`, `rowsToModules`, `buildSampleCsv`, header comment)
- Modify: `apps/web/src/lib/syllabus-import.test.ts` (viết lại gần như toàn bộ)
- Create: `apps/web/scripts/gen-sample-xlsx.mjs`
- Modify (regenerate): `apps/e2e/fixtures/syllabus-import.sample.csv`
- Modify (regenerate): `apps/e2e/fixtures/syllabus-import.sample.xlsx`
- Modify: `plans/260914-0744-syllabus-excel-csv-import/plan.md` (chỉ thêm 1 dòng addendum, không sửa nội dung cũ)

**Không đụng:** `apps/server/**`, `packages/api/**`, `apps/server/src/syllabus-template-migration.test.ts` (migration 0009, không liên quan), `apps/web/src/components/**`.

## Tasks & Steps

### Task 1.1 — Parser core v2 + viết lại unit tests

- Goal: `rowsToModules` parse format 5 cột theo 14 luật trong `plan.md`; toàn bộ unit test pass.
- Target files: `apps/web/src/lib/syllabus-import.ts`, `apps/web/src/lib/syllabus-import.test.ts`.
- Steps:
  1. Trong `normalizeRow`: đổi vòng lặp `i < 6` thành `i < 5`; cập nhật docblock ("5 cột" thay "6 cột").
  2. Trong `rowsToModules`, **trước** logic skip-header hiện tại, thêm detect template cũ theo đúng thứ tự pseudocode sau:
     ```ts
     let start = 0;
     if (rows.length > 0) {
       const first = normalizeRow(rows[0], 1);
       if (first.ok) {
         // Luật 4 (mới): template cũ 6 cột có "Buổi học" ở cột 2 — bắt TRƯỚC
         // skip-header vì header cũ cũng có "Module" ở cột 0. Không kèm điều
         // kiện độ dài row (xlsx/papaparse pad đuôi khác nhau → misfire).
         const col2 = first.cells[2].toLowerCase();
         if (col2 === "buổi học" || col2 === "lesson") {
           return {
             ok: false,
             errors: [
               'File dùng template cũ (cột "Buổi học" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.',
             ],
           };
         }
         // Luật 5: header mới — bỏ dòng đầu iff cột 0 là "module".
         if (first.cells[0].toLowerCase() === "module") start = 1;
       }
     }
     ```
  3. Trong vòng lặp data, thay toàn bộ khối `if (cells[2] !== "") … else if (cells[3] !== "" || …)` (luật 9 cũ) bằng:
     ```ts
     // Luật 8: dòng tạo buổi học iff bất kỳ ô Mục tiêu/Tài liệu/Trạng thái
     // khác rỗng. Title tự sinh theo thứ tự buổi TOÀN FILE (1-based);
     // module-only row và dòng trống không tiêu số.
     const hasLessonContent =
       cells[2] !== "" || cells[3] !== "" || cells[4] !== "";
     if (hasLessonContent) {
       const status = mapStatus(cells[4], lineNumber);
       if (!status.ok) {
         errors.push(status.error);
         continue;
       }
       currentModule?.lessons.push({
         title: `Buổi ${lessonOrdinal}`,
         objectives: cells[2],
         materials: cells[3],
         status: status.status,
       });
       lessonOrdinal += 1;
     }
     ```
     Khai báo `let lessonOrdinal = 1;` cạnh `let currentModule`. Module-grouping (luật 6/7 cũ) giữ nguyên.
  4. Thay `buildSampleCsv()` bằng đúng nội dung "Sample CSV v2" trong `plan.md` (BOM + CRLF, header `Module,Mô tả module,Mục tiêu,Tài liệu,Trạng thái`, 3 dòng data).
  5. Cập nhật header comment đầu `syllabus-import.ts`: tham chiếu "14 luật" và hợp đồng mới `plans/260915-1108-syllabus-import-v2/plan.md` (thay đường dẫn plan v1).
  6. Viết lại `syllabus-import.test.ts` — giữ cấu trúc describe (`rowsToModules`, `normalizeRow`, `parseSyllabusFile (CSV)`, `buildSampleCsv`), mọi fixture data chuyển sang 5 cột. Test bắt buộc phải có:
     - Header mới skip qua `cells[0] === "Module"` (kèm biến thể "module" lowercase); dòng đầu không phải header → là data.
     - Template cũ: header cũ 6 cột → đúng thông điệp lỗi trên; dòng đầu 6 cột `["Module","Mô tả module","Buổi học","Mục tiêu","Tài liệu","Trạng thái"]` và cả biến thể `"lesson"`; file cũ có padding cột rỗng đuôi (7–8 ô) vẫn dính luật 4 (chứng minh không misfire).
     - Auto-numbering: 3 lesson xuyên 2 module → title `Buổi 1`, `Buổi 2`, `Buổi 3`; dòng trống xen giữa và module-only row **không** tiêu số (ví dụ input 3 dòng `["M1","","","",""]`, `["","","","",""]`, `["","","mục tiêu","",""]` → duy nhất 1 lesson, title là `Buổi 1`); title `objectives/materials/status` map đúng cột 2/3/4.
     - Module-only row → module `lessons: []`, `lessonCount: 0`; dòng data đầu thiếu module → lỗi "Dòng 1: thiếu tên module"; nhóm consecutive + trùng tên không liền kề (giữ test cũ, data 5 cột).
     - Trạng thái: cột 4; đủ 7 giá trị map + lỗi "trạng thái không hợp lệ 'finished'".
     - Cap 500 (giữ test cũ, data 5 cột, expected đúng số mục); "Không có dòng dữ liệu." (giữ); row ngắn pad / row dài cắt về 5 cột; `normalizeRow` Date-lỗi + mixed-coerce (input `["M1", 42, true, null, undefined]` → expected 5 phần tử `["M1","42","true","",""]`).
     - CSV: delimiter `;`, BOM strip (fixture text 5 cột), `.xls` reject, >2MB reject, quote lỗi — giữ nguyên hành vi, đổi data.
     - `buildSampleCsv`: BOM, 4 dòng sau khi bỏ BOM, dòng 0 đúng header mới, dòng 2 bắt đầu `","` (module rỗng kế thừa), dòng 3 là module mới.
- Success criteria: không còn chuỗi "Buổi học" trong lib ngoài thông điệp lỗi luật 4; mọi test mới pass.
- Verify: `pnpm --filter web test -- syllabus-import` → **exit 0**, stdout chứa `syllabus-import.test.ts` và `passed`.

### Task 1.2 — Script sinh fixture xlsx + regenerate 2 fixtures

- Goal: fixture `syllabus-import.sample.xlsx` (binary) và `syllabus-import.sample.csv` phản ánh format 5 cột; có script tái sinh được, không thêm npm deps.
- Target files: `apps/web/scripts/gen-sample-xlsx.mjs` (mới), `apps/e2e/fixtures/syllabus-import.sample.csv`, `apps/e2e/fixtures/syllabus-import.sample.xlsx`.
- Steps:
  1. Viết `apps/web/scripts/gen-sample-xlsx.mjs` (chạy bằng `node`, ESM):
     - Data = đúng 4 dòng của `buildSampleCsv()` (không BOM): header + `Module 1 — Nền tảng…` + `,,Viết introduction,File mẫu 2,đã dạy` + `Module 2 — Thực hành…`.
     - Build minimal xlsx bằng **zip tự viết trên node stdlib**: `node:zlib`.`deflateRawSync` cho mỗi entry + CRC32 tự viết (bảng 256 phần tử) + local file header + central directory + EOCD. Đúng **5 entries**: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/worksheets/sheet1.xml`. Cell text dùng inline string `<c r="A1" t="inlineStr"><is><t>…</t></is></c>`; escape XML (`&`,`<`,`>`,`"`). Header comment trong script ghi rõ cách tái chạy.
     - Ghi ra `../e2e/fixtures/syllabus-import.sample.xlsx` (resolve từ `import.meta.url`, không từ cwd).
     - **Round-trip verify (bắt buộc, ngay trong script)**: đọc lại file vừa ghi bằng `await import("read-excel-file/node")` (dep prod của apps/web — script nằm trong apps/web nên resolve được), assert mảng rows trả về deep-equal 4 dòng data (coerce số/null về string trước khi so), in `round-trip OK: 4 rows x 5 cols`; sai → `process.exit(1)`.
  2. Chạy script 1 lần để ghi đè fixture xlsx; commit cả script lẫn binary.
  3. Ghi đè `apps/e2e/fixtures/syllabus-import.sample.csv` bằng đúng nội dung `buildSampleCsv()` (UTF-8, có BOM, CRLF) — có thể tạo bằng `node -e` xuất chuỗi từ 4 dòng text, hoặc ghi trực tiếp.
- Success criteria: script exit 0 + in `round-trip OK`; 2 fixture files mới tồn tại với nội dung 5 cột.
- Verify: `node apps/web/scripts/gen-sample-xlsx.mjs` → **exit 0**, stdout chứa `round-trip OK`; `head -c 200 apps/e2e/fixtures/syllabus-import.sample.csv` hiển thị header `Module,Mô tả module,Mục tiêu,Tài liệu,Trạng thái` (sau BOM nếu có).

### Task 1.3 — Addendum plan v1 + rà tham chiếu

- Goal: plan v1 không gây hiểu lầm là hợp đồng còn hiệu lực; không còn tham chiếu luật cũ sống sót.
- Target files: `plans/260914-0744-syllabus-excel-csv-import/plan.md`.
- Steps:
  1. Ngay dưới tiêu đề mục `## Định dạng file nhập (hợp đồng forensic — mọi phase theo đúng mục này)` của plan v1, thêm đúng 1 dòng blockquote: `> **Superseded 2026-09-15:** format v2 5 cột (bỏ cột Buổi học, auto-numbering "Buổi {n}") — hợp đồng hiện hành: plans/260915-1108-syllabus-import-v2/plan.md`
  2. Không sửa bất kỳ dòng nào khác của plan v1.
- Success criteria: addendum tồn tại; `syllabus-import.ts` trỏ hợp đồng mới (đã làm ở Task 1.1 bước 5).
- Verify: `grep -c "260915-1108-syllabus-import-v2" plans/260914-0744-syllabus-excel-csv-import/plan.md apps/web/src/lib/syllabus-import.ts` → mỗi file ≥ 1.

## Phase Verification (chạy sau khi đủ Task 1.1–1.3)

- `pnpm --filter web test -- syllabus-import` → exit 0.
- `pnpm --filter web check-types` → exit 0.
- `node apps/web/scripts/gen-sample-xlsx.mjs` → exit 0 + `round-trip OK`.

## Risk Assessment

- Fixture xlsx hỏng zip → chính round-trip trong script bắt ngay lúc generate (không để e2e đỏ bí ẩn ở CI).
- Test cũ pin luật v1 (`Buổi học`, 6 cột) sẽ đỏ nếu chỉ sửa lib mà chưa viết lại test — Task 1.1 gộp cả hai trong cùng một đơn vị vì lý do này.
- Port 8000 local có thể bị dev env giữ (như lần trước) — e2e của Phase 2 sẽ xử lý riêng; phase này không phụ thuộc e2e.

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
