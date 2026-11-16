import type { PlacementContent } from "@teacher-os/api/placement-test-contracts";
import { describe, expect, it } from "vitest";
import {
	addBand,
	addClipQuestion,
	addListeningClip,
	addReadingPassage,
	addReadingQuestion,
	addSpeakingTask,
	addVgQuestion,
	convertClipQuestionType,
	countListeningQuestions,
	countReadingQuestions,
	countTotalQuestions,
	countVgQuestions,
	moveClipQuestion,
	moveListeningClip,
	moveReadingPassage,
	moveSpeakingTask,
	moveVgQuestion,
	removeBand,
	removeClipQuestion,
	removeListeningClip,
	removeReadingPassage,
	removeReadingQuestion,
	removeSpeakingTask,
	removeVgQuestion,
	updateBand,
	updateVgQuestion,
	updateWritingPart,
} from "./content-model";

function makeSampleContent(): PlacementContent {
	return {
		bands: [
			{
				min: 0,
				max: 49,
				cefr: "A1",
				course: "foundation-core",
				displayCourse: "Xây Nền Từ Gốc",
				advice: "Bắt đầu từ nền tảng.",
			},
			{
				min: 50,
				max: 100,
				cefr: "B1",
				course: "comm-2",
				displayCourse: "Giao tiếp 2",
				advice: "Luyện phản xạ nghe nói.",
			},
		],
		parts: [
			{
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-la",
						partLabel: "Part A",
						instruction: "Listen and tick.",
						title: "Clip LA",
						notesTitle: "",
						transcript: "Hello",
						audioId: null,
						maxPlays: 2,
						level: "A2",
						questions: [
							{
								id: "l-01",
								type: "mcq",
								level: "A2",
								prompt: "Listening 1",
								options: ["A", "B", "C"],
								answer: 2,
							},
						],
					},
				],
			},
			{
				id: "vocab-grammar",
				title: "Grammar & Vocabulary",
				questions: [
					{
						id: "vg-01",
						kind: "grammar",
						level: "A1",
						prompt: "Question 1",
						options: ["A", "B", "C", "D"],
						answer: 0,
					},
					{
						id: "vg-02",
						kind: "vocab",
						level: "A2",
						prompt: "Question 2",
						options: ["A", "B", "C", "D"],
						answer: 1,
					},
				],
			},
			{
				id: "reading",
				title: "Reading",
				passages: [
					{
						id: "p-1",
						partLabel: "Signs",
						kind: "sign",
						instruction: "Read the sign.",
						title: "Sign 1",
						body: "NO PARKING",
						questions: [
							{
								id: "r-01",
								level: "A2",
								prompt: "",
								options: ["A", "B", "C"],
								answer: 0,
							},
						],
					},
				],
			},
			{
				id: "writing",
				title: "Writing",
				promptTitle: "Email",
				promptBody: "Write an email.",
				minWords: 50,
				maxWords: 80,
			},
			{
				id: "speaking",
				title: "Speaking",
				tasks: [
					{
						id: "s-01",
						partLabel: "Part 1",
						level: "A2",
						prompt: "Introduce yourself.",
						prepSeconds: 10,
						answerSeconds: 30,
					},
				],
			},
		],
	};
}

describe("placement-test content-model (5 skills)", () => {
	it("đếm đúng từng phần và tổng số câu khách quan", () => {
		const state = makeSampleContent();
		expect(countListeningQuestions(state)).toBe(1);
		expect(countVgQuestions(state)).toBe(2);
		expect(countReadingQuestions(state)).toBe(1);
		expect(countTotalQuestions(state)).toBe(4);
	});

	it("thêm, sửa, xóa và đổi thứ tự câu hỏi Grammar & Vocabulary (parts[1]) với id duy nhất", () => {
		let state = makeSampleContent();
		state = addVgQuestion(state);
		expect(state.parts[1].questions).toHaveLength(3);
		expect(state.parts[1].questions[2]?.id).toBe("vg-05");
		expect(countTotalQuestions(state)).toBe(5);

		state = updateVgQuestion(state, 2, { prompt: "New Question 3", answer: 3 });
		expect(state.parts[1].questions[2]?.prompt).toBe("New Question 3");

		state = moveVgQuestion(state, 0, 2);
		expect(state.parts[1].questions.map((q) => q.id)).toEqual([
			"vg-02",
			"vg-05",
			"vg-01",
		]);

		state = removeVgQuestion(state, 1);
		expect(state.parts[1].questions.map((q) => q.id)).toEqual([
			"vg-02",
			"vg-01",
		]);
		expect(countTotalQuestions(state)).toBe(4);
	});

	it("thêm, xóa, đổi loại mcq/gap và đổi thứ tự đoạn nghe (parts[0])", () => {
		let state = makeSampleContent();
		state = addListeningClip(state);
		expect(state.parts[0].clips).toHaveLength(2);
		expect(state.parts[0].clips[1]?.id).toBe("clip-2");
		expect(state.parts[0].clips[1]?.questions).toHaveLength(1);

		state = addClipQuestion(state, 1, "gap");
		expect(state.parts[0].clips[1]?.questions[1]?.type).toBe("gap");

		state = convertClipQuestionType(state, 1, 0, "gap");
		expect(state.parts[0].clips[1]?.questions[0]?.type).toBe("gap");

		const qIdsBefore =
			state.parts[0].clips[1]?.questions.map((q) => q.id) ?? [];
		state = moveClipQuestion(state, 1, 0, 1);
		expect(state.parts[0].clips[1]?.questions.map((q) => q.id)).toEqual([
			qIdsBefore[1],
			qIdsBefore[0],
		]);

		state = moveListeningClip(state, 0, 1);
		expect(state.parts[0].clips.map((c) => c.id)).toEqual([
			"clip-2",
			"clip-la",
		]);

		state = removeClipQuestion(state, 0, 0);
		expect(state.parts[0].clips[0]?.questions).toHaveLength(1);

		state = removeListeningClip(state, 0);
		expect(state.parts[0].clips.map((c) => c.id)).toEqual(["clip-la"]);
	});

	it("quản lý Reading (parts[2]), Writing (parts[3]) và Speaking (parts[4])", () => {
		let state = makeSampleContent();
		state = addReadingPassage(state, "cloze");
		expect(state.parts[2].passages).toHaveLength(2);
		expect(state.parts[2].passages[1]?.questions[0]?.options).toHaveLength(3);

		state = addReadingQuestion(state, 1);
		expect(state.parts[2].passages[1]?.questions).toHaveLength(2);

		state = moveReadingPassage(state, 0, 1);
		expect(state.parts[2].passages[0]?.id).toBe("p-2");

		state = removeReadingQuestion(state, 0, 0);
		expect(state.parts[2].passages[0]?.questions).toHaveLength(1);

		state = removeReadingPassage(state, 0);
		expect(state.parts[2].passages).toHaveLength(1);

		state = updateWritingPart(state, { minWords: 60, maxWords: 100 });
		expect(state.parts[3].minWords).toBe(60);

		state = addSpeakingTask(state);
		expect(state.parts[4].tasks).toHaveLength(2);
		expect(state.parts[4].tasks[1]?.audioId).toBeNull();
		state = moveSpeakingTask(state, 0, 1);
		expect(state.parts[4].tasks[1]?.id).toBe("s-01");
		state = removeSpeakingTask(state, 0);
		expect(state.parts[4].tasks).toHaveLength(1);
	});

	it("thêm, sửa, xóa ngưỡng % CEFR", () => {
		let state = makeSampleContent();
		state = addBand(state);
		expect(state.bands).toHaveLength(3);
		expect(state.bands[2]?.min).toBe(100);
		expect(state.bands[2]?.max).toBe(100);

		state = updateBand(state, 1, {
			max: 79,
			cefr: "B1+",
			displayCourse: "Giao tiếp 3",
		});
		expect(state.bands[1]?.cefr).toBe("B1+");
		expect(state.bands[1]?.displayCourse).toBe("Giao tiếp 3");

		state = removeBand(state, 2);
		expect(state.bands).toHaveLength(2);
	});
});
