/**
 * Sinh fixture e2e `apps/e2e/fixtures/syllabus-import.sample.xlsx` cho format
 * v2 5 cột (issue #150). Tự viết zip tối thiểu trên node stdlib (deflateRaw +
 * CRC32) — không thêm npm deps. Round-trip verify bằng read-excel-file/node
 * (dep prod của apps/web) trước khi exit 0.
 *
 * Chạy lại: node apps/web/scripts/gen-sample-xlsx.mjs
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROWS = [
	["Module", "Mô tả module", "Mục tiêu", "Tài liệu", "Trạng thái"],
	[
		"Module 1 — Nền tảng",
		"Làm quen format đề",
		"Hiểu cấu trúc đề",
		"Cambridge 18",
		"sắp tới",
	],
	["", "", "Viết introduction", "File mẫu 2", "đã dạy"],
	["Module 2 — Thực hành", "", "Viết body paragraph", "", "đang học"],
];

// ---------- CRC32 (bảng 256, poly 0xEDB88320) ----------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	CRC_TABLE[n] = c;
}
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

// ---------- Zip builder (local header + central directory + EOCD) ----------
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01, deterministic

function u16(v) {
	const b = Buffer.alloc(2);
	b.writeUInt16LE(v, 0);
	return b;
}
function u32(v) {
	const b = Buffer.alloc(4);
	b.writeUInt32LE(v, 0);
	return b;
}

function zipFile(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const { name, data } of entries) {
		const nameBuf = Buffer.from(name, "utf8");
		const crc = crc32(data);
		const compressed = deflateRawSync(data, { level: 9 });
		const local = Buffer.concat([
			u32(0x04034b50),
			u16(20), // version needed
			u16(0), // flags
			u16(8), // method: deflate
			u16(DOS_TIME),
			u16(DOS_DATE),
			u32(crc),
			u32(compressed.length),
			u32(data.length),
			u16(nameBuf.length),
			u16(0), // extra len
			nameBuf,
			compressed,
		]);
		locals.push(local);
		centrals.push(
			Buffer.concat([
				u32(0x02014b50),
				u16(20), // version made by
				u16(20), // version needed
				u16(0), // flags
				u16(8), // method
				u16(DOS_TIME),
				u16(DOS_DATE),
				u32(crc),
				u32(compressed.length),
				u32(data.length),
				u16(nameBuf.length),
				u16(0), // extra len
				u16(0), // comment len
				u16(0), // disk start
				u16(0), // internal attrs
				u32(0), // external attrs
				u32(offset),
				nameBuf,
			]),
		);
		offset += local.length;
	}
	const centralBuf = Buffer.concat(centrals);
	return Buffer.concat([
		...locals,
		centralBuf,
		Buffer.concat([
			u32(0x06054b50),
			u16(0), // disk
			u16(0), // cd disk
			u16(entries.length),
			u16(entries.length),
			u32(centralBuf.length),
			u32(offset),
			u16(0), // comment len
		]),
	]);
}

// ---------- XML parts ----------
function escapeXml(s) {
	return s
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function colName(i) {
	return String.fromCharCode("A".charCodeAt(0) + i);
}

function sheetXml(rows) {
	const rowXml = rows
		.map((row, r) => {
			const cells = row
				.map((value, c) => {
					const ref = `${colName(c)}${r + 1}`;
					return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
				})
				.join("");
			return `<row r="${r + 1}">${cells}</row>`;
		})
		.join("");
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

// ---------- Build + ghi ----------
const fixturePath = fileURLToPath(
	new URL("../../e2e/fixtures/syllabus-import.sample.xlsx", import.meta.url),
);

const xlsx = zipFile([
	{ name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES, "utf8") },
	{ name: "_rels/.rels", data: Buffer.from(ROOT_RELS, "utf8") },
	{ name: "xl/workbook.xml", data: Buffer.from(WORKBOOK, "utf8") },
	{
		name: "xl/_rels/workbook.xml.rels",
		data: Buffer.from(WORKBOOK_RELS, "utf8"),
	},
	{
		name: "xl/worksheets/sheet1.xml",
		data: Buffer.from(sheetXml(ROWS), "utf8"),
	},
]);
writeFileSync(fixturePath, xlsx);
console.log(`wrote ${fixturePath} (${xlsx.length} bytes)`);

// ---------- Round-trip verify (read-excel-file/node) ----------
const { readSheet } = await import("read-excel-file/node");
const readBack = await readSheet(fixturePath);
const normalized = readBack.map((row) =>
	Array.from({ length: 5 }, (_, i) => String(row[i] ?? "").trim()),
);
const pass = JSON.stringify(normalized) === JSON.stringify(ROWS);
if (!pass) {
	console.error("round-trip MISMATCH:");
	console.error(JSON.stringify(normalized, null, 2));
	process.exit(1);
}
console.log("round-trip OK: 4 rows x 5 cols");
