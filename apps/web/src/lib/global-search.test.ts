import { describe, expect, test } from "vitest";
import { normalizeVi, searchGlobal } from "./global-search";
import type { ClassGroup, MockData, Student } from "./mock-data";

function student(
	partial: Partial<Student> & { id: string; name: string },
): Student {
	return {
		phone: "",
		zalo: "",
		email: "",
		hasPackage: true,
		parent: { name: "", phone: "" },
		targetBand: "",
		skills: [],
		examDate: "",
		pkg: {
			total: 0,
			done: 0,
			remaining: 0,
			price: 0,
			mode: "Online",
			start: "",
			expiry: "",
		},
		tags: [],
		notes: "",
		avatar: "",
		atRisk: false,
		...partial,
	};
}

function klass(
	partial: Partial<ClassGroup> & { id: string; name: string },
): ClassGroup {
	return {
		level: "",
		type: "Writing",
		skills: [],
		mode: "Online",
		syllabusId: "",
		studentIds: [],
		schedule: "",
		sessionsDone: 0,
		sessionsTotal: 0,
		status: "active",
		startDate: "",
		notes: "",
		...partial,
	} as ClassGroup;
}

function data(partial: Partial<MockData>): MockData {
	return {
		assignmentPrompts: [],
		students: [],
		lessons: [],
		invoices: [],
		assignments: [],
		reports: [],
		notifs: [],
		commentBank: [],
		classes: [],
		syllabi: [],
		...partial,
	};
}

describe("normalizeVi", () => {
	test("strips diacritics, horn vowels, đ and lowercases", () => {
		expect(normalizeVi("Nguyễn")).toBe("nguyen");
		expect(normalizeVi("Trương")).toBe("truong");
		expect(normalizeVi("Dương")).toBe("duong");
		expect(normalizeVi("Đặng")).toBe("dang");
		expect(normalizeVi("TrẦN")).toBe("tran");
	});
});

describe("searchGlobal", () => {
	test("matches students by name (ASCII and accented)", () => {
		const d = data({
			students: [
				student({ id: "s1", name: "Nguyễn Minh" }),
				student({ id: "s2", name: "Lan" }),
			],
		});
		expect(searchGlobal(d, "minh")).toEqual([
			{ type: "student", id: "s1", label: "Nguyễn Minh", sublabel: "" },
		]);
		expect(searchGlobal(d, "nguyen")).toEqual([
			{ type: "student", id: "s1", label: "Nguyễn Minh", sublabel: "" },
		]);
	});

	test("accented query matches unaccented data (both sides normalized)", () => {
		const d = data({ students: [student({ id: "s1", name: "TRAN VAN A" })] });
		expect(searchGlobal(d, "trần")).toEqual([
			{ type: "student", id: "s1", label: "TRAN VAN A", sublabel: "" },
		]);
	});

	test("matches students by phone, zalo, and parent name", () => {
		const d = data({
			students: [
				student({ id: "s1", name: "A", phone: "0901234567" }),
				student({ id: "s2", name: "B", zalo: "minhzalo" }),
				student({
					id: "s3",
					name: "C",
					parent: { name: "Phạm Minh", phone: "" },
				}),
			],
		});
		const ids = (q: string) => searchGlobal(d, q).map((r) => r.id);
		expect(ids("0901")).toEqual(["s1"]);
		expect(ids("minhzalo")).toEqual(["s2"]);
		expect(ids("pham minh")).toEqual(["s3"]);
	});

	test("matches classes by name", () => {
		const d = data({
			classes: [klass({ id: "c1", name: "IELTS Writing Tối" })],
		});
		expect(searchGlobal(d, "writing toi")).toEqual([
			{
				type: "class",
				id: "c1",
				label: "IELTS Writing Tối",
				sublabel: "Online",
			},
		]);
	});

	test("students come before classes", () => {
		const d = data({
			students: [student({ id: "s1", name: "Minh" })],
			classes: [klass({ id: "c1", name: "Lớp của Minh" })],
		});
		expect(searchGlobal(d, "minh").map((r) => r.type)).toEqual([
			"student",
			"class",
		]);
	});

	test("caps are per type: many students never crowd out a matching class", () => {
		const students = Array.from({ length: 9 }, (_, i) =>
			student({ id: `s${i}`, name: `Minh ${i}` }),
		);
		const d = data({
			students,
			classes: [klass({ id: "c1", name: "Minh Club" })],
		});
		const results = searchGlobal(d, "minh");
		const studentHits = results.filter((r) => r.type === "student");
		const classHits = results.filter((r) => r.type === "class");
		expect(studentHits).toHaveLength(5);
		expect(classHits).toEqual([
			{ type: "class", id: "c1", label: "Minh Club", sublabel: "Online" },
		]);
	});

	test("no match returns empty array", () => {
		const d = data({ students: [student({ id: "s1", name: "Lan" })] });
		expect(searchGlobal(d, "zzz")).toEqual([]);
	});

	test("empty or whitespace query returns empty array", () => {
		const d = data({ students: [student({ id: "s1", name: "Lan" })] });
		expect(searchGlobal(d, "")).toEqual([]);
		expect(searchGlobal(d, "   ")).toEqual([]);
	});
});
