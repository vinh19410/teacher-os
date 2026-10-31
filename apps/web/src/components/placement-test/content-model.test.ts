import type { PlacementContent } from "@teacher-os/api/placement-test-contracts";
import { describe, expect, it } from "vitest";
import {
	addBand,
	addClipQuestion,
	addListeningClip,
	addVgQuestion,
	countTotalQuestions,
	moveClipQuestion,
	moveListeningClip,
	moveVgQuestion,
	removeBand,
	removeClipQuestion,
	removeListeningClip,
	removeVgQuestion,
	updateBand,
	updateVgQuestion,
} from "./content-model";

function makeSampleContent(): PlacementContent {
	return {
		bands: [
			{ min: 0, max: 1, cefr: "A1", course: "ielts-foundation" },
			{ min: 2, max: 3, cefr: "B1", course: "ielts-pre" },
		],
		parts: [
			{
				id: "vocab-grammar",
				title: "Vocab + Grammar",
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
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-1",
						audioId: null,
						maxPlays: 2,
						level: "A2",
						title: "Đoạn 1",
						questions: [
							{
								id: "l-01",
								level: "A2",
								prompt: "Listening 1",
								options: ["A", "B", "C", "D"],
								answer: 2,
							},
						],
					},
				],
			},
		],
	};
}

describe("placement-test content-model", () => {
	it("thêm, sửa, xóa và đổi thứ tự câu hỏi Phần 1 với id duy nhất", () => {
		let state = makeSampleContent();
		expect(countTotalQuestions(state)).toBe(3);

		state = addVgQuestion(state);
		expect(state.parts[0].questions).toHaveLength(3);
		expect(state.parts[0].questions[2]?.id).toBe("vg-04");
		expect(countTotalQuestions(state)).toBe(4);

		state = updateVgQuestion(state, 2, { prompt: "New Question 3", answer: 3 });
		expect(state.parts[0].questions[2]?.prompt).toBe("New Question 3");

		state = moveVgQuestion(state, 0, 2);
		expect(state.parts[0].questions.map((q) => q.id)).toEqual([
			"vg-02",
			"vg-04",
			"vg-01",
		]);

		state = removeVgQuestion(state, 1);
		expect(state.parts[0].questions.map((q) => q.id)).toEqual([
			"vg-02",
			"vg-01",
		]);
		expect(countTotalQuestions(state)).toBe(3);
	});

	it("thêm, xóa, đổi thứ tự đoạn nghe và câu hỏi trong đoạn nghe", () => {
		let state = makeSampleContent();
		state = addListeningClip(state);
		expect(state.parts[1].clips).toHaveLength(2);
		expect(state.parts[1].clips[1]?.id).toBe("clip-2");
		expect(state.parts[1].clips[1]?.questions).toHaveLength(1);

		state = addClipQuestion(state, 1);
		expect(state.parts[1].clips[1]?.questions).toHaveLength(2);

		const qIdsBefore =
			state.parts[1].clips[1]?.questions.map((q) => q.id) ?? [];
		state = moveClipQuestion(state, 1, 0, 1);
		expect(state.parts[1].clips[1]?.questions.map((q) => q.id)).toEqual([
			qIdsBefore[1],
			qIdsBefore[0],
		]);

		state = moveListeningClip(state, 0, 1);
		expect(state.parts[1].clips.map((c) => c.id)).toEqual(["clip-2", "clip-1"]);

		state = removeClipQuestion(state, 0, 0);
		expect(state.parts[1].clips[0]?.questions).toHaveLength(1);

		state = removeListeningClip(state, 0);
		expect(state.parts[1].clips.map((c) => c.id)).toEqual(["clip-1"]);
	});

	it("thêm, sửa, xóa ngưỡng CEFR và tính tổng điểm", () => {
		let state = makeSampleContent();
		state = addBand(state);
		expect(state.bands).toHaveLength(3);
		expect(state.bands[2]?.min).toBe(4);

		state = updateBand(state, 1, { max: 2, cefr: "B1+" });
		expect(state.bands[1]?.cefr).toBe("B1+");

		state = removeBand(state, 2);
		expect(state.bands).toHaveLength(2);
	});
});
