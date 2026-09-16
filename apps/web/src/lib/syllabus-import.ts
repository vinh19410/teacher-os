/**
 * Syllabus Excel/CSV import v3 (issue #152) — parse 100% client-side.
 * Core `rowsToModules`/`normalizeRow` thuần (chạy được trong vitest env node);
 * adapter `parseSyllabusFile` dynamic-import papaparse/read-excel-file để tách
 * chunk. File không bao giờ tới server — format 4 cột (không còn cột "Trạng
 * thái"): file v2 5 cột bị từ chối tường minh, title buổi tự sinh `Buổi {n}`
 * theo thứ tự dòng.
 */
import type { SyllabusModuleContent } from "@teacher-os/api/contracts";

export const IMPORT_MAX_NODES = 500;
export const IMPORT_FILE_MAX_BYTES = 2 * 1024 * 1024;
// Mirror zod contract của POST /api/syllabi (packages/api contracts.ts) —
// viền này phải bắt ở parser: server fail chỉ trả 400 opaque "invalid body",
// không chỉ ra dòng/ô nào của file.
const MODULE_TITLE_MAX = 500;
const FIELD_TEXT_MAX = 10_000;

export type SyllabusImportResult =
	| { ok: true; modules: SyllabusModuleContent[]; lessonCount: number }
	| { ok: false; errors: string[] };

/**
 * Chuẩn hóa 1 row về đúng 4 cột: pad thiếu / cắt thừa, mọi cell về trimmed
 * string. Cell `Date` (read-excel-file trả cho ô định dạng ngày) là lỗi dòng —
 * tránh `String(date)` thành chuỗi GMT rác.
 */
export function normalizeRow(
	row: unknown[],
	lineNumber: number,
): { ok: true; cells: string[] } | { ok: false; error: string } {
	const cells: string[] = [];
	for (let i = 0; i < 4; i++) {
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
	// trước normalizeRow — normalize cắt về 4 cột làm mất ô thứ 5.
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
		// File v2 đã xóa header vẫn bị chặn: bất kỳ dòng nào còn nội dung ở ô
		// thứ 5 là dữ liệu user đã điền — không bỏ ngầm.
		if (String(rows[i]?.[4] ?? "").trim() !== "") {
			errors.push(
				`Dòng ${lineNumber}: file có cột dữ liệu thừa ở cột thứ 5 — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.`,
			);
			continue;
		}
		const normalized = normalizeRow(rows[i], lineNumber);
		if (!normalized.ok) {
			errors.push(normalized.error);
			continue;
		}
		const cells = normalized.cells;

		// Dòng trống hoàn toàn → bỏ qua (numbering theo file gốc).
		if (cells.every((cell) => cell === "")) continue;
		sawDataRow = true;

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

		// Dòng tạo buổi học iff bất kỳ ô Mục tiêu/Tài liệu khác rỗng. Title
		// tự sinh theo thứ tự buổi TOÀN FILE (1-based); module-only row và
		// dòng trống không tiêu số.
		const hasLessonContent = cells[2] !== "" || cells[3] !== "";
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
			// Format v3 không còn cột status — import mới luôn khởi điểm
			// "upcoming" (type SyllabusModuleContent là zod output type nên
			// status là trường bắt buộc, không thể bỏ field).
			currentModule?.lessons.push({
				title: `Buổi ${lessonOrdinal}`,
				objectives: cells[2],
				materials: cells[3],
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

/**
 * Browser adapter: chọn nhánh parse theo đuôi file, bắt mọi exception
 * — caller không bao giờ thấy reject thoát ra ngoài.
 */
export async function parseSyllabusFile(
	file: File,
): Promise<SyllabusImportResult> {
	try {
		const name = file.name.toLowerCase();
		const isCsv = name.endsWith(".csv");
		if (!isCsv && !name.endsWith(".xlsx")) {
			return { ok: false, errors: ["Chỉ nhận file .csv hoặc .xlsx."] };
		}
		if (file.size > IMPORT_FILE_MAX_BYTES) {
			return { ok: false, errors: ["File vượt giới hạn 2 MB."] };
		}
		if (isCsv) {
			const Papa = (await import("papaparse")).default;
			const result = Papa.parse<string[]>(await file.text());
			if (result.errors.length > 0) {
				return {
					ok: false,
					errors: result.errors.map(
						(e) => `Dòng ${(e.row ?? 0) + 1}: cú pháp CSV không hợp lệ`,
					),
				};
			}
			const rows = result.data;
			// Strip BOM ở cell đầu của dòng đầu (Excel VN thường ghi UTF-8 BOM).
			if (rows[0]?.[0]?.startsWith("\uFEFF")) {
				rows[0][0] = rows[0][0].slice(1);
			}
			return rowsToModules(rows);
		}
		const { readSheet } = await import("read-excel-file/browser");
		const rows = await readSheet(file);
		return rowsToModules(rows);
	} catch {
		return {
			ok: false,
			errors: ["Không đọc được file. Kiểm tra file Excel/CSV hợp lệ."],
		};
	}
}

/**
 * File mẫu: CSV UTF-8 có BOM + CRLF, 4 cột, khớp fixture e2e —
 * 2 module · 3 buổi (Buổi 1..3 xuyên module theo thứ tự dòng).
 */
export function buildSampleCsv(): string {
	return [
		"\uFEFFModule,Mô tả module,Mục tiêu,Tài liệu",
		"Module 1 — Nền tảng,Làm quen format đề,Hiểu cấu trúc đề,Cambridge 18",
		",,Viết introduction,File mẫu 2",
		"Module 2 — Thực hành,,Viết body paragraph,",
	].join("\r\n");
}
