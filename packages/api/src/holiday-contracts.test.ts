import { describe, expect, it } from "vitest";
import {
	HOLIDAY_MAX_DAYS,
	HOLIDAY_MODES,
	HOLIDAY_NAME_MAX,
	HOLIDAY_NAME_MIN,
	holidayApplySchema,
	holidayDraftSchema,
	LESSON_STATUS_LABEL,
} from "./contracts";

const VALID_DRAFT = {
	name: "Nghỉ lễ 20/11",
	fromDate: "2026-11-20",
	toDate: "2026-11-20",
	scope: "org",
	mode: "shift",
	notify: true,
} as const;

describe("holiday contracts (TOS-11, issue #445)", () => {
	it("accepts a valid org-scope draft with defaults", () => {
		const parsed = holidayDraftSchema.safeParse({ ...VALID_DRAFT });
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.notify).toBe(true);
			expect(parsed.data.classIds).toEqual([]);
		}
	});

	it(`rejects a name shorter than ${HOLIDAY_NAME_MIN} or longer than ${HOLIDAY_NAME_MAX}`, () => {
		const tooShort = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			name: "N",
		});
		expect(tooShort.success).toBe(false);

		const tooLong = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			name: "X".repeat(HOLIDAY_NAME_MAX + 1),
		});
		expect(tooLong.success).toBe(false);

		// trim đếm sau khi cắt khoảng trắng
		const trimmed = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			name: "  Nghỉ lễ 30/4  ",
		});
		expect(trimmed.success).toBe(true);
	});

	it(`rejects a ${HOLIDAY_MAX_DAYS + 1}-day range and accepts exactly ${HOLIDAY_MAX_DAYS} days (both ends inclusive)`, () => {
		const long = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			fromDate: "2026-06-01",
			toDate: "2026-07-01",
		});
		expect(long.success).toBe(false);

		const exact = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			fromDate: "2026-06-01",
			toDate: "2026-06-30",
		});
		expect(exact.success).toBe(true);
	});

	it("rejects toDate before fromDate", () => {
		const inverted = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			fromDate: "2026-11-21",
			toDate: "2026-11-20",
		});
		expect(inverted.success).toBe(false);
	});

	it("requires at least one class when scope = classes", () => {
		const empty = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			scope: "classes",
			classIds: [],
		});
		expect(empty.success).toBe(false);

		const picked = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			scope: "classes",
			classIds: ["cls-1"],
		});
		expect(picked.success).toBe(true);
	});

	it("rejects impossible calendar dates like 2026-02-30 and 2026-13-01 without throwing (strict roundtrip)", () => {
		for (const bad of [
			"2026-02-30",
			"2026-13-01",
			"2026-00-01",
			"2026-02-32",
		]) {
			const impossible = holidayDraftSchema.safeParse({
				...VALID_DRAFT,
				fromDate: bad,
				toDate: bad,
			});
			expect(impossible.success).toBe(false);
		}
	});

	it("deduplicates classIds when scope = classes", () => {
		const parsed = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			scope: "classes",
			classIds: ["cls-1", "cls-1", "cls-2"],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.classIds).toEqual(["cls-1", "cls-2"]);
		}
	});

	it(`rejects unknown mode (HOLIDAY_MODES = ${HOLIDAY_MODES.join(" | ")})`, () => {
		const bogus = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			mode: "delete",
		});
		expect(bogus.success).toBe(false);
	});

	it('accepts mode "cancel" (TOS-13, issue #448)', () => {
		const cancel = holidayDraftSchema.safeParse({
			...VALID_DRAFT,
			mode: "cancel",
		});
		expect(cancel.success).toBe(true);
		if (cancel.success) expect(cancel.data.mode).toBe("cancel");
	});

	it("apply schema requires a non-empty planHash", () => {
		const without = holidayApplySchema.safeParse({ ...VALID_DRAFT });
		expect(without.success).toBe(false);

		const withHash = holidayApplySchema.safeParse({
			...VALID_DRAFT,
			planHash: "abc123",
		});
		expect(withHash.success).toBe(true);
	});

	it("LESSON_STATUS_LABEL covers the holiday state", () => {
		expect(LESSON_STATUS_LABEL.holiday).toBe("Nghỉ lễ — Đã dời lịch");
		expect(LESSON_STATUS_LABEL.cancelled).toBe("Đã hủy");
	});
});
