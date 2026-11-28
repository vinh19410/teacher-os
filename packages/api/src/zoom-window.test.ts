import { describe, expect, test } from "vitest";
import {
	studentClassLessonSchema,
	studentNextSessionSchema,
	studentZoomJoinErrorSchema,
	studentZoomJoinResponseSchema,
} from "./contracts";
import {
	evaluateZoomJoinWindow,
	formatZoomJoinWindowMessage,
	isValidZoomJoinUrl,
	ZOOM_EARLY_JOIN_MINUTES,
	ZOOM_EARLY_JOIN_MS,
	ZOOM_JOIN_ERROR_CODES,
} from "./zoom-window";

describe("zoom-window constants", () => {
	test("exposes 30-minute early join constants and error codes", () => {
		expect(ZOOM_EARLY_JOIN_MINUTES).toBe(30);
		expect(ZOOM_EARLY_JOIN_MS).toBe(30 * 60_000);
		expect(ZOOM_JOIN_ERROR_CODES).toEqual({
			TOO_EARLY: "ZOOM_JOIN_TOO_EARLY",
			ENDED: "ZOOM_JOIN_ENDED",
			NOT_AVAILABLE: "ZOOM_JOIN_NOT_AVAILABLE",
			SESSION_INACTIVE: "ZOOM_JOIN_SESSION_INACTIVE",
			INVALID_SCHEDULE: "ZOOM_JOIN_INVALID_SCHEDULE",
		});
	});
});

describe("evaluateZoomJoinWindow", () => {
	test("evaluates every millisecond boundary for a same-day Vietnam session", () => {
		const date = "2026-03-10";
		const time = "19:00";
		const dur = 90;
		const startMs = Date.parse("2026-03-10T19:00:00+07:00");
		const openMs = Date.parse("2026-03-10T18:30:00+07:00");
		const closeMs = Date.parse("2026-03-10T20:30:00+07:00");

		// start - 30m - 1ms -> too_early
		expect(
			evaluateZoomJoinWindow({ date, time, dur, nowMs: openMs - 1 }),
		).toEqual({
			status: "too_early",
			startMs,
			openMs,
			closeMs,
		});

		// start - 30m (exact) -> open
		expect(evaluateZoomJoinWindow({ date, time, dur, nowMs: openMs })).toEqual({
			status: "open",
			startMs,
			openMs,
			closeMs,
		});

		// start (exact) -> open
		expect(evaluateZoomJoinWindow({ date, time, dur, nowMs: startMs })).toEqual(
			{
				status: "open",
				startMs,
				openMs,
				closeMs,
			},
		);

		// mid-session -> open
		expect(
			evaluateZoomJoinWindow({
				date,
				time,
				dur,
				nowMs: startMs + 45 * 60_000,
			}),
		).toEqual({
			status: "open",
			startMs,
			openMs,
			closeMs,
		});

		// end - 1ms -> open
		expect(
			evaluateZoomJoinWindow({ date, time, dur, nowMs: closeMs - 1 }),
		).toEqual({
			status: "open",
			startMs,
			openMs,
			closeMs,
		});

		// end (exact) -> ended
		expect(evaluateZoomJoinWindow({ date, time, dur, nowMs: closeMs })).toEqual(
			{
				status: "ended",
				startMs,
				openMs,
				closeMs,
			},
		);

		// end + 1ms -> ended
		expect(
			evaluateZoomJoinWindow({ date, time, dur, nowMs: closeMs + 1 }),
		).toEqual({
			status: "ended",
			startMs,
			openMs,
			closeMs,
		});
	});

	test("handles early morning session (00:15) crossing midnight on the open boundary", () => {
		const date = "2026-03-10";
		const time = "00:15";
		const dur = 60;
		const startMs = Date.parse("2026-03-10T00:15:00+07:00");
		const openMs = Date.parse("2026-03-09T23:45:00+07:00");
		const closeMs = Date.parse("2026-03-10T01:15:00+07:00");

		expect(
			evaluateZoomJoinWindow({ date, time, dur, nowMs: openMs - 1 }),
		).toEqual({
			status: "too_early",
			startMs,
			openMs,
			closeMs,
		});
		expect(evaluateZoomJoinWindow({ date, time, dur, nowMs: openMs })).toEqual({
			status: "open",
			startMs,
			openMs,
			closeMs,
		});
		expect(
			evaluateZoomJoinWindow({ date, time, dur, nowMs: closeMs - 1 }),
		).toEqual({
			status: "open",
			startMs,
			openMs,
			closeMs,
		});
		expect(evaluateZoomJoinWindow({ date, time, dur, nowMs: closeMs })).toEqual(
			{
				status: "ended",
				startMs,
				openMs,
				closeMs,
			},
		);
	});

	test("handles late night session (23:30, dur 60) crossing midnight on the close boundary", () => {
		const date = "2026-03-10";
		const time = "23:30";
		const dur = 60;
		const startMs = Date.parse("2026-03-10T23:30:00+07:00");
		const openMs = Date.parse("2026-03-10T23:00:00+07:00");
		const closeMs = Date.parse("2026-03-11T00:30:00+07:00");

		expect(
			evaluateZoomJoinWindow({ date, time, dur, nowMs: openMs - 1 }),
		).toEqual({
			status: "too_early",
			startMs,
			openMs,
			closeMs,
		});
		expect(evaluateZoomJoinWindow({ date, time, dur, nowMs: openMs })).toEqual({
			status: "open",
			startMs,
			openMs,
			closeMs,
		});
		expect(
			evaluateZoomJoinWindow({ date, time, dur, nowMs: closeMs - 1 }),
		).toEqual({
			status: "open",
			startMs,
			openMs,
			closeMs,
		});
		expect(evaluateZoomJoinWindow({ date, time, dur, nowMs: closeMs })).toEqual(
			{
				status: "ended",
				startMs,
				openMs,
				closeMs,
			},
		);
	});

	test("accepts valid leap-day calendar dates", () => {
		const startMs = Date.parse("2028-02-29T09:00:00+07:00");
		expect(
			evaluateZoomJoinWindow({
				date: "2028-02-29",
				time: "09:00",
				dur: 60,
				nowMs: startMs,
			}).status,
		).toBe("open");
	});

	test("returns invalid for null/malformed/non-calendar dates, bad times, bad durations, or non-finite nowMs", () => {
		const expectedInvalid = {
			status: "invalid",
			startMs: null,
			openMs: null,
			closeMs: null,
		};

		const badDates: Array<string | null | undefined> = [
			null,
			undefined,
			"",
			"2026-02-31",
			"2026-02-29",
			"2026-04-31",
			"2026-13-01",
			"2026-00-10",
			"10/03/2026",
			"2026-3-10",
			" 2026-03-10",
		];
		for (const date of badDates) {
			expect(
				evaluateZoomJoinWindow({ date, time: "19:00", dur: 60, nowMs: 0 }),
			).toEqual(expectedInvalid);
		}

		const badTimes = [
			"",
			"7:00",
			"24:00",
			"12:60",
			"19:00:00",
			"19:00 ",
			"7pm",
			"ab:cd",
		];
		for (const time of badTimes) {
			expect(
				evaluateZoomJoinWindow({
					date: "2026-03-10",
					time,
					dur: 60,
					nowMs: 0,
				}),
			).toEqual(expectedInvalid);
		}

		const badDurs = [
			0,
			-1,
			-60,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		];
		for (const dur of badDurs) {
			expect(
				evaluateZoomJoinWindow({
					date: "2026-03-10",
					time: "19:00",
					dur,
					nowMs: 0,
				}),
			).toEqual(expectedInvalid);
		}

		expect(
			evaluateZoomJoinWindow({
				date: "2026-03-10",
				time: "19:00",
				dur: 60,
				nowMs: Number.NaN,
			}),
		).toEqual(expectedInvalid);
	});
});

describe("formatZoomJoinWindowMessage", () => {
	test("formats same-day too_early and ended messages from date/time/dur", () => {
		expect(
			formatZoomJoinWindowMessage({
				status: "too_early",
				date: "2026-03-10",
				time: "19:00",
				dur: 90,
			}),
		).toBe(
			"Chưa đến giờ vào lớp. Link Zoom chỉ mở từ 18:30 đến 20:30 ngày 10/03/2026 (được vào sớm 30 phút).",
		);

		expect(
			formatZoomJoinWindowMessage({
				status: "ended",
				date: "2026-03-10",
				time: "19:00",
				dur: 90,
			}),
		).toBe(
			"Buổi học đã kết thúc (19:00 – 20:30 ngày 10/03/2026). Link Zoom không còn hiệu lực.",
		);
	});

	test("formats cross-midnight too_early when early-open falls on previous day (00:15 session)", () => {
		expect(
			formatZoomJoinWindowMessage({
				status: "too_early",
				date: "2026-03-10",
				time: "00:15",
				dur: 60,
			}),
		).toBe(
			"Chưa đến giờ vào lớp. Link Zoom chỉ mở từ 23:45 ngày 09/03/2026 đến 01:15 ngày 10/03/2026 (được vào sớm 30 phút).",
		);

		// Ended message uses start..close, which stay on the same VN date (10/03/2026).
		expect(
			formatZoomJoinWindowMessage({
				status: "ended",
				date: "2026-03-10",
				time: "00:15",
				dur: 60,
			}),
		).toBe(
			"Buổi học đã kết thúc (00:15 – 01:15 ngày 10/03/2026). Link Zoom không còn hiệu lực.",
		);
	});

	test("formats cross-midnight too_early and ended when close falls on next day (23:30 session)", () => {
		expect(
			formatZoomJoinWindowMessage({
				status: "too_early",
				date: "2026-03-10",
				time: "23:30",
				dur: 60,
			}),
		).toBe(
			"Chưa đến giờ vào lớp. Link Zoom chỉ mở từ 23:00 ngày 10/03/2026 đến 00:30 ngày 11/03/2026 (được vào sớm 30 phút).",
		);

		expect(
			formatZoomJoinWindowMessage({
				status: "ended",
				date: "2026-03-10",
				time: "23:30",
				dur: 60,
			}),
		).toBe(
			"Buổi học đã kết thúc (23:30 ngày 10/03/2026 – 00:30 ngày 11/03/2026). Link Zoom không còn hiệu lực.",
		);
	});

	test("prefers valid openAt/closeAt ISO strings and derives startMs when date/time absent", () => {
		// 18:30 VN -> 11:30Z, 20:30 VN -> 13:30Z
		const openAt = "2026-03-10T11:30:00.000Z";
		const closeAt = "2026-03-10T13:30:00.000Z";

		expect(
			formatZoomJoinWindowMessage({
				status: "too_early",
				openAt,
				closeAt,
			}),
		).toBe(
			"Chưa đến giờ vào lớp. Link Zoom chỉ mở từ 18:30 đến 20:30 ngày 10/03/2026 (được vào sớm 30 phút).",
		);

		expect(
			formatZoomJoinWindowMessage({
				status: "ended",
				openAt,
				closeAt,
			}),
		).toBe(
			"Buổi học đã kết thúc (19:00 – 20:30 ngày 10/03/2026). Link Zoom không còn hiệu lực.",
		);

		// Cross-midnight ISO strings without date/time
		expect(
			formatZoomJoinWindowMessage({
				status: "ended",
				openAt: "2026-03-10T16:00:00.000Z", // 23:00 VN -> start 23:30 VN
				closeAt: "2026-03-10T17:30:00.000Z", // 00:30 VN next day
			}),
		).toBe(
			"Buổi học đã kết thúc (23:30 ngày 10/03/2026 – 00:30 ngày 11/03/2026). Link Zoom không còn hiệu lực.",
		);
	});

	test("returns fallback message for invalid status or missing/invalid timestamps", () => {
		const fallback = "Không xác định được khung giờ buổi học để mở link Zoom.";

		expect(formatZoomJoinWindowMessage({ status: "invalid" })).toBe(fallback);
		expect(
			formatZoomJoinWindowMessage({
				status: "invalid",
				date: "2026-03-10",
				time: "19:00",
				dur: 60,
			}),
		).toBe(fallback);
		expect(
			formatZoomJoinWindowMessage({
				status: "too_early",
				date: null,
				time: "19:00",
				dur: 60,
			}),
		).toBe(fallback);
		expect(
			formatZoomJoinWindowMessage({
				status: "ended",
				openAt: "not-a-date",
				closeAt: "not-a-date",
			}),
		).toBe(fallback);
		expect(
			formatZoomJoinWindowMessage({
				status: "too_early",
				openAt: "2026-03-10T13:30:00.000Z",
				closeAt: "2026-03-10T11:30:00.000Z",
			}),
		).toBe(fallback);
	});
});

describe("student Zoom contracts", () => {
	test("studentNextSessionSchema supports dur and hasZoom while preserving backward compatibility", () => {
		expect(
			studentNextSessionSchema.safeParse({
				date: "2026-03-10",
				time: "19:00",
				topic: "Writing Task 2",
			}).success,
		).toBe(true);

		expect(
			studentNextSessionSchema.safeParse({
				date: "2026-03-10",
				time: "19:00",
				dur: 90,
				topic: "Writing Task 2",
				hasZoom: true,
				joinUrl: null,
			}).success,
		).toBe(true);

		expect(
			studentNextSessionSchema.safeParse({
				date: "2026-03-10",
				time: "19:00",
				dur: 0,
				topic: "Writing Task 2",
			}).success,
		).toBe(false);
	});

	test("studentClassLessonSchema supports hasZoom while preserving joinUrl", () => {
		expect(
			studentClassLessonSchema.safeParse({
				id: "s-1",
				date: "2026-03-10",
				day: 2,
				time: "19:00",
				dur: 90,
				status: "scheduled",
				topic: "Reading",
				hasZoom: true,
				joinUrl: null,
			}).success,
		).toBe(true);
	});

	test("studentZoomJoinResponseSchema and studentZoomJoinErrorSchema validate payloads", () => {
		expect(
			studentZoomJoinResponseSchema.safeParse({
				joinUrl: "https://zoom.us/j/123456",
				openAt: "2026-03-10T11:30:00.000Z",
				closeAt: "2026-03-10T13:30:00.000Z",
			}).success,
		).toBe(true);

		expect(
			studentZoomJoinResponseSchema.safeParse({
				joinUrl: "https://zoom.us/j/123456",
			}).success,
		).toBe(false);

		expect(
			studentZoomJoinErrorSchema.safeParse({
				error: "Chưa đến giờ vào lớp.",
				code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
				date: "2026-03-10",
				time: "19:00",
				dur: 90,
				openAt: "2026-03-10T11:30:00.000Z",
				closeAt: "2026-03-10T13:30:00.000Z",
			}).success,
		).toBe(true);

		expect(
			studentZoomJoinErrorSchema.safeParse({
				error: "Không có link Zoom.",
				code: ZOOM_JOIN_ERROR_CODES.NOT_AVAILABLE,
			}).success,
		).toBe(true);
	});
});

describe("isValidZoomJoinUrl", () => {
	test("accepts valid https URLs case-insensitively and rejects non-https or malformed values", () => {
		expect(isValidZoomJoinUrl("https://zoom.us/j/123456")).toBe(true);
		expect(isValidZoomJoinUrl("  HTTPS://zoom.us/j/123456  ")).toBe(true);
		expect(isValidZoomJoinUrl("http://zoom.us/j/123456")).toBe(false);
		expect(isValidZoomJoinUrl("javascript:alert(1)")).toBe(false);
		expect(isValidZoomJoinUrl("https://zoom.us/j/123 456")).toBe(false);
		expect(isValidZoomJoinUrl("https://zoom.us/j/123\u0000456")).toBe(false);
		expect(isValidZoomJoinUrl("https://zoom.us/j/123\u0007456")).toBe(false);
		expect(isValidZoomJoinUrl("https://zoom.us/j/123\u001f456")).toBe(false);
		expect(isValidZoomJoinUrl("https://zoom.us/j/123\u007f456")).toBe(false);
		expect(isValidZoomJoinUrl("")).toBe(false);
		expect(isValidZoomJoinUrl(null)).toBe(false);
		expect(isValidZoomJoinUrl(undefined)).toBe(false);
	});
});
