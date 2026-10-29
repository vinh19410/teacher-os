import type { ExtractedExam } from "@teacher-os/api/contracts";
import { type ExamExtractor, ExtractionFailedError } from "./extractor";

/** Đề cố định của extractor giả (test unit + e2e): 3 câu, 1 câu 0.6 để
 * route hậu xử lý gắn `needsReview`. */
export const FAKE_EXTRACTED_EXAM: ExtractedExam = {
	title: "Cambridge IELTS Sample",
	skill: "reading",
	timeLimitMinutes: 60,
	parts: [
		{
			passage: [
				"The growth of urban cycling has changed how city planners think about mobility. Cycling accounts for a rising share of short trips, and dedicated lanes reduce conflicts between riders and pedestrians.",
				"Research in several European cities shows that when protected lanes are added, the number of riders rises within a year while accident rates fall, suggesting that infrastructure, not weather, drives participation.",
			].join("\n\n"),
			questions: [
				{
					stem: "Cycling lanes reduce conflicts between riders and pedestrians.",
					opts: ["TRUE", "FALSE", "NOT GIVEN"],
					answer: "TRUE",
					type: "tfng",
					confidence: 0.9,
				},
				{
					stem: "What rises within a year when protected lanes are added?",
					opts: [
						"The number of riders",
						"Accident rates",
						"Trip distances",
						"Fuel prices",
					],
					answer: "The number of riders",
					type: "mcq",
					confidence: 0.9,
				},
				{
					stem: "Complete the sentence: infrastructure, not ______, drives participation.",
					confidence: 0.6,
				},
			],
		},
	],
};

/**
 * Extractor giả — không gọi AI, trả đề cố định với pageCount 2 trang.
 * Tên tệp chứa `ai-fail` → ném `ExtractionFailedError` để E2E AC-004 (TOS-27)
 * kiểm tra luồng hoàn trả 5 Credit + hiện E-004 trên stack thật.
 */
export function createFakeExamExtractor(): ExamExtractor {
	return {
		async extract(input) {
			if (input.fileName.toLowerCase().includes("ai-fail")) {
				throw new ExtractionFailedError("simulated AI extraction failure");
			}
			return { exam: FAKE_EXTRACTED_EXAM, pageCount: 2 };
		},
	};
}
