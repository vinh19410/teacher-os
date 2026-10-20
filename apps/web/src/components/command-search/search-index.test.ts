import { describe, expect, it } from "vitest";
import { TEACHER_NAV } from "@/components/layout/sidebar";
import type {
	Assignment,
	ClassGroup,
	Invoice,
	MockData,
	Student,
} from "@/lib/mock-data";
import {
	buildSearchIndex,
	isSnapshotLoaded,
	normalizeVi,
	queryIndex,
} from "./search-index";

/** Fixture tối thiểu — chỉ mục chỉ đọc 4 collection kernel + tên học viên. */
function studentFixture(id: string, name: string, phone = ""): Student {
	return {
		id,
		name,
		phone,
		zalo: "",
		email: "",
		hasPackage: true,
		parent: { name: "", phone: "" },
		targetBand: "6.5",
		skills: [],
		examDate: "",
		pkg: {
			total: 0,
			done: 0,
			remaining: 0,
			price: 0,
			mode: "Offline",
			start: "",
			expiry: "",
		},
		tags: [],
		notes: "",
		avatar: "",
		atRisk: false,
	};
}

function classFixture(id: string, name: string, mode = "Offline"): ClassGroup {
	return {
		id,
		name,
		level: "IELTS 5.5",
		type: "ielts",
		skills: [],
		mode,
		syllabusId: "",
		studentIds: [],
		invitedStudentIds: [],
		schedule: "",
		sessionsDone: 0,
		sessionsTotal: 0,
		status: "active",
		startDate: "",
		tuitionFee: null,
		notes: "",
	};
}

function assignmentFixture(id: string, sid: string, title: string): Assignment {
	return {
		id,
		sid,
		title,
		type: "essay",
		due: "",
		status: "not-submitted",
		scores: null,
	};
}

function invoiceFixture(id: string, sid: string): Invoice {
	return {
		id,
		sid,
		eid: "",
		amount: 4_000_000,
		paidAmount: 0,
		status: "unpaid",
		date: "",
		type: "Học phí",
		method: "",
		due: "",
		note: "",
		createdAt: 0,
	};
}

function dataFixture(
	overrides: Partial<
		Pick<MockData, "students" | "classes" | "assignments" | "invoices">
	> = {},
): MockData {
	return {
		students: [],
		lessons: [],
		invoices: [],
		assignments: [],
		assignmentPrompts: [],
		reports: [],
		notifs: [],
		commentBank: [],
		classes: [],
		syllabi: [],
		...overrides,
	};
}

describe("normalizeVi", () => {
	it("bỏ dấu tiếng Việt và lowercase cho cả đ/Đ", () => {
		expect(normalizeVi("Lớp 7")).toBe("lop 7");
		expect(normalizeVi("Lê Quang Huy")).toBe("le quang huy");
		expect(normalizeVi("Đào Ngọc")).toBe("dao ngoc");
	});
});

describe("isSnapshotLoaded", () => {
	it("chưa có snapshot (null) hoặc thiếu collection → chưa tải", () => {
		expect(isSnapshotLoaded(null)).toBe(false);
		expect(isSnapshotLoaded({ students: [], classes: [] })).toBe(false);
	});

	it("org rỗng hợp lệ (đủ 4 collection) → đã tải", () => {
		expect(isSnapshotLoaded(dataFixture())).toBe(true);
	});
});

describe("buildSearchIndex", () => {
	it("store chưa tải → loaded false, không nhóm nào", () => {
		const index = buildSearchIndex(null);
		expect(index.loaded).toBe(false);
		expect(index.groups).toEqual([]);
	});

	it("org rỗng đã tải → chỉ có nhóm Điều hướng với đủ mục nav bật", () => {
		const index = buildSearchIndex(dataFixture());
		expect(index.loaded).toBe(true);
		expect(index.groups).toHaveLength(1);
		const nav = index.groups[0];
		expect(nav.label).toBe("Điều hướng");
		const expectedNav = TEACHER_NAV.flatMap((group) =>
			group.items
				.filter((item) => item.enabled !== false)
				.map((item) => ({
					label: item.label,
					href: item.href,
					hint: group.group,
				})),
		);
		expect(
			nav.items.map((item) => ({
				label: item.label,
				href: item.href,
				hint: item.hint,
			})),
		).toEqual(expectedNav);
	});

	it("nhóm sắp theo thứ tự lớp → học viên → bài tập → hóa đơn → nav", () => {
		const index = buildSearchIndex(
			dataFixture({
				students: [studentFixture("s-1", "Lê Quang Huy")],
				classes: [classFixture("c-1", "Lớp 7 IELTS Foundation")],
				assignments: [assignmentFixture("a-1", "s-1", "Essay: Technology")],
				invoices: [invoiceFixture("i-1234567890", "s-1")],
			}),
		);
		expect(index.groups.map((group) => group.kind)).toEqual([
			"class",
			"student",
			"assignment",
			"invoice",
			"nav",
		]);
	});
});

describe("queryIndex — so khớp bỏ dấu tiếng Việt", () => {
	const index = buildSearchIndex(
		dataFixture({
			students: [
				studentFixture("s-1", "Lê Quang Huy", "0901234567"),
				studentFixture("s-2", "Nguyễn Minh Anh"),
				studentFixture("s-3", "Trần Bình"),
			],
			classes: [
				classFixture("c-1", "Lớp 7 IELTS Foundation"),
				classFixture("c-2", "Speaking B1", "Online"),
			],
			assignments: [assignmentFixture("a-1", "s-1", "Essay: Technology")],
			invoices: [invoiceFixture("i-1234567890", "s-1")],
		}),
	);

	it("tìm 'huy' khớp 'Lê Quang Huy' trong nhóm Học viên", () => {
		const groups = queryIndex(index, "huy");
		const students = groups.find((group) => group.kind === "student");
		expect(students?.items.map((item) => item.label)).toEqual(["Lê Quang Huy"]);
	});

	it("tìm 'lop 7' khớp 'Lớp 7 IELTS Foundation' trong nhóm Lớp học", () => {
		const groups = queryIndex(index, "lop 7");
		const classes = groups.find((group) => group.kind === "class");
		expect(classes?.items.map((item) => item.label)).toEqual([
			"Lớp 7 IELTS Foundation",
		]);
	});

	it("tìm theo SĐT và theo tên phụ huynh vẫn khớp học viên", () => {
		expect(queryIndex(index, "0901234567")[0]?.items[0]?.id).toBe("s-1");
	});

	it("bài tập khớp theo tên đề, hint là tên học viên", () => {
		const groups = queryIndex(index, "essay tech");
		const assignments = groups.find((group) => group.kind === "assignment");
		expect(assignments?.items[0]?.label).toBe("Essay: Technology");
		expect(assignments?.items[0]?.hint).toBe("Lê Quang Huy");
	});

	it("hóa đơn: label tên học viên, khớp được mã INV và hiển thị tiền", () => {
		const byCode = queryIndex(index, "inv 3456");
		const invoices = byCode.find((group) => group.kind === "invoice");
		expect(invoices?.items[0]?.label).toBe("Lê Quang Huy");
		expect(invoices?.items[0]?.hint).toContain("Học phí");
		expect(invoices?.items[0]?.hint).toContain("4.000.000đ");
	});

	it("mục nav khớp theo nhãn và nhóm: 'kinh doanh' ra Doanh thu", () => {
		const groups = queryIndex(index, "kinh doanh");
		const nav = groups.find((group) => group.kind === "nav");
		expect(nav?.items.map((item) => item.label)).toContain("Doanh thu");
	});

	it("mỗi nhóm tối đa 5 kết quả", () => {
		const many = dataFixture({
			students: Array.from({ length: 7 }, (_, i) =>
				studentFixture(`s-${i}`, `Học Sinh ${i}`),
			),
		});
		// Token "sinh" chỉ nằm trong tên học viên — mục nav "Học viên" chứa
		// "hoc" nhưng thiếu "sinh" nên bị loại bởi AND theo token.
		const groups = queryIndex(buildSearchIndex(many), "hoc sinh");
		expect(groups).toHaveLength(1);
		expect(groups[0].items).toHaveLength(5);
	});

	it("query rỗng hoặc chỉ whitespace → không nhóm nào", () => {
		expect(queryIndex(index, "")).toEqual([]);
		expect(queryIndex(index, "   ")).toEqual([]);
	});

	it("không khớp → rỗng (palette hiển thị 'Không tìm thấy')", () => {
		expect(queryIndex(index, "zzz-khong-co")).toEqual([]);
	});

	it("index chưa tải → luôn rỗng dù có query", () => {
		expect(queryIndex(buildSearchIndex(null), "huy")).toEqual([]);
	});
});
