// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentOnboardingPayload } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
	cleanup();
});
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

	it("OnboardingWizard: transitions Tiếp tục from disabled muted contrast to enabled primary-foreground contrast and renders readable Hoàn thành CTA", () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={queryClient}>
				<OnboardingWizard onCompleted={vi.fn()} />
			</QueryClientProvider>,
		);

		const assertDisabledContinue = (btn: HTMLButtonElement) => {
			expect(btn.disabled).toBe(true);
			expect(btn.classList.contains("bg-muted")).toBe(true);
			expect(btn.classList.contains("text-muted-foreground")).toBe(true);
			expect(btn.classList.contains("opacity-50")).toBe(false);
			expect(btn.classList.contains("text-bg")).toBe(false);
		};

		const assertEnabledPrimaryCta = (btn: HTMLButtonElement) => {
			expect(btn.disabled).toBe(false);
			expect(btn.classList.contains("bg-primary")).toBe(true);
			expect(btn.classList.contains("text-primary-foreground")).toBe(true);
			expect(btn.classList.contains("hover:bg-primary/90")).toBe(true);
			expect(btn.classList.contains("text-bg")).toBe(false);
			expect(btn.classList.contains("hover:bg-primary")).toBe(false);
		};

		// Step 1/4: disabled -> select IELTS -> enabled -> advance
		const continueStep1 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep1);
		fireEvent.click(screen.getByRole("button", { name: /IELTS/i }));
		assertEnabledPrimaryCta(continueStep1);
		fireEvent.click(continueStep1);

		// Step 2/4: disabled -> select Band 6.5 -> enabled -> advance
		const continueStep2 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep2);
		fireEvent.click(screen.getByRole("button", { name: "Band 6.5" }));
		assertEnabledPrimaryCta(continueStep2);
		fireEvent.click(continueStep2);

		// Step 3/4: disabled -> select Du học -> enabled -> advance
		const continueStep3 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep3);
		fireEvent.click(screen.getByRole("button", { name: "Du học" }));
		assertEnabledPrimaryCta(continueStep3);
		fireEvent.click(continueStep3);

		// Step 4/4: disabled -> select 1–2 giờ -> enabled -> advance
		const continueStep4 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep4);
		fireEvent.click(screen.getByRole("button", { name: "1–2 giờ" }));
		assertEnabledPrimaryCta(continueStep4);
		fireEvent.click(continueStep4);

		// Step 5 (confirmation): Hoàn thành button uses primary-foreground contrast
		const finishBtn = screen.getByRole<HTMLButtonElement>("button", {
			name: "Hoàn thành",
		});
		assertEnabledPrimaryCta(finishBtn);
	});
});
