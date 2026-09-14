/**
 * Syllabus Excel/CSV import (issue #144) — parse 100% client-side.
 * Core `rowsToModules`/`normalizeRow` thuần (chạy được trong vitest env node);
 * adapter `parseSyllabusFile` dynamic-import papaparse/read-excel-file để tách
 * chunk. File không bao giờ tới server — 13 luật deterministic định nghĩa ở
 * plans/260914-0744-syllabus-excel-csv-import/plan.md là hợp đồng forensic.
 */
import type { SyllabusModuleContent } from "@teacher-os/api/contracts";

export const IMPORT_MAX_NODES = 500;
export const IMPORT_FILE_MAX_BYTES = 2 * 1024 * 1024;

const STATUS_MAP: Record<string, "done" | "current" | "upcoming"> = {
	"đã dạy": "done",
	done: "done",
	"đang học": "current",
	current: "current",
	"sắp tới": "upcoming",
	upcoming: "upcoming",
	"": "upcoming",
};

export type SyllabusImportResult =
	| { ok: true; modules: SyllabusModuleContent[]; lessonCount: number }
	| { ok: false; errors: string[] };

/**
 * Chuẩn hóa 1 row về đúng 6 cột: pad thiếu / cắt thừa, mọi cell về trimmed
 * string. Cell `Date` (read-excel-file trả cho ô định dạng ngày) là lỗi dòng —
 * tránh `String(date)` thành chuỗi GMT rác.
 */
export function normalizeRow(
	row: unknown[],
	lineNumber: number,
): { ok: true; cells: string[] } | { ok: false; error: string } {
	const cells: string[] = [];
	for (let i = 0; i < 6; i++) {
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

/** Map cột Trạng thái (luật 8) — giá trị lạ là lỗi dòng. */
function mapStatus(
	value: string,
	lineNumber: number,
):
	| { ok: true; status: "done" | "current" | "upcoming" }
	| { ok: false; error: string } {
	const status = STATUS_MAP[value.toLowerCase()];
	if (!status) {
		return {
			ok: false,
			error: `Dòng ${lineNumber}: trạng thái không hợp lệ '${value}'`,
		};
	}
	return { ok: true, status };
}

/** Core thuần: rows (đã theo thứ tự file gốc) → modules. Luật 4–11. */
export function rowsToModules(rows: unknown[][]): SyllabusImportResult {
	const errors: string[] = [];
	const modules: SyllabusModuleContent[] = [];
	let currentModule: SyllabusModuleContent | null = null;
	let sawDataRow = false;

	// Luật 4: bỏ dòng đầu iff cột 2 là "buổi học"/"lesson".
	let start = 0;
	if (rows.length > 0) {
		const first = normalizeRow(rows[0], 1);
		if (first.ok) {
			const col2 = first.cells[2].toLowerCase();
			if (col2 === "buổi học" || col2 === "lesson") start = 1;
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

		// Luật 5: dòng trống hoàn toàn → bỏ qua (numbering theo file gốc).
		if (cells.every((cell) => cell === "")) continue;
		sawDataRow = true;

		const moduleName = cells[0];
		if (moduleName === "") {
			// Luật 6: kế thừa module dòng trước; rỗng khi chưa có module → lỗi.
			if (!currentModule) {
				errors.push(`Dòng ${lineNumber}: thiếu tên module`);
				continue;
			}
		} else if (currentModule !== null && currentModule.title === moduleName) {
			// Luật 7: nhóm consecutive cùng tên — mô tả giữ của dòng đầu nhóm.
		} else {
			currentModule = {
				title: moduleName,
				description: cells[1],
				lessons: [],
			};
			modules.push(currentModule);
		}

		if (cells[2] !== "") {
			const lessonTitle = cells[2];
			const status = mapStatus(cells[5], lineNumber);
			if (!status.ok) {
				errors.push(status.error);
				continue;
			}
			currentModule?.lessons.push({
				title: lessonTitle,
				objectives: cells[3],
				materials: cells[4],
				status: status.status,
			});
		} else if (cells[3] !== "" || cells[4] !== "" || cells[5] !== "") {
			// Luật 9: có nội dung cột 3/4/5 nhưng thiếu tên buổi học → lỗi dòng,
			// không drop im lặng.
			errors.push(`Dòng ${lineNumber}: có nội dung nhưng thiếu tên buổi học`);
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
 * Browser adapter: chọn nhánh parse theo đuôi file, bắt mọi exception (luật 13)
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
			if (
				rows.length > 0 &&
				rows[0].length > 0 &&
				rows[0][0].startsWith("\uFEFF")
			) {
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

/** File mẫu (luật 12): CSV UTF-8 có BOM + CRLF, khớp fixture e2e. */
export function buildSampleCsv(): string {
	return [
		"\uFEFFModule,Mô tả module,Buổi học,Mục tiêu,Tài liệu,Trạng thái",
		"Module 1 — Nền tảng,Làm quen format đề,Buổi 1,Hiểu cấu trúc đề,Cambridge 18,sắp tới",
		",,Buổi 2,Viết introduction,File mẫu 2,đã dạy",
		"Module 2 — Thực hành,,Buổi 3,Viết body paragraph,,đang học",
	].join("\r\n");
}
