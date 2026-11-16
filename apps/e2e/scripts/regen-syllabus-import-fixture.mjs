/**
 * Regen fixture legacy v3 cho e2e import syllabus (issue #152): dựng lại
 * `fixtures/syllabus-import.sample.xlsx` từ dữ liệu nguồn ROWS — 4 cột,
 * không cột "Trạng thái"/"Loại", 2 module · 3 buổi.
 *
 * Anchor output theo vị trí chính nó → chạy được từ mọi cwd:
 *   node apps/e2e/scripts/regen-syllabus-import-fixture.mjs
 * Sau khi ghi, đọc lại file và assert nội dung khớp nguồn — sai thì exit 1
 * (chặn fixture lạc/sai dễ gây e2e đỏ misleading).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const xlsxPath = fileURLToPath(
	new URL("../fixtures/syllabus-import.sample.xlsx", import.meta.url),
);

const ROWS = [
	["Module", "Mô tả module", "Mục tiêu", "Tài liệu"],
	[
		"Module 1 — Nền tảng",
		"Làm quen format đề",
		"Hiểu cấu trúc đề",
		"Cambridge 18",
	],
	["", "", "Viết introduction", "File mẫu 2"],
	["Module 2 — Thực hành", "", "Viết body paragraph", ""],
];

function fail(message) {
	console.error(`self-verify fail: ${message}`);
	process.exit(1);
}

// --- XLSX: 1 sheet, mọi cell Text, cùng ROWS ---
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Syllabus");
for (const row of ROWS) {
	sheet.addRow(row);
}
sheet.eachRow((row) => {
	row.eachCell((cell) => {
		cell.numFmt = "@"; // Text — tránh Excel/read-excel-file hiểu thành ngày/số
	});
});
const buffer = await workbook.xlsx.writeBuffer();
writeFileSync(xlsxPath, buffer);

// Self-verify: đọc lại và so khớp dữ liệu nguồn.
const reread = new ExcelJS.Workbook();
await reread.xlsx.load(readFileSync(xlsxPath));
const first = reread.worksheets[0];
if (!first) fail("XLSX không có worksheet");
const actual = [];
first.eachRow({ includeEmpty: true }, (row) => {
	const values = [];
	for (let c = 1; c <= 4; c++) {
		const v = row.getCell(c).value;
		values.push(v === undefined || v === null ? "" : String(v));
	}
	actual.push(values);
});
const expected = ROWS.map((row) => row.map((cell) => String(cell)));
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
	fail(
		`XLSX nội dung không khớp nguồn:\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
	);
}
console.log(`regenerated + verified:\n  ${xlsxPath} (${actual.length} rows)`);
