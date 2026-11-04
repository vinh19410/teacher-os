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
	CurrentLevelStep,
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
	it("CurrentLevelStep: renders IELTS or TOEIC level options appropriately", () => {
		const ieltsHtml = renderToStaticMarkup(
			<CurrentLevelStep
				examInterest="ielts"
				value="intermediate"
				onSelect={vi.fn()}
			/>,
		);
		expect(ieltsHtml).toContain("Trình độ hiện tại của bạn?");
		expect(ieltsHtml).toContain("4.5 – 5.5");
		expect(ieltsHtml).toContain("Mới bắt đầu");

		const toeicHtml = renderToStaticMarkup(
			<CurrentLevelStep examInterest="toeic" value={null} onSelect={vi.fn()} />,
		);
		expect(toeicHtml).toContain("350 – 550");
		expect(toeicHtml).toContain("Dưới 350");
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
			currentLevel: "intermediate",
			targetScore: "6.5",
			learningGoals: ["study-abroad", "communication"],
			learningGoalsNote: "Cần nộp trước tháng 12",
			dailyStudyHours: "1-2",
		};
		const html = renderToStaticMarkup(<OnboardingSummary answers={answers} />);
		expect(html).toContain("IELTS");
		expect(html).toContain("Band 6.5");
		expect(html).toContain("Trình độ hiện tại");
		expect(html).toContain("4.5 – 5.5");
		expect(html).toContain("Du học");
		expect(html).toContain("Giao tiếp tự tin");
		expect(html).toContain("Cần nộp trước tháng 12");
		expect(html).toContain("1–2 giờ");
	});

	it("OnboardingWizard: renders initial step 1/5 without Hoàn thành button", () => {
		const queryClient = new QueryClient();
		const html = renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<OnboardingWizard onCompleted={vi.fn()} />
			</QueryClientProvider>,
		);
		expect(html).toContain("Bạn đang quan tâm chứng chỉ nào?");
		expect(html).toContain("Bước 1/5");
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

		// Step 1/5: disabled -> select IELTS -> enabled -> advance
		const continueStep1 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep1);
		fireEvent.click(screen.getByRole("button", { name: /IELTS/i }));
		assertEnabledPrimaryCta(continueStep1);
		fireEvent.click(continueStep1);

		// Step 2/5: disabled -> select 4.5 – 5.5 -> enabled -> advance
		const continueStep2 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep2);
		fireEvent.click(screen.getByRole("button", { name: /4.5 – 5.5/ }));
		assertEnabledPrimaryCta(continueStep2);
		fireEvent.click(continueStep2);

		// Step 3/5: disabled -> select Band 6.5 -> enabled -> advance
		const continueStep3 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep3);
		fireEvent.click(screen.getByRole("button", { name: "Band 6.5" }));
		assertEnabledPrimaryCta(continueStep3);
		fireEvent.click(continueStep3);

		// Step 4/5: disabled -> select Du học -> enabled -> advance
		const continueStep4 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep4);
		fireEvent.click(screen.getByRole("button", { name: "Du học" }));
		assertEnabledPrimaryCta(continueStep4);
		fireEvent.click(continueStep4);

		// Step 5/5: disabled -> select 1–2 giờ -> enabled -> advance
		const continueStep5 = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		assertDisabledContinue(continueStep5);
		fireEvent.click(screen.getByRole("button", { name: "1–2 giờ" }));
		assertEnabledPrimaryCta(continueStep5);
		fireEvent.click(continueStep5);

		// Step 6 (confirmation): Hoàn thành button uses primary-foreground contrast
		const finishBtn = screen.getByRole<HTMLButtonElement>("button", {
			name: "Hoàn thành",
		});
		assertEnabledPrimaryCta(finishBtn);
	});
	it("OnboardingWizard: resets currentLevel and targetScore when examInterest changes", () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={queryClient}>
				<OnboardingWizard onCompleted={vi.fn()} />
			</QueryClientProvider>,
		);

		// Step 0: Select IELTS -> advance to Step 1
		fireEvent.click(screen.getByRole("button", { name: /IELTS/i }));
		fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

		// Step 1: Select 4.5 – 5.5 -> advance to Step 2
		fireEvent.click(screen.getByRole("button", { name: /4.5 – 5.5/ }));
		fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

		// Step 2: Select Band 6.5
		fireEvent.click(screen.getByRole("button", { name: "Band 6.5" }));

		// Go back to Step 1, then Step 0
		fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
		fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));

		// Change to TOEIC
		fireEvent.click(screen.getByRole("button", { name: /TOEIC/i }));
		fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));

		// On Step 1 (TOEIC), currentLevel should be reset (no button selected, continue disabled)
		const continueBtn = screen.getByRole<HTMLButtonElement>("button", {
			name: "Tiếp tục",
		});
		expect(continueBtn.disabled).toBe(true);
	});

	it("Onboarding steps: selected cards and band chips expose aria-pressed and high-contrast selection classes without border-transparent", () => {
		const { unmount: unmountExam } = render(
			<ExamInterestStep value="ielts" onSelect={vi.fn()} />,
		);
		const ieltsBtn = screen.getByRole("button", { name: /IELTS/ });
		const toeicBtn = screen.getByRole("button", { name: /TOEIC/ });
		expect(ieltsBtn.getAttribute("aria-pressed")).toBe("true");
		expect(ieltsBtn.classList.contains("border-primary")).toBe(true);
		expect(ieltsBtn.classList.contains("bg-muted")).toBe(true);
		expect(ieltsBtn.classList.contains("text-foreground")).toBe(true);
		expect(ieltsBtn.classList.contains("ring-1")).toBe(true);
		expect(ieltsBtn.classList.contains("ring-primary")).toBe(true);
		expect(ieltsBtn.classList.contains("focus-visible:ring-0")).toBe(true);
		expect(ieltsBtn.classList.contains("border-transparent")).toBe(false);
		expect(ieltsBtn.classList.contains("text-primary")).toBe(false);

		expect(toeicBtn.getAttribute("aria-pressed")).toBe("false");
		expect(toeicBtn.classList.contains("border-input")).toBe(true);
		expect(toeicBtn.classList.contains("bg-transparent")).toBe(true);
		expect(toeicBtn.classList.contains("hover:bg-accent")).toBe(true);
		const toeicBadge = toeicBtn.lastElementChild;
		expect(toeicBadge?.getAttribute("aria-hidden")).toBe("true");
		expect(toeicBadge?.classList.contains("border-input")).toBe(true);
		expect(toeicBadge?.classList.contains("border-border")).toBe(false);
		unmountExam();

		const { unmount: unmountBand } = render(
			<TargetScoreStep examInterest="ielts" value="6.5" onSelect={vi.fn()} />,
		);
		const band65 = screen.getByRole("button", { name: "Band 6.5" });
		const band60 = screen.getByRole("button", { name: "Band 6.0" });
		expect(band65.getAttribute("aria-pressed")).toBe("true");
		expect(band65.classList.contains("border-primary")).toBe(true);
		expect(band65.classList.contains("bg-primary")).toBe(true);
		expect(band65.classList.contains("text-primary-foreground")).toBe(true);
		expect(band65.classList.contains("border-transparent")).toBe(false);
		expect(band65.classList.contains("bg-muted")).toBe(false);

		expect(band60.getAttribute("aria-pressed")).toBe("false");
		expect(band60.classList.contains("border-input")).toBe(true);
		expect(band60.classList.contains("bg-transparent")).toBe(true);
		expect(band60.classList.contains("hover:bg-accent")).toBe(true);
		unmountBand();

		const { unmount: unmountGoals } = render(
			<LearningGoalsStep
				value={["study-abroad"]}
				onToggle={vi.fn()}
				note=""
				onNoteChange={vi.fn()}
			/>,
		);
		const studyAbroadBtn = screen.getByRole("button", { name: "Du học" });
		const careerBtn = screen.getByRole("button", {
			name: "Thăng tiến công việc",
		});
		expect(studyAbroadBtn.getAttribute("aria-pressed")).toBe("true");
		expect(studyAbroadBtn.classList.contains("border-primary")).toBe(true);
		expect(studyAbroadBtn.classList.contains("bg-muted")).toBe(true);
		expect(studyAbroadBtn.classList.contains("text-foreground")).toBe(true);
		expect(studyAbroadBtn.classList.contains("ring-1")).toBe(true);
		expect(studyAbroadBtn.classList.contains("ring-primary")).toBe(true);
		expect(studyAbroadBtn.classList.contains("focus-visible:ring-0")).toBe(
			true,
		);
		expect(studyAbroadBtn.classList.contains("border-transparent")).toBe(false);
		expect(studyAbroadBtn.classList.contains("text-primary")).toBe(false);

		expect(careerBtn.getAttribute("aria-pressed")).toBe("false");
		expect(careerBtn.classList.contains("border-input")).toBe(true);
		expect(careerBtn.classList.contains("bg-transparent")).toBe(true);
		expect(careerBtn.classList.contains("hover:bg-accent")).toBe(true);
		const careerBadge = careerBtn.lastElementChild;
		expect(careerBadge?.getAttribute("aria-hidden")).toBe("true");
		expect(careerBadge?.classList.contains("border-input")).toBe(true);
		expect(careerBadge?.classList.contains("border-border")).toBe(false);
		unmountGoals();

		const { unmount: unmountHours } = render(
			<StudyHoursStep value="1-2" onSelect={vi.fn()} />,
		);
		const hourSelected = screen.getByRole("button", { name: "1–2 giờ" });
		const hourUnselected = screen.getByRole("button", { name: "Dưới 1 giờ" });
		expect(hourSelected.getAttribute("aria-pressed")).toBe("true");
		expect(hourSelected.classList.contains("border-primary")).toBe(true);
		expect(hourSelected.classList.contains("bg-muted")).toBe(true);
		expect(hourSelected.classList.contains("ring-1")).toBe(true);
		expect(hourSelected.classList.contains("ring-primary")).toBe(true);
		expect(hourSelected.classList.contains("border-transparent")).toBe(false);
		expect(hourUnselected.getAttribute("aria-pressed")).toBe("false");
		expect(hourUnselected.classList.contains("border-input")).toBe(true);
		expect(hourUnselected.classList.contains("bg-transparent")).toBe(true);
		unmountHours();
	});
});
