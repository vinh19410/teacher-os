import { describe, expect, test } from "vitest";
import { fillMessageTemplate } from "./message-template";

describe("fillMessageTemplate", () => {
	test("fills known vars and keeps unknown placeholders", () => {
		expect(
			fillMessageTemplate(
				"Phụ huynh ơi, {{student_name}} còn nợ {{amount}}. QR MoMo {{qr_link}}",
				{ student_name: "Bình", amount: "500.000đ" },
			),
		).toBe("Phụ huynh ơi, Bình còn nợ 500.000đ. QR MoMo {{qr_link}}");
	});

	test("tolerates spaces inside braces", () => {
		expect(
			fillMessageTemplate("{{ student_name }} học tốt", { student_name: "An" }),
		).toBe("An học tốt");
	});
});
