import { describe, expect, test, vi } from "vitest";

const features = vi.hoisted(() => ({ AI_ENABLED: false }));
vi.mock("@/lib/features", () => ({
	get AI_ENABLED() {
		return features.AI_ENABLED;
	},
}));

import { ImportWithAiButton } from "./import-with-ai-button";

describe("ImportWithAiButton", () => {
	test("không render khi cờ AI tắt", () => {
		features.AI_ENABLED = false;
		expect(ImportWithAiButton()).toBeNull();
	});

	test("render nút khi cờ AI bật", () => {
		features.AI_ENABLED = true;
		expect(ImportWithAiButton()).not.toBeNull();
	});
});
