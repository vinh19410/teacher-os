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
	"Buổi học",
	"Mục tiêu",
	"Tài liệu",
	"Trạng thái",
];

describe("rowsToModules", () => {
	test("bỏ header khi cột Buổi học là 'Buổi học' hoặc 'Lesson'; data row chứa chữ Lesson trong tên module không bị skip", () => {
		const vi = rowsToModules([
			HEADERS,
			["Lesson planning", "", "Buổi 1", "", "", ""],
		]);
		expect(vi).toEqual({
			ok: true,
			modules: [
				{
					title: "Lesson planning",
					description: "",
					lessons: [
						{
							title: "Buổi 1",
							objectives: "",
							materials: "",
							status: "upcoming",
						},
					],
				},
			],
			lessonCount: 1,
		});

		const en = rowsToModules([
			["Module", "Description", "lesson", "Objectives", "Materials", "Status"],
			["M1", "", "B1", "", "", ""],
		]);
		expect(en).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "",
					lessons: [
						{ title: "B1", objectives: "", materials: "", status: "upcoming" },
					],
				},
			],
			lessonCount: 1,
		});

		// Dòng đầu KHÔNG phải header (cột 2 khác) → là data.
		const notHeader = rowsToModules([
			["Lesson planning", "", "Giới thiệu", "", "", ""],
		]);
		expect(notHeader.ok).toBe(true);
		if (notHeader.ok) {
			expect(notHeader.modules).toHaveLength(1);
			expect(notHeader.modules[0].lessons).toHaveLength(1);
		}
	});

	test("cột Module rỗng kế thừa module dòng trước; dòng data đầu thiếu module là lỗi", () => {
		const inherited = rowsToModules([
			["M1", "d1", "B1", "o1", "m1", "đã dạy"],
			["", "", "B2", "", "", ""],
		]);
		expect(inherited).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "d1",
					lessons: [
						{ title: "B1", objectives: "o1", materials: "m1", status: "done" },
						{ title: "B2", objectives: "", materials: "", status: "upcoming" },
					],
				},
			],
			lessonCount: 2,
		});

		const firstRowMissing = rowsToModules([["", "", "B1", "", "", ""]]);
		expect(firstRowMissing).toEqual({
			ok: false,
			errors: ["Dòng 1: thiếu tên module"],
		});
	});

	test("nhóm consecutive cùng tên module; trùng tên không liền kề là 2 module; mô tả lấy từ dòng đầu nhóm", () => {
		const result = rowsToModules([
			["M1", "d1", "B1", "", "", ""],
			["M1", "d2-bị-bỏ-qua", "B2", "", "", ""],
			["M2", "", "", "", "", ""],
			["M1", "d3", "B3", "", "", ""],
		]);
		expect(result).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "d1",
					lessons: [
						{ title: "B1", objectives: "", materials: "", status: "upcoming" },
						{ title: "B2", objectives: "", materials: "", status: "upcoming" },
					],
				},
				{ title: "M2", description: "", lessons: [] },
				{
					title: "M1",
					description: "d3",
					lessons: [
						{ title: "B3", objectives: "", materials: "", status: "upcoming" },
					],
				},
			],
			lessonCount: 3,
		});
	});

	test("trạng thái: đã dạy/done, đang học/current, sắp tới/upcoming/rỗng → upcoming; giá trị lạ là lỗi dòng", () => {
		const result = rowsToModules([
			["M1", "", "B1", "", "", "đã dạy"],
			["", "", "B2", "", "", "done"],
			["", "", "B3", "", "", "đang học"],
			["", "", "B4", "", "", "current"],
			["", "", "B5", "", "", "sắp tới"],
			["", "", "B6", "", "", "upcoming"],
			["", "", "B7", "", "", ""],
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

		const bad = rowsToModules([["M1", "", "B1", "", "", "finished"]]);
		expect(bad).toEqual({
			ok: false,
			errors: ["Dòng 1: trạng thái không hợp lệ 'finished'"],
		});
	});

	test("dòng có Module, Buổi học rỗng, cột 3–5 trống → module không có lesson; có nội dung cột 3/4/5 → lỗi dòng", () => {
		const moduleOnly = rowsToModules([["M1", "mô tả", "", "", "", ""]]);
		expect(moduleOnly).toEqual({
			ok: true,
			modules: [{ title: "M1", description: "mô tả", lessons: [] }],
			lessonCount: 0,
		});

		const withContent = rowsToModules([
			["M1", "", "", "mục tiêu mồ côi", "", ""],
			["M2", "", "", "", "tài liệu mồ côi", ""],
			["M3", "", "", "", "", "đã dạy"],
		]);
		expect(withContent).toEqual({
			ok: false,
			errors: [
				"Dòng 1: có nội dung nhưng thiếu tên buổi học",
				"Dòng 2: có nội dung nhưng thiếu tên buổi học",
				"Dòng 3: có nội dung nhưng thiếu tên buổi học",
			],
		});
	});

	test("dòng trống hoàn toàn bị bỏ qua; dòng trống xen giữa không làm lệch số dòng của lỗi sau nó", () => {
		const result = rowsToModules([
			["M1", "", "B1", "", "", ""],
			["", "", "", "", "", ""],
			["", "", "", "nội dung thiếu buổi", "", ""],
		]);
		expect(result).toEqual({
			ok: false,
			errors: ["Dòng 3: có nội dung nhưng thiếu tên buổi học"],
		});
	});

	test("tổng modules + lessons > 500 → lỗi kèm số lượng", () => {
		const rows: unknown[][] = [["M1", "", "", "", "", ""]];
		for (let i = 1; i <= 501; i++) {
			rows.push(["", "", `B${i}`, "", "", ""]);
		}
		const result = rowsToModules(rows);
		expect(result).toEqual({
			ok: false,
			errors: ["File có 502 mục (module + buổi học), vượt giới hạn 500."],
		});
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
		expect(rowsToModules([["", "", "", "", "", ""]])).toEqual({
			ok: false,
			errors: ["Không có dòng dữ liệu."],
		});
	});

	test("row ngắn (thiếu cột) được pad về 6 cột, không crash; row dài hơn 6 cột bị cắt", () => {
		const short = rowsToModules([["M1"], ["", "", "B1"]]);
		expect(short).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "",
					lessons: [
						{ title: "B1", objectives: "", materials: "", status: "upcoming" },
					],
				},
			],
			lessonCount: 1,
		});

		const long = rowsToModules([
			["M1", "d", "B1", "o", "m", "đã dạy", "cột 7 bị cắt", "cột 8"],
		]);
		expect(long).toEqual({
			ok: true,
			modules: [
				{
					title: "M1",
					description: "d",
					lessons: [
						{ title: "B1", objectives: "o", materials: "m", status: "done" },
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

		const mixed = normalizeRow(["M1", 42, true, null, undefined, "ok"], 1);
		expect(mixed).toEqual({
			ok: true,
			cells: ["M1", "42", "true", "", "", "ok"],
		});
	});
});

describe("parseSyllabusFile (CSV)", () => {
	test("delimiter ; (Excel locale Việt Nam) parse đúng", async () => {
		const file = new File(["M1;d1;B1;o1;m1;đã dạy"], "x.csv", {
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
						{ title: "B1", objectives: "o1", materials: "m1", status: "done" },
					],
				},
			],
			lessonCount: 1,
		});
	});

	test("BOM đầu file bị strip khỏi tên module đầu tiên", async () => {
		const file = new File(
			[
				"\uFEFFModule,Mô tả module,Buổi học,Mục tiêu,Tài liệu,Trạng thái\r\nModule 1 — Nền tảng,,Buổi 1,,,",
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
			new File(['"M1,d1,B1,,,'], "x.csv", { type: "text/csv" }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors[0]).toContain("cú pháp CSV không hợp lệ");
		}
	});
});

describe("buildSampleCsv", () => {
	test("buildSampleCsv có BOM, CRLF, 4 dòng; dòng 3 có Module rỗng", () => {
		const csv = buildSampleCsv();
		expect(csv.startsWith("\uFEFF")).toBe(true);
		const lines = csv.slice(1).split("\r\n");
		expect(lines).toHaveLength(4);
		expect(lines[0]).toBe(
			"Module,Mô tả module,Buổi học,Mục tiêu,Tài liệu,Trạng thái",
		);
		expect(lines[2].startsWith(",")).toBe(true);
	});
});
