import type {
	QuizAttemptDetail,
	QuizAttemptSummary,
} from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import {
	AWAITING_GRADE_MAX_POLL_COUNT,
	AWAITING_GRADE_POLL_INTERVAL_MS,
	AWAITING_GRADE_STALE_TIME_MS,
	attemptDetailQueryOptions,
	attemptSummaryQueryOptions,
	DEFAULT_ATTEMPT_STALE_TIME_MS,
	isAttemptAwaitingGrade,
} from "../src/lib/repos/quiz";

describe("isAttemptAwaitingGrade", () => {
	it("returns false for null or undefined attempt", () => {
		expect(isAttemptAwaitingGrade(null)).toBe(false);
		expect(isAttemptAwaitingGrade(undefined)).toBe(false);
	});

	it("returns false when grade is already present", () => {
		const gradedSummary = {
			skill: "writing",
			essay: "Some essay content",
			grade: {
				band: 6.5,
				scores: { taskResponse: 6.5 },
				feedback: "Good",
			},
		} as unknown as QuizAttemptSummary;

		expect(isAttemptAwaitingGrade(gradedSummary)).toBe(false);
	});

	it("returns true for practice writing attempt awaiting teacher grade", () => {
		const practiceSummary = {
			skill: "writing",
			essay: "Self practice essay",
			practice: true,
			grade: null,
		} as unknown as QuizAttemptSummary;

		expect(isAttemptAwaitingGrade(practiceSummary)).toBe(true);
	});

	it("returns false for practice objective tests (reading/listening)", () => {
		const practiceReading = {
			skill: "reading",
			essay: null,
			practice: true,
			grade: null,
		} as unknown as QuizAttemptSummary;

		expect(isAttemptAwaitingGrade(practiceReading)).toBe(false);
	});

	it("returns false for purely objective reading or listening tests", () => {
		const readingSummary = {
			skill: "reading",
			essay: null,
			grade: null,
		} as unknown as QuizAttemptSummary;

		expect(isAttemptAwaitingGrade(readingSummary)).toBe(false);
	});

	it("returns true for un-graded writing attempt", () => {
		const writingSummary = {
			skill: "writing",
			essay: "Student essay",
			grade: null,
		} as unknown as QuizAttemptSummary;

		expect(isAttemptAwaitingGrade(writingSummary)).toBe(true);
	});

	it("returns true for un-graded speaking attempt with media", () => {
		const speakingSummary = {
			skill: "speaking",
			media: {
				url: "https://example.com/audio.webm",
				type: "audio/webm",
				name: "speech.webm",
				size: 1024,
			},
			grade: null,
		} as unknown as QuizAttemptSummary;

		expect(isAttemptAwaitingGrade(speakingSummary)).toBe(true);
	});

	it("returns true for hybrid quiz attempt with writing section", () => {
		const hybridDetail = {
			title: "Hybrid Quiz",
			essay: "Hybrid essay answer",
			writing: { part: "task2", prompt: "Write an essay" },
			grade: null,
		} as unknown as QuizAttemptDetail;

		expect(isAttemptAwaitingGrade(hybridDetail)).toBe(true);
	});
});

describe("attemptDetailQueryOptions & attemptSummaryQueryOptions cache configuration", () => {
	const awaitingDetail = {
		id: "att-1",
		skill: "writing",
		essay: "Draft essay",
		grade: null,
	} as unknown as QuizAttemptDetail;

	const gradedDetail = {
		id: "att-1",
		skill: "writing",
		essay: "Draft essay",
		grade: { band: 7.0, scores: {}, feedback: "Well done" },
	} as unknown as QuizAttemptDetail;

	it("configures staleTime dynamically based on grading status", () => {
		const options = attemptDetailQueryOptions("att-1");
		const staleTimeFn = options.staleTime as (query: {
			state: { data?: QuizAttemptDetail };
		}) => number;

		expect(staleTimeFn({ state: { data: awaitingDetail } })).toBe(
			AWAITING_GRADE_STALE_TIME_MS,
		);
		expect(staleTimeFn({ state: { data: gradedDetail } })).toBe(
			DEFAULT_ATTEMPT_STALE_TIME_MS,
		);
		expect(staleTimeFn({ state: { data: undefined } })).toBe(
			DEFAULT_ATTEMPT_STALE_TIME_MS,
		);
	});

	it("configures refetchInterval dynamically and caps at max poll count", () => {
		const options = attemptDetailQueryOptions("att-1");
		const refetchIntervalFn = options.refetchInterval as (query: {
			state: { data?: QuizAttemptDetail; dataUpdateCount: number };
		}) => number | false;

		// Awaiting grade and within cap -> polls at interval
		expect(
			refetchIntervalFn({
				state: { data: awaitingDetail, dataUpdateCount: 1 },
			}),
		).toBe(AWAITING_GRADE_POLL_INTERVAL_MS);

		// Exceeded cap -> stops polling
		expect(
			refetchIntervalFn({
				state: {
					data: awaitingDetail,
					dataUpdateCount: AWAITING_GRADE_MAX_POLL_COUNT + 1,
				},
			}),
		).toBe(false);

		// Already graded -> stops polling
		expect(
			refetchIntervalFn({
				state: { data: gradedDetail, dataUpdateCount: 1 },
			}),
		).toBe(false);
	});

	it("configures refetchOnWindowFocus as 'always' when awaiting grade and false when graded", () => {
		const options = attemptSummaryQueryOptions("att-1");
		const focusFn = options.refetchOnWindowFocus as (query: {
			state: { data?: QuizAttemptSummary };
		}) => "always" | false;

		expect(
			focusFn({
				state: { data: awaitingDetail as unknown as QuizAttemptSummary },
			}),
		).toBe("always");
		expect(
			focusFn({
				state: { data: gradedDetail as unknown as QuizAttemptSummary },
			}),
		).toBe(false);
	});
});
