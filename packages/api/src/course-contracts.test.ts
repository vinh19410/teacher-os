import { describe, expect, it } from "vitest";
import {
	COURSE_CATEGORY_NAME_MAX,
	COURSE_NAME_MAX,
	courseCategoryCreateSchema,
	courseCategoryReorderSchema,
	courseCategoryUpdateSchema,
	courseCreateSchema,
	courseReorderSchema,
	courseUpdateSchema,
	DEFAULT_COURSE_CATALOG,
	formatCourseDisplayName,
	normalizeCourseNameKey,
} from "./course-contracts";

describe("course-contracts", () => {
	it("seeds Giao Tiếp (3 courses) and IELTS (4 courses) by default", () => {
		expect(DEFAULT_COURSE_CATALOG.map((c) => c.name)).toEqual([
			"Giao Tiếp",
			"IELTS",
		]);
		expect(DEFAULT_COURSE_CATALOG[0]?.courses.map((c) => c.name)).toEqual([
			"Communication English Level 1",
			"Communication English Level 2",
			"Communication English Level 3",
		]);
		expect(DEFAULT_COURSE_CATALOG[1]?.courses.map((c) => c.name)).toEqual([
			"Foundation",
			"First Step",
			"Pre IELTS",
			"Advanced",
		]);
	});

	it("formats display name as '<Category> - <Course>'", () => {
		expect(formatCourseDisplayName("IELTS", "Foundation")).toBe(
			"IELTS - Foundation",
		);
		expect(
			formatCourseDisplayName(
				"  Giao Tiếp ",
				" Communication English Level 1 ",
			),
		).toBe("Giao Tiếp - Communication English Level 1");
		expect(formatCourseDisplayName("", "Foundation")).toBe("Foundation");
	});

	it("normalizes course name keys consistently", () => {
		expect(normalizeCourseNameKey("  Pre   IELTS ")).toBe("pre ielts");
	});

	it("validates category create/update/reorder schemas", () => {
		expect(courseCategoryCreateSchema.parse({ name: "  TOEIC  " })).toEqual({
			name: "TOEIC",
		});
		expect(courseCategoryCreateSchema.safeParse({ name: "   " }).success).toBe(
			false,
		);
		expect(
			courseCategoryCreateSchema.safeParse({
				name: "a".repeat(COURSE_CATEGORY_NAME_MAX + 1),
			}).success,
		).toBe(false);

		expect(courseCategoryUpdateSchema.safeParse({}).success).toBe(false);
		expect(courseCategoryUpdateSchema.parse({ isActive: false })).toEqual({
			isActive: false,
		});
		expect(
			courseCategoryReorderSchema.safeParse({ orderedIds: [] }).success,
		).toBe(false);
		expect(
			courseCategoryReorderSchema.parse({ orderedIds: ["c1", "c2"] }),
		).toEqual({ orderedIds: ["c1", "c2"] });
	});

	it("validates course create/update/reorder schemas", () => {
		expect(
			courseCreateSchema.parse({ categoryId: "cat-1", name: "  Pre IELTS " }),
		).toEqual({ categoryId: "cat-1", name: "Pre IELTS" });
		expect(
			courseCreateSchema.safeParse({
				categoryId: "cat-1",
				name: "x".repeat(COURSE_NAME_MAX + 1),
			}).success,
		).toBe(false);
		expect(courseUpdateSchema.safeParse({}).success).toBe(false);
		expect(
			courseUpdateSchema.parse({ categoryId: "cat-2", isActive: true }),
		).toEqual({ categoryId: "cat-2", isActive: true });
		expect(
			courseReorderSchema.parse({
				categoryId: "cat-1",
				orderedIds: ["a", "b"],
			}),
		).toEqual({ categoryId: "cat-1", orderedIds: ["a", "b"] });
	});
});
