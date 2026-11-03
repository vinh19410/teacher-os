import { describe, expect, it } from "vitest";
import { parseByteRange } from "./byte-range";

describe("parseByteRange", () => {
	it("parse dải byte chuẩn, dải mở cuối và suffix range", () => {
		expect(parseByteRange("bytes=0-99", 500)).toEqual({ start: 0, end: 99 });
		expect(parseByteRange("bytes=100-", 500)).toEqual({
			start: 100,
			end: 499,
		});
		expect(parseByteRange("bytes=-100", 500)).toEqual({
			start: 400,
			end: 499,
		});
		expect(parseByteRange("bytes=400-9999", 500)).toEqual({
			start: 400,
			end: 499,
		});
	});

	it("trả null khi ngoài biên, đảo thứ tự hoặc sai cú pháp", () => {
		expect(parseByteRange("bytes=500-600", 500)).toBeNull();
		expect(parseByteRange("bytes=200-100", 500)).toBeNull();
		expect(parseByteRange("bytes=-0", 500)).toBeNull();
		expect(parseByteRange("bytes=-", 500)).toBeNull();
		expect(parseByteRange("items=0-10", 500)).toBeNull();
		expect(parseByteRange("bytes=0-10, 20-30", 500)).toBeNull();
		expect(parseByteRange("bytes=0-10", 0)).toBeNull();
	});
});
