/**
 * Zero-dependency XLSX worksheet reader built on Node's `node:zlib`.
 * Supports standard ZIP Central Directory entries (stored & deflate),
 * shared strings (`xl/sharedStrings.xml`), inline strings (`t="inlineStr"`),
 * rich-text runs, numeric/string cell values, and XML entity decoding.
 */
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CD_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const UTF8_DECODER = new TextDecoder("utf-8");

export interface XlsxSheetInfo {
	name: string;
	targetPath: string;
}

/**
 * Decodes standard XML named & numeric character references in a single pass
 * (avoids double-unescaping sequences such as `&amp;lt;`).
 */
export function decodeXmlEntities(raw: string): string {
	return raw.replace(
		/&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g,
		(
			match,
			hex: string | undefined,
			dec: string | undefined,
			named: string | undefined,
		) => {
			if (hex !== undefined) {
				const cp = Number.parseInt(hex, 16);
				return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff
					? String.fromCodePoint(cp)
					: match;
			}
			if (dec !== undefined) {
				const cp = Number.parseInt(dec, 10);
				return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff
					? String.fromCodePoint(cp)
					: match;
			}
			switch (named) {
				case "amp":
					return "&";
				case "lt":
					return "<";
				case "gt":
					return ">";
				case "quot":
					return '"';
				case "apos":
					return "'";
				default:
					return match;
			}
		},
	);
}

/**
 * Converts Excel column letters (`A` -> 0, `Z` -> 25, `AA` -> 26) into a 0-based index.
 */
export function columnLettersToIndex(letters: string): number {
	let idx = 0;
	for (let i = 0; i < letters.length; i++) {
		const code = letters.charCodeAt(i);
		if (code >= 65 && code <= 90) {
			idx = idx * 26 + (code - 64);
		} else if (code >= 97 && code <= 122) {
			idx = idx * 26 + (code - 96);
		} else {
			throw new Error(`Invalid Excel column reference: "${letters}"`);
		}
	}
	if (idx <= 0) {
		throw new Error(`Invalid Excel column reference: "${letters}"`);
	}
	return idx - 1;
}

/**
 * Extracts all files from a standard ZIP archive via its Central Directory.
 */
export function extractZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
	if (bytes.byteLength < 22) {
		throw new Error("Invalid XLSX/ZIP archive: file is too short.");
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const minEocdOffset = Math.max(
		0,
		bytes.byteLength - 22 - MAX_ZIP_COMMENT_BYTES,
	);
	let eocdOffset = -1;
	for (let offset = bytes.byteLength - 22; offset >= minEocdOffset; offset--) {
		if (view.getUint32(offset, true) === ZIP_EOCD_SIGNATURE) {
			const commentLength = view.getUint16(offset + 20, true);
			if (offset + 22 + commentLength === bytes.byteLength) {
				eocdOffset = offset;
				break;
			}
		}
	}
	if (eocdOffset === -1) {
		throw new Error(
			"Invalid XLSX/ZIP archive: End of Central Directory record not found.",
		);
	}

	const entryCount = view.getUint16(eocdOffset + 10, true);
	const cdSize = view.getUint32(eocdOffset + 12, true);
	const cdOffset = view.getUint32(eocdOffset + 16, true);
	if (cdOffset + cdSize > bytes.byteLength) {
		throw new Error(
			"Invalid XLSX/ZIP archive: Central Directory extends past end of file.",
		);
	}

	const entries = new Map<string, Uint8Array>();
	let cursor = cdOffset;
	for (let i = 0; i < entryCount; i++) {
		if (cursor + 46 > bytes.byteLength) {
			throw new Error("Invalid XLSX/ZIP archive: truncated Central Directory.");
		}
		if (view.getUint32(cursor, true) !== ZIP_CD_SIGNATURE) {
			throw new Error(
				"Invalid XLSX/ZIP archive: bad Central Directory entry signature.",
			);
		}
		const compressionMethod = view.getUint16(cursor + 10, true);
		const compressedSize = view.getUint32(cursor + 20, true);
		const uncompressedSize = view.getUint32(cursor + 24, true);
		const nameLength = view.getUint16(cursor + 28, true);
		const extraLength = view.getUint16(cursor + 30, true);
		const commentLength = view.getUint16(cursor + 32, true);
		const localHeaderOffset = view.getUint32(cursor + 42, true);

		if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
			throw new Error(
				`XLSX entry exceeds maximum supported size (${MAX_ENTRY_UNCOMPRESSED_BYTES} bytes).`,
			);
		}

		const nameStart = cursor + 46;
		const nameEnd = nameStart + nameLength;
		const entryName = UTF8_DECODER.decode(
			bytes.subarray(nameStart, nameEnd),
		).replace(/\\/g, "/");
		cursor = nameEnd + extraLength + commentLength;

		if (entryName.endsWith("/")) continue;

		if (localHeaderOffset + 30 > bytes.byteLength) {
			throw new Error(
				`Invalid XLSX/ZIP archive: local header out of bounds for "${entryName}".`,
			);
		}
		if (view.getUint32(localHeaderOffset, true) !== ZIP_LOCAL_SIGNATURE) {
			throw new Error(
				`Invalid XLSX/ZIP archive: bad local header signature for "${entryName}".`,
			);
		}
		const localNameLen = view.getUint16(localHeaderOffset + 26, true);
		const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
		const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
		const dataEnd = dataStart + compressedSize;
		if (dataEnd > bytes.byteLength) {
			throw new Error(
				`Invalid XLSX/ZIP archive: compressed data out of bounds for "${entryName}".`,
			);
		}

		const compressedData = bytes.subarray(dataStart, dataEnd);
		let rawContent: Uint8Array;
		if (compressionMethod === 0) {
			rawContent = new Uint8Array(compressedData);
		} else if (compressionMethod === 8) {
			rawContent = inflateRawSync(compressedData, {
				maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES,
			});
		} else {
			throw new Error(
				`Unsupported ZIP compression method ${compressionMethod} for "${entryName}".`,
			);
		}
		entries.set(entryName, rawContent);
	}

	return entries;
}

function parseXmlAttributes(attrSource: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
	for (const match of attrSource.matchAll(attrRegex)) {
		const key = match[1];
		const val = match[2] ?? match[3] ?? "";
		if (key) {
			attrs[key] = decodeXmlEntities(val);
		}
	}
	return attrs;
}

function extractTextTags(xmlFragment: string): string {
	const parts: string[] = [];
	const tRegex = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
	for (const match of xmlFragment.matchAll(tRegex)) {
		parts.push(decodeXmlEntities(match[1] ?? ""));
	}
	return parts.join("");
}

function parseSharedStrings(xml: string): string[] {
	const strings: string[] = [];
	const siRegex = /<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g;
	for (const match of xml.matchAll(siRegex)) {
		strings.push(extractTextTags(match[1] ?? ""));
	}
	return strings;
}

function resolveWorkbookSheets(
	entries: Map<string, Uint8Array>,
): XlsxSheetInfo[] {
	const workbookBuf = entries.get("xl/workbook.xml");
	const relsBuf = entries.get("xl/_rels/workbook.xml.rels");
	if (!workbookBuf || !relsBuf) {
		throw new Error(
			"Invalid XLSX workbook: missing xl/workbook.xml or xl/_rels/workbook.xml.rels.",
		);
	}

	const relTargetById = new Map<string, string>();
	const relsXml = UTF8_DECODER.decode(relsBuf);
	for (const match of relsXml.matchAll(
		/<(?:\w+:)?Relationship\s+([^>]+?)\/?>/g,
	)) {
		const attrs = parseXmlAttributes(match[1] ?? "");
		if (attrs.Id && attrs.Target) {
			const cleanTarget = attrs.Target.replace(/^\/+/, "");
			const normalizedTarget = cleanTarget.startsWith("xl/")
				? cleanTarget
				: `xl/${cleanTarget}`;
			relTargetById.set(attrs.Id, normalizedTarget);
		}
	}

	const sheets: XlsxSheetInfo[] = [];
	const workbookXml = UTF8_DECODER.decode(workbookBuf);
	for (const match of workbookXml.matchAll(/<(?:\w+:)?sheet\s+([^>]+?)\/?>/g)) {
		const attrs = parseXmlAttributes(match[1] ?? "");
		const name = attrs.name;
		const relId = attrs["r:id"] ?? attrs.id;
		if (!name || !relId) continue;
		const targetPath = relTargetById.get(relId);
		if (!targetPath) continue;
		sheets.push({ name, targetPath });
	}
	return sheets;
}

function parseWorksheetXml(
	xml: string,
	sharedStrings: readonly string[],
): string[][] {
	const sheetDataMatch =
		/<(?:\w+:)?sheetData(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?sheetData>/.exec(
			xml,
		);
	if (!sheetDataMatch) return [];
	const sheetData = sheetDataMatch[1] ?? "";

	const rows: string[][] = [];
	const rowRegex = /<(?:\w+:)?row(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?row>/g;
	const cellRegex = /<(?:\w+:)?c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;

	for (const rowMatch of sheetData.matchAll(rowRegex)) {
		const rowBody = rowMatch[1] ?? "";
		const cellMap = new Map<number, string>();
		let maxColIdx = -1;
		let fallbackColIdx = 0;

		for (const cellMatch of rowBody.matchAll(cellRegex)) {
			const attrStr = cellMatch[1] ?? "";
			const cellBody = cellMatch[2];
			const attrs = parseXmlAttributes(attrStr);

			let colIdx = fallbackColIdx;
			if (attrs.r) {
				const colLettersMatch = /^([A-Za-z]+)/.exec(attrs.r);
				if (colLettersMatch?.[1]) {
					colIdx = columnLettersToIndex(colLettersMatch[1]);
				}
			}
			fallbackColIdx = colIdx + 1;

			if (cellBody === undefined) {
				continue;
			}

			const cellType = attrs.t ?? "";
			let value = "";
			if (cellType === "inlineStr") {
				const isMatch =
					/<(?:\w+:)?is(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?is>/.exec(cellBody);
				value = isMatch ? extractTextTags(isMatch[1] ?? "") : "";
			} else if (cellType === "s") {
				const vMatch = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(
					cellBody,
				);
				if (vMatch?.[1] !== undefined) {
					const sstIndex = Number.parseInt(vMatch[1].trim(), 10);
					if (
						!Number.isInteger(sstIndex) ||
						sstIndex < 0 ||
						sstIndex >= sharedStrings.length
					) {
						throw new Error(
							`XLSX shared string index out of bounds: ${vMatch[1]}`,
						);
					}
					value = sharedStrings[sstIndex] ?? "";
				}
			} else {
				const vMatch = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(
					cellBody,
				);
				value = vMatch?.[1] !== undefined ? decodeXmlEntities(vMatch[1]) : "";
			}

			if (value.length > 0) {
				cellMap.set(colIdx, value);
				if (colIdx > maxColIdx) maxColIdx = colIdx;
			}
		}

		if (maxColIdx >= 0) {
			const rowCells = new Array<string>(maxColIdx + 1).fill("");
			for (const [idx, val] of cellMap.entries()) {
				rowCells[idx] = val;
			}
			if (rowCells.some((cell) => cell.trim().length > 0)) {
				rows.push(rowCells);
			}
		}
	}

	return rows;
}

export function listXlsxSheetNames(bytes: Uint8Array): string[] {
	const entries = extractZipEntries(bytes);
	return resolveWorkbookSheets(entries).map((s) => s.name);
}

export function readXlsxSheetRowsFromBuffer(
	bytes: Uint8Array,
	sheetName: string,
): string[][] {
	const entries = extractZipEntries(bytes);
	const sheets = resolveWorkbookSheets(entries);
	const wantedNfc = sheetName.trim().normalize("NFC");
	const matched =
		sheets.find((s) => s.name === sheetName) ??
		sheets.find((s) => s.name.trim().normalize("NFC") === wantedNfc);

	if (!matched) {
		throw new Error(
			`Sheet "${sheetName}" not found in workbook. Available sheets: [${sheets.map((s) => s.name).join(", ")}]`,
		);
	}

	const worksheetBuf = entries.get(matched.targetPath);
	if (!worksheetBuf) {
		throw new Error(
			`Worksheet XML "${matched.targetPath}" for sheet "${matched.name}" is missing from archive.`,
		);
	}

	const sharedStringsBuf = entries.get("xl/sharedStrings.xml");
	const sharedStrings = sharedStringsBuf
		? parseSharedStrings(UTF8_DECODER.decode(sharedStringsBuf))
		: [];

	return parseWorksheetXml(UTF8_DECODER.decode(worksheetBuf), sharedStrings);
}

export async function readXlsxSheetRowsFromFile(
	filePath: string,
	sheetName: string,
): Promise<string[][]> {
	const buffer = await readFile(filePath);
	return readXlsxSheetRowsFromBuffer(buffer, sheetName);
}
