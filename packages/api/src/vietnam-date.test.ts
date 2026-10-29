import { describe, expect, test } from "vitest";
import { vietnamSessionEndMs } from "./vietnam-date";

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
