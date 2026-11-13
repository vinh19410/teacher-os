import ExcelJS from "exceljs";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	buildSampleXlsxBytes,
	downloadSyllabusSampleXlsx,
	normalizeRow,
	parseSyllabusFile,
	rowsToModules,
	SAMPLE_HEADER,
	SAMPLE_ROWS,
	SYLLABUS_SAMPLE_FILENAME,
	SYLLABUS_SAMPLE_MIME,
} from "./syllabus-import";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const HEADERS = ["Module", "Mô tả module", "Mục tiêu", "Tài liệu"];

const OLD_TEMPLATE_LESSON_ERROR =
	'File dùng template cũ (cột "Buổi học" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.';
const OLD_TEMPLATE_STATUS_ERROR =
	'File dùng template cũ (cột "Trạng thái" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.';

describe("rowsToModules", () => {
	test("bỏ header khi cột 0 là 'Module'/'module'; dòng đầu không phải header → là data", () => {
		const vi = rowsToModules([HEADERS, ["M1", "d1", "Mục tiêu", "Tài liệu"]]);
		expect(vi).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "d1",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "Mục tiêu",
							materials: "Tài liệu",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 1,
		});

		const lower = rowsToModules([
			["module", "description", "objectives", "materials"],
			["M1", "", "o", ""],
		]);
		expect(lower.ok).toBe(true);
		if (lower.ok) {
			expect(lower.modules).toHaveLength(1);
			expect(lower.modules[0].lessons).toHaveLength(1);
		}

		// Dòng đầu KHÔNG phải header (cột 0 khác "module") → là data.
		const notHeader = rowsToModules([
			["Lesson planning", "", "Giới thiệu", ""],
		]);
		expect(notHeader.ok).toBe(true);
		if (notHeader.ok) {
			expect(notHeader.modules).toHaveLength(1);
			expect(notHeader.modules[0].lessons).toHaveLength(1);
			expect(notHeader.modules[0].lessons[0].title).toBe("Buổi 1");
		}
	});

	test("template cũ 6 cột ('Buổi học'/'lesson' ở cột 2) → đúng 1 lỗi tường minh; padding cột thừa không làm thoát luật", () => {
		const viHeader = rowsToModules([
			[
				"Module",
				"Mô tả module",
				"Buổi học",
				"Mục tiêu",
				"Tài liệu",
				"Trạng thái",
			],
		]);
		expect(viHeader).toEqual({
			ok: false,
			errors: [OLD_TEMPLATE_LESSON_ERROR],
		});

		const enHeader = rowsToModules([
			["Module", "Description", "lesson", "Objectives", "Materials", "Status"],
		]);
		expect(enHeader).toEqual({
			ok: false,
			errors: [OLD_TEMPLATE_LESSON_ERROR],
		});

		// File cũ có padding cột rỗng đuôi (7–8 ô) vẫn dính luật — chứng minh
		// detection không phụ thuộc độ dài row.
		const padded = rowsToModules([
			[
				"Module",
				"Mô tả module",
				"Buổi học",
				"Mục tiêu",
				"Tài liệu",
				"Trạng thái",
				"",
				"",
			],
			["M1", "", "Buổi 1", "o", "m", "đã dạy", "", ""],
		]);
		expect(padded).toEqual({ ok: false, errors: [OLD_TEMPLATE_LESSON_ERROR] });
	});

	test("auto-numbering: 3 buổi xuyên 2 module → Buổi 1, Buổi 2, Buổi 3; objectives/materials map cột 2/3; status luôn upcoming", () => {
		const result = rowsToModules([
			["Module 1", "d1", "Mục tiêu A", "Tài liệu A"],
			["", "", "Viết introduction", "File mẫu 2"],
			["Module 2", "", "Viết body paragraph", ""],
		]);
		expect(result).toEqual({
			ok: true,
			modules: [
				{
					title: "Module 1",
					description: "d1",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "Mục tiêu A",
							materials: "Tài liệu A",
							kind: "lesson",
							status: "upcoming",
						},
						{
							title: "Buổi 2",
							objectives: "Viết introduction",
							materials: "File mẫu 2",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
				{
					title: "Module 2",
					description: "",
					lessons: [
						{
							title: "Buổi 3",
							objectives: "Viết body paragraph",
							materials: "",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 3,
		});
	});

	test("module-only row và dòng trống không tiêu số thứ tự buổi", () => {
		const result = rowsToModules([
			["M1", "", "", ""],
			["", "", "", ""],
			["", "", "mục tiêu", ""],
		]);
		expect(result).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "mục tiêu",
							materials: "",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 1,
		});
	});

	test("cột Module rỗng kế thừa module dòng trước; dòng data đầu thiếu module là lỗi", () => {
		const inherited = rowsToModules([
			["M1", "d1", "o1", "m1"],
			["", "", "o2", ""],
		]);
		expect(inherited).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "d1",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "o1",
							materials: "m1",
							kind: "lesson",
							status: "upcoming",
						},
						{
							title: "Buổi 2",
							objectives: "o2",
							materials: "",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 2,
		});

		const firstRowMissing = rowsToModules([["", "", "o1", ""]]);
		expect(firstRowMissing).toEqual({
			ok: false,
			errors: ["Dòng 1: thiếu tên module"],
		});
	});

	test("nhóm consecutive cùng tên module; trùng tên không liền kề là 2 module; mô tả lấy từ dòng đầu nhóm", () => {
		const result = rowsToModules([
			["M1", "d1", "o1", ""],
			["M1", "d2-bị-bỏ-qua", "o2", ""],
			["M2", "", "", ""],
			["M1", "d3", "o3", ""],
		]);
		expect(result).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "d1",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "o1",
							materials: "",
							kind: "lesson",
							status: "upcoming",
						},
						{
							title: "Buổi 2",
							objectives: "o2",
							materials: "",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
				{ title: "M2", description: "", lessons: [] },
				{
					title: "M1",
					description: "d3",
					lessons: [
						{
							title: "Buổi 3",
							objectives: "o3",
							materials: "",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 3,
		});
	});

	test("template v2 5 cột ('Trạng thái'/'status' ở ô thứ 5 của header) → đúng 1 lỗi tường minh", () => {
		const viHeader = rowsToModules([
			[...HEADERS, "Trạng thái"],
			["M1", "", "o", "m", "đã dạy"],
		]);
		expect(viHeader).toEqual({
			ok: false,
			errors: [OLD_TEMPLATE_STATUS_ERROR],
		});

		const enHeader = rowsToModules([
			["Module", "Description", "Objectives", "Materials", "Status"],
		]);
		expect(enHeader).toEqual({
			ok: false,
			errors: [OLD_TEMPLATE_STATUS_ERROR],
		});
	});

	test("file v2 KHÔNG header (dòng data có ô thứ 5 khác rỗng) → lỗi ở đúng dòng, không parse ngầm cột 5", () => {
		const result = rowsToModules([
			["M1", "", "o", "m", "đã dạy"],
			["M2", "", "o2", "", ""],
		]);
		expect(result).toEqual({
			ok: false,
			errors: [
				'Dòng 1: cột Loại nhận "đã dạy" — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.',
			],
		});

		// Nhiều dòng vi phạm → mỗi dòng một lỗi, giữ số dòng file gốc.
		const multi = rowsToModules([
			["M1", "", "o", "m", "đã dạy"],
			["", "", "o2", "", "current"],
		]);
		expect(multi).toEqual({
			ok: false,
			errors: [
				'Dòng 1: cột Loại nhận "đã dạy" — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.',
				'Dòng 2: cột Loại nhận "current" — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.',
			],
		});
	});

	test("dòng có Module nhưng cột 2/3 trống → module không có lesson (module-only row hợp lệ)", () => {
		const moduleOnly = rowsToModules([["M1", "mô tả", "", ""]]);
		expect(moduleOnly).toEqual({
			ok: true,
			modules: [{ title: "M1", description: "mô tả", lessons: [] }],
			lessonCount: 0,
		});
	});

	test("dòng trống hoàn toàn bị bỏ qua; lỗi dòng vẫn theo số dòng file gốc", () => {
		const result = rowsToModules([
			["M1", "", "o1", ""],
			["", "", "", ""],
			["", "", "", "", "thừa-cột-5"],
		]);
		expect(result).toEqual({
			ok: false,
			errors: [
				"Dòng 3: loại buổi không hợp lệ 'thừa-cột-5' (dùng: giữa kỳ / cuối kỳ)",
			],
		});
	});

	test("tổng modules + lessons > 500 → lỗi kèm số lượng", () => {
		const rows: unknown[][] = [["M1", "", "", ""]];
		for (let i = 1; i <= 501; i++) {
			rows.push(["", "", `o${i}`, ""]);
		}
		const result = rowsToModules(rows);
		expect(result).toEqual({
			ok: false,
			errors: ["File có 502 mục (module + buổi học), vượt giới hạn 500."],
		});
	});

	test("boundary cap: đúng 500 mục → ok; 501 → lỗi (inclusive)", () => {
		const at500: unknown[][] = [["M1", "", "", ""]];
		for (let i = 1; i <= 499; i++) {
			at500.push(["", "", `o${i}`, ""]);
		}
		expect(rowsToModules(at500)).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "",
					lessons: Array.from({ length: 499 }, (_, i) => ({
						title: `Buổi ${i + 1}`,
						objectives: `o${i + 1}`,
						materials: "",
						kind: "lesson",
						status: "upcoming",
					})),
				},
			],
			lessonCount: 499,
		});

		const at501: unknown[][] = [["M1", "", "", ""]];
		for (let i = 1; i <= 500; i++) {
			at501.push(["", "", `o${i}`, ""]);
		}
		expect(rowsToModules(at501)).toEqual({
			ok: false,
			errors: ["File có 501 mục (module + buổi học), vượt giới hạn 500."],
		});
	});

	test("length mirror API contract: title >500 / text >10.000 → lỗi dòng; đúng biên → pass", () => {
		const longTitle = "M".repeat(501);
		expect(rowsToModules([[longTitle, "", "", ""]])).toEqual({
			ok: false,
			errors: ["Dòng 1: tên module vượt 500 ký tự"],
		});

		const longDesc = "d".repeat(10_001);
		expect(rowsToModules([["M1", longDesc, "", ""]])).toEqual({
			ok: false,
			errors: ["Dòng 1: mô tả module vượt 10000 ký tự"],
		});

		expect(rowsToModules([["M1", "", "o".repeat(10_001), ""]])).toEqual({
			ok: false,
			errors: ["Dòng 1: mục tiêu vượt 10000 ký tự"],
		});

		expect(rowsToModules([["M1", "", "o", "m".repeat(10_001)]])).toEqual({
			ok: false,
			errors: ["Dòng 1: tài liệu vượt 10000 ký tự"],
		});

		// Chiều pass ở đúng biên: server zod contract chấp nhận 500/10.000.
		const atLimit = rowsToModules([
			[
				"M".repeat(500),
				"d".repeat(10_000),
				"o".repeat(10_000),
				"t".repeat(10_000),
			],
		]);
		expect(atLimit.ok).toBe(true);
		if (atLimit.ok) {
			expect(atLimit.modules[0].title).toHaveLength(500);
			expect(atLimit.modules[0].description).toHaveLength(10_000);
			expect(atLimit.modules[0].lessons[0].objectives).toHaveLength(10_000);
			expect(atLimit.modules[0].lessons[0].materials).toHaveLength(10_000);
		}

		// Description dòng continuation bị luật nhóm bỏ — không check length.
		const continuation = rowsToModules([
			["M1", "", "o1", ""],
			["M1", "d".repeat(10_001), "o2", ""],
		]);
		expect(continuation.ok).toBe(true);
	});

	test("không có dòng data → lỗi 'Không có dòng dữ liệu.'", () => {
		expect(rowsToModules([])).toEqual({
			ok: false,
			errors: ["Không có dòng dữ liệu."],
		});
		expect(rowsToModules([HEADERS])).toEqual({
			ok: false,
			errors: ["Không có dòng dữ liệu."],
		});
		expect(rowsToModules([["", "", "", ""]])).toEqual({
			ok: false,
			errors: ["Không có dòng dữ liệu."],
		});
	});

	test("row ngắn (thiếu cột) được pad về 5 cột, không crash; ô 6+ bị cắt an toàn", () => {
		const short = rowsToModules([["M1"], ["", "", "o1"]]);
		expect(short).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "o1",
							materials: "",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 1,
		});

		// Ô thứ 5 RỖNG (padding cột rỗng của spreadsheet) → cắt an toàn.
		const longEmptyFifth = rowsToModules([["M1", "d", "o", "m", "", "cột 6"]]);
		expect(longEmptyFifth).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "d",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "o",
							materials: "m",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 1,
		});

		// Ô thứ 5 CÓ nội dung lạ → lỗi dòng (không bỏ ngầm dữ liệu user).
		const longFilledFifth = rowsToModules([["M1", "d", "o", "m", "x"]]);
		expect(longFilledFifth.ok).toBe(false);
		if (!longFilledFifth.ok) {
			expect(longFilledFifth.errors[0]).toBe(
				"Dòng 1: loại buổi không hợp lệ 'x' (dùng: giữa kỳ / cuối kỳ)",
			);
		}
	});
});

describe("import v4 cột Loại (issue #154)", () => {
	test("mapping 6 giá trị Loại: rỗng/buổi học/lesson → lesson; giữa kỳ/midterm → midterm; cuối kỳ/final → final", () => {
		const result = rowsToModules([
			["M1", "", "o1", "", ""],
			["", "", "o2", "", "buổi học"],
			["", "", "o3", "", "lesson"],
			["", "", "o4", "", "giữa kỳ"],
			["", "", "o5", "", "MIDTERM"],
			["M2", "", "o6", "", "cuối kỳ"],
			["", "", "o7", "", "Final"],
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.modules[0].lessons.map((l) => l.kind)).toEqual([
				"lesson",
				"lesson",
				"lesson",
				"midterm",
				"midterm",
			]);
			expect(result.modules[1].lessons.map((l) => l.kind)).toEqual([
				"final",
				"final",
			]);
		}
	});

	test("Loại lạ → lỗi đúng dòng với đúng câu, không parse nửa chừng", () => {
		const result = rowsToModules([
			["M1", "", "o1", "", "giữa kỳ"],
			["", "", "o2", "", "thi giữa kỳ"],
		]);
		expect(result).toEqual({
			ok: false,
			errors: [
				"Dòng 2: loại buổi không hợp lệ 'thi giữa kỳ' (dùng: giữa kỳ / cuối kỳ)",
			],
		});
	});

	test("dòng chỉ điền Loại vẫn tạo buổi thi (không cần mục tiêu/tài liệu)", () => {
		const result = rowsToModules([
			["M1", "", "", ""],
			["", "", "", "", "giữa kỳ"],
			["", "", "", "", "cuối kỳ"],
		]);
		expect(result).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "",
							materials: "",
							kind: "midterm",
							status: "upcoming",
						},
						{
							title: "Buổi 2",
							objectives: "",
							materials: "",
							kind: "final",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 2,
		});
	});

	test("file 4 cột v3 (không cột Loại) vẫn import không lỗi — regression bắt buộc", () => {
		const result = rowsToModules([
			["Module", "Mô tả module", "Mục tiêu", "Tài liệu"],
			["M1", "d1", "o1", "m1"],
			["", "", "o2", ""],
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(
				result.modules.flatMap((m) => m.lessons).map((l) => l.kind),
			).toEqual(["lesson", "lesson"]);
		}
	});

	test("cap 500 đếm cả loại-only row: 500 mục → ok, 501 → lỗi", () => {
		const at500: unknown[][] = [["M1", "", "", ""]];
		for (let i = 1; i <= 499; i++) {
			at500.push(["", "", `o${i}`, "", i <= 10 ? "giữa kỳ" : ""]);
		}
		const ok500 = rowsToModules(at500);
		expect(ok500.ok).toBe(true);
		if (ok500.ok) {
			expect(ok500.lessonCount).toBe(499);
			expect(
				ok500.modules[0].lessons.filter((l) => l.kind === "midterm"),
			).toHaveLength(10);
		}

		const at501: unknown[][] = [["M1", "", "", ""]];
		for (let i = 1; i <= 500; i++) {
			at501.push(["", "", "", "", "cuối kỳ"]);
		}
		expect(rowsToModules(at501)).toEqual({
			ok: false,
			errors: ["File có 501 mục (module + buổi học), vượt giới hạn 500."],
		});
	});

	test("v2 vocab check chạy TRƯỚC mapping Loại — 'đã dạy' báo old-template, không báo loại lạ", () => {
		const result = rowsToModules([
			["M1", "", "o", "", "sắp tới"],
			["", "", "o2", "", "upcoming"],
		]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toEqual([
				'Dòng 1: cột Loại nhận "sắp tới" — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.',
				'Dòng 2: cột Loại nhận "upcoming" — có thể bạn đang dùng template cũ (cột "Trạng thái"). Hãy tải file mẫu mới.',
			]);
		}
	});
});

describe("normalizeRow", () => {
	test("cell Date → lỗi dòng; number/boolean/null → string", () => {
		const date = normalizeRow([new Date("2026-01-01T00:00:00Z")], 7);
		expect(date).toEqual({
			ok: false,
			error:
				"Dòng 7: ô dạng ngày tháng không hỗ trợ — hãy định dạng ô thành Text",
		});

		const mixed = normalizeRow(["M1", 42, true, null, undefined], 1);
		expect(mixed).toEqual({
			ok: true,
			cells: ["M1", "42", "true", "", ""],
		});
	});
});

async function buildXlsxFile(
	populate: (workbook: ExcelJS.Workbook) => void,
	filename = "syllabus.xlsx",
): Promise<File> {
	const workbook = new ExcelJS.Workbook();
	populate(workbook);
	const raw = await workbook.xlsx.writeBuffer();
	const buffer = new ArrayBuffer(raw.byteLength);
	new Uint8Array(buffer).set(new Uint8Array(raw));
	return new File([buffer], filename, { type: SYLLABUS_SAMPLE_MIME });
}

describe("parseSyllabusFile (XLSX)", () => {
	test("đuôi .csv và .xls bị từ chối", async () => {
		const csvResult = await parseSyllabusFile(
			new File(["Module,Mô tả module,Mục tiêu,Tài liệu\r\nM1,,o1,"], "x.csv", {
				type: "text/csv",
			}),
		);
		expect(csvResult).toEqual({
			ok: false,
			errors: ["Chỉ nhận file Excel (.xlsx)."],
		});

		const xlsResult = await parseSyllabusFile(
			new File(["Module\r\nM1"], "x.xls", { type: "application/vnd.ms-excel" }),
		);
		expect(xlsResult).toEqual({
			ok: false,
			errors: ["Chỉ nhận file Excel (.xlsx)."],
		});
	});

	test("file vượt 2 MB bị từ chối", async () => {
		const big = new Uint8Array(2 * 1024 * 1024 + 1);
		const result = await parseSyllabusFile(new File([big], "x.xlsx"));
		expect(result).toEqual({ ok: false, errors: ["File vượt giới hạn 2 MB."] });
	});

	test("file giả mạo .xlsx (0 byte, không phải ZIP, hoặc ZIP hỏng) bị từ chối", async () => {
		const empty = new File([], "empty.xlsx", { type: SYLLABUS_SAMPLE_MIME });
		expect(await parseSyllabusFile(empty)).toEqual({
			ok: false,
			errors: ["Không đọc được file. Kiểm tra file Excel (.xlsx) hợp lệ."],
		});

		const fake = new File(
			["Module,Mô tả module,Mục tiêu,Tài liệu\r\nM1,,o1,"],
			"fake.xlsx",
			{ type: SYLLABUS_SAMPLE_MIME },
		);
		expect(await parseSyllabusFile(fake)).toEqual({
			ok: false,
			errors: ["Không đọc được file. Kiểm tra file Excel (.xlsx) hợp lệ."],
		});

		const corruptZip = new File(
			[new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01])],
			"corrupt.XLSX",
			{ type: SYLLABUS_SAMPLE_MIME },
		);
		expect(await parseSyllabusFile(corruptZip)).toEqual({
			ok: false,
			errors: ["Không đọc được file. Kiểm tra file Excel (.xlsx) hợp lệ."],
		});
	});

	test("hỗ trợ đuôi viết hoa .XLSX", async () => {
		const file = await buildXlsxFile((workbook) => {
			const sheet = workbook.addWorksheet("Syllabus");
			sheet.addRow(["Module", "Mô tả module", "Mục tiêu", "Tài liệu", "Loại"]);
			sheet.addRow(["Module 1", "", "Mục tiêu 1", "", ""]);
		}, "SAMPLE.XLSX");

		const result = await parseSyllabusFile(file);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.lessonCount).toBe(1);
		}
	});

	test("đọc .xlsx tạo bằng ExcelJS: hỗ trợ merge cells cột Module và nhiều sheet (chỉ đọc sheet 1)", async () => {
		const file = await buildXlsxFile((workbook) => {
			const sheet1 = workbook.addWorksheet("Syllabus");
			sheet1.addRow(["Module", "Mô tả module", "Mục tiêu", "Tài liệu", "Loại"]);
			sheet1.addRow(["Module 1", "Tổng quan", "Mục tiêu 1", "Tài liệu 1", ""]);
			sheet1.addRow(["", "", "Mục tiêu 2", "", "giữa kỳ"]);
			sheet1.addRow(["Module 2", "", "Mục tiêu 3", "Tài liệu 3", "cuối kỳ"]);
			sheet1.mergeCells("A2:A3");

			const sheet2 = workbook.addWorksheet("Hướng dẫn");
			sheet2.addRow(["Mục", "Hướng dẫn"]);
			sheet2.addRow(["Lỗi giả", "Sheet 2 không được parse"]);
		});

		const result = await parseSyllabusFile(file);
		expect(result).toEqual({
			ok: true,
			modules: [
				{
					title: "Module 1",
					description: "Tổng quan",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "Mục tiêu 1",
							materials: "Tài liệu 1",
							kind: "lesson",
							status: "upcoming",
						},
						{
							title: "Buổi 2",
							objectives: "Mục tiêu 2",
							materials: "",
							kind: "midterm",
							status: "upcoming",
						},
					],
				},
				{
					title: "Module 2",
					description: "",
					lessons: [
						{
							title: "Buổi 3",
							objectives: "Mục tiêu 3",
							materials: "Tài liệu 3",
							kind: "final",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 3,
		});
	});
});

describe("buildSampleXlsxBytes", () => {
	test("có 2 sheet ['Syllabus', 'Hướng dẫn'], frozen row 1, header in đậm, 5 cột numFmt='@', validation E2:E501 và đúng 6 dòng khớp SAMPLE_HEADER + SAMPLE_ROWS", async () => {
		const bytes = buildSampleXlsxBytes();
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(bytes.buffer);

		expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
			"Syllabus",
			"Hướng dẫn",
		]);

		const syllabus = workbook.worksheets[0];
		expect(syllabus.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

		const headerRow = syllabus.getRow(1);
		for (let c = 1; c <= 5; c++) {
			expect(syllabus.getColumn(c).numFmt).toBe("@");
			expect(headerRow.getCell(c).font?.bold).toBe(true);
		}

		const dataValidations = (
			syllabus as unknown as {
				dataValidations: {
					find: (address: string) => ExcelJS.DataValidation | undefined;
				};
			}
		).dataValidations;
		for (let r = 2; r <= 501; r++) {
			const dv = dataValidations.find(`E${r}`);
			expect(dv?.type).toBe("list");
			expect(dv?.formulae?.[0]).toBe('"giữa kỳ,cuối kỳ"');
		}

		expect(syllabus.rowCount).toBe(6);
		const actualRows: string[][] = [];
		syllabus.eachRow({ includeEmpty: true }, (row) => {
			const values: string[] = [];
			for (let c = 1; c <= 5; c++) {
				const v = row.getCell(c).value;
				values.push(v === undefined || v === null ? "" : String(v));
			}
			actualRows.push(values);
		});
		expect(actualRows).toEqual([[...SAMPLE_HEADER], ...SAMPLE_ROWS]);

		const guide = workbook.worksheets[1];
		expect(guide.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
		expect(guide.getColumn(1).numFmt).toBe("@");
		expect(guide.getColumn(2).numFmt).toBe("@");
		expect(guide.rowCount).toBe(7);
		expect(guide.getRow(1).getCell(1).font?.bold).toBe(true);
		expect(String(guide.getRow(1).getCell(1).value)).toBe("Mục");
		expect(String(guide.getRow(2).getCell(2).value)).toContain("Syllabus");

		// Round-trip: file mẫu của chính app phải parse ra đúng 2 module · 5 buổi.
		const roundTrip = await parseSyllabusFile(
			new File([bytes], SYLLABUS_SAMPLE_FILENAME, {
				type: SYLLABUS_SAMPLE_MIME,
			}),
		);
		expect(roundTrip.ok).toBe(true);
		if (roundTrip.ok) {
			expect(roundTrip.modules).toHaveLength(2);
			expect(roundTrip.lessonCount).toBe(5);
			expect(
				roundTrip.modules.flatMap((m) => m.lessons).map((l) => l.kind),
			).toEqual(["lesson", "lesson", "midterm", "lesson", "final"]);
		}
	});
});

describe("downloadSyllabusSampleXlsx", () => {
	test("tạo Blob XLSX đúng MIME, tải syllabus-template.xlsx và revoke URL bất đồng bộ", async () => {
		vi.useFakeTimers();
		let capturedBlob: Blob | null = null;
		const createObjectURL = vi
			.spyOn(URL, "createObjectURL")
			.mockImplementation((obj: Blob | MediaSource) => {
				capturedBlob = obj as Blob;
				return "blob:syllabus-sample";
			});
		const revokeObjectURL = vi
			.spyOn(URL, "revokeObjectURL")
			.mockImplementation(() => {});
		const anchor = {
			href: "",
			download: "",
			click: vi.fn(),
		};
		const createElement = vi.fn(() => anchor);
		vi.stubGlobal("document", { createElement });

		downloadSyllabusSampleXlsx();

		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(capturedBlob).toBeInstanceOf(Blob);
		if (!capturedBlob) throw new Error("expected capturedBlob");
		expect((capturedBlob as Blob).type).toBe(SYLLABUS_SAMPLE_MIME);
		const downloadedBytes = new Uint8Array(
			await (capturedBlob as Blob).arrayBuffer(),
		);
		expect(downloadedBytes).toEqual(buildSampleXlsxBytes());

		expect(createElement).toHaveBeenCalledWith("a");
		expect(anchor.href).toBe("blob:syllabus-sample");
		expect(anchor.download).toBe(SYLLABUS_SAMPLE_FILENAME);
		expect(anchor.download).toBe("syllabus-template.xlsx");
		expect(anchor.click).toHaveBeenCalledTimes(1);

		expect(revokeObjectURL).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:syllabus-sample");
	});
});
