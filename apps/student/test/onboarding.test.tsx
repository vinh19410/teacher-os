import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentOnboardingPayload } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

import {
	ExamInterestStep,
	LearningGoalsStep,
	OnboardingSummary,
	StudyHoursStep,
	TargetScoreStep,
} from "@/components/onboarding/onboarding-steps";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

describe("OnboardingStep Components", () => {
	it("ExamInterestStep: renders questions and choices without skip button", () => {
		const html = renderToStaticMarkup(
			<ExamInterestStep value={null} onSelect={vi.fn()} />,
		);
		expect(html).toContain("Bạn đang quan tâm chứng chỉ nào?");
		expect(html).toContain("IELTS");
		expect(html).toContain("TOEIC");
		expect(html).not.toContain("Bỏ qua");
	});

	it("TargetScoreStep: renders IELTS bands or TOEIC scores appropriately", () => {
		// TOEIC
		const toeicHtml = renderToStaticMarkup(
			<TargetScoreStep examInterest="toeic" value={null} onSelect={vi.fn()} />,
		);
		expect(toeicHtml).toContain("990");
		expect(toeicHtml).not.toContain("8.0+");

		// IELTS
		const ieltsHtml = renderToStaticMarkup(
			<TargetScoreStep examInterest="ielts" value="6.5" onSelect={vi.fn()} />,
		);
		expect(ieltsHtml).toContain("Band 6.5");
	});

	it("LearningGoalsStep: renders goals and textarea with maxLength 200", () => {
		const html = renderToStaticMarkup(
			<LearningGoalsStep
				value={["career"]}
				onToggle={vi.fn()}
				note=""
				onNoteChange={vi.fn()}
			/>,
		);
		expect(html).toContain("Thăng tiến công việc");
		expect(html).toContain('maxLength="200"');
	});

	it("StudyHoursStep: renders study duration options", () => {
		const html = renderToStaticMarkup(
			<StudyHoursStep value={null} onSelect={vi.fn()} />,
		);
		expect(html).toContain("Dưới 1 giờ");
		expect(html).toContain("Hơn 3 giờ");
	});

	it("OnboardingSummary: renders complete selection summary", () => {
		const answers: StudentOnboardingPayload = {
			examInterest: "ielts",
			targetScore: "6.5",
			learningGoals: ["study-abroad", "communication"],
			learningGoalsNote: "Cần nộp trước tháng 12",
			dailyStudyHours: "1-2",
		};
		const html = renderToStaticMarkup(<OnboardingSummary answers={answers} />);
		expect(html).toContain("IELTS");
		expect(html).toContain("Band 6.5");
		expect(html).toContain("Du học");
		expect(html).toContain("Giao tiếp tự tin");
		expect(html).toContain("Cần nộp trước tháng 12");
		expect(html).toContain("1–2 giờ");
	});

	it("OnboardingWizard: renders initial step 1/4 without Hoàn thành button", () => {
		const queryClient = new QueryClient();
		const html = renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<OnboardingWizard onCompleted={vi.fn()} />
			</QueryClientProvider>,
		);
		expect(html).toContain("Bạn đang quan tâm chứng chỉ nào?");
		expect(html).toContain("Bước 1/4");
		expect(html).not.toContain("Hoàn thành");
	});
});
