import { describe, expect, test } from "vitest";
import { classAssignmentCreateSchema } from "./contracts";
import {
	evaluateAssignmentDeadline,
	formatViDateDisplay,
	formatViWeekdayDate,
	parseTimeHHMM,
	parseViDateInput,
	vietnamSessionEndMs,
} from "./vietnam-date";

describe("vietnamSessionEndMs", () => {
	test("computes the VN end instant for a normal session", () => {
		// 08:00 + 90 phút = 09:30 giờ VN cùng ngày.
		expect(vietnamSessionEndMs("2099-03-10", "08:00", 90)).toBe(
			Date.parse("2099-03-10T09:30:00+07:00"),
		);
	});

	test("crosses midnight into the next VN day", () => {
		// 23:30 + 90 phút = 01:00 ngày hôm sau giờ VN.
		expect(vietnamSessionEndMs("2099-03-09", "23:30", 90)).toBe(
			Date.parse("2099-03-10T01:00:00+07:00"),
		);
	});

	test("returns null for malformed times (defensive, TIME_REGEX guards write paths)", () => {
		expect(vietnamSessionEndMs("2099-03-10", "7pm", 60)).toBeNull();
		// Giờ 1 chữ số: Date.parse bỏ qua "T7:00:00" trên runtime repo (đã verify NaN).
		expect(vietnamSessionEndMs("2099-03-10", "7:00", 60)).toBeNull();
		// Dấu cách đuôi làm parser từ chối.
		expect(vietnamSessionEndMs("2099-03-10", "08:00 ", 60)).toBeNull();
	});

	test("returns null for malformed dates", () => {
		expect(vietnamSessionEndMs("10/03/2099", "08:00", 60)).toBeNull();
		expect(vietnamSessionEndMs("2099-03-10", "", 60)).toBeNull();
	});
});

describe("parseViDateInput & formatViDateDisplay (#572)", () => {
	test("parses dd/mm/yyyy, d/m/yyyy, and 8-digit ddmmyyyy without swapping day/month", () => {
		expect(parseViDateInput("06/11/2026")).toBe("2026-11-06");
		expect(parseViDateInput(" 6/11/2026 ")).toBe("2026-11-06");
		expect(parseViDateInput("6/1/2026")).toBe("2026-01-06");
		expect(parseViDateInput("09112026")).toBe("2026-11-09");
		expect(parseViDateInput("29/02/2028")).toBe("2028-02-29");
	});

	test("rejects impossible calendar dates, out-of-range years, incomplete strings, and ISO input", () => {
		expect(parseViDateInput("31/02/2026")).toBeNull();
		expect(parseViDateInput("29/02/2026")).toBeNull();
		expect(parseViDateInput("31/04/2026")).toBeNull();
		expect(parseViDateInput("13/13/2026")).toBeNull();
		expect(parseViDateInput("00/11/2026")).toBeNull();
		expect(parseViDateInput("06/11/1999")).toBeNull();
		expect(parseViDateInput("06/11/2101")).toBeNull();
		expect(parseViDateInput("06/11")).toBeNull();
		expect(parseViDateInput("2026-11-06")).toBeNull();
		expect(parseViDateInput("")).toBeNull();
	});

	test("formats ISO yyyy-mm-dd to dd/mm/yyyy and Vietnamese weekday label", () => {
		expect(formatViDateDisplay("2026-11-06")).toBe("06/11/2026");
		expect(formatViDateDisplay("")).toBe("");
		expect(formatViDateDisplay("20/08")).toBe("20/08");
		expect(formatViWeekdayDate("2026-11-06")).toBe("Thứ Sáu, 06/11/2026");
		expect(formatViWeekdayDate("2026-11-08")).toBe("Chủ Nhật, 08/11/2026");
		expect(formatViWeekdayDate("invalid")).toBe("");
	});
});

describe("parseTimeHHMM (#572)", () => {
	test("parses valid 24h HH:mm, H:mm, and 4-digit HHmm", () => {
		expect(parseTimeHHMM("23:59")).toBe("23:59");
		expect(parseTimeHHMM("9:05")).toBe("09:05");
		expect(parseTimeHHMM("0930")).toBe("09:30");
		expect(parseTimeHHMM("00:00")).toBe("00:00");
	});

	test("rejects out-of-bounds hours/minutes and incomplete strings", () => {
		expect(parseTimeHHMM("24:00")).toBeNull();
		expect(parseTimeHHMM("12:60")).toBeNull();
		expect(parseTimeHHMM("9999")).toBeNull();
		expect(parseTimeHHMM("9")).toBeNull();
		expect(parseTimeHHMM("abc")).toBeNull();
		expect(parseTimeHHMM("")).toBeNull();
	});
});

describe("evaluateAssignmentDeadline (#572)", () => {
	test("evaluates exact ms boundaries (dueAt - 1ms, dueAt, dueAt + 1ms) in Vietnam timezone", () => {
		const dueAt = "2026-11-06T10:00:00.000Z"; // 17:00:00.000 VN on 2026-11-06
		const dueAtMs = Date.parse(dueAt);

		expect(
			evaluateAssignmentDeadline({
				due: "2027-01-01", // stale/different due column is ignored when dueAt is valid
				dueAt,
				submittedAt: null,
				nowMs: dueAtMs - 1,
			}),
		).toEqual({
			hasDueAt: true,
			dueAtMs,
			dueDateISO: "2026-11-06",
			isOverdue: false,
			isLate: false,
		});

		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt,
				submittedAt: null,
				nowMs: dueAtMs,
			}),
		).toMatchObject({
			hasDueAt: true,
			isOverdue: true,
			isLate: false,
		});

		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt,
				submittedAt: null,
				nowMs: dueAtMs + 1,
			}),
		).toMatchObject({
			hasDueAt: true,
			isOverdue: true,
			isLate: false,
		});

		// Submitted at exact deadline ms -> NOT late
		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt,
				submittedAt: new Date(dueAtMs).toISOString(),
				nowMs: dueAtMs + 60_000,
			}),
		).toMatchObject({
			hasDueAt: true,
			isOverdue: false,
			isLate: false,
		});

		// Submitted 1ms after deadline -> late
		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt,
				submittedAt: new Date(dueAtMs + 1).toISOString(),
				nowMs: dueAtMs + 60_000,
			}),
		).toMatchObject({
			hasDueAt: true,
			isOverdue: false,
			isLate: true,
		});
	});

	test("preserves legacy null-dueAt semantics across midnight VN rollover and legacyDateLate flag", () => {
		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt: null,
				submittedAt: null,
				todayISO: "2026-11-06",
			}),
		).toEqual({
			hasDueAt: false,
			dueAtMs: null,
			dueDateISO: "2026-11-06",
			isOverdue: false,
			isLate: false,
		});

		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt: null,
				submittedAt: null,
				todayISO: "2026-11-07",
			}).isOverdue,
		).toBe(true);

		// 23:59:59.999 VN on 2026-11-06 -> 16:59:59.999Z
		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt: null,
				submittedAt: "2026-11-06T16:59:59.999Z",
				legacyDateLate: true,
			}).isLate,
		).toBe(false);

		// 00:00:00.000 VN on 2026-11-07 -> 17:00:00.000Z on 2026-11-06 UTC
		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt: null,
				submittedAt: "2026-11-06T17:00:00.000Z",
				legacyDateLate: false, // student precedent
			}).isLate,
		).toBe(false);

		expect(
			evaluateAssignmentDeadline({
				due: "2026-11-06",
				dueAt: null,
				submittedAt: "2026-11-06T17:00:00.000Z",
				legacyDateLate: true, // web precedent
			}).isLate,
		).toBe(true);
	});
});

describe("classAssignmentCreateSchema (#572)", () => {
	const validBase = {
		promptId: "p-1",
		due: "2026-11-06",
		note: "",
		studentIds: ["s-1"],
	};

	test("accepts omitted dueTime and valid HH:mm dueTime", () => {
		expect(classAssignmentCreateSchema.safeParse(validBase).success).toBe(true);
		expect(
			classAssignmentCreateSchema.safeParse({
				...validBase,
				dueTime: "17:30",
			}).success,
		).toBe(true);
		expect(
			classAssignmentCreateSchema.safeParse({
				...validBase,
				dueTime: "23:59",
			}).success,
		).toBe(true);
	});

	test("rejects malformed dueTime and unknown fields (.strict)", () => {
		for (const bad of ["24:00", "7:30", "17:30:00", ""]) {
			expect(
				classAssignmentCreateSchema.safeParse({
					...validBase,
					dueTime: bad,
				}).success,
			).toBe(false);
		}
		expect(
			classAssignmentCreateSchema.safeParse({
				...validBase,
				extra: 1,
			}).success,
		).toBe(false);
	});
});
