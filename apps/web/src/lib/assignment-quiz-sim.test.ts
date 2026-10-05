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

describe("buildQuizSim — type hiệu dụng từng câu", () => {
	it("câu khai type riêng giữ nguyên type trong takeQuestions", () => {
		const sim = buildQuizSim(
			draft({
				skill: "reading",
				part: "p3",
				type: "note",
				items: [
					{ ...items[0], type: "mcq" },
					{ ...items[1], type: "note" },
				] as QuestionItem[],
			}),
		);
		expect(sim?.takeQuestions.map((question) => question.type)).toEqual([
			"mcq",
			"note",
		]);
	});

	it("đề type note có câu markerless đáp án TFNG → tfng; câu có marker giữ type đề", () => {
		const sim = buildQuizSim(
			draft({
				skill: "reading",
				part: "p1",
				type: "note",
				items: [
					{
						stem: "The roof was made of wood.",
						opts: null,
						answer: "FALSE",
						alts: "",
					},
					{
						stem: "The walls were painted.",
						opts: null,
						answer: "NOT GIVEN",
						alts: "",
					},
					...items.slice(1),
				],
			}),
		);
		expect(sim?.takeQuestions.map((question) => question.type)).toEqual([
			"tfng",
			"tfng",
			"note",
		]);
		// Key vẫn nằm ở fullQuestions, take không lộ đáp án.
		expect(sim?.fullQuestions[0]?.answer).toBe("FALSE");
		expect(JSON.stringify(sim?.takeQuestions)).not.toContain("FALSE");
	});

	it("câu không khai type và không suy luận được nhận type đề", () => {
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p3", type: "mcq", items }),
		);
		expect(sim?.takeQuestions.map((question) => question.type)).toEqual([
			"mcq",
			"mcq",
		]);
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

describe("buildQuizSim — resolver type RAW khớp công thức render của tab 'Đề bài'", () => {
	it("type truyền nguyên văn (formula `type ?? genre ?? 'discuss'`)", () => {
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p3", type: "mcq", items }),
		);
		expect(sim?.detail.type).toBe("mcq");
		const byGenre = buildQuizSim(
			draft({ skill: "listening", part: "s1", genre: "form", items }),
		);
		expect(byGenre?.detail.type).toBe("form");
	});

	it("draft giữ type lệch part (đổi part trong composer không reset type) — KHÔNG resolve fallback đổi widget", () => {
		// p1 không có type `mcq` (thuộc p3) — nếu resolve qua typeOf thì fallback
		// `tfng` đổi pill TRUE/FALSE/NOT GIVEN và letter key "C" không chọn được.
		// Giữ raw `mcq` để tab Làm thử render cùng widget như tab "Đề bài".
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p1", type: "mcq", items }),
		);
		expect(sim?.detail.type).toBe("mcq");
		expect(answerKindByType[sim?.detail.type ?? ""]).toBe("mcq4");
	});

	it("type rỗng truyền nguyên văn — không 'fill chuỗi rỗng' bằng fallback bịa", () => {
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p1", type: "", items }),
		);
		expect(sim?.detail.type).toBe("");
	});
});

describe("buildQuizSim — sanitize opts/pin như parseQuizQuestions phía server", () => {
	it("opts lẫn object non-string bị lọc — không crash render take", () => {
		const dirty = [
			{
				stem: "Câu opts bẩn ____.",
				opts: ["London", { bad: 1 }, "Paris"],
				answer: "B",
				alts: "",
			},
		] as unknown as QuestionItem[];
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p3", type: "mcq", items: dirty }),
		);
		expect(sim?.fullQuestions[0]?.opts).toEqual(["London", "Paris"]);
		expect(sim?.takeQuestions[0]?.opts).toEqual(["London", "Paris"]);
	});

	it("pin invalid-but-truthy về null — câu fallback hàng cloze, không thành câu chết", () => {
		const pinned = [
			{
				stem: "Label the map",
				opts: null,
				answer: "A",
				alts: "",
				pin: { x: 999, y: 50 }, // ngoài 0–100
			},
		] as unknown as QuestionItem[];
		const sim = buildQuizSim(
			draft({ skill: "reading", part: "p1", type: "note", items: pinned }),
		);
		expect(sim?.fullQuestions[0]?.pin).toBeNull();
		expect(sim?.takeQuestions[0]?.pin).toBeNull();
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
