import { describe, expect, it } from "vitest";
import {
	ACTIVE_KEY_BY_PREFIX,
	resolveStudentActiveKey,
	STUDENT_NAV,
	STUDENT_PAGE_LABEL,
} from "./student-nav";

describe("student-nav placement test entry removal", () => {
	it("excludes placement-test from STUDENT_NAV items and children", () => {
		const allItems = STUDENT_NAV.flatMap((group) => group.items);
		const allKeys = allItems.flatMap((item) => [
			item.key,
			...(item.children?.map((child) => child.key) ?? []),
		]);
		const allHrefs = allItems.flatMap((item) => [
			item.href,
			...(item.children?.map((child) => child.href) ?? []),
		]);

		expect(allKeys).not.toContain("placement-test");
		expect(allHrefs).not.toContain("/placement-test");
	});

	it("keeps /placement-test active key and header breadcrumb label", () => {
		expect(ACTIVE_KEY_BY_PREFIX["/placement-test"]).toBe("placement-test");
		expect(STUDENT_PAGE_LABEL["placement-test"]).toBe("Kiểm tra đầu vào");
	});
});

describe("student-nav practice & history menu visibility (#852)", () => {
	it("excludes practice and history from STUDENT_NAV by default", () => {
		const allItems = STUDENT_NAV.flatMap((group) => group.items);
		const allKeys = allItems.map((item) => item.key);
		const allHrefs = allItems.map((item) => item.href);

		expect(allKeys).not.toContain("practice");
		expect(allKeys).not.toContain("history");
		expect(allHrefs).not.toContain("/practice");
		expect(allHrefs).not.toContain("/history");
	});

	it("preserves practice and history active keys and crumb labels", () => {
		expect(ACTIVE_KEY_BY_PREFIX["/practice"]).toBe("practice");
		expect(ACTIVE_KEY_BY_PREFIX["/history"]).toBe("history");
		expect(STUDENT_PAGE_LABEL.practice).toBe("Luyện tập");
		expect(STUDENT_PAGE_LABEL.history).toBe("Lịch sử");
	});
});

describe("resolveStudentActiveKey with /student basepath", () => {
	it("normalizes optional /student prefix before matching overview and section prefixes", () => {
		expect(resolveStudentActiveKey("/")).toBe("overview");
		expect(resolveStudentActiveKey("/student")).toBe("overview");
		expect(resolveStudentActiveKey("/student/")).toBe("overview");
		expect(resolveStudentActiveKey("/classes")).toBe("classes");
		expect(resolveStudentActiveKey("/student/classes")).toBe("classes");
		expect(resolveStudentActiveKey("/student/classes/cls-1")).toBe("classes");
		expect(resolveStudentActiveKey("/student/schedule")).toBe("schedule");
		expect(resolveStudentActiveKey("/student/assignments")).toBe("assignments");
		expect(resolveStudentActiveKey("/student/practice/reading")).toBe(
			"practice",
		);
		expect(resolveStudentActiveKey("/student/history")).toBe("history");
		expect(resolveStudentActiveKey("/student/tuition/inv-1")).toBe("tuition");
		expect(resolveStudentActiveKey("/student/placement-test")).toBe(
			"placement-test",
		);
		expect(resolveStudentActiveKey("/student-other")).toBe("");
		expect(resolveStudentActiveKey("/unknown")).toBe("");
	});
});
