import type {
	StudentAssignment,
	StudentClass,
	StudentInvoiceItem,
	StudentScheduleLesson,
} from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import {
	deriveStudentGoalSummary,
	formatAssignmentSkillLabel,
	formatMinutesUntilStart,
	formatSessionEndTime,
	formatVietnamLongDate,
	normalizeInvoiceTypeLabel,
	parseIeltsBand,
	selectNextTaskHero,
	selectStudentTuitionSummary,
	selectTodaySchedule,
	vietnamClockHHMM,
} from "./student-overview-selectors";

function makeAssignment(
	overrides: Partial<StudentAssignment> = {},
): StudentAssignment {
	return {
		id: "asg-1",
		title: "Writing Task 2 — Opinion essay",
		source: "class_assignment",
		classId: "cls-1",
		className: "IELTS Writing 6.5 · K08",
		due: "2026-11-28",
		dueAt: null,
		submittedAt: null,
		scores: null,
		skill: "writing",
		gradedAt: null,
		...overrides,
	};
}

function makeClass(overrides: Partial<StudentClass> = {}): StudentClass {
	return {
		id: "cls-1",
		name: "IELTS Writing 6.5 · K08",
		level: "IELTS 6.5",
		mode: "Online",
		schedule: "T2 & T5 · 18:00–19:30",
		sessionsDone: 14,
		sessionsTotal: 24,
		status: "active",
		enrollmentId: "enr-1",
		enrollmentStatus: "active",
		nextSession: null,
		teacher: { name: "Nguyễn Thu Hạnh", email: "hanh@test.local", image: null },
		...overrides,
	};
}

function makeLesson(
	overrides: Partial<StudentScheduleLesson> = {},
): StudentScheduleLesson {
	return {
		id: "les-1",
		classId: "cls-1",
		className: "IELTS Writing 6.5 · K08",
		date: "2026-11-26",
		day: 4,
		time: "18:00",
		dur: 90,
		status: "upcoming",
		topic: "Opinion essay structure",
		hasZoom: true,
		...overrides,
	};
}

function makeInvoice(
	overrides: Partial<StudentInvoiceItem> = {},
): StudentInvoiceItem {
	return {
		id: "inv-1",
		invoiceCode: "INV-0001",
		amount: 3_200_000,
		paidAmount: 0,
		amountDue: 3_200_000,
		status: "unpaid",
		due: "30/11",
		type: "Học phí",
		...overrides,
	};
}

describe("time helpers", () => {
	it("formats session end time safely including overnight wrap and rejects malformed input", () => {
		expect(formatSessionEndTime("18:30", 90)).toBe("20:00");
		expect(formatSessionEndTime("23:30", 60)).toBe("00:30");
		expect(formatSessionEndTime("09:00", 45)).toBe("09:45");
		expect(formatSessionEndTime("invalid", 90)).toBeNull();
		expect(formatSessionEndTime("", 90)).toBeNull();
		expect(formatSessionEndTime("25:00", 60)).toBeNull();
		expect(formatSessionEndTime("18:30", 0)).toBeNull();
		expect(formatSessionEndTime("18:30", -30)).toBeNull();
		expect(formatSessionEndTime("18:30", Number.NaN)).toBeNull();
		expect(formatSessionEndTime("18:30", undefined)).toBeNull();
	});

	it("formats Vietnam long date and clock HH:mm", () => {
		// 2026-11-26 17:52 ICT = 2026-11-26 10:52 UTC
		const ms = Date.parse("2026-11-26T10:52:00Z");
		expect(formatVietnamLongDate(ms)).toBe("Thứ Năm, 26 tháng 11");
		expect(vietnamClockHHMM(ms)).toBe("17:52");
		expect(vietnamClockHHMM(Number.NaN)).toBe("");
		expect(formatVietnamLongDate(Number.NaN)).toBe("");
	});

	it("formats relative minutes until start cleanly", () => {
		expect(formatMinutesUntilStart(0)).toBe("1 phút");
		expect(formatMinutesUntilStart(15)).toBe("15 phút");
		expect(formatMinutesUntilStart(60)).toBe("1 giờ");
		expect(formatMinutesUntilStart(125)).toBe("2 giờ 5 phút");
	});
});

describe("selectNextTaskHero", () => {
	const TODAY = "2026-11-26";
	const NOW_MS = Date.parse("2026-11-26T10:52:00Z"); // 17:52 ICT

	it("excludes grading-source, submitted, gradedAt, and scored items from hero queue while counting overdue/dueSoon across all assignments", () => {
		const gradingDueSoon = makeAssignment({
			id: "g-1",
			source: "grading",
			title: "Chấm tay ngoài lớp",
			due: "2026-11-27",
		});
		const submitted = makeAssignment({
			id: "a-sub",
			title: "Đã nộp",
			due: "2026-11-26",
			submittedAt: "2026-11-26T08:00:00Z",
		});
		const gradedAtOnly = makeAssignment({
			id: "a-graded-at",
			title: "Đã chốt điểm",
			due: "2026-11-26",
			gradedAt: "2026-11-26T09:00:00Z",
		});
		const scored = makeAssignment({
			id: "a-scored",
			title: "Có band điểm",
			due: "2026-11-26",
			scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
		});
		const pending = makeAssignment({
			id: "a-pending",
			title: "Bài cần làm thật",
			due: "2026-11-27",
		});

		const result = selectNextTaskHero(
			[gradingDueSoon, submitted, gradedAtOnly, scored, pending],
			TODAY,
			NOW_MS,
		);

		expect(result.primary?.assignment.id).toBe("a-pending");
		expect(result.queue).toHaveLength(0);
		expect(result.totalPending).toBe(1);
		// Cả gradingDueSoon lẫn pending đều là due-soon (khớp tab AssignmentList)
		expect(result.dueSoonCount).toBe(2);
		expect(result.overdueCount).toBe(0);
	});

	it("prioritizes overdue -> due-soon -> not-submitted with ascending dueAtMs tie-break and caps queue at 2", () => {
		const notSubNoDue = makeAssignment({
			id: "a-nodue",
			title: "Không hạn",
			due: "",
			dueAt: null,
		});
		const notSubLater = makeAssignment({
			id: "a-later",
			title: "Hạn tuần sau",
			due: "2026-12-05",
		});
		const dueSoonTomorrow = makeAssignment({
			id: "a-tmr",
			title: "Hạn ngày mai",
			due: "2026-11-27",
			dueAt: "2026-11-27T14:00:00Z", // 21:00 ICT
		});
		const dueSoonTonight = makeAssignment({
			id: "a-tonight",
			title: "Hạn tối nay",
			due: "2026-11-26",
			dueAt: "2026-11-26T16:59:00Z", // 23:59 ICT
		});
		const overdue = makeAssignment({
			id: "a-overdue",
			title: "Bài quá hạn",
			due: "2026-11-25",
		});

		const result = selectNextTaskHero(
			[notSubNoDue, notSubLater, dueSoonTomorrow, dueSoonTonight, overdue],
			TODAY,
			NOW_MS,
		);

		expect(result.primary?.assignment.id).toBe("a-overdue");
		expect(result.primary?.remaining?.tone).toBe("destructive");
		expect(result.primary?.remaining?.label).toBe("Đã quá hạn");
		expect(result.queue.map((q) => q.assignment.id)).toEqual([
			"a-tonight",
			"a-tmr",
		]);
		expect(result.totalPending).toBe(5);
		expect(result.overdueCount).toBe(1);
		expect(result.dueSoonCount).toBe(2);
	});

	it("formats honest remaining time for dueAt minutes/hours/days and date-only due without inventing 23:59", () => {
		const in45m = makeAssignment({
			id: "m45",
			due: TODAY,
			dueAt: new Date(NOW_MS + 45 * 60_000).toISOString(),
		});
		const in6h = makeAssignment({
			id: "h6",
			due: TODAY,
			dueAt: new Date(NOW_MS + 6 * 3_600_000).toISOString(),
		});
		const dateOnlyToday = makeAssignment({
			id: "d0",
			due: TODAY,
			dueAt: null,
		});
		const noDue = makeAssignment({
			id: "none",
			due: "",
			dueAt: null,
		});

		const r1 = selectNextTaskHero([in45m], TODAY, NOW_MS);
		expect(r1.primary?.remaining).toEqual({
			label: "còn 45 phút",
			tone: "warn",
		});

		const r2 = selectNextTaskHero([in6h], TODAY, NOW_MS);
		expect(r2.primary?.remaining).toEqual({
			label: "còn 6 giờ",
			tone: "warn",
		});

		const r3 = selectNextTaskHero([dateOnlyToday], TODAY, NOW_MS);
		expect(r3.primary?.dueLabel).not.toContain("23:59");
		expect(r3.primary?.remaining).toEqual({
			label: "hôm nay",
			tone: "warn",
		});

		const r4 = selectNextTaskHero([noDue], TODAY, NOW_MS);
		expect(r4.primary?.remaining).toBeNull();

		// 59m40s must stay "còn 59 phút", never "còn 60 phút"
		const in59m40s = makeAssignment({
			id: "m59",
			due: TODAY,
			dueAt: new Date(NOW_MS + 59 * 60_000 + 40_000).toISOString(),
		});
		const r5 = selectNextTaskHero([in59m40s], TODAY, NOW_MS);
		expect(r5.primary?.remaining).toEqual({
			label: "còn 59 phút",
			tone: "warn",
		});

		// Tomorrow 21:00 (27h08m from 17:52 today) must show "Hạn Ngày mai, 21:00" and "còn 1 ngày" (matching AssignmentRow)
		const tomorrow21 = makeAssignment({
			id: "tmr21",
			due: "2026-11-27",
			dueAt: "2026-11-27T14:00:00Z",
		});
		const r6 = selectNextTaskHero([tomorrow21], TODAY, NOW_MS);
		expect(r6.primary?.dueLabel).toBe("Hạn Ngày mai, 21:00");
		expect(r6.primary?.remaining).toEqual({
			label: "còn 1 ngày",
			tone: "warn",
		});

		// 3 days away is still due-soon, so remaining tone stays "warn"
		const in3Days = makeAssignment({
			id: "d3",
			due: "2026-11-29",
			dueAt: "2026-11-29T16:59:00Z",
		});
		const r7 = selectNextTaskHero([in3Days], TODAY, NOW_MS);
		expect(r7.primary?.remaining).toEqual({
			label: "còn 3 ngày",
			tone: "warn",
		});

		// 5 days away is not-submitted, so remaining tone is "neutral"
		const in5Days = makeAssignment({
			id: "d5",
			due: "2026-12-01",
			dueAt: "2026-12-01T16:59:00Z",
		});
		const r8 = selectNextTaskHero([in5Days], TODAY, NOW_MS);
		expect(r8.primary?.remaining).toEqual({
			label: "còn 5 ngày",
			tone: "neutral",
		});
	});

	it("formats assignment skill labels cleanly", () => {
		expect(formatAssignmentSkillLabel("writing")).toBe("Writing");
		expect(formatAssignmentSkillLabel("speaking")).toBe("Speaking");
		expect(formatAssignmentSkillLabel("reading")).toBe("Reading");
		expect(formatAssignmentSkillLabel("listening")).toBe("Listening");
		expect(formatAssignmentSkillLabel("grammar")).toBe("Grammar");
		expect(formatAssignmentSkillLabel("vocab")).toBe("Từ vựng");
		expect(formatAssignmentSkillLabel("")).toBeNull();
		expect(formatAssignmentSkillLabel(null)).toBeNull();
	});
});

describe("selectTodaySchedule", () => {
	// 2026-11-26 17:52 ICT = 2026-11-26 10:52 UTC
	const NOW_MS = Date.parse("2026-11-26T10:52:00Z");

	it("allowlists active enrolled classes, excludes paused/invited/unknown classes and cancelled/holiday lessons, and classifies ended/live/open/later using 30m Zoom window", () => {
		const activeCls = makeClass({ id: "cls-1", name: "IELTS Speaking 6.0" });
		const pausedCls = makeClass({
			id: "cls-paused",
			name: "Lớp tạm dừng",
			status: "paused",
		});
		const invitedCls = makeClass({
			id: "cls-invited",
			name: "Lớp mời",
			enrollmentStatus: "invited",
		});

		const lessons: StudentScheduleLesson[] = [
			makeLesson({
				id: "l-ended",
				classId: "cls-1",
				time: "09:00",
				dur: 90,
				status: "completed",
			}),
			makeLesson({
				id: "l-live",
				classId: "cls-1",
				time: "17:00",
				dur: 90,
				status: "upcoming",
				hasZoom: true,
			}),
			makeLesson({
				id: "l-open",
				classId: "cls-1",
				time: "18:10",
				dur: 90,
				status: "upcoming",
				hasZoom: true,
			}),
			makeLesson({
				id: "l-later-zoom",
				classId: "cls-1",
				time: "20:00",
				dur: 60,
				status: "upcoming",
				hasZoom: true,
			}),
			makeLesson({
				id: "l-later-offline",
				classId: "cls-1",
				time: "18:15",
				dur: 60,
				status: "upcoming",
				hasZoom: false,
			}),
			makeLesson({
				id: "l-cancelled",
				classId: "cls-1",
				time: "19:00",
				dur: 60,
				status: "cancelled",
			}),
			makeLesson({
				id: "l-holiday",
				classId: "cls-1",
				time: "19:30",
				dur: 60,
				status: "holiday",
			}),
			makeLesson({
				id: "l-paused-class",
				classId: "cls-paused",
				time: "10:00",
				dur: 90,
				status: "completed",
			}),
			makeLesson({
				id: "l-invited-class",
				classId: "cls-invited",
				time: "11:00",
				dur: 90,
				status: "upcoming",
			}),
			makeLesson({
				id: "l-foreign-org",
				classId: "cls-other-org",
				time: "18:00",
				dur: 90,
				status: "upcoming",
			}),
		];

		const res = selectTodaySchedule({
			classes: [activeCls, pausedCls, invitedCls],
			lessons,
			nowMs: NOW_MS,
		});

		expect(res.isFallback).toBe(false);
		expect(res.todayItems.map((x) => [x.id, x.state])).toEqual([
			["l-ended", "ended"],
			["l-live", "live"],
			["l-open", "open"],
			["l-later-offline", "later"],
			["l-later-zoom", "later"],
		]);
		expect(res.remainingCount).toBe(4);
		expect(res.todayItems[2]?.relativeText).toBe("18 phút");
		expect(res.todayItems[3]?.relativeText).toBe("23 phút");
		expect(res.todayItems[4]?.openAtLabel).toBe("19:30");
		expect(res.todayItems[4]?.relativeText).toBe("2 giờ 8 phút");
	});

	it("includes previous date in openAtLabel when Zoom session starts between 00:00 and 00:29 VN", () => {
		const activeCls = makeClass({ id: "cls-1" });
		const res = selectTodaySchedule({
			classes: [activeCls],
			lessons: [
				makeLesson({
					id: "l-midnight",
					date: "2026-11-26",
					time: "00:20",
					dur: 60,
					status: "upcoming",
					hasZoom: true,
				}),
			],
			nowMs: Date.parse("2026-11-25T17:00:00Z"), // 2026-11-26 00:00 ICT
		});
		expect(res.todayItems[0]?.openAtLabel).toBe("23:50 25/11");
	});

	it("handles whitespace-padded valid time and malformed time/dur cleanly without NaN", () => {
		const activeCls = makeClass({ id: "cls-1" });
		const res = selectTodaySchedule({
			classes: [activeCls],
			lessons: [
				makeLesson({
					id: "l-padded",
					date: "2026-11-26",
					time: " 18:10 ",
					dur: 90,
					status: "upcoming",
					hasZoom: true,
				}),
				makeLesson({
					id: "l-bad-time",
					date: "2026-11-26",
					time: "TBD",
					dur: 0,
					status: "upcoming",
					hasZoom: false,
				}),
			],
			nowMs: NOW_MS,
		});
		const padded = res.todayItems.find((i) => i.id === "l-padded");
		const malformed = res.todayItems.find((i) => i.id === "l-bad-time");
		expect(padded?.time).toBe("18:10");
		expect(padded?.endTime).toBe("19:40");
		expect(padded?.state).toBe("open");
		expect(malformed?.endTime).toBeNull();
		expect(malformed?.state).toBe("later");
		expect(malformed?.openAtLabel).toBeNull();
	});

	it("derives upcomingFallback from schedule lessons (filtering cancelled/holiday/ended) when today is empty", () => {
		const activeCls = makeClass({ id: "cls-1" });
		const res = selectTodaySchedule({
			classes: [activeCls],
			lessons: [
				makeLesson({
					id: "past",
					date: "2026-11-25",
					time: "18:00",
					status: "upcoming",
				}),
				makeLesson({
					id: "cancel-tmr",
					date: "2026-11-27",
					time: "18:00",
					status: "cancelled",
				}),
				makeLesson({
					id: "u1",
					date: "2026-11-27",
					time: "19:00",
					status: "upcoming",
					hasZoom: true,
				}),
				makeLesson({
					id: "u2",
					date: "2026-11-28",
					time: "09:00",
					status: "upcoming",
					joinUrl: "https://zoom.us/j/999",
					hasZoom: undefined,
				}),
				makeLesson({
					id: "u3",
					date: "2026-11-29",
					time: "09:00",
					status: "upcoming",
				}),
			],
			nowMs: NOW_MS,
		});

		expect(res.todayItems).toHaveLength(0);
		expect(res.remainingCount).toBe(0);
		expect(res.upcomingFallback.map((x) => x.id)).toEqual(["u1", "u2"]);
		expect(res.upcomingFallback[1]?.hasZoom).toBe(true);
	});

	it("falls back safely to overview classes nextSession when lessons === null, handling undefined dur without marking ended", () => {
		const clsNoDur = makeClass({
			id: "cls-nodur",
			name: "No Dur Class",
			nextSession: {
				date: "2026-11-26",
				time: "19:00",
				topic: "Reading",
				hasZoom: true,
			},
		});
		const clsEnded = makeClass({
			id: "cls-ended",
			name: "Stale Ended Class",
			nextSession: {
				date: "2026-11-25",
				time: "19:00",
				dur: 90,
				topic: "Yesterday",
			},
		});

		const res = selectTodaySchedule({
			classes: [clsNoDur, clsEnded],
			lessons: null,
			nowMs: NOW_MS,
		});

		expect(res.isFallback).toBe(true);
		expect(res.todayItems).toHaveLength(1);
		expect(res.todayItems[0]?.classId).toBe("cls-nodur");
		expect(res.todayItems[0]?.state).toBe("later");
		expect(res.todayItems[0]?.endTime).toBeNull();
		expect(res.upcomingFallback).toHaveLength(0);
	});
});

describe("parseIeltsBand & deriveStudentGoalSummary", () => {
	it("parses valid IELTS formats and rejects TOEIC/CEFR/out-of-range strings", () => {
		expect(parseIeltsBand("6.5")).toEqual({
			value: 6.5,
			isPlus: false,
			display: "6.5",
		});
		expect(parseIeltsBand("8.0+")).toEqual({
			value: 8,
			isPlus: true,
			display: "8.0+",
		});
		expect(parseIeltsBand("Band 5.5")).toEqual({
			value: 5.5,
			isPlus: false,
			display: "5.5",
		});
		expect(parseIeltsBand("6.5 IELTS")).toEqual({
			value: 6.5,
			isPlus: false,
			display: "6.5",
		});
		expect(parseIeltsBand("IELTS 7.0")).toEqual({
			value: 7,
			isPlus: false,
			display: "7.0",
		});
		expect(parseIeltsBand("800 TOEIC")).toBeNull();
		expect(parseIeltsBand("B1")).toBeNull();
		expect(parseIeltsBand("B1 trở lên")).toBeNull();
		expect(parseIeltsBand("10.0")).toBeNull();
		expect(parseIeltsBand("")).toBeNull();
		expect(parseIeltsBand(null)).toBeNull();
	});

	it("builds 4 real stats and numeric IELTS scale for IELTS student with numeric entryScore", () => {
		const res = deriveStudentGoalSummary({
			student: {
				examInterest: "ielts",
				currentLevel: "intermediate",
				targetScore: "6.5",
				entryScore: "5.5",
				dailyStudyHours: "1-2",
			},
			activeClassCount: 2,
		});

		expect(res.hasGoalData).toBe(true);
		expect(res.examLabel).toBe("IELTS");
		expect(res.stats.map((s) => [s.label, s.value])).toEqual([
			["Trình độ hiện tại", "5.5"],
			["Band mục tiêu", "6.5"],
			["Cần tăng thêm", "+1.0"],
			["Lớp đang học", "2"],
		]);
		expect(res.ieltsScale?.currentPointPct).toBeCloseTo(30);
		expect(res.ieltsScale?.targetPointPct).toBeCloseTo(50);
		expect(res.ieltsScale?.gapWidthPct).toBeCloseTo(20);
	});

	it("handles 6.5 IELTS -> 8.0+ without NaN", () => {
		const res = deriveStudentGoalSummary({
			student: {
				examInterest: "ielts",
				currentLevel: "upper-intermediate",
				targetScore: "8.0+",
				entryScore: "6.5 IELTS",
				dailyStudyHours: "2-3",
			},
			activeClassCount: 1,
		});
		expect(res.stats[2]?.value).toBe("+1.5+");
		expect(res.ieltsScale?.targetPointPct).toBeCloseTo(80);
	});

	it("prioritizes non-IELTS CEFR entryScore without plotting conflicting currentLevel range or gap", () => {
		const res = deriveStudentGoalSummary({
			student: {
				examInterest: "ielts",
				currentLevel: "intermediate",
				targetScore: "6.5",
				entryScore: "B1 trở lên",
				dailyStudyHours: "1-2",
			},
			activeClassCount: 1,
		});

		expect(res.stats[0]).toMatchObject({
			label: "Trình độ hiện tại",
			value: "B1 trở lên",
			hint: "Điểm đầu vào đã ghi nhận",
		});
		expect(res.stats[2]).toMatchObject({
			label: "Thời gian tự học",
			value: "1–2 giờ",
		});
		expect(res.ieltsScale?.currentPointPct).toBeNull();
		expect(res.ieltsScale?.currentRangePct).toBeNull();
		expect(res.ieltsScale?.targetPointPct).toBeCloseTo(50);
	});

	it("clamps band < 4.0 safely and handles current >= target without negative width or text", () => {
		const lowBand = deriveStudentGoalSummary({
			student: {
				examInterest: "ielts",
				currentLevel: "basic",
				targetScore: "6.5",
				entryScore: "3.5",
				dailyStudyHours: "1-2",
			},
			activeClassCount: 1,
		});
		expect(lowBand.stats[2]?.value).toBe("+3.0");
		expect(lowBand.ieltsScale?.currentPointPct).toBe(0);
		expect(lowBand.ieltsScale?.gapWidthPct).toBeGreaterThanOrEqual(0);

		const reached = deriveStudentGoalSummary({
			student: {
				examInterest: "ielts",
				currentLevel: "advanced",
				targetScore: "6.5",
				entryScore: "7.0",
				dailyStudyHours: "1-2",
			},
			activeClassCount: 1,
		});
		expect(reached.stats[2]?.value).toBe("Đã đạt");
		expect(reached.ieltsScale?.gapWidthPct).toBe(0);
	});

	it("maps all 6 CURRENT_LEVEL_OPTIONS for IELTS accurately", () => {
		const check = (
			currentLevel: string,
			targetScore = "6.5",
			dailyStudyHours = "1-2",
		) =>
			deriveStudentGoalSummary({
				student: {
					examInterest: "ielts",
					currentLevel,
					targetScore,
					entryScore: null,
					dailyStudyHours,
				},
				activeClassCount: 1,
			});

		expect(check("beginner").ieltsScale?.currentRangePct).toBeNull();
		expect(check("basic").ieltsScale?.currentRangePct).toEqual([0, 10]);
		const inter = check("intermediate");
		expect(inter.ieltsScale?.currentRangePct).toEqual([10, 30]);
		expect(inter.stats[2]?.value).toBe("+1.0 – 2.0");
		expect(check("upper-intermediate").ieltsScale?.currentRangePct).toEqual([
			40, 50,
		]);
		expect(check("advanced", "7.5").ieltsScale?.currentRangePct).toEqual([
			60, 100,
		]);
		const unsure = check("unsure", "8.0+");
		expect(unsure.ieltsScale?.currentRangePct).toBeNull();
		expect(unsure.stats[2]).toMatchObject({
			label: "Thời gian tự học",
			value: "1–2 giờ",
		});
	});

	it("handles communication track (no IELTS scale) and empty profile (hasGoalData: false)", () => {
		const comm = deriveStudentGoalSummary({
			student: {
				examInterest: "communication",
				currentLevel: "intermediate",
				targetScore: "B2",
				entryScore: null,
				dailyStudyHours: "2-3",
			},
			activeClassCount: 1,
		});
		expect(comm.examLabel).toBe("Giao Tiếp");
		expect(comm.ieltsScale).toBeNull();
		expect(comm.stats.map((s) => s.value)).toEqual([
			"B1",
			"B2",
			"2–3 giờ",
			"1",
		]);

		const empty = deriveStudentGoalSummary({
			student: {
				examInterest: null,
				currentLevel: null,
				targetScore: null,
				entryScore: null,
				dailyStudyHours: undefined,
			},
			activeClassCount: 0,
		});
		expect(empty.hasGoalData).toBe(false);
	});
});

describe("selectStudentTuitionSummary & normalizeInvoiceTypeLabel", () => {
	it("normalizes raw/blank invoice types", () => {
		expect(normalizeInvoiceTypeLabel("tuition")).toBe("Học phí");
		expect(normalizeInvoiceTypeLabel("TUITION")).toBe("Học phí");
		expect(normalizeInvoiceTypeLabel("   ")).toBe("Học phí");
		expect(normalizeInvoiceTypeLabel("")).toBe("Học phí");
		expect(normalizeInvoiceTypeLabel("Phí tài liệu")).toBe("Phí tài liệu");
	});

	it("returns null for empty array and respects manual paid rule (status === paid with paidAmount 0)", () => {
		expect(selectStudentTuitionSummary([])).toBeNull();

		const manualPaid = makeInvoice({
			id: "inv-paid",
			amount: 5_000_000,
			paidAmount: 0,
			amountDue: 5_000_000,
			status: "paid",
		});
		const summary = selectStudentTuitionSummary([manualPaid]);
		expect(summary).not.toBeNull();
		expect(summary?.totalDue).toBe(0);
		expect(summary?.totalPaid).toBe(5_000_000);
		expect(summary?.unsettledCount).toBe(0);
		expect(summary?.primaryInvoice.id).toBe("inv-paid");
	});

	it("picks first unsettled invoice, sums totalDue, and guarantees Học phí in primaryLinkAriaLabel", () => {
		const settled = makeInvoice({
			id: "inv-s",
			amount: 5_000_000,
			paidAmount: 5_000_000,
			amountDue: 0,
			status: "paid",
		});
		const u1 = makeInvoice({
			id: "inv-u1",
			amount: 500_000,
			amountDue: 500_000,
			type: "Phí tài liệu",
			due: "30/11",
		});
		const u2 = makeInvoice({
			id: "inv-u2",
			amount: 400_000,
			amountDue: 400_000,
			type: "tuition",
			due: "15/12",
		});

		const summary = selectStudentTuitionSummary([settled, u1, u2]);
		expect(summary?.primaryInvoice.id).toBe("inv-u1");
		expect(summary?.totalDue).toBe(900_000);
		expect(summary?.primaryInvoiceDue).toBe(500_000);
		expect(summary?.unsettledCount).toBe(2);
		expect(summary?.totalInvoices).toBe(3);
		expect(summary?.primaryLinkAriaLabel).toMatch(/Học phí/);
		expect(summary?.subtitle).toContain("2 hóa đơn chưa đóng");
		expect(summary?.subtitle).toContain("500.000đ");
	});
});
