---
phase: 3
title: "Modal UI & E2E"
status: pending
priority: P1
effort: 6h
dependencies: [1, 2]
---

# Phase 3: Modal UI & E2E

## Goal

Giáo viên upload .csv/.xlsx ngay trong `AddSyllabusModal`, xem preview/k lỗi, tải file mẫu, và tạo syllabus kèm toàn bộ nội dung; e2e phủ **cả hai** code path parse (CSV qua papaparse, XLSX qua read-excel-file).

## Files to Create / Modify

- Modify: `apps/web/src/components/modals/add-syllabus-modal.tsx`
- Create: `apps/e2e/fixtures/syllabus-import.sample.csv`
- Create: `apps/e2e/fixtures/syllabus-import.sample.xlsx` (copy từ plan assets)
- Create: `apps/e2e/specs/syllabus-excel-csv-import.spec.ts`

## Key Insights

- Pattern file input ẩn + ref.click(): copy theo `apps/web/src/components/profile/avatar-section.tsx:77–84`.
- **Contract test quét source modal**: `apps/web/src/lib/kernel-runtime.contract.test.ts` loop `KERNEL_WRITE_MODALS` (có `add-syllabus-modal.tsx`, dòng 19) và assert regex `/disabled=\{saving \|\| submitBlocked/` (dòng 135). Vì vậy điều kiện disabled PHẢI giữ nguyên prefix `disabled={saving || submitBlocked` rồi mới nối thêm điều kiện mới phía sau (xem Task 3.1 bước 7). Các assertion kèm theo (`async function submit`, `const result = await run(`) vẫn khớp sau khi sửa.
- E2E phải có **cả CSV lẫn XLSX** — hai lib, hai code path; e2e CSV không exercise `read-excel-file` chút nào (kongming).
- Fixture .xlsx nhị phân đã có sẵn ở `plans/260914-0744-syllabus-excel-csv-import/assets/syllabus-import.sample.xlsx` (4 hàng × 6 cột; **A3 rỗng** để thử luật kế thừa module/merged-cell) — executor CHỈ copy, không tự sinh file nhị phân.
- Chuỗi copy UI là contract cho e2e locator — dùng đúng từng ký tự (kể cả dấu `·`).
- Prefill `totalLessons`: parse thành công thì gửi **trực tiếp** `totalLessons: lessonCount` trong payload — không đi qua state `total` (string) vì `Number.parseInt(total, 10) || 10` hiện có (`add-syllabus-modal.tsx:66`) sẽ biến `0` thành `10`.

## Tasks & Steps

### Task 3.1 — Upload section + preview trong AddSyllabusModal

- Goal: modal có upload, preview, lỗi theo dòng, nút gỡ file; submit gửi `modules`; parse lỗi chặn submit.
- Target files and symbols: `apps/web/src/components/modals/add-syllabus-modal.tsx` — component `AddSyllabusModal`.
- Steps:
  1. Thêm imports: `useRef` từ react; `parseSyllabusFile`, `type SyllabusImportResult` từ `@/lib/syllabus-import`.
  2. Thêm state: `const fileInputRef = useRef<HTMLInputElement>(null);`, `const [importResult, setImportResult] = useState<SyllabusImportResult | null>(null);`, `const [parsing, setParsing] = useState(false);`
  3. Thêm async handler `onFileChange(e)` — **dùng try/finally để `setParsing(false)` luôn chạy** (tránh kẹt "Đang đọc file…" khi adapter throw):
     ```ts
     async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
     	const file = e.target.files?.[0];
     	e.target.value = ""; // cho phép chọn lại cùng file
     	if (!file) return;
     	setParsing(true);
     	try {
     		const result = await parseSyllabusFile(file);
     		setImportResult(result);
     		if (result.ok) setTotal(String(result.lessonCount));
     	} finally {
     		setParsing(false);
     	}
     }
     ```
  4. Render sau field "Mô tả", trước field "Số buổi dự kiến":
     - Field label: `Nhập nhanh từ Excel/CSV (tùy chọn)`
     - Hidden input: `<input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onFileChange} />`
     - Row: `<Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={parsing}>Chọn file</Button>` + `<Button type="button" variant="secondary" size="sm" onClick={downloadSample}>Tải file mẫu</Button>`
     - Khi `parsing`: text `Đang đọc file…`.
     - Khi `importResult?.ok === true`: `<p>{importResult.modules.length} module · {importResult.lessonCount} buổi học</p>` + `<details><summary>Xem trước nội dung</summary>` render mỗi module `<li>{m.title} ({m.lessons.length} buổi)</li>` `</details>` + button `Gỡ file` (set `importResult` về null).
     - Khi `importResult` có lỗi: `<ul role="alert">` với mỗi error một `<li>` (danger text class như error hiện có: `text-danger text-xs`) + button `Gỡ file`. **Có lỗi parse → nút "Tạo" bị disable** (bước 7) — không cho tạo syllabus rỗng khi teacher đã cố import.
  5. Hàm `downloadSample()`: `const csv = buildSampleCsv();` (import từ `@/lib/syllabus-import`) → `const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));` → tạo `<a href={url} download="syllabus-template.csv">` click rồi `URL.revokeObjectURL(url)`.
  6. Trong `submit(e)`:
     - Guard đầu hàm: `if (parsing || (importResult !== null && !importResult.ok)) return;`
     - Payload `add-syllabus` thay 2 field:
       ```ts
       modules: importResult?.ok ? importResult.modules : undefined,
       totalLessons: importResult?.ok
       	? importResult.lessonCount
       	: (Number.parseInt(total, 10) || 10),
       ```
  7. Button submit — **giữ nguyên prefix `disabled={saving || submitBlocked`** (contract test, xem Key Insights), nối thêm phía sau:
     `disabled={saving || submitBlocked || parsing || (importResult !== null && !importResult.ok)}`. Button Hủy giữ `disabled={saving}`.
  8. `resetForm()` thêm `setImportResult(null)`.
- Success criteria: chọn file hợp lệ → preview + total ghi đè; file lỗi → danh sách lỗi + nút Tạo disabled; submit tạo syllabus có nội dung (e2e Verify ở Task 3.4).
- Verify: `pnpm --filter web build` exits 0; **và** `pnpm --filter web test -- kernel-runtime` exits 0 (contract test regex dòng 135 vẫn khớp source modal sau khi sửa).

### Task 3.2 — E2E fixtures

- Goal: 2 fixture file với cùng nội dung 2 module · 3 buổi học, cả hai đều thử luật kế thừa module.
- Target files: Create `apps/e2e/fixtures/syllabus-import.sample.csv`; Create `apps/e2e/fixtures/syllabus-import.sample.xlsx`.
- Steps:
  1. Tạo `apps/e2e/fixtures/syllabus-import.sample.csv` — file text UTF-8 **có BOM** (`\uFEFF` đầu file), 4 dòng (dòng 3 **Module rỗng** → kế thừa):
     ```csv
     Module,Mô tả module,Buổi học,Mục tiêu,Tài liệu,Trạng thái
     Module 1 — Nền tảng,Làm quen format đề,Buổi 1,Hiểu cấu trúc đề,Cambridge 18,sắp tới
     ,,Buổi 2,Viết introduction,File mẫu 2,đã dạy
     Module 2 — Thực hành,,Buổi 3,Viết body paragraph,,đang học
     ```
     (Cách ghi BOM deterministic: `printf '\xEF\xBB\xBF' > file` rồi append nội dung.)
  2. Copy: `cp plans/260914-0744-syllabus-excel-csv-import/assets/syllabus-import.sample.xlsx apps/e2e/fixtures/syllabus-import.sample.xlsx` (asset có A3 rỗng — cùng ngữ nghĩa kế thừa).
- Success criteria: 2 file tồn tại; csv bắt đầu bằng `EF BB BF`.
- Verify: `ls apps/e2e/fixtures/syllabus-import.sample.*` in ra 2 file; `xxd apps/e2e/fixtures/syllabus-import.sample.csv | head -1` bắt đầu bằng `efbb bf`.

### Task 3.3 — Không có task riêng (gộp vào 3.4)

### Task 3.4 — E2E spec: CSV path + XLSX path

- Goal: e2e end-to-end cho cả hai định dạng, từ upload đến detail page.
- Target files: Create `apps/e2e/specs/syllabus-excel-csv-import.spec.ts`.
- Steps:
  1. Imports: `import { expect, test } from "@playwright/test";` và `import { signUpViaUi } from "./helpers";` (pattern file `apps/e2e/specs/syllabus-delete-reorder.spec.ts`).
  2. Viết 2 test song song cấu trúc (chỉ khác fixture + tên):
     - `test("tạo syllabus bằng upload CSV: preview rồi thấy đủ modules/buổi trên trang chi tiết", ...)` dùng `fixtures/syllabus-import.sample.csv`
     - `test("tạo syllabus bằng upload XLSX: preview rồi thấy đủ modules/buổi trên trang chi tiết", ...)` dùng `fixtures/syllabus-import.sample.xlsx`
  3. Thân mỗi test:
     1. `await signUpViaUi(page);`
     2. `await page.goto("/syllabus");`
     3. Click nút `+ Tạo syllabus`.
     4. Điền tên: fill input placeholder `VD: IELTS Writing 7.0` với `E2E Import CSV ${Date.now()}` (hoặc XLSX).
     5. Chọn skill (type ielts cần ≥1): click text `Writing`.
     6. `await page.setInputFiles("input[type=file]", "fixtures/syllabus-import.sample.csv")` (đường dẫn tính từ `apps/e2e`).
     7. `await expect(page.getByText("2 module · 3 buổi học")).toBeVisible();`
     8. `await expect(page.getByLabel("Số buổi dự kiến")).toHaveValue("3");` (Field gắn label–control qua id: `apps/web/src/components/ui/field.tsx:31–34`).
     9. Click button `Tạo`.
     10. Chờ điều hướng: `await page.waitForURL(/\/syllabus\/.+/);`
     11. Assert nội dung: `await expect(page.getByText("Module 1 — Nền tảng")).toBeVisible();` tương tự `Module 2 — Thực hành`, `Buổi 1`, `Buổi 2`, `Buổi 3`.
- Success criteria: 2 test xanh.
- Verify: `pnpm --filter e2e e2e` exits 0 (playwright tự boot 2 webServer theo config).

### Task 3.5 — Cổng kiểm tra toàn repo

- Goal: mọi gate xanh trước handoff code review.
- Steps: chạy lần lượt 4 lệnh dưới.
- Success criteria: cả 4 exit 0.
- Verify:
  1. `pnpm check` → exit 0 (biome auto-format; commit thay đổi format nếu có).
  2. `pnpm check-types` → exit 0.
  3. `pnpm test` → exit 0 (turbo run test + ci-workflow + topology-drift).
  4. `pnpm --filter e2e e2e` → exit 0.

## Verification (cổng cuối phase)

- `pnpm --filter web build` → exit 0.
- `pnpm --filter web test -- kernel-runtime` → exit 0 (regex contract giữ nguyên).
- `xxd apps/e2e/fixtures/syllabus-import.sample.csv | head -1` → bắt đầu `efbb bf`.
- `pnpm --filter e2e e2e` → exit 0.
- `pnpm check && pnpm check-types && pnpm test` → exit 0 cả ba.

## Risk Assessment

- **Locator e2e phụ thuộc chuỗi copy** — nếu đổi copy UI phải đổi cả spec (đã cố định chuỗi ở Task 3.1/3.4; giữ đồng bộ).
- ChipMulti skill click theo text `Writing` — nếu chip render chữ khác (VD uppercase), dùng `getByText("Writing", { exact: false })`; KHÔNG dùng selector vị trí.
- **E2E DB là file-backed, không phải in-memory**: `apps/e2e/src/boot.ts` wipe `local.db` (+wal/shm) bằng `rmSync` mỗi boot — sạch là nhờ wipe, không phải memory DB. Không chạy 2 instance e2e song song trên cùng thư mục; `Date.now()` trong tên là guard thứ hai.
- Playwright workers 1, timezone VN; các `expect(...).toBeVisible()` auto-retry — không thêm waitFor thủ công.

## Security Considerations

- `accept=".csv,.xlsx"` chỉ là UX filter — validation thật nằm trong `parseSyllabusFile` (đuôi + size); duplicate ở 2 lớp là có chủ đích.
- Blob download chỉ chứa template tĩnh sinh trong code — không chứa dữ liệu người dùng.
- Không render nội dung file bằng `dangerouslySetInnerHTML` — chỉ text node React.

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
