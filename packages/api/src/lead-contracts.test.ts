import { describe, expect, it } from "vitest";
import {
	LEAD_COURSE_GROUPS,
	LEAD_COURSE_LABELS,
	LEAD_COURSES,
	LEAD_ERROR_CODES,
	LEAD_STATUS_LABELS,
	LEAD_STATUSES,
	leadPatchSchema,
	leadQuerySchema,
	leadSubmitSchema,
	normalizeVietnamPhone,
} from "./lead-contracts";

const VALID_SUBMIT = {
	name: "  Nguyễn Thu Hà  ",
	phone: "0909 123 456",
	elapsedMs: 12_345,
} as const;

describe("normalizeVietnamPhone (#506 D3)", () => {
	it("keeps already-local 10-digit numbers", () => {
		expect(normalizeVietnamPhone("0909 123 456")).toBe("0909123456");
		expect(normalizeVietnamPhone("0909123456")).toBe("0909123456");
	});

	it("converts +84 / 84 prefixes to the 0-prefixed local form", () => {
		expect(normalizeVietnamPhone("+84 909123456")).toBe("0909123456");
		expect(normalizeVietnamPhone("84909123456")).toBe("0909123456");
		expect(normalizeVietnamPhone("(+84) 909-123-456")).toBe("0909123456");
	});

	it("rejects numbers that are not 0-prefixed 10-digit VN numbers", () => {
		expect(normalizeVietnamPhone("12345")).toBeNull();
		expect(normalizeVietnamPhone("09091234567")).toBeNull();
		expect(normalizeVietnamPhone("1234567890")).toBeNull();
		expect(normalizeVietnamPhone("")).toBeNull();
	});
});

describe("leadSubmitSchema (#506 phase 1)", () => {
	it("accepts a minimal submit with only name + phone (D3: chỉ 2 trường bắt buộc)", () => {
		const parsed = leadSubmitSchema.safeParse(VALID_SUBMIT);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.name).toBe("Nguyễn Thu Hà");
			expect(parsed.data.phone).toBe("0909123456");
			expect(parsed.data.email).toBeUndefined();
		}
	});

	it("rejects unknown keys (strict — bot probing phải dính 400)", () => {
		const parsed = leadSubmitSchema.safeParse({
			...VALID_SUBMIT,
			orgId: "org_sneaky",
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects a bad phone instead of silently storing it", () => {
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, phone: "12345" }).success,
		).toBe(false);
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, phone: "abc" }).success,
		).toBe(false);
	});

	it("trims name and enforces length bounds", () => {
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, name: "A" }).success,
		).toBe(false);
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, name: "A".repeat(81) })
				.success,
		).toBe(false);
	});

	it("maps empty email to undefined and rejects a malformed one", () => {
		const empty = leadSubmitSchema.safeParse({ ...VALID_SUBMIT, email: "  " });
		expect(empty.success).toBe(true);
		if (empty.success) expect(empty.data.email).toBeUndefined();

		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, email: "not-an-email" })
				.success,
		).toBe(false);
	});

	it("enforces birthDate calendar validity and year range 1940..now", () => {
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, birthDate: "2026-02-30" })
				.success,
		).toBe(false);
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, birthDate: "1939-12-31" })
				.success,
		).toBe(false);
		const valid = leadSubmitSchema.safeParse({
			...VALID_SUBMIT,
			birthDate: "2008-05-14",
		});
		expect(valid.success).toBe(true);
	});

	it("rejects enum values outside the Google Form catalog", () => {
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, course: "ielts-8.0-plus" })
				.success,
		).toBe(false);
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, studyDays: "mon-wed" })
				.success,
		).toBe(false);
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, timeSlot: "0730" }).success,
		).toBe(false);
		expect(
			leadSubmitSchema.safeParse({
				...VALID_SUBMIT,
				studyMode: "offline-home",
			}).success,
		).toBe(false);
	});

	it("accepts every catalog enum value", () => {
		for (const course of LEAD_COURSES) {
			expect(
				leadSubmitSchema.safeParse({ ...VALID_SUBMIT, course }).success,
			).toBe(true);
		}
	});

	it("rejects negative or fractional elapsedMs", () => {
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, elapsedMs: -1 }).success,
		).toBe(false);
		expect(
			leadSubmitSchema.safeParse({ ...VALID_SUBMIT, elapsedMs: 1.5 }).success,
		).toBe(false);
	});
});

describe("teacher query + patch schemas (#506 phase 3)", () => {
	it("coerces page and keeps q within bounds", () => {
		const parsed = leadQuerySchema.safeParse({ q: "thu", page: "3" });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.page).toBe(3);

		expect(leadQuerySchema.safeParse({ page: "0" }).success).toBe(false);
		expect(leadQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(
			false,
		);
		expect(leadQuerySchema.safeParse({ status: "archived" }).success).toBe(
			false,
		);
	});

	it("patches status + optional teacherNote, rejects unknown keys", () => {
		expect(
			leadPatchSchema.safeParse({ status: "contacted", teacherNote: "Đã nhắn" })
				.success,
		).toBe(true);
		expect(leadPatchSchema.safeParse({ status: "new" }).success).toBe(true);
		expect(leadPatchSchema.safeParse({ status: "closed" }).success).toBe(false);
		expect(
			leadPatchSchema.safeParse({
				status: "new",
				teacherNote: "x".repeat(1001),
			}).success,
		).toBe(false);
		expect(
			leadPatchSchema.safeParse({ status: "new", phone: "0909123456" }).success,
		).toBe(false);
	});
});

describe("label maps stay total over the enums (#506 drift guard)", () => {
	it("every course/status has a Vietnamese label", () => {
		for (const course of LEAD_COURSES) {
			expect(LEAD_COURSE_LABELS[course], `label for ${course}`).toBeTruthy();
		}
		for (const status of LEAD_STATUSES) {
			expect(LEAD_STATUS_LABELS[status], `label for ${status}`).toBeTruthy();
		}
	});

	it("course groups partition the catalog exactly once (web optgroup + drift test phụ thuộc)", () => {
		const grouped = Object.values(LEAD_COURSE_GROUPS).flatMap((g) => g.codes);
		expect(new Set(grouped).size).toBe(grouped.length);
		expect([...grouped].sort()).toEqual([...LEAD_COURSES].sort());
	});

	it("error codes are unique", () => {
		expect(new Set(LEAD_ERROR_CODES).size).toBe(LEAD_ERROR_CODES.length);
	});
});
