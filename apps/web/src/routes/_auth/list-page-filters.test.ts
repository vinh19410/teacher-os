import { describe, expect, it } from "vitest";

describe("issue #170 list page filters and KPI styling logic", () => {
	it("debt KPI danger style only applies when outstanding > 0", () => {
		const debtClassFor = (outstanding: number) => {
			if (outstanding <= 0) {
				return undefined;
			}
			return "[&>div:first-child]:text-danger";
		};

		expect(debtClassFor(0)).toBeUndefined();
		expect(debtClassFor(-50000)).toBeUndefined();
		expect(debtClassFor(400000)).toBe("[&>div:first-child]:text-danger");
	});

	it("students filter correctly maps Vietnamese labels to student tags", () => {
		const FILTER_TAGS: Record<string, string[]> = {
			"Sắp hết buổi": ["sắp hết buổi"],
			"Nợ học phí": ["nợ học phí"],
			Viết: ["IELTS Writing", "Writing", "Viết"],
			Nói: ["IELTS Speaking", "Speaking", "Nói"],
		};

		const mockStudents = [
			{ tags: ["IELTS Writing"] },
			{ tags: ["Writing"] },
			{ tags: ["IELTS Speaking"] },
			{ tags: ["sắp hết buổi"] },
			{ tags: ["nợ học phí"] },
			{ tags: ["other"] },
		];

		const filterBy = (tagLabel: string) => {
			if (tagLabel === "Tất cả") return mockStudents;
			const targetTags = FILTER_TAGS[tagLabel] ?? [tagLabel];
			return mockStudents.filter((s) =>
				s.tags.some((t) => targetTags.includes(t)),
			);
		};

		expect(filterBy("Tất cả")).toHaveLength(6);
		expect(filterBy("Viết")).toHaveLength(2);
		expect(filterBy("Nói")).toHaveLength(1);
		expect(filterBy("Sắp hết buổi")).toHaveLength(1);
		expect(filterBy("Nợ học phí")).toHaveLength(1);
	});

	it("classes filter correctly maps Trực tuyến and Trực tiếp to wire mode", () => {
		const MODE_MAP: Record<string, string> = {
			"Trực tuyến": "Online",
			"Trực tiếp": "Offline",
		};

		const mockClasses = [
			{ status: "active", mode: "Online" },
			{ status: "paused", mode: "Online" },
			{ status: "active", mode: "Offline" },
			{ status: "paused", mode: "Offline" },
		];

		const filterByMode = (modeLabel: string) => {
			if (modeLabel === "Tất cả") return mockClasses;
			return mockClasses.filter((c) =>
				modeLabel === "Đang học"
					? c.status === "active"
					: c.mode === (MODE_MAP[modeLabel] ?? modeLabel),
			);
		};

		expect(filterByMode("Tất cả")).toHaveLength(4);
		expect(filterByMode("Trực tuyến")).toHaveLength(2);
		expect(filterByMode("Trực tiếp")).toHaveLength(2);
		expect(filterByMode("Đang học")).toHaveLength(2);
	});

	it("syllabus filter correctly maps Vietnamese labels to wire skills", () => {
		const SKILL_MAP: Record<string, string> = {
			Viết: "Writing",
			Nói: "Speaking",
			Đọc: "Reading",
			Nghe: "Listening",
		};

		const mockTemplates = [
			{ skills: ["Writing"] },
			{ skills: ["Speaking", "Writing"] },
			{ skills: ["Reading"] },
			{ skills: ["Listening"] },
		];

		const filterBySkill = (skillLabel: string) => {
			if (skillLabel === "Tất cả") return mockTemplates;
			const wireSkill = SKILL_MAP[skillLabel] ?? skillLabel;
			return mockTemplates.filter((s) => s.skills.includes(wireSkill));
		};

		expect(filterBySkill("Tất cả")).toHaveLength(4);
		expect(filterBySkill("Viết")).toHaveLength(2);
		expect(filterBySkill("Nói")).toHaveLength(1);
		expect(filterBySkill("Đọc")).toHaveLength(1);
		expect(filterBySkill("Nghe")).toHaveLength(1);
	});
});
