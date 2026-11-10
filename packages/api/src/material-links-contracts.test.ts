import { describe, expect, test } from "vitest";
import { addManualSessionSchema, lessonUpsertSchema } from "./contracts";

/** Issue #655 — materialIds trên contract tạo/sửa bài học và tạo buổi manual. */
describe("lessonUpsertSchema materialIds (#655)", () => {
	test("nhận materialIds hợp lệ", () => {
		const parsed = lessonUpsertSchema.parse({
			title: "Passive voice",
			materialIds: ["mat-1", "mat-2"],
		});
		expect(parsed.materialIds).toEqual(["mat-1", "mat-2"]);
	});

	test("vắng mặt materialIds là undefined (route quyết định giữ nguyên/rỗng)", () => {
		const parsed = lessonUpsertSchema.parse({ title: "X" });
		expect(parsed.materialIds).toBeUndefined();
	});

	test("nhận mảng rỗng (gỡ hết links khi edit)", () => {
		expect(
			lessonUpsertSchema.parse({ title: "X", materialIds: [] }).materialIds,
		).toEqual([]);
	});

	test("từ chối quá 20 links", () => {
		expect(
			lessonUpsertSchema.safeParse({
				title: "X",
				materialIds: Array.from({ length: 21 }, (_, i) => `m-${i}`),
			}).success,
		).toBe(false);
	});

	test("từ chối id rỗng", () => {
		expect(
			lessonUpsertSchema.safeParse({ title: "X", materialIds: [""] }).success,
		).toBe(false);
	});
});

describe("addManualSessionSchema materialIds (#655)", () => {
	const base = { date: "2026-11-10", time: "19:00", topic: "Buổi 1" };

	test("vắng mặt mặc định mảng rỗng (client cũ không vỡ)", () => {
		expect(addManualSessionSchema.parse(base).materialIds).toEqual([]);
	});

	test("nhận materialIds hợp lệ", () => {
		expect(
			addManualSessionSchema.parse({ ...base, materialIds: ["mat-9"] })
				.materialIds,
		).toEqual(["mat-9"]);
	});

	test("từ chối quá 20 links", () => {
		expect(
			addManualSessionSchema.safeParse({
				...base,
				materialIds: Array.from({ length: 21 }, (_, i) => `m-${i}`),
			}).success,
		).toBe(false);
	});
});
