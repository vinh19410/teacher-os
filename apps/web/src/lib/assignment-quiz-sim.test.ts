import { answerKindByType } from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import type { QuestionItem } from "@/components/assignments/assignment-presets";
import type { PreviewDraft } from "@/lib/assignment-preview-draft";
import { buildQuizSim, draftSimKey } from "@/lib/assignment-quiz-sim";

function draft(partial: Partial<PreviewDraft> = {}): PreviewDraft {
	return {
		task: "task2",
		genre: "discuss",
		title: "Reading — Fixture",
		band: "6.5",
		source: "Fixture",
		prompt: "",
		note: "",
		status: "ready",
		...partial,
	};
}

const items: QuestionItem[] = [
	{
		stem: "Where is the Eiffel Tower?",
		opts: ["London", "Rome", "Paris", "Madrid"],
		answer: "C",
		alts: "",
	},
	{
		stem: "The tower is made of ____.",
		opts: null,
		answer: "iron",
		alts: "metal / steel",
	},
];

describe("buildQuizSim — gating khớp isAuto của tab 'Đề bài'", () => {
	it("reading + items hợp lệ → dựng được, detail resolve đúng field", () => {
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p3", type: "mcq", items }),
		);
		expect(sim).not.toBeNull();
		expect(sim?.detail.skill).toBe("reading");
		expect(sim?.detail.type).toBe("mcq");
		expect(sim?.detail.band).toBe("6.5");
		expect(sim?.detail.optionBank).toEqual([]);
		expect(sim?.fullQuestions).toHaveLength(2);
	});

	it("writing (kể cả skill thiếu → fallback writing) → null", () => {
		expect(buildQuizSim(draft({ skill: "writing", items }))).toBeNull();
		// Công thức `skill ?? "writing"` — KHÔNG fallback task/genre.
		expect(buildQuizSim(draft({ items }))).toBeNull();
	});

	it("listening nhưng items rỗng / toàn stem rỗng → null", () => {
		expect(
			buildQuizSim(draft({ skill: "listening", part: "s1", items: [] })),
		).toBeNull();
		expect(
			buildQuizSim(
				draft({
					skill: "listening",
					part: "s1",
					items: [
						{ stem: "   ", opts: null, answer: "x", alts: "" },
						{ stem: "", opts: null, answer: "y", alts: "" },
					],
				}),
			),
		).toBeNull();
	});
});

describe("buildQuizSim — take questions strip key (mirror server)", () => {
	it("takeQuestions không chứa answer/alts/note — props lẫn giá trị", () => {
		const sim = buildQuizSim(
			draft({
				skill: "reading",
				part: "p1",
				type: "note",
				note: "Đáp án đúng là iron — xem thay thế metal / steel",
				items,
			}),
		);
		expect(sim).not.toBeNull();
		const takeJson = JSON.stringify(sim?.takeQuestions);
		// Không có field key trong từng question object…
		expect(takeJson).not.toContain('"answer"');
		expect(takeJson).not.toContain('"alts"');
		// …và không có GIÁ TRỊ key/alts/note anywhere trong mảng take.
		expect(takeJson).not.toContain("iron");
		expect(takeJson).not.toContain("metal / steel");
		expect(takeJson).not.toContain("Đáp án đúng");
		// Note chỉ nằm ở sim.note (prompt-level, reveal ở review).
		expect(sim?.note).toBe("Đáp án đúng là iron — xem thay thế metal / steel");
	});

	it("fullQuestions giữ full key cùng thứ tự để gradeQuiz chấm đúng index", () => {
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p1", type: "note", items }),
		);
		expect(sim?.fullQuestions[1]?.answer).toBe("iron");
		expect(sim?.fullQuestions[1]?.alts).toBe("metal / steel");
		// Đồng bộ index: take[i] và full[i] là cùng một câu.
		sim?.takeQuestions.forEach((take, index) => {
			expect(take.stem).toBe(sim.fullQuestions[index]?.stem);
		});
	});

	it("pin được truyền qua take questions (mirror `{stem, opts, pin}`)", () => {
		const sim = buildQuizSim(
			draft({
				skill: "reading",
				part: "p1",
				type: "note",
				items: [
					{
						stem: "Label the map",
						opts: null,
						answer: "A",
						alts: "",
						pin: { x: 10, y: 20 },
					},
				],
			}),
		);
		expect(sim?.takeQuestions[0]?.pin).toEqual({ x: 10, y: 20 });
	});
});

describe("buildQuizSim — normalize items malformed (mirror parseQuizQuestions)", () => {
	it("item thiếu alts/answer ở runtime → default rỗng; thiếu stem → bỏ", () => {
		const malformed = [
			{ stem: "Câu thường ____.", opts: null, answer: "ok", alts: "" },
			// JSON cũ không có answer/alts — ép kiểu qua unknown như storage thật.
			{ stem: "Câu legacy ____.", opts: null } as unknown as QuestionItem,
			{ stem: "", opts: null, answer: "bị bỏ", alts: "" },
		];
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p1", type: "note", items: malformed }),
		);
		expect(sim).not.toBeNull();
		expect(sim?.fullQuestions).toHaveLength(2);
		expect(sim?.fullQuestions[1]?.answer).toBe("");
		expect(sim?.fullQuestions[1]?.alts).toBe("");
		// Index đồng bộ sau khi bỏ câu hỏng.
		expect(sim?.takeQuestions[1]?.stem).toBe("Câu legacy ____.");
	});
});

describe("buildQuizSim — resolver type đúng công thức StudentPreviewPaper", () => {
	it("type rỗng/không nhận diện resolve qua preset fallback — mcq không thành cloze", () => {
		// `type: ""` (không phải undefined) — `??` không nhảy qua, chuỗi rỗng
		// xuống typeOf và phải resolve về type thật của part preset.
		const emptyType = buildQuizSim(
			draft({ skill: "reading", part: "p1", type: "", items }),
		);
		expect(emptyType).not.toBeNull();
		expect(answerKindByType[emptyType?.detail.type ?? ""]).toBeDefined();

		const missingType = buildQuizSim(
			draft({ skill: "reading", part: "p1", genre: "", items }),
		);
		expect(missingType).not.toBeNull();
		expect(answerKindByType[missingType?.detail.type ?? ""]).toBeDefined();
		// Cùng part → cùng fallback (hiển thị preset tab "Đề bài" khớp take).
		expect(emptyType?.detail.type).toBe(missingType?.detail.type);
	});
});

describe("simKey — bank id | draft fingerprint", () => {
	it("simKey tường định (bank prompt.id) được dùng nguyên văn", () => {
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p3", type: "mcq", items }),
			"bank-prompt-42",
		);
		expect(sim?.simKey).toBe("bank-prompt-42");
	});

	it("draftSimKey ổn định theo nội dung, không theo object identity", () => {
		const a = draft({ skill: "reading", items });
		const b = draft({
			skill: "reading",
			items: items.map((item) => ({ ...item })),
		});
		expect(draftSimKey(a)).toBe(draftSimKey(b));
		const changed = draft({
			skill: "reading",
			items: [
				...items,
				{ stem: "Extra ____.", opts: null, answer: "z", alts: "" },
			],
		});
		expect(draftSimKey(changed)).not.toBe(draftSimKey(a));
	});
});
