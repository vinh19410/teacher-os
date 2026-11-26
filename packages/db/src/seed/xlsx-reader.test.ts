import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	columnLettersToIndex,
	decodeXmlEntities,
	extractZipEntries,
	listXlsxSheetNames,
	readXlsxSheetRowsFromBuffer,
	readXlsxSheetRowsFromFile,
} from "./xlsx-reader";

const SAMPLE_XLSX_PATH = resolve(
	import.meta.dirname,
	"../../../../docs/vocab-sample/IELTS_Bridge_Vocabulary.xlsx",
);

/** Builds a minimal valid ZIP buffer for testing stored + deflated + sharedStrings XLSX inputs. */
function buildSyntheticZip(
	files: Array<{ name: string; content: Buffer; deflate?: boolean }>,
): Buffer {
	const localChunks: Buffer[] = [];
	const centralChunks: Buffer[] = [];
	let offset = 0;

	for (const file of files) {
		const nameBuf = Buffer.from(file.name, "utf8");
		const method = file.deflate ? 8 : 0;
		const compressed = file.deflate
			? deflateRawSync(file.content)
			: file.content;

		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(method, 8);
		localHeader.writeUInt32LE(compressed.length, 18);
		localHeader.writeUInt32LE(file.content.length, 22);
		localHeader.writeUInt16LE(nameBuf.length, 26);

		localChunks.push(localHeader, nameBuf, compressed);

		const cdHeader = Buffer.alloc(46);
		cdHeader.writeUInt32LE(0x02014b50, 0);
		cdHeader.writeUInt16LE(20, 4);
		cdHeader.writeUInt16LE(20, 6);
		cdHeader.writeUInt16LE(method, 10);
		cdHeader.writeUInt32LE(compressed.length, 20);
		cdHeader.writeUInt32LE(file.content.length, 24);
		cdHeader.writeUInt16LE(nameBuf.length, 28);
		cdHeader.writeUInt32LE(offset, 42);

		centralChunks.push(cdHeader, nameBuf);
		offset += localHeader.length + nameBuf.length + compressed.length;
	}

	const centralDir = Buffer.concat(centralChunks);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(files.length, 8);
	eocd.writeUInt16LE(files.length, 10);
	eocd.writeUInt32LE(centralDir.length, 12);
	eocd.writeUInt32LE(offset, 16);

	return Buffer.concat([...localChunks, centralDir, eocd]);
}

describe("xlsx-reader", () => {
	it("decodes XML entities in a single pass without double-unescaping", () => {
		expect(decodeXmlEntities("Technology &amp; Education")).toBe(
			"Technology & Education",
		);
		expect(decodeXmlEntities("in our ancestors&apos; time")).toBe(
			"in our ancestors' time",
		);
		expect(decodeXmlEntities("&amp;lt;tag&amp;gt;")).toBe("&lt;tag&gt;");
		expect(decodeXmlEntities("&#65;&#x42;&#x2013;")).toBe("AB–");
	});

	it("converts Excel column letters to 0-based indices", () => {
		expect(columnLettersToIndex("A")).toBe(0);
		expect(columnLettersToIndex("H")).toBe(7);
		expect(columnLettersToIndex("Z")).toBe(25);
		expect(columnLettersToIndex("AA")).toBe(26);
		expect(columnLettersToIndex("AZ")).toBe(51);
	});

	it("reads sharedStrings.xml, stored/deflated ZIP entries, sparse columns, and NFD sheet names", () => {
		const zipBuf = buildSyntheticZip([
			{
				name: "xl/workbook.xml",
				content: Buffer.from(
					`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tổng hợp" sheetId="1" r:id="rId1"/></sheets></workbook>`,
				),
				deflate: false,
			},
			{
				name: "xl/_rels/workbook.xml.rels",
				content: Buffer.from(
					`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
				),
				deflate: true,
			},
			{
				name: "xl/sharedStrings.xml",
				content: Buffer.from(
					"<sst><si><t>Week</t></si><si><r><t>Tech </t></r><r><t>&amp; Ed</t></r></si></sst>",
				),
				deflate: true,
			},
			{
				name: "xl/worksheets/sheet1.xml",
				content: Buffer.from(
					`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2"/><c r="C2" t="inlineStr"><is><t>in our ancestors&apos; time</t></is></c></row></sheetData></worksheet>`,
				),
				deflate: true,
			},
		]);

		// NFD Vietnamese sheet name must match NFC workbook sheet name
		const nfdName = "Tổng hợp".normalize("NFD");
		const rows = readXlsxSheetRowsFromBuffer(zipBuf, nfdName);
		expect(rows).toEqual([
			["Week", "", "Tech & Ed"],
			["1", "", "in our ancestors' time"],
		]);
	});

	it("rejects corrupted ZIP buffers cleanly", () => {
		expect(() => extractZipEntries(Buffer.from("not a zip"))).toThrow(
			/Invalid XLSX\/ZIP archive/,
		);
	});

	it("reads the real IELTS_Bridge_Vocabulary.xlsx workbook accurately", async () => {
		const buf = await readFile(SAMPLE_XLSX_PATH);
		expect(listXlsxSheetNames(buf)).toEqual([
			"Thống kê",
			"Tổng hợp",
			"Paraphrase Pairs",
			"Flashcard import",
		]);

		const rows = await readXlsxSheetRowsFromFile(SAMPLE_XLSX_PATH, "Tổng hợp");
		expect(rows.length).toBe(997); // 1 header + 996 data rows
		expect(rows[0]).toEqual([
			"No.",
			"Week",
			"Skill",
			"Topic",
			"Word / Phrase",
			"IPA",
			"Meaning (Nghĩa)",
			"Note",
		]);
		expect(rows[1]?.slice(0, 7)).toEqual([
			"1",
			"1",
			"Reading",
			"Reading Passages",
			"detect",
			"/dɪˈtɛkt/",
			"phát hiện",
		]);
		// Verify XML entities decoded properly on real workbook data
		expect(rows.some((r) => r[3] === "Technology & Education")).toBe(true);
		expect(rows.some((r) => r[4] === "in our ancestors' time")).toBe(true);
		expect(rows[996]?.slice(0, 7)).toEqual([
			"996",
			"8",
			"Listening",
			"Friends · Alex's Training",
			"advice",
			"/ədˈvaɪs/",
			"lời khuyên",
		]);
	});
});
