/**
 * Regen fixture v4 cho e2e import syllabus (issue #154): dựng lại
 * fixtures/syllabus-import.v4.{csv,xlsx} từ dữ liệu nguồn ROWS — y hệt
 * `SAMPLE_ROWS` (apps/web/src/lib/syllabus-import.ts): 5 cột (cột "Loại"),
 * 2 module · 5 buổi, buổi `giữa kỳ` cuối Module 1 và `cuối kỳ` cuối Module 2.
 * CSV và XLSX cùng một nguồn để không bao giờ lệch nhau.
 *
 * Fixture v3 4 cột (syllabus-import.sample.*) là regression legacy — KHÔNG
 * đụng tới, regen bằng regen-syllabus-import-fixture.mjs.
 *
 * Anchor output theo vị trí chính nó → chạy được từ mọi cwd:
 *   node apps/e2e/scripts/regen-syllabus-v4-fixture.mjs
 * Sau khi ghi, đọc lại từng file và assert nội dung khớp nguồn — sai thì
 * exit 1 (chặn fixture lạc/sai dễ gây e2e đỏ misleading).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const csvPath = fileURLToPath(
	new URL("../fixtures/syllabus-import.v4.csv", import.meta.url),
);
const xlsxPath = fileURLToPath(
	new URL("../fixtures/syllabus-import.v4.xlsx", import.meta.url),
);

// Dữ liệu nguồn — mirror 1:1 SAMPLE_ROWS + SAMPLE_HEADER của buildSampleCsv().
const ROWS = [
	["Module", "Mô tả module", "Mục tiêu", "Tài liệu", "Loại"],
	[
		"Module 1 — Nền tảng",
		"Làm quen format đề",
		"Hiểu cấu trúc đề",
		"Cambridge 18",
		"",
	],
	["", "", "Viết introduction", "File mẫu 2", ""],
	["", "", "Kiểm tra giữa kỳ", "", "giữa kỳ"],
	["Module 2 — Thực hành", "", "Viết body paragraph", "", ""],
	["", "", "Kiểm tra cuối kỳ", "", "cuối kỳ"],
];

function fail(message) {
	console.error(`self-verify fail: ${message}`);
	process.exit(1);
}

// --- CSV: UTF-8 BOM + CRLF, khớp buildSampleCsv() ---
const csvContent = `\uFEFF${ROWS.map((row) => row.join(",")).join("\r\n")}`;
writeFileSync(csvPath, csvContent, "utf8");
const csvReread = readFileSync(csvPath, "utf8");
if (csvReread !== csvContent) fail("CSV đọc lại không khớp nội dung đã ghi");
const csvLines = csvReread.slice(1).split("\r\n");
const expectedLines = ROWS.map((row) => row.join(","));
if (JSON.stringify(csvLines) !== JSON.stringify(expectedLines)) {
	fail(
		`CSV dòng không khớp nguồn:\n  expected ${JSON.stringify(expectedLines)}\n  actual   ${JSON.stringify(csvLines)}`,
	);
}
if (!csvReread.includes("Kiểm tra giữa kỳ")) {
	fail("CSV thiếu cell 'Kiểm tra giữa kỳ' (encoding lỗi?)");
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
	for (let c = 1; c <= 5; c++) {
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
console.log(
	`regenerated + verified:\n  ${csvPath}\n  ${xlsxPath} (${actual.length} rows)`,
);
