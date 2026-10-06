import { describe, expect, test } from "vitest";
import {
	futureCompletedUpdates,
	type LessonDumpRow,
	toBackfillLessonInputs,
} from "./backfill-dump";

const dumpRow = (over: Partial<LessonDumpRow> = {}): LessonDumpRow => ({
	id: "l1",
	class_id: "c1",
	enrollment_id: "e1",
	day: 2,
	time: "19:00",
	created_at_ms: 10,
	seq: 3,
	status: "completed",
	...over,
});

describe("toBackfillLessonInputs", () => {
	test("maps dump columns including status", () => {
		expect(toBackfillLessonInputs([dumpRow()])).toEqual([
			{
				id: "l1",
				classId: "c1",
				enrollmentId: "e1",
				day: 2,
				time: "19:00",
				createdAtMs: 10,
				seq: 3,
				status: "completed",
			},
		]);
	});

	test("throws when the dump predates the status column", () => {
		const legacyDump = [
			{ ...dumpRow(), status: undefined },
		] as unknown as LessonDumpRow[];
		expect(() => toBackfillLessonInputs(legacyDump)).toThrow(/status/);
	});

	test("throws on an unknown status value", () => {
		expect(() => toBackfillLessonInputs([dumpRow({ status: "done" })])).toThrow(
			/status/,
		);
	});
});

describe("futureCompletedUpdates", () => {
	test("flags only completed rows stamped after today", () => {
		const updates = [
			{ id: "a", date: "2026-10-06", status: "completed" },
			{ id: "b", date: "2026-10-07", status: "completed" },
			{ id: "c", date: "2026-11-03", status: "upcoming" },
		];
		expect(
			futureCompletedUpdates(updates, "2026-10-06").map((u) => u.id),
		).toEqual(["b"]);
	});
});
