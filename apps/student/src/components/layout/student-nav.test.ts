import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ACTIVE_KEY_BY_PREFIX,
	resolveStudentActiveKey,
	STUDENT_NAV,
	STUDENT_PAGE_LABEL,
	VOCABULARY_NAV_ITEM,
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

describe("student-nav practice & history menu visibility (#852, #1054)", () => {
	it("shows direct Từ vựng entry while hiding practice and history from STUDENT_NAV by default", () => {
		const allItems = STUDENT_NAV.flatMap((group) => group.items);
		const allKeys = allItems.flatMap((item) => [
			item.key,
			...(item.children?.map((child) => child.key) ?? []),
		]);
		const allHrefs = allItems.flatMap((item) => [
			item.href,
			...(item.children?.map((child) => child.href) ?? []),
		]);

		expect(allItems.map((item) => item.key)).toEqual([
			"overview",
			"classes",
			"schedule",
			"assignments",
			"vocabulary",
			"tuition",
		]);
		expect(VOCABULARY_NAV_ITEM.label).toBe("Từ vựng");
		expect(VOCABULARY_NAV_ITEM.href).toBe("/practice/vocabulary");
		expect(VOCABULARY_NAV_ITEM.children).toBeUndefined();
		expect(allKeys).not.toContain("practice");
		expect(allKeys).not.toContain("history");
		expect(allHrefs).not.toContain("/practice");
		expect(allHrefs).not.toContain("/history");
		expect(allHrefs).not.toContain("/practice/reading");
		expect(allHrefs).not.toContain("/practice/listening");
		expect(allHrefs).not.toContain("/practice/writing");
		expect(allHrefs).not.toContain("/practice/speaking");
	});

	it("preserves vocabulary, practice, and history active keys and crumb labels", () => {
		expect(ACTIVE_KEY_BY_PREFIX["/practice"]).toBe("practice");
		expect(ACTIVE_KEY_BY_PREFIX["/history"]).toBe("history");
		expect(STUDENT_PAGE_LABEL.vocabulary).toBe("Từ vựng");
		expect(STUDENT_PAGE_LABEL.practice).toBe("Luyện tập");
		expect(STUDENT_PAGE_LABEL.history).toBe("Lịch sử");
	});
});

describe("student-nav practice & history flag toggling via VITE_STUDENT_PRACTICE_ENABLED", () => {
	afterEach(() => {
		vi.doUnmock("@teacher-os/env/web");
		vi.resetModules();
	});

	it("includes Luyện tập (5 skills) and Lịch sử without top-level Từ vựng when VITE_STUDENT_PRACTICE_ENABLED='true'", async () => {
		vi.resetModules();
		vi.doMock("@teacher-os/env/web", () => ({
			env: {
				VITE_SERVER_URL: "http://localhost:8000",
				VITE_STUDENT_PRACTICE_ENABLED: "true",
			},
		}));
		const mod = await import("./student-nav");

		expect(mod.PRACTICE_ROUTES_LIVE).toBe(true);
		expect(mod.HISTORY_ROUTES_LIVE).toBe(true);
		const items = mod.STUDENT_NAV.flatMap((group) => group.items);
		expect(items).toHaveLength(7);
		expect(items.map((item) => item.key)).toEqual([
			"overview",
			"classes",
			"schedule",
			"assignments",
			"practice",
			"history",
			"tuition",
		]);
		expect(items.map((item) => item.key)).not.toContain("vocabulary");
		const practice = items.find((item) => item.key === "practice");
		expect(practice?.label).toBe("Luyện tập");
		expect(practice?.children?.map((child) => child.href)).toEqual([
			"/practice/reading",
			"/practice/listening",
			"/practice/writing",
			"/practice/speaking",
			"/practice/vocabulary",
		]);
		const history = items.find((item) => item.key === "history");
		expect(history?.label).toBe("Lịch sử");
		expect(history?.href).toBe("/history");
		expect(mod.resolveStudentActiveKey("/practice/vocabulary")).toBe(
			"practice",
		);
		expect(mod.resolveStudentActiveKey("/student/practice/vocabulary")).toBe(
			"practice",
		);
		expect(
			mod.resolveStudentActiveKey("/student/practice/vocabulary/courses"),
		).toBe("practice");
	});

	it("shows top-level Từ vựng and hides practice/history when VITE_STUDENT_PRACTICE_ENABLED is 'false', empty, or undefined", async () => {
		for (const value of ["false", "", undefined]) {
			vi.resetModules();
			vi.doMock("@teacher-os/env/web", () => ({
				env: {
					VITE_SERVER_URL: "http://localhost:8000",
					VITE_STUDENT_PRACTICE_ENABLED: value,
				},
			}));
			const mod = await import("./student-nav");

			expect(mod.PRACTICE_ROUTES_LIVE).toBe(false);
			const items = mod.STUDENT_NAV.flatMap((group) => group.items);
			expect(items).toHaveLength(6);
			expect(items.map((item) => item.key)).toEqual([
				"overview",
				"classes",
				"schedule",
				"assignments",
				"vocabulary",
				"tuition",
			]);
			expect(items.map((item) => item.key)).not.toContain("practice");
			expect(items.map((item) => item.key)).not.toContain("history");
			const vocab = items.find((item) => item.key === "vocabulary");
			expect(vocab?.label).toBe("Từ vựng");
			expect(vocab?.href).toBe("/practice/vocabulary");
			expect(vocab?.children).toBeUndefined();
			expect(mod.resolveStudentActiveKey("/practice/vocabulary")).toBe(
				"vocabulary",
			);
			expect(mod.resolveStudentActiveKey("/student/practice/vocabulary")).toBe(
				"vocabulary",
			);
			expect(
				mod.resolveStudentActiveKey("/student/practice/vocabulary/courses"),
			).toBe("vocabulary");
			expect(
				mod.resolveStudentActiveKey(
					"/student/practice/vocabulary/deck-1/session",
				),
			).toBe("vocabulary");
			expect(
				mod.resolveStudentActiveKey("/student/practice/vocabulary-other"),
			).toBe("practice");
		}
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
		expect(resolveStudentActiveKey("/student/practice/vocabulary")).toBe(
			"vocabulary",
		);
		expect(
			resolveStudentActiveKey("/student/practice/vocabulary/deck-1/session"),
		).toBe("vocabulary");
		expect(resolveStudentActiveKey("/student/practice/vocabulary-other")).toBe(
			"practice",
		);
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
