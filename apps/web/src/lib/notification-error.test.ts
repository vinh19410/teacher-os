import { describe, expect, it } from "vitest";
import { formatDeliveryError } from "./notification-error";

describe("formatDeliveryError (#463 phase 2)", () => {
	it("bỏ tiền tố E-selfomy-alignment-010: trong shortText và giữ nguyên trong fullText", () => {
		const res = formatDeliveryError(
			"E-selfomy-alignment-010: mailbox unavailable",
			3,
		);
		expect(res.shortText).toBe("E-010: mailbox unavailable sau 3 lần thử");
		expect(res.fullText).toBe("E-selfomy-alignment-010: mailbox unavailable");
	});

	it("chuỗi lỗi không có tiền tố vẫn ghép E-010: và số lần thử", () => {
		const res = formatDeliveryError("SMTP timeout", 2);
		expect(res.shortText).toBe("E-010: SMTP timeout sau 2 lần thử");
		expect(res.fullText).toBe("SMTP timeout");
	});

	it("lastError null, rỗng hoặc chỉ chứa tiền tố → dùng fallback tiếng Việt", () => {
		expect(formatDeliveryError(null, 3)).toEqual({
			shortText: "E-010: Không gửi được email sau 3 lần thử",
			fullText: "E-010: Không gửi được email sau 3 lần thử",
		});
		expect(formatDeliveryError("", 3)).toEqual({
			shortText: "E-010: Không gửi được email sau 3 lần thử",
			fullText: "E-010: Không gửi được email sau 3 lần thử",
		});
		expect(formatDeliveryError("E-selfomy-alignment-010:   ", 3)).toEqual({
			shortText: "E-010: Không gửi được email sau 3 lần thử",
			fullText: "E-010: Không gửi được email sau 3 lần thử",
		});
	});

	it("nguyên nhân dài hơn 80 ký tự → cắt 80 ký tự kèm dấu ba chấm trong shortText, giữ nguyên fullText", () => {
		const longCause = "a".repeat(100);
		const full = `E-selfomy-alignment-010: ${longCause}`;
		const res = formatDeliveryError(full, 3);
		expect(res.shortText).toBe(`E-010: ${"a".repeat(80)}… sau 3 lần thử`);
		expect(res.fullText).toBe(full);
	});
});
