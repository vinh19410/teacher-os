import { describe, expect, test } from "vitest";
import {
	buildSampleCsv,
	normalizeRow,
	parseSyllabusFile,
	rowsToModules,
} from "./syllabus-import";

const HEADERS = [
	"Module",
	"Mô tả module",
	"Mục tiêu",
	"Tài liệu",
	"Trạng thái",
];

const OLD_TEMPLATE_ERROR =
	'File dùng template cũ (cột "Buổi học" đã bỏ). Hãy tải file mẫu mới rồi điền lại dữ liệu.';

describe("rowsToModules", () => {
	test("bỏ header khi cột 0 là 'Module'/'module'; dòng đầu không phải header → là data", () => {
		const vi = rowsToModules([
			HEADERS,
			["M1", "d1", "Mục tiêu", "Tài liệu", "sắp tới"],
		]);
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
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 1,
		});

		const lower = rowsToModules([
			["module", "description", "objectives", "materials", "status"],
			["M1", "", "o", "", ""],
		]);
		expect(lower.ok).toBe(true);
		if (lower.ok) {
			expect(lower.modules).toHaveLength(1);
			expect(lower.modules[0].lessons).toHaveLength(1);
		}

		// Dòng đầu KHÔNG phải header (cột 0 khác "module") → là data.
		const notHeader = rowsToModules([
			["Lesson planning", "", "Giới thiệu", "", ""],
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
		expect(viHeader).toEqual({ ok: false, errors: [OLD_TEMPLATE_ERROR] });

		const enHeader = rowsToModules([
			["Module", "Description", "lesson", "Objectives", "Materials", "Status"],
		]);
		expect(enHeader).toEqual({ ok: false, errors: [OLD_TEMPLATE_ERROR] });

		// File cũ có padding cột rỗng đuôi (7–8 ô) vẫn dính luật 4 — chứng minh
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
		expect(padded).toEqual({ ok: false, errors: [OLD_TEMPLATE_ERROR] });
	});

	test("auto-numbering: 3 buổi xuyên 2 module → Buổi 1, Buổi 2, Buổi 3; objectives/materials/status map cột 2/3/4", () => {
		const result = rowsToModules([
			["Module 1", "d1", "Mục tiêu A", "Tài liệu A", "sắp tới"],
			["", "", "Viết introduction", "File mẫu 2", "đã dạy"],
			["Module 2", "", "Viết body paragraph", "", "đang học"],
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
							status: "upcoming",
						},
						{
							title: "Buổi 2",
							objectives: "Viết introduction",
							materials: "File mẫu 2",
							status: "done",
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
							status: "current",
						},
					],
				},
			],
			lessonCount: 3,
		});
	});

	test("module-only row và dòng trống không tiêu số thứ tự buổi", () => {
		const result = rowsToModules([
			["M1", "", "", "", ""],
			["", "", "", "", ""],
			["", "", "mục tiêu", "", ""],
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
			["M1", "d1", "o1", "m1", "đã dạy"],
			["", "", "o2", "", ""],
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
							status: "done",
						},
						{
							title: "Buổi 2",
							objectives: "o2",
							materials: "",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 2,
		});

		const firstRowMissing = rowsToModules([["", "", "o1", "", ""]]);
		expect(firstRowMissing).toEqual({
			ok: false,
			errors: ["Dòng 1: thiếu tên module"],
		});
	});

	test("nhóm consecutive cùng tên module; trùng tên không liền kề là 2 module; mô tả lấy từ dòng đầu nhóm", () => {
		const result = rowsToModules([
			["M1", "d1", "o1", "", ""],
			["M1", "d2-bị-bỏ-qua", "o2", "", ""],
			["M2", "", "", "", ""],
			["M1", "d3", "o3", "", ""],
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
							status: "upcoming",
						},
						{
							title: "Buổi 2",
							objectives: "o2",
							materials: "",
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
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 3,
		});
	});

	test("trạng thái: đã dạy/done, đang học/current, sắp tới/upcoming/rỗng → upcoming; giá trị lạ là lỗi dòng", () => {
		const result = rowsToModules([
			["M1", "", "o", "", "đã dạy"],
			["", "", "o", "", "done"],
			["", "", "o", "", "đang học"],
			["", "", "o", "", "current"],
			["", "", "o", "", "sắp tới"],
			["", "", "o", "", "upcoming"],
			["", "", "o", "", ""],
		]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.modules[0].lessons.map((l) => l.status)).toEqual([
				"done",
				"done",
				"current",
				"current",
				"upcoming",
				"upcoming",
				"upcoming",
			]);
		}

		const bad = rowsToModules([["M1", "", "o", "", "finished"]]);
		expect(bad).toEqual({
			ok: false,
			errors: ["Dòng 1: trạng thái không hợp lệ 'finished'"],
		});
	});

	test("dòng có Module nhưng cột 2/3/4 trống → module không có lesson (module-only row hợp lệ)", () => {
		const moduleOnly = rowsToModules([["M1", "mô tả", "", "", ""]]);
		expect(moduleOnly).toEqual({
			ok: true,
			modules: [{ title: "M1", description: "mô tả", lessons: [] }],
			lessonCount: 0,
		});
	});

	test("dòng trống hoàn toàn bị bỏ qua; numbering lỗi vẫn theo số dòng file gốc", () => {
		const result = rowsToModules([
			["M1", "", "o1", "", ""],
			["", "", "", "", ""],
			["", "", "", "", "trạng-thái-lạ"],
		]);
		expect(result).toEqual({
			ok: false,
			errors: ["Dòng 3: trạng thái không hợp lệ 'trạng-thái-lạ'"],
		});
	});

	test("tổng modules + lessons > 500 → lỗi kèm số lượng", () => {
		const rows: unknown[][] = [["M1", "", "", "", ""]];
		for (let i = 1; i <= 501; i++) {
			rows.push(["", "", `o${i}`, "", ""]);
		}
		const result = rowsToModules(rows);
		expect(result).toEqual({
			ok: false,
			errors: ["File có 502 mục (module + buổi học), vượt giới hạn 500."],
		});
	});

	test("boundary cap: đúng 500 mục → ok; 501 → lỗi (luật 11 inclusive)", () => {
		const at500: unknown[][] = [["M1", "", "", "", ""]];
		for (let i = 1; i <= 499; i++) {
			at500.push(["", "", `o${i}`, "", ""]);
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
						status: "upcoming",
					})),
				},
			],
			lessonCount: 499,
		});

		const at501: unknown[][] = [["M1", "", "", "", ""]];
		for (let i = 1; i <= 500; i++) {
			at501.push(["", "", `o${i}`, "", ""]);
		}
		expect(rowsToModules(at501)).toEqual({
			ok: false,
			errors: ["File có 501 mục (module + buổi học), vượt giới hạn 500."],
		});
	});

	test("luật 15 length mirror API contract: title >500 / text >10.000 → lỗi dòng; đúng biên → pass", () => {
		const longTitle = "M".repeat(501);
		expect(rowsToModules([[longTitle, "", "", "", ""]])).toEqual({
			ok: false,
			errors: ["Dòng 1: tên module vượt 500 ký tự"],
		});

		const longDesc = "d".repeat(10_001);
		expect(rowsToModules([["M1", longDesc, "", "", ""]])).toEqual({
			ok: false,
			errors: ["Dòng 1: mô tả module vượt 10000 ký tự"],
		});

		expect(rowsToModules([["M1", "", "o".repeat(10_001), "", ""]])).toEqual({
			ok: false,
			errors: ["Dòng 1: mục tiêu vượt 10000 ký tự"],
		});

		expect(rowsToModules([["M1", "", "o", "m".repeat(10_001), ""]])).toEqual({
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
				"",
			],
		]);
		expect(atLimit.ok).toBe(true);
		if (atLimit.ok) {
			expect(atLimit.modules[0].title).toHaveLength(500);
			expect(atLimit.modules[0].description).toHaveLength(10_000);
			expect(atLimit.modules[0].lessons[0].objectives).toHaveLength(10_000);
			expect(atLimit.modules[0].lessons[0].materials).toHaveLength(10_000);
		}

		// Description dòng continuation bị luật 7 bỏ — không check length.
		const continuation = rowsToModules([
			["M1", "", "o1", "", ""],
			["M1", "d".repeat(10_001), "o2", "", ""],
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
		expect(rowsToModules([["", "", "", "", ""]])).toEqual({
			ok: false,
			errors: ["Không có dòng dữ liệu."],
		});
	});

	test("row ngắn (thiếu cột) được pad về 5 cột, không crash; row dài hơn 5 cột bị cắt", () => {
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
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 1,
		});

		const long = rowsToModules([
			["M1", "d", "o", "m", "đã dạy", "cột 6 bị cắt", "cột 7"],
		]);
		expect(long).toEqual({
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
							status: "done",
						},
					],
				},
			],
			lessonCount: 1,
		});
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
		const file = new File(["M1;d1;o1;m1;đã dạy"], "x.csv", {
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
							status: "done",
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
				"\uFEFFModule,Mô tả module,Mục tiêu,Tài liệu,Trạng thái\r\nModule 1 — Nền tảng,,Hiểu cấu trúc đề,,",
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
			new File(['"M1,d1,o,,'], "x.csv", { type: "text/csv" }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors[0]).toContain("cú pháp CSV không hợp lệ");
		}
	});
});

describe("buildSampleCsv", () => {
	test("buildSampleCsv có BOM, CRLF, 4 dòng; header 5 cột; dòng 2 module rỗng kế thừa; dòng 3 module mới", () => {
		const csv = buildSampleCsv();
		expect(csv.startsWith("\uFEFF")).toBe(true);
		const lines = csv.slice(1).split("\r\n");
		expect(lines).toHaveLength(4);
		expect(lines[0]).toBe("Module,Mô tả module,Mục tiêu,Tài liệu,Trạng thái");
		expect(lines[1].startsWith("Module 1 — Nền tảng")).toBe(true);
		expect(lines[2].startsWith(",")).toBe(true);
		expect(lines[3].startsWith("Module 2 — Thực hành")).toBe(true);
	});
});
