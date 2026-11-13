import { afterEach, describe, expect, test, vi } from "vitest";
import {
	buildSampleCsv,
	downloadSyllabusSampleCsv,
	normalizeRow,
	parseSyllabusFile,
	rowsToModules,
	SYLLABUS_SAMPLE_FILENAME,
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

describe("parseSyllabusFile (CSV)", () => {
	test("delimiter ; (Excel locale Việt Nam) parse đúng", async () => {
		const file = new File(["M1;d1;o1;m1"], "x.csv", {
			type: "text/csv",
		});
		const result = await parseSyllabusFile(file);
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
							materials: "m1",
							kind: "lesson",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 1,
		});
	});

	test("BOM đầu file bị strip khỏi tên module đầu tiên", async () => {
		const file = new File(
			[
				"\uFEFFModule,Mô tả module,Mục tiêu,Tài liệu\r\nModule 1 — Nền tảng,,Hiểu cấu trúc đề,",
			],
			"x.csv",
			{ type: "text/csv" },
		);
		const result = await parseSyllabusFile(file);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.modules[0].title).toBe("Module 1 — Nền tảng");
		}
	});

	test("đuôi .xls bị từ chối", async () => {
		const result = await parseSyllabusFile(
			new File(["Module\r\nM1"], "x.xls", { type: "application/vnd.ms-excel" }),
		);
		expect(result).toEqual({
			ok: false,
			errors: ["Chỉ nhận file .csv hoặc .xlsx."],
		});
	});

	test("file vượt 2 MB bị từ chối", async () => {
		const big = "a".repeat(2 * 1024 * 1024 + 1);
		const result = await parseSyllabusFile(new File([big], "x.csv"));
		expect(result).toEqual({ ok: false, errors: ["File vượt giới hạn 2 MB."] });
	});

	test("quote chưa đóng → lỗi 'cú pháp CSV không hợp lệ'", async () => {
		const result = await parseSyllabusFile(
			new File(['"M1,d1,o,'], "x.csv", { type: "text/csv" }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors[0]).toContain("cú pháp CSV không hợp lệ");
		}
	});
});

describe("buildSampleCsv", () => {
	test("buildSampleCsv có BOM, CRLF, 6 dòng; header 5 cột 'Loại' không 'Trạng thái'; 5 buổi với giữa kỳ cuối M1, cuối kỳ cuối M2 (law 7 v4)", () => {
		const csv = buildSampleCsv();
		expect(csv.startsWith("\uFEFF")).toBe(true);
		const lines = csv.slice(1).split("\r\n");
		expect(lines).toHaveLength(6);
		expect(lines[0]).toBe("Module,Mô tả module,Mục tiêu,Tài liệu,Loại");
		expect(lines[0]).not.toContain("Trạng thái");
		expect(lines[1].startsWith("Module 1 — Nền tảng")).toBe(true);
		expect(lines[2].startsWith(",")).toBe(true);
		expect(lines[3]).toBe(",,Kiểm tra giữa kỳ,,giữa kỳ");
		expect(lines[4].startsWith("Module 2 — Thực hành")).toBe(true);
		expect(lines[5]).toBe(",,Kiểm tra cuối kỳ,,cuối kỳ");

		// Round-trip: file mẫu của chính app phải parse ra đúng 5 buổi thi/không thi.
		const result = rowsToModules(lines.slice(1).map((line) => line.split(",")));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.lessonCount).toBe(5);
			expect(
				result.modules.flatMap((m) => m.lessons).map((l) => l.kind),
			).toEqual(["lesson", "lesson", "midterm", "lesson", "final"]);
		}
	});
});

describe("downloadSyllabusSampleCsv", () => {
	test("tạo Blob CSV UTF-8 BOM, kích hoạt tải syllabus-template.csv và revoke URL bất đồng bộ", async () => {
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

		downloadSyllabusSampleCsv();

		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(capturedBlob).toBeInstanceOf(Blob);
		if (!capturedBlob) throw new Error("expected capturedBlob");
		expect((capturedBlob as Blob).type).toBe("text/csv;charset=utf-8");
		const decodedCsv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
			await (capturedBlob as Blob).arrayBuffer(),
		);
		expect(decodedCsv).toBe(buildSampleCsv());

		expect(createElement).toHaveBeenCalledWith("a");
		expect(anchor.href).toBe("blob:syllabus-sample");
		expect(anchor.download).toBe(SYLLABUS_SAMPLE_FILENAME);
		expect(anchor.download).toBe("syllabus-template.csv");
		expect(anchor.click).toHaveBeenCalledTimes(1);

		expect(revokeObjectURL).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:syllabus-sample");
	});
});
