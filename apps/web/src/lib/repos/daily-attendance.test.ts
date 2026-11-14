import { CLASS_ERROR_CODES } from "@teacher-os/api/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	DailyAttendanceApiError,
	fetchDailyAttendance,
	saveSessionAttendance,
} from "./daily-attendance";

describe("daily-attendance repo (#694)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("saveSessionAttendance preserves HTTP code CLASS_PAUSED on 409", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						error: "Lớp học đang tạm dừng.",
						code: CLASS_ERROR_CODES.CLASS_PAUSED,
					}),
					{
						status: 409,
						headers: { "Content-Type": "application/json" },
					},
				),
			),
		);

		let caught: unknown;
		try {
			await saveSessionAttendance(
				"cl-paused",
				"2026-11-10",
				[{ lessonId: "l-1", attendance: "present", note: "" }],
				"http://localhost:8000",
			);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(DailyAttendanceApiError);
		expect((caught as DailyAttendanceApiError).status).toBe(409);
		expect((caught as DailyAttendanceApiError).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect((caught as DailyAttendanceApiError).reason).toBe(
			"Lớp học đang tạm dừng.",
		);
	});

	test("fetchDailyAttendance parses sessions with classPaused flag", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						date: "2026-11-10",
						sessions: [
							{
								classId: "cl-paused",
								className: "IELTS Tạm Dừng",
								time: "19:00",
								dur: 90,
								mode: "dated",
								recorded: false,
								classPaused: true,
								students: [
									{
										lessonId: "l-1",
										studentId: "st-1",
										studentName: "Minh Anh",
										attendance: "present",
										note: "",
									},
								],
							},
						],
						counts: { all: 1, pending: 0, completed: 0 },
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				),
			),
		);

		const data = await fetchDailyAttendance(
			"2026-11-10",
			"http://localhost:8000",
		);
		expect(data.sessions[0]?.classPaused).toBe(true);
		expect(data.counts.pending).toBe(0);
	});
});
