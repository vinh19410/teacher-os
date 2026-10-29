import { describe, expect, test } from "vitest";
import { createAiProviders } from "./ai-gate";
import type { WorkersAiBinding } from "./exam-import/extractor";

const binding: WorkersAiBinding = {
	toMarkdown: () => Promise.resolve(""),
	run: () => Promise.resolve({}),
};

describe("createAiProviders", () => {
	test("cờ vắng mặt hoặc khác 'true' thì không có extractor/grader dù binding AI tồn tại", () => {
		for (const AI_ENABLED of [undefined, "", "false", "TRUE", "1"]) {
			const providers = createAiProviders({ AI: binding, AI_ENABLED });
			expect(providers.getExamExtractor()).toBeUndefined();
			expect(providers.getAiGrader()).toBeUndefined();
		}
	});

	test("cờ 'true' cùng binding AI thì cấp extractor và grader", () => {
		const providers = createAiProviders({ AI: binding, AI_ENABLED: "true" });
		expect(providers.getExamExtractor()?.extract).toBeTypeOf("function");
		expect(providers.getAiGrader()?.grade).toBeTypeOf("function");
	});

	test("cờ 'true' nhưng thiếu binding AI vẫn fail-closed", () => {
		const providers = createAiProviders({ AI_ENABLED: "true" });
		expect(providers.getExamExtractor()).toBeUndefined();
		expect(providers.getAiGrader()).toBeUndefined();
	});
});
