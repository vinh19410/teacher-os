/**
 * Syllabus Excel (.xlsx) import v4 (issue #154) — parse 100% client-side.
 * Core `rowsToModules`/`normalizeRow` thuần (chạy được trong vitest env node);
 * adapter `parseSyllabusFile` dynamic-import `read-excel-file/browser` để tách
 * chunk. File không bao giờ tới server — format 5 cột: cột thứ 5 "Loại" tùy
 * chọn (`giữa kỳ`/`cuối kỳ`, rỗng = buổi thường); file 4 cột v3 vẫn import
 * bình thường, title buổi tự sinh `Buổi {n}` theo thứ tự dòng.
 */
import type { SyllabusModuleContent } from "@teacher-os/api/contracts";
import type { SyllabusLessonKind } from "./mock-data";
import { SYLLABUS_SAMPLE_XLSX_BASE64 } from "./syllabus-template-xlsx";

export const IMPORT_MAX_NODES = 500;
export const IMPORT_FILE_MAX_BYTES = 2 * 1024 * 1024;
// Mirror zod contract của POST /api/syllabus-templates (packages/api contracts.ts) —
// viền này phải bắt ở parser: server fail chỉ trả 400 opaque "invalid body",
// không chỉ ra dòng/ô nào của file.
const MODULE_TITLE_MAX = 500;
const FIELD_TEXT_MAX = 10_000;

export type SyllabusImportResult =
	| { ok: true; modules: SyllabusModuleContent[]; lessonCount: number }
	| { ok: false; errors: string[] };

/**
 * Chuẩn hóa 1 row về đúng 5 cột: pad thiếu / cắt thừa, mọi cell về trimmed
 * string. Cell `Date` (read-excel-file trả cho ô định dạng ngày) là lỗi dòng —
 * tránh `String(date)` thành chuỗi GMT rác.
 */
export function normalizeRow(
	row: unknown[],
	lineNumber: number,
): { ok: true; cells: string[] } | { ok: false; error: string } {
	const cells: string[] = [];
	for (let i = 0; i < 5; i++) {
		const cell = row[i];
		if (cell instanceof Date) {
			return {
				ok: false,
				error: `Dòng ${lineNumber}: ô dạng ngày tháng không hỗ trợ — hãy định dạng ô thành Text`,
			};
		}
		cells.push(String(cell ?? "").trim());
	}
	return { ok: true, cells };
}

/**
 * Từ vựng status của template v2 — lọt vào cột Loại phải báo đúng nguyên
 * nhân (template cũ), không báo "loại không hợp lệ" (law 3 hợp đồng v4).
 */
const V2_STATUS_VOCAB = new Set([
	"đã dạy",
	"đang học",
	"sắp tới",
	"done",
	"current",
	"upcoming",
]);

/** Mapping cột Loại (law 4): so khớp trên chuỗi đã lowercase-trim. */
function mapLessonKind(value: string): SyllabusLessonKind | null {
	const v = value.toLowerCase();
	if (v === "" || v === "buổi học" || v === "lesson") return "lesson";
	if (v === "giữa kỳ" || v === "midterm") return "midterm";
	if (v === "cuối kỳ" || v === "final") return "final";
	return null;
}

/** Core thuần: rows (đã theo thứ tự file gốc) → modules. */
export function rowsToModules(rows: unknown[][]): SyllabusImportResult {
	const errors: string[] = [];
	const modules: SyllabusModuleContent[] = [];
	let currentModule: SyllabusModuleContent | null = null;
	let sawDataRow = false;
	let lessonOrdinal = 1;

	// Template cũ phải bắt TRƯỚC skip-header vì header cũ cũng có "Module" ở
	// cột 0. Không kèm điều kiện độ dài row (read-excel-file/papaparse pad
	// đuôi khác nhau → misfire). v2 (cột "Trạng thái" ở ô thứ 5) phải bắt
	// trước khi cột 5 được đọc làm dữ liệu Loại (law 2 hợp đồng v4).
	let start = 0;
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
		const first = normalizeRow(rows[0], 1);
		if (first.ok) {
			const col2 = first.cells[2].toLowerCase();
			if (col2 === "buổi học" || col2 === "lesson") {
				return {
					ok: false,
					errors: [
						'File dùng template cũ (cột "Buổi học" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.',
					],
				};
			}
			// Header mới — bỏ dòng đầu iff cột 0 là "module".
			if (first.cells[0].toLowerCase() === "module") start = 1;
		}
	}

	for (let i = start; i < rows.length; i++) {
		const lineNumber = i + 1;
		const normalized = normalizeRow(rows[i], lineNumber);
		if (!normalized.ok) {
			errors.push(normalized.error);
			continue;
		}
		const cells = normalized.cells;

		// Dòng trống hoàn toàn → bỏ qua (numbering theo file gốc).
		if (cells.every((cell) => cell === "")) continue;
		sawDataRow = true;

		// Dữ liệu status cũ (template v2) lọt vào cột Loại → báo đúng nguyên
		// nhân, không báo "loại không hợp lệ" (law 3 hợp đồng v4).
		if (V2_STATUS_VOCAB.has(cells[4].toLowerCase())) {
			errors.push(
				`Dòng ${lineNumber}: cột Loại nhận "${cells[4]}" — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.`,
			);
			continue;
		}

		const kind = mapLessonKind(cells[4]);
		if (kind === null) {
			errors.push(
				`Dòng ${lineNumber}: loại buổi không hợp lệ '${cells[4]}' (dùng: giữa kỳ / cuối kỳ)`,
			);
			continue;
		}

		const moduleName = cells[0];
		if (moduleName === "") {
			// Kế thừa module dòng trước; rỗng khi chưa có module → lỗi.
			if (!currentModule) {
				errors.push(`Dòng ${lineNumber}: thiếu tên module`);
				continue;
			}
		} else if (currentModule !== null && currentModule.title === moduleName) {
			// Nhóm consecutive cùng tên — mô tả giữ của dòng đầu nhóm.
		} else {
			// Length mirror API contract — chỉ check giá trị thật sự đáp xuống
			// payload: tên module + mô tả dòng đầu nhóm (description dòng
			// continuation bị luật nhóm bỏ, không check).
			if (moduleName.length > MODULE_TITLE_MAX) {
				errors.push(
					`Dòng ${lineNumber}: tên module vượt ${MODULE_TITLE_MAX} ký tự`,
				);
				continue;
			}
			if (cells[1].length > FIELD_TEXT_MAX) {
				errors.push(
					`Dòng ${lineNumber}: mô tả module vượt ${FIELD_TEXT_MAX} ký tự`,
				);
				continue;
			}
			currentModule = {
				title: moduleName,
				description: cells[1],
				lessons: [],
			};
			modules.push(currentModule);
		}

		// Dòng tạo buổi học iff bất kỳ ô Mục tiêu/Tài liệu khác rỗng HOẶC Loại
		// ≠ buổi thường (law 5: dòng chỉ điền Loại vẫn tạo buổi thi). Title
		// tự sinh theo thứ tự buổi TOÀN FILE (1-based); module-only row và
		// dòng trống không tiêu số.
		const hasLessonContent =
			cells[2] !== "" || cells[3] !== "" || kind !== "lesson";
		if (hasLessonContent) {
			// Length mirror API contract: objectives/materials — chỉ check dòng
			// tạo buổi học (giá trị vào payload).
			if (cells[2].length > FIELD_TEXT_MAX) {
				errors.push(
					`Dòng ${lineNumber}: mục tiêu vượt ${FIELD_TEXT_MAX} ký tự`,
				);
				continue;
			}
			if (cells[3].length > FIELD_TEXT_MAX) {
				errors.push(
					`Dòng ${lineNumber}: tài liệu vượt ${FIELD_TEXT_MAX} ký tự`,
				);
				continue;
			}
			// Loại đã map ở trên — file 4 cột v3 có cells[4] rỗng → "lesson",
			// import cũ chạy như cũ (law 6 hợp đồng v4).
			currentModule?.lessons.push({
				title: `Buổi ${lessonOrdinal}`,
				objectives: cells[2],
				materials: cells[3],
				kind,
				status: "upcoming",
			});
			lessonOrdinal += 1;
		}
	}

	if (errors.length > 0) return { ok: false, errors };
	if (!sawDataRow) return { ok: false, errors: ["Không có dòng dữ liệu."] };

	const lessonCount = modules.reduce((sum, m) => sum + m.lessons.length, 0);
	const nodes = modules.length + lessonCount;
	if (nodes > IMPORT_MAX_NODES) {
		return {
			ok: false,
			errors: [
				`File có ${nodes} mục (module + buổi học), vượt giới hạn ${IMPORT_MAX_NODES}.`,
			],
		};
	}
	return { ok: true, modules, lessonCount };
}

function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
	if (typeof file.arrayBuffer === "function") {
		return file.arrayBuffer();
	}
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (reader.result instanceof ArrayBuffer) {
				resolve(reader.result);
			} else {
				reject(new Error("Expected ArrayBuffer from FileReader"));
			}
		};
		reader.onerror = () => {
			reject(reader.error ?? new Error("FileReader failed"));
		};
		reader.readAsArrayBuffer(file);
	});
}

/**
 * Browser adapter: kiểm tra định dạng `.xlsx` (đuôi file + ZIP magic bytes)
 * và parse sheet đầu tiên, bắt mọi exception — caller không bao giờ thấy
 * reject thoát ra ngoài.
 */
export async function parseSyllabusFile(
	file: File,
): Promise<SyllabusImportResult> {
	try {
		if (!file.name.toLowerCase().endsWith(".xlsx")) {
			return { ok: false, errors: ["Chỉ nhận file Excel (.xlsx)."] };
		}
		if (file.size > IMPORT_FILE_MAX_BYTES) {
			return { ok: false, errors: ["File vượt giới hạn 2 MB."] };
		}
		const buffer = await readFileArrayBuffer(file);
		const magic = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
		if (
			magic.length < 4 ||
			magic[0] !== 0x50 ||
			magic[1] !== 0x4b ||
			magic[2] !== 0x03 ||
			magic[3] !== 0x04
		) {
			return {
				ok: false,
				errors: ["Không đọc được file. Kiểm tra file Excel (.xlsx) hợp lệ."],
			};
		}
		const { readSheet } = await import("read-excel-file/browser");
		const rows = await readSheet(buffer);
		return rowsToModules(rows);
	} catch {
		return {
			ok: false,
			errors: ["Không đọc được file. Kiểm tra file Excel (.xlsx) hợp lệ."],
		};
	}
}

/**
 * Dữ liệu file mẫu v4 — nguồn sự thật chung cho file mẫu `.xlsx` nhúng sẵn
 * (`syllabus-template-xlsx.ts`) và script regenerate fixture e2e
 * (`apps/e2e/scripts/regen-syllabus-v4-fixture.mjs`) — script mirror 1:1
 * SAMPLE_ROWS (giới hạn đã biết: .mjs không import được TS; đổi SAMPLE_ROWS
 * phải đổi ROWS trong script rồi chạy regen — red-team #8). 5 buổi / 2 module:
 * buổi `giữa kỳ` cuối Module 1, `cuối kỳ` cuối Module 2 (law 7 hợp đồng v4).
 */
export const SAMPLE_HEADER = [
	"Module",
	"Mô tả module",
	"Mục tiêu",
	"Tài liệu",
	"Loại",
] as const;

export const SAMPLE_ROWS: Array<
	readonly [string, string, string, string, string]
> = [
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

export const SYLLABUS_SAMPLE_FILENAME = "syllabus-template.xlsx";
export const SYLLABUS_SAMPLE_MIME =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Giải mã file mẫu `.xlsx` nhúng sẵn thành bytes chuẩn `ArrayBuffer` (tương
 * thích `new Blob([bytes])` trên TypeScript 5.7+).
 */
export function buildSampleXlsxBytes(): Uint8Array<ArrayBuffer> {
	const binary = atob(SYLLABUS_SAMPLE_XLSX_BASE64);
	const arrayBuffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(arrayBuffer);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Tải xuống file mẫu Excel chuẩn v4 (`syllabus-template.xlsx`) ở client-side —
 * dùng chung cho modal Tạo syllabus và trang chi tiết `/syllabus/:id`.
 */
export function downloadSyllabusSampleXlsx(): void {
	const bytes = buildSampleXlsxBytes();
	const url = URL.createObjectURL(
		new Blob([bytes], { type: SYLLABUS_SAMPLE_MIME }),
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = SYLLABUS_SAMPLE_FILENAME;
	a.click();
	// Revoke sau khi download khởi hành — revoke đồng bộ ngay sau click
	// có thể hủy download trên Safari/Firefox.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
