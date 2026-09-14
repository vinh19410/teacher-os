# Researcher Report — Client-side Excel/CSV parsing library choice

Research date: 2026-09-14 · Researcher agent (npm/OSV/GitHub/esbuild verified)

## Kết luận

**Chọn: `papaparse` (CSV) + `read-excel-file` entry `/browser` (XLSX)** — 2 deps nhỏ (~23KB gzip tổng), đều publish 8/2026, 0 CVE mở, ESM browser-native, 0 dòng config Vite.

**Fallback:** SheetJS CE 0.20.3 qua tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (covers cả 2 format, nhưng 158KB gzip và cập nhật bảo mật thủ công — Dependabot không theo dõi tarball).

**Loại:**
- `xlsx` trên npm (0.18.5, 2022): 2 CVE mở không bao giờ fix trên npm — GHSA-4r6h-8v6p-xvw6 / CVE-2023-30533 (prototype pollution, fixed 0.19.3), GHSA-5pgg-2g8v-p4x9 / CVE-2024-22363 (ReDoS, fixed 0.20.2).
- `exceljs` 4.4.0: stale 23 tháng, 948KB, entry browser cần workaround Vite (kéo `tmp`, `archiver`, `readable-stream`).

## Bảng so sánh (verify 2026-09-14)

| | `xlsx` (npm) | SheetJS CDN tarball | `exceljs` | `papaparse` | `read-excel-file` |
|---|---|---|---|---|---|
| Version | 0.18.5 | 0.20.3 | 4.4.0 | 5.7.0 | 9.3.10 |
| Last publish | 2022-03-24 | ~2024-12 | 2023-10-19 | 2026-08-24 | 2026-08-10 |
| CVE | 2 mở, không fix trên npm | Sạch (0.20.3) | Sạch nhưng stale | Sạch | Sạch (0 advisory) |
| Vite browser | Có | Có | Khó (node deps) | Có (CJS, pre-bundle tự động) | Có (ESM, bắt buộc subpath `/browser`) |
| Bundle min/gzip | ~430KB min | 491KB/158KB | 948KB/~250KB | 19KB/7KB | 52KB/16KB |
| Format | xlsx+csv | xlsx+csv+xls+ODS | xlsx (CSV kiểu Node stream) | Chỉ CSV | Chỉ .xlsx |

## Khai báo dependency (apps/web/package.json)

```json
{
  "dependencies": {
    "papaparse": "^5.7.0",
    "read-excel-file": "^9.3.10"
  },
  "devDependencies": {
    "@types/papaparse": "^5.3.16"
  }
}
```

Lưu ý:
- `read-excel-file` 9.x KHÔNG có entry gốc `.` — import bắt buộc `read-excel-file/browser`.
- Nên dynamic-import cả hai trong hàm parse để tách chunk khỏi bundle chính.
- 0 config Vite cần thêm.

## Code sample đọc rows từ File

```ts
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";

export async function parseFileRows(file: File): Promise<(string | null)[][]> {
  if (/\.(csv|txt)$/i.test(file.name)) {
    const { data } = Papa.parse<string[]>(await file.text(), {
      skipEmptyLines: true,
    });
    return data;
  }
  const rows = await readSheet(file); // (string|number|boolean|null)[][]
  return rows.map((row) => row.map((cell) => (cell == null ? null : String(cell))));
}
```

## Hạn chế

- Bundle size đo bằng esbuild single-entry, chưa phản ánh tree-shaking thực tế.
- Chưa benchmark file lớn (có entry `/web-worker` nếu cần).
- Không cover .xls legacy — nếu cần sau này thì chuyển nhánh fallback SheetJS.

Sources: npm (xlsx, exceljs, papaparse, read-excel-file), OSV.dev API, GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9, docs.sheetjs.com, github.com/catamphetamine/read-excel-file, vitejs/vite discussion #6640.
