import { describe, expect, test } from "vitest";
import {
	CURRICULUM_IMPORT_ERROR_CODES,
	importSyllabusSchema,
} from "./contracts";
import {
	classifyManualSessionDates,
	isManualLessonSettled,
	projectCurriculumDates,
} from "./curriculum-overwrite";

describe("curriculum-overwrite pure helpers", () => {
	const monWedSchedule = JSON.stringify({
		days: [0, 2],
		start: "19:00",
		end: "20:30",
	});

	test("projectCurriculumDates returns sorted active dates for standard schedule", () => {
		const res = projectCurriculumDates({
			schedule: monWedSchedule,
			startDate: "2026-11-09", // Monday
			lessonCount: 3,
			todayISO: "2026-11-01",
		});
		expect(res).toEqual({
			ok: true,
			activeDates: ["2026-11-09", "2026-11-11", "2026-11-16"],
			nonHolidayDates: ["2026-11-09", "2026-11-11", "2026-11-16"],
			inactiveDates: [],
		});
	});

	test("projectCurriculumDates separates holiday-shifted original date into inactiveDates and includes makeup date in activeDates", () => {
		const monOnlySchedule = JSON.stringify({
			days: [0],
			start: "19:00",
			end: "20:30",
		});
		const res = projectCurriculumDates({
			schedule: monOnlySchedule,
			startDate: "2026-11-09",
			lessonCount: 3,
			holidays: [
				{
					id: "h1",
					name: "Nghỉ lễ",
					fromDate: "2026-11-09",
					toDate: "2026-11-09",
					mode: "shift",
				},
			],
			todayISO: "2026-11-01",
		});
		expect(res).toEqual({
			ok: true,
			activeDates: ["2026-11-16", "2026-11-23", "2026-11-30"],
			nonHolidayDates: ["2026-11-16", "2026-11-23", "2026-11-30"],
			inactiveDates: ["2026-11-09"],
		});
	});

	test("projectCurriculumDates separates holiday-cancelled date into inactiveDates without adding makeup date", () => {
		const monOnlySchedule = JSON.stringify({
			days: [0],
			start: "19:00",
			end: "20:30",
		});
		const res = projectCurriculumDates({
			schedule: monOnlySchedule,
			startDate: "2026-11-09",
			lessonCount: 3,
			holidays: [
				{
					id: "h-cancel",
					name: "Nghỉ hủy",
					fromDate: "2026-11-16",
					toDate: "2026-11-16",
					mode: "cancel",
				},
			],
			todayISO: "2026-11-01",
		});
		expect(res).toEqual({
			ok: true,
			activeDates: ["2026-11-09", "2026-11-23"],
			nonHolidayDates: ["2026-11-09", "2026-11-16", "2026-11-23"],
			inactiveDates: ["2026-11-16"],
		});
	});

	test("projectCurriculumDates fails closed on invalid schedule, invalid startDate, out-of-bounds lessonCount, and holiday SCAN_CAP_DAYS", () => {
		expect(
			projectCurriculumDates({
				schedule: "T2 19:00",
				startDate: "2026-11-09",
				lessonCount: 3,
				todayISO: "2026-11-01",
			}),
		).toEqual({ ok: false, reason: "invalid-schedule" });

		expect(
			projectCurriculumDates({
				schedule: monWedSchedule,
				startDate: "",
				lessonCount: 3,
				todayISO: "2026-11-01",
			}),
		).toEqual({ ok: false, reason: "invalid-start-date" });

		expect(
			projectCurriculumDates({
				schedule: monWedSchedule,
				startDate: "01/09",
				lessonCount: 3,
				todayISO: "2026-11-01",
			}),
		).toEqual({ ok: false, reason: "invalid-start-date" });

		expect(
			projectCurriculumDates({
				schedule: monWedSchedule,
				startDate: "2026-02-30",
				lessonCount: 3,
				todayISO: "2026-11-01",
			}),
		).toEqual({ ok: false, reason: "invalid-start-date" });

		expect(
			projectCurriculumDates({
				schedule: monWedSchedule,
				startDate: "2026-11-09",
				lessonCount: 0,
				todayISO: "2026-11-01",
			}),
		).toEqual({ ok: false, reason: "invalid-lesson-count" });

		expect(
			projectCurriculumDates({
				schedule: monWedSchedule,
				startDate: "2026-11-09",
				lessonCount: 53,
				todayISO: "2026-11-01",
			}),
		).toEqual({ ok: false, reason: "invalid-lesson-count" });

		// Kỳ nghỉ phủ > 364 ngày khiến planHolidayShift chạm SCAN_CAP_DAYS — không throw
		expect(
			projectCurriculumDates({
				schedule: JSON.stringify({ days: [0], start: "19:00", end: "20:30" }),
				startDate: "2026-11-09",
				lessonCount: 2,
				holidays: [
					{
						id: "h-year",
						name: "Nghỉ cả năm",
						fromDate: "2026-11-01",
						toDate: "2028-01-01",
						mode: "shift",
					},
				],
				todayISO: "2026-11-01",
			}),
		).toEqual({ ok: false, reason: "holiday-scan-cap" });
	});

	test("classifyManualSessionDates partitions, dedupes, and sorts conflicting vs other manual dates", () => {
		const res = classifyManualSessionDates(
			["2026-11-16", "2026-11-10", "2026-11-09", "2026-11-10", "2026-11-12"],
			["2026-11-09", "2026-11-11", "2026-11-16"],
		);
		expect(res).toEqual({
			conflictingDates: ["2026-11-09", "2026-11-16"],
			otherManualDates: ["2026-11-10", "2026-11-12"],
		});
	});

	test("isManualLessonSettled detects completed, absent, attendance, and non-empty attendanceNote", () => {
		expect(
			isManualLessonSettled({
				status: "completed",
				attendance: null,
				attendanceNote: null,
			}),
		).toBe(true);
		expect(
			isManualLessonSettled({
				status: "absent",
				attendance: null,
				attendanceNote: null,
			}),
		).toBe(true);
		expect(
			isManualLessonSettled({
				status: "upcoming",
				attendance: "present",
				attendanceNote: null,
			}),
		).toBe(true);
		expect(
			isManualLessonSettled({
				status: "upcoming",
				attendance: null,
				attendanceNote: "Nghỉ có phép",
			}),
		).toBe(true);
		expect(
			isManualLessonSettled({
				status: "upcoming",
				attendance: null,
				attendanceNote: "",
			}),
		).toBe(false);
		expect(
			isManualLessonSettled({
				status: "cancelled",
				attendance: null,
				attendanceNote: null,
			}),
		).toBe(false);
	});

	test("importSyllabusSchema enforces .strict() and validates optional overwrite fields", () => {
		expect(CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST).toBe(
			"MANUAL_SESSIONS_EXIST",
		);
		expect(CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_COMPLETED).toBe(
			"MANUAL_SESSIONS_COMPLETED",
		);
		expect(importSyllabusSchema.safeParse({ templateId: "t1" }).success).toBe(
			true,
		);
		expect(
			importSyllabusSchema.safeParse({
				templateId: "t1",
				overwriteManualSessions: false,
			}).success,
		).toBe(true);
		expect(
			importSyllabusSchema.safeParse({
				templateId: "t1",
				overwriteManualSessions: true,
				overwriteHash: "abc123",
			}).success,
		).toBe(true);
		expect(
			importSyllabusSchema.safeParse({
				templateId: "t1",
				overwriteManualSessions: "yes",
			}).success,
		).toBe(false);
		expect(
			importSyllabusSchema.safeParse({
				templateId: "t1",
				overwriteManualSessions: true,
				overwriteHash: "",
			}).success,
		).toBe(false);
		expect(
			importSyllabusSchema.safeParse({
				templateId: "t1",
				overwriteManualSession: true,
			}).success,
		).toBe(false);
	});
});
