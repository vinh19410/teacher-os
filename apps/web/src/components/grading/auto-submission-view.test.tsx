// @vitest-environment jsdom
import type { TeacherAutoSubmission } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AutoSubmissionView } from "./auto-submission-view";

afterEach(cleanup);

function makeAutoSubmission(
	overrides: Partial<TeacherAutoSubmission> = {},
): TeacherAutoSubmission {
	return {
		kind: "auto",
		attemptId: "att-mc-1",
		classAssignmentId: "ca-1",
		classId: "cl-1",
		className: "IELTS Foundation 5.5 (Test)",
		title: "[Integration test] Grammar quick check 26/11",
		due: "2026-11-30",
		student: { id: "st-1", name: "Grok Test Student" },
		skill: "grammar",
		part: "tenses",
		startedAt: "2026-11-26T08:25:00.000Z",
		submittedAt: "2026-11-26T08:29:00.000Z",
		correctCount: 2,
		wrongCount: 1,
		skippedCount: 0,
		totalCount: 3,
		items: [
			{ verdict: "correct", key: "B", answer: "B" },
			{ verdict: "wrong", key: "C", answer: "A" },
			{ verdict: "correct", key: "C", answer: "C" },
		],
		detail: {
			skill: "grammar",
			type: "mcq",
			band: "5.5",
			intro: "Choose the correct answer.",
			prompt: "<p>Complete the sentences.</p>",
			passage: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			note: "Xem lại thì quá khứ đơn.",
		},
		questions: [
			{
				stem: "She ___ coffee every morning.",
				opts: ["drink", "drinks", "drinking", "drank"],
				type: "mcq",
				pin: null,
				key: "B",
				alts: "",
				verdict: "correct",
				answer: "B",
			},
			{
				stem: "They ___ the project yesterday.",
				opts: ["finish", "finishes", "finished", "finishing"],
				type: "mcq",
				pin: null,
				key: "C",
				alts: "",
				verdict: "wrong",
				answer: "A",
				explanation: "Yesterday requires simple past.",
			},
			{
				stem: "We ___ here since 2020.",
				opts: ["live", "lived", "have lived", "living"],
				type: "mcq",
				pin: null,
				key: "C",
				alts: "",
				verdict: "correct",
				answer: "C",
			},
		],
		...overrides,
	};
}

describe("AutoSubmissionView (#978)", () => {
	it("renders score card, compact answer list, questions with 'Học viên trả lời', correct keys, and explanations", () => {
		render(<AutoSubmissionView submission={makeAutoSubmission()} />);

		expect(screen.getByTestId("attempt-correct-count").textContent).toBe("2");
		expect(screen.getByText("trên tổng 3 câu")).toBeTruthy();
		expect(screen.getByTestId("attempt-compact-list")).toBeTruthy();
		expect(screen.getByText(/Học viên trả lời:/)).toBeTruthy();
		expect(screen.queryByText(/Bạn trả lời:/)).toBeNull();
		expect(screen.getByText("Học viên chọn")).toBeTruthy();
		expect(screen.queryByText("Bạn chọn")).toBeNull();
		expect(screen.getByText("Yesterday requires simple past.")).toBeTruthy();
		expect(screen.getByTestId("navigator-progress")).toBeTruthy();
	});

	it("renders Listening audio player pointing to /api/grading/:attemptId/audio with credentials and retry plus transcript", () => {
		render(
			<AutoSubmissionView
				submission={makeAutoSubmission({
					attemptId: "att-listen-1",
					skill: "listening",
					part: "s1",
					transcript: "Speaker: Welcome to the library.",
					detail: {
						skill: "listening",
						type: "cloze",
						band: "6.0",
						intro: "",
						prompt: "Listen and fill.",
						passage: "",
						cueTopic: "",
						cuePoints: "",
						audioName: "track1.mp3",
						hasAudio: true,
						imageUrl: "",
						optionBank: [],
						note: "",
					},
					questions: [
						{
							stem: "Place: [___]",
							opts: null,
							type: "cloze",
							pin: null,
							key: "library",
							alts: "",
							verdict: "correct",
							answer: "library",
						},
					],
					items: [{ verdict: "correct", key: "library", answer: "library" }],
					correctCount: 1,
					wrongCount: 0,
					skippedCount: 0,
					totalCount: 1,
				})}
			/>,
		);

		const audio = screen.getByTestId("quiz-audio-player") as HTMLAudioElement;
		expect(audio.getAttribute("src")).toContain(
			"/api/grading/att-listen-1/audio",
		);
		expect(audio.getAttribute("crossorigin")).toBe("use-credentials");
		expect(screen.getByText("Welcome to the library.")).toBeTruthy();

		fireEvent.error(audio);
		const retryBtn = screen.getByRole("button", { name: "Thử lại" });
		fireEvent.click(retryBtn);
		expect(
			screen.getByTestId("quiz-audio-player").getAttribute("src"),
		).toContain("/api/grading/att-listen-1/audio?retry=1");
	});

	it("falls back to static audioName label without mounting doomed audio element when hasAudio is absent/false", () => {
		render(
			<AutoSubmissionView
				submission={makeAutoSubmission({
					attemptId: "att-listen-no-file",
					skill: "listening",
					part: "s1",
					detail: {
						skill: "listening",
						type: "cloze",
						band: "6.0",
						intro: "",
						prompt: "Listen and fill.",
						passage: "",
						cueTopic: "",
						cuePoints: "",
						audioName: "track1.mp3",
						imageUrl: "",
						optionBank: [],
						note: "",
					},
					questions: [
						{
							stem: "Place: [___]",
							opts: null,
							type: "cloze",
							pin: null,
							key: "library",
							alts: "",
							verdict: "correct",
							answer: "library",
						},
					],
					items: [{ verdict: "correct", key: "library", answer: "library" }],
					correctCount: 1,
					wrongCount: 0,
					skippedCount: 0,
					totalCount: 1,
				})}
			/>,
		);

		expect(screen.queryByTestId("quiz-audio-player")).toBeNull();
		expect(screen.getByText(/track1\.mp3/)).toBeTruthy();
	});
});
