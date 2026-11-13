import { describe, expect, test } from "vitest";
import { CLASS_ERROR_CODES, classUpdateSchema } from "./contracts";

describe("classUpdateSchema", () => {
	const validBase = {
		name: "IELTS 6.5 — Tối T3/T5",
		type: "ielts" as const,
		level: "IELTS 6.5",
		skills: ["Writing", "Speaking"] as const,
		mode: "Online",
		tuitionFee: 3_500_000,
	};

	test("chấp nhận cập nhật thông tin chung không kèm lịch", () => {
		const parsed = classUpdateSchema.safeParse(validBase);
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.name).toBe("IELTS 6.5 — Tối T3/T5");
		expect(parsed.data.schedule).toBeUndefined();
		expect(parsed.data.startDate).toBeUndefined();
		expect(parsed.data.sessionsTotal).toBeUndefined();
	});

	test("chấp nhận cập nhật đầy đủ lịch, startDate ISO và sessionsTotal", () => {
		const parsed = classUpdateSchema.safeParse({
			...validBase,
			tuitionFee: null,
			schedule: { days: [1, 3], start: "19:00", end: "20:30" },
			startDate: "2026-12-01",
			sessionsTotal: 20,
		});
		expect(parsed.success).toBe(true);
	});

	test("chấp nhận lớp giao tiếp không có kỹ năng và từ chối lớp giao tiếp có kỹ năng", () => {
		expect(
			classUpdateSchema.safeParse({
				name: "Giao tiếp B1",
				type: "communication",
				level: "B1",
				skills: [],
				mode: "Offline",
			}).success,
		).toBe(true);

		const bad = classUpdateSchema.safeParse({
			name: "Giao tiếp B1",
			type: "communication",
			level: "B1",
			skills: ["Speaking"],
			mode: "Offline",
		});
		expect(bad.success).toBe(false);
	});

	test("từ chối lớp IELTS không chọn kỹ năng", () => {
		const parsed = classUpdateSchema.safeParse({
			...validBase,
			skills: [],
		});
		expect(parsed.success).toBe(false);
	});

	test("từ chối schedule khi end <= start", () => {
		const parsed = classUpdateSchema.safeParse({
			...validBase,
			schedule: { days: [0], start: "20:00", end: "19:00" },
		});
		expect(parsed.success).toBe(false);
	});

	test("từ chối startDate không đúng định dạng, ngoài dải 2000..2100 hoặc ngày không tồn tại", () => {
		expect(
			classUpdateSchema.safeParse({
				...validBase,
				startDate: "2026-02-30",
			}).success,
		).toBe(false);
		expect(
			classUpdateSchema.safeParse({
				...validBase,
				startDate: "1999-12-31",
			}).success,
		).toBe(false);
		expect(
			classUpdateSchema.safeParse({
				...validBase,
				startDate: "2101-01-01",
			}).success,
		).toBe(false);
		expect(
			classUpdateSchema.safeParse({
				...validBase,
				startDate: "01/08",
			}).success,
		).toBe(false);
		expect(
			classUpdateSchema.safeParse({
				...validBase,
				startDate: "",
			}).success,
		).toBe(true);
	});

	test("từ chối trường lạ (strict) như status, syllabusId, schedulingMode", () => {
		expect(
			classUpdateSchema.safeParse({ ...validBase, status: "paused" }).success,
		).toBe(false);
		expect(
			classUpdateSchema.safeParse({ ...validBase, syllabusId: "sy-1" }).success,
		).toBe(false);
		expect(
			classUpdateSchema.safeParse({ ...validBase, schedulingMode: "manual" })
				.success,
		).toBe(false);
	});

	test("khai báo CLASS_ERROR_CODES.SCHEDULE_LOCKED", () => {
		expect(CLASS_ERROR_CODES.SCHEDULE_LOCKED).toBe("CLASS_SCHEDULE_LOCKED");
	});
});
