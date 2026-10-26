import { describe, expect, test } from "vitest";
import {
	ORG_EVENT_TITLE_MAX,
	ORG_EVENT_TITLE_MIN,
	orgEventDraftSchema,
} from "./event-contracts";

const VALID = {
	title: "Họp chuyên môn giáo viên",
	date: "2026-10-26",
	startTime: "19:00",
	endTime: "21:00",
};

describe("orgEventDraftSchema", () => {
	test(`title ${ORG_EVENT_TITLE_MIN} ký tự là biên hợp lệ, ${ORG_EVENT_TITLE_MIN - 1} ký tự bị từ chối`, () => {
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, title: "ab" }).success,
		).toBe(true);
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, title: "a" }).success,
		).toBe(false);
	});

	test(`title ${ORG_EVENT_TITLE_MAX} ký tự hợp lệ, ${ORG_EVENT_TITLE_MAX + 1} ký tự bị từ chối`, () => {
		expect(
			orgEventDraftSchema.safeParse({
				...VALID,
				title: "a".repeat(ORG_EVENT_TITLE_MAX),
			}).success,
		).toBe(true);
		expect(
			orgEventDraftSchema.safeParse({
				...VALID,
				title: `${"a".repeat(ORG_EVENT_TITLE_MAX)}x`,
			}).success,
		).toBe(false);
	});

	test("endTime <= startTime bị từ chối, endTime > startTime hợp lệ", () => {
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, endTime: "19:00" }).success,
		).toBe(false);
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, endTime: "18:59" }).success,
		).toBe(false);
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, endTime: "21:01" }).success,
		).toBe(true);
	});

	test("2026-02-30 bị từ chối; ngày hợp lệ được qua", () => {
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, date: "2026-02-30" }).success,
		).toBe(false);
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, date: "2026-13-01" }).success,
		).toBe(false);
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, date: "26-10-26" }).success,
		).toBe(false);
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, date: "2024-02-29" }).success,
		).toBe(true);
	});

	test("note 501 ký tự bị từ chối, 500 hợp lệ, mặc định rỗng", () => {
		expect(
			orgEventDraftSchema.safeParse({
				...VALID,
				note: `${"x".repeat(500)}x`,
			}).success,
		).toBe(false);
		const ok = orgEventDraftSchema.safeParse({
			...VALID,
			note: "x".repeat(500),
		});
		expect(ok.success).toBe(true);
		const empty = orgEventDraftSchema.safeParse(VALID);
		expect(empty.success).toBe(true);
		if (empty.success) expect(empty.data.note).toBe("");
	});

	test("title có whitespace quanh được trim trước khi validate", () => {
		const parsed = orgEventDraftSchema.safeParse({
			...VALID,
			title: "  Họp chuyên môn giáo viên  ",
		});
		expect(parsed.success).toBe(true);
		if (parsed.success)
			expect(parsed.data.title).toBe("Họp chuyên môn giáo viên");
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, title: "   a   " }).success,
		).toBe(false);
	});

	test("startTime/endTime phải là HH:mm trong 00:00–23:59", () => {
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, startTime: "24:00" }).success,
		).toBe(false);
		expect(
			orgEventDraftSchema.safeParse({ ...VALID, startTime: "7:00" }).success,
		).toBe(false);
		expect(
			orgEventDraftSchema.safeParse({
				...VALID,
				startTime: "23:00",
				endTime: "23:59",
			}).success,
		).toBe(true);
	});
});
