/**
 * Regen fixture v4 cho e2e import syllabus (issue #154) và file mẫu nhúng
 * trong apps/web: dựng `fixtures/syllabus-import.v4.xlsx` +
 * `apps/web/src/lib/syllabus-template-xlsx.ts` từ dữ liệu nguồn ROWS — y hệt
 * `SAMPLE_ROWS` (apps/web/src/lib/syllabus-import.ts): 5 cột (cột "Loại"),
 * 2 module · 5 buổi, buổi `giữa kỳ` cuối Module 1 và `cuối kỳ` cuối Module 2.
 *
 * Fixture v3 4 cột (syllabus-import.sample.xlsx) là regression legacy —
 * KHÔNG đụng tới, regen bằng regen-syllabus-import-fixture.mjs.
 *
 * Anchor output theo vị trí chính nó → chạy được từ mọi cwd:
 *   node apps/e2e/scripts/regen-syllabus-v4-fixture.mjs
 * Sau khi ghi, đọc lại và assert cấu trúc + nội dung khớp nguồn — sai thì
 * exit 1 (chặn fixture lạc/sai dễ gây e2e đỏ misleading).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const xlsxPath = fileURLToPath(
	new URL("../fixtures/syllabus-import.v4.xlsx", import.meta.url),
);
const webTemplatePath = fileURLToPath(
	new URL(
		"../../../apps/web/src/lib/syllabus-template-xlsx.ts",
		import.meta.url,
	),
);

const MAX_TEMPLATE_BYTES = 15_360;

// Dữ liệu nguồn — mirror 1:1 SAMPLE_HEADER + SAMPLE_ROWS trong syllabus-import.ts.
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

const GUIDE_ROWS = [
	["Mục", "Hướng dẫn chi tiết"],
	[
		"Sheet nhập liệu",
		"Chỉ điền dữ liệu ở sheet Syllabus (hệ thống chỉ đọc sheet đầu tiên).",
	],
	[
		"Cột Module",
		"Điền tên module ở dòng đầu nhóm; để trống ô Module ở các dòng kế tiếp (hoặc lặp lại tên giống hệt) để gộp buổi vào module đó.",
	],
	[
		"Cột Mô tả module",
		"Mô tả ngắn cho module (chỉ lấy ở dòng đầu tiên của module).",
	],
	[
		"Cột Mục tiêu & Tài liệu",
		"Nội dung từng buổi học; hệ thống tự đánh số Buổi 1, Buổi 2… theo thứ tự dòng.",
	],
	[
		"Cột Loại",
		"Chọn giữa kỳ hoặc cuối kỳ từ danh sách thả xuống cho buổi kiểm tra; để trống nếu là buổi học thường.",
	],
	[
		"Định dạng & giới hạn",
		"Các ô đã khóa định dạng Text (@); tối đa 2 MB và 500 mục (module + buổi học).",
	],
];

const CELL_STYLE = {
	numFmt: "@",
	alignment: { vertical: "top", wrapText: true },
};

function styleHeaderRow(row) {
	row.height = 24;
	row.eachCell({ includeEmpty: true }, (cell) => {
		cell.font = { bold: true };
		cell.fill = {
			type: "pattern",
			pattern: "solid",
			fgColor: { argb: "FFF4F4F5" },
		};
		cell.border = {
			bottom: { style: "thin", color: { argb: "FFD4D4D8" } },
		};
		cell.alignment = { vertical: "middle", wrapText: true };
		cell.numFmt = "@";
	});
}

function fail(message) {
	console.error(`self-verify fail: ${message}`);
	process.exit(1);
}

// --- XLSX: 2 sheet ("Syllabus" + "Hướng dẫn"), metadata cố định ---
const workbook = new ExcelJS.Workbook();
workbook.created = new Date("2026-01-01T00:00:00.000Z");
workbook.modified = new Date("2026-01-01T00:00:00.000Z");
workbook.creator = "Teacher OS";

const sheet = workbook.addWorksheet("Syllabus", {
	views: [{ state: "frozen", ySplit: 1 }],
});
sheet.columns = [
	{ width: 28, style: CELL_STYLE },
	{ width: 28, style: CELL_STYLE },
	{ width: 34, style: CELL_STYLE },
	{ width: 24, style: CELL_STYLE },
	{ width: 16, style: CELL_STYLE },
];
for (const row of ROWS) {
	sheet.addRow(row);
}
styleHeaderRow(sheet.getRow(1));
for (let r = 2; r <= ROWS.length; r++) {
	sheet.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
		cell.numFmt = "@";
	});
}
sheet.dataValidations.add("E2:E501", {
	type: "list",
	allowBlank: true,
	formulae: ['"giữa kỳ,cuối kỳ"'],
	showInputMessage: true,
	promptTitle: "Loại buổi học",
	prompt: "Để trống = buổi học thường; chọn giữa kỳ hoặc cuối kỳ cho buổi thi.",
	showErrorMessage: true,
	errorStyle: "error",
	errorTitle: "Loại buổi không hợp lệ",
	error: "Để trống cho buổi học thường, hoặc chọn: giữa kỳ / cuối kỳ.",
});

const guideSheet = workbook.addWorksheet("Hướng dẫn", {
	views: [{ state: "frozen", ySplit: 1 }],
});
guideSheet.columns = [
	{ width: 26, style: CELL_STYLE },
	{ width: 68, style: CELL_STYLE },
];
for (const row of GUIDE_ROWS) {
	guideSheet.addRow(row);
}
styleHeaderRow(guideSheet.getRow(1));
for (let r = 2; r <= GUIDE_ROWS.length; r++) {
	guideSheet.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
		cell.numFmt = "@";
	});
}

const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
writeFileSync(xlsxPath, buffer);

const tsContent = [
	"/**",
	" * File mẫu syllabus `.xlsx` nhúng sẵn — được sinh tự động bởi",
	" * `apps/e2e/scripts/regen-syllabus-v4-fixture.mjs`. Không sửa tay.",
	" */",
	"export const SYLLABUS_SAMPLE_XLSX_BASE64 =",
	`\t"${buffer.toString("base64")}";`,
	"",
].join("\n");
writeFileSync(webTemplatePath, tsContent, "utf8");

// --- Self-verify 1: kích thước buffer ---
if (buffer.byteLength >= MAX_TEMPLATE_BYTES) {
	fail(
		`kích thước buffer ${buffer.byteLength} bytes vượt ngưỡng ${MAX_TEMPLATE_BYTES}`,
	);
}

// --- Self-verify 2: đọc lại bằng ExcelJS ---
const reread = new ExcelJS.Workbook();
await reread.xlsx.load(readFileSync(xlsxPath));
const sheetNames = reread.worksheets.map((ws) => ws.name);
if (JSON.stringify(sheetNames) !== JSON.stringify(["Syllabus", "Hướng dẫn"])) {
	fail(`tên worksheet không khớp: ${JSON.stringify(sheetNames)}`);
}

const first = reread.worksheets[0];
if (first.views[0]?.state !== "frozen" || first.views[0]?.ySplit !== 1) {
	fail(
		`Syllabus views không đúng frozen ySplit=1: ${JSON.stringify(first.views)}`,
	);
}
for (let c = 1; c <= 5; c++) {
	if (first.getColumn(c).numFmt !== "@") {
		fail(`Cột ${c} thiếu numFmt "@": ${first.getColumn(c).numFmt}`);
	}
}
for (let r = 2; r <= 501; r++) {
	const dv = first.dataValidations.find(`E${r}`);
	if (dv?.type !== "list" || dv.formulae?.[0] !== '"giữa kỳ,cuối kỳ"') {
		fail(`Data validation tại E${r} không đúng: ${JSON.stringify(dv)}`);
	}
}

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

// --- Self-verify 3: kiểm chứng read-excel-file/node trả đúng 6 dòng ---
let readSheet;
try {
	({ readSheet } = await import("read-excel-file/node"));
} catch {
	({ readSheet } = await import(
		new URL(
			"../../../apps/web/node_modules/read-excel-file/node/index.js",
			import.meta.url,
		).href
	));
}
const parsedRows = await readSheet(buffer);
if (parsedRows.length !== ROWS.length) {
	fail(
		`read-excel-file/node trả ${parsedRows.length} dòng (kỳ vọng ${ROWS.length})`,
	);
}
const parsedNormalized = parsedRows.map((row) =>
	row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
);
if (JSON.stringify(parsedNormalized) !== JSON.stringify(expected)) {
	fail(
		`read-excel-file/node nội dung không khớp:\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(parsedNormalized)}`,
	);
}

console.log(
	`regenerated + verified:\n  ${xlsxPath} (${buffer.byteLength} bytes, ${actual.length} rows)\n  ${webTemplatePath}`,
);
