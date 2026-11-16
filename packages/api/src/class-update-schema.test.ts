import { describe, expect, test } from "vitest";
import {
	CLASS_ERROR_CODES,
	CLASS_STATUSES,
	classStatusResponseSchema,
	classStatusUpdateSchema,
	classUpdateSchema,
	dailyAttendanceResponseSchema,
	studentClassSchema,
} from "./contracts";

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

	test("khai báo CLASS_ERROR_CODES.SCHEDULE_LOCKED và CLASS_PAUSED", () => {
		expect(CLASS_ERROR_CODES.SCHEDULE_LOCKED).toBe("CLASS_SCHEDULE_LOCKED");
		expect(CLASS_ERROR_CODES.CLASS_PAUSED).toBe("CLASS_PAUSED");
	});
});

describe("class status contracts (#694)", () => {
	test("CLASS_STATUSES chỉ gồm đúng 2 trạng thái active và paused", () => {
		expect(CLASS_STATUSES).toEqual(["active", "paused"]);
	});

	test("classStatusUpdateSchema chấp nhận active | paused và từ chối archived / key lạ", () => {
		expect(
			classStatusUpdateSchema.safeParse({ status: "active" }).success,
		).toBe(true);
		expect(
			classStatusUpdateSchema.safeParse({ status: "paused" }).success,
		).toBe(true);
		expect(
			classStatusUpdateSchema.safeParse({ status: "archived" }).success,
		).toBe(false);
		expect(
			classStatusUpdateSchema.safeParse({ status: "paused", extra: 1 }).success,
		).toBe(false);
	});

	test("classStatusResponseSchema parse ok & status", () => {
		expect(
			classStatusResponseSchema.safeParse({ ok: true, status: "paused" })
				.success,
		).toBe(true);
		expect(
			classStatusResponseSchema.safeParse({ ok: true, status: "archived" })
				.success,
		).toBe(false);
	});

	test("dailyAttendanceResponseSchema chấp nhận classPaused optional mà không đòi hỏi bắt buộc", () => {
		const parsed = dailyAttendanceResponseSchema.safeParse({
			date: "2026-10-01",
			sessions: [
				{
					classId: "c1",
					className: "IELTS",
					time: "19:00",
					dur: 90,
					mode: "dated",
					recorded: false,
					classPaused: true,
					students: [],
				},
			],
			counts: { all: 1, pending: 0, completed: 0 },
		});
		expect(parsed.success).toBe(true);
	});

	test("studentClassSchema giữ active/paused và catch giá trị lạ về active", () => {
		const base = {
			id: "c1",
			name: "IELTS",
			level: "6.5",
			mode: "Online",
			schedule: "T2 19:00",
			sessionsDone: 1,
			sessionsTotal: 10,
			enrollmentId: "e1",
			enrollmentStatus: "active",
			nextSession: null,
			teacher: null,
		};
		const paused = studentClassSchema.parse({ ...base, status: "paused" });
		expect(paused.status).toBe("paused");
		const fallback = studentClassSchema.parse({ ...base, status: "archived" });
		expect(fallback.status).toBe("active");
	});
});
