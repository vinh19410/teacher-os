import type { AssignmentQuestion } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnswersPanelSlot } from "./answers-checking-panel";
import { AnswersCheckingPanel } from "./answers-checking-panel";

/**
 * Panel Soát đáp án (phase-05 Tasks 5.2/5.3) — controlled component nên
 * static render bao trọn flow View All + Paste + Compare + Apply preview.
 * Apply loop (PATCH tuần tự, idempotency) đã test ở repos; đây là tầng UI.
 */

/** Reading full 13/13/14 — p1 tfng, p2 mcq, p3 text. */
const fullTestSlots = (): AnswersPanelSlot[] => {
	const question = (
		stem: string,
		answer: string,
		alts = "",
		opts: string[] | null = null,
	): AssignmentQuestion => ({ stem, opts, answer, alts, pin: null });
	return [
		{
			part: "p1",
			label: "Passage 1",
			promptId: "prompt-p1",
			qStart: 1,
			kind: "tfng" as const,
			questions: Array.from({ length: 13 }, (_, index) =>
				question(`Q${index + 1}`, index % 2 ? "FALSE" : "TRUE"),
			),
		},
		{
			part: "p2",
			label: "Passage 2",
			promptId: "prompt-p2",
			qStart: 14,
			kind: "mcq4" as const,
			questions: Array.from({ length: 13 }, (_, index) =>
				question(`Q${14 + index}`, "ABCD"[index % 4], "", ["A", "B", "C", "D"]),
			),
		},
		{
			part: "p3",
			label: "Passage 3",
			promptId: "prompt-p3",
			qStart: 27,
			kind: "text" as const,
			questions: Array.from({ length: 14 }, (_, index) =>
				question(`Q${27 + index}`, `word${27 + index}`, `alt${27 + index}`),
			),
		},
	];
};

/** Key khớp toàn bộ 40 câu — dựng ngược từ chính slots. */
const matchingKey = (slots: AnswersPanelSlot[]) =>
	slots
		.flatMap((slot) =>
			slot.questions.map((question, index) => {
				const number = slot.qStart + index;
				return question.alts
					? `${number}. ${question.answer} / ${question.alts}`
					: `${number}. ${question.answer}`;
			}),
		)
		.join("\n");

const render = (keyText: string, slots = fullTestSlots()) =>
	renderToStaticMarkup(
		<AnswersCheckingPanel
			slots={slots}
			keyText={keyText}
			onKeyTextChange={() => {}}
			busy={false}
			onPatchPart={async () => true}
		/>,
	);

describe("AnswersCheckingPanel (phase-05 Task 5.2)", () => {
	it("View All: grid 40 ô đánh số tuyệt đối, kind chip, answer + alts", () => {
		const html = render("");
		expect(html).toContain("View All Answers — 40 câu");
		expect(html).toContain("Q1</span>");
		expect(html).toContain("Q14</span>");
		expect(html).toContain("Q40</span>");
		// Kind chip theo part; answer + alts hiển thị đầy đủ.
		expect(html.match(/>TFNG</g)?.length).toBe(13);
		expect(html.match(/>MCQ</g)?.length).toBe(13);
		expect(html).toContain("word27 / alt27");
		expect(html).not.toContain("Chưa có đáp án");
		// Chưa paste key → không có vùng Compare.
		expect(html).not.toContain("Compare —");
		expect(html).toContain("Mỗi dòng 1 câu");
	});

	it("ô chưa có đáp án nổi bật cảnh báo", () => {
		const slots = fullTestSlots();
		slots[0].questions[6] = {
			stem: "Q7",
			opts: null,
			answer: "",
			alts: "",
			pin: null,
		};
		const html = render("", slots);
		// 1 ở text node; title attr của cùng ô không tính (match >…<).
		expect(html.match(/>Chưa có đáp án</g)?.length).toBe(1);
		expect(html).toContain("bg-accent");
	});

	it("paste 40 dòng với 2 sai → đúng 2 mismatch ở đúng số câu, đếm 38 match", () => {
		const slots = fullTestSlots();
		const key = matchingKey(slots)
			.split("\n")
			.map((line) =>
				line.startsWith("7. ")
					? "7. FALSE" // actual Q7 = TRUE
					: line.startsWith("21. ")
						? "21. A" // actual Q21 = "ABCD"[7] = D
						: line,
			)
			.join("\n");
		const html = render(key, slots);
		expect(html.match(/data-status="match"/g)?.length).toBe(38);
		expect(html.match(/data-status="mismatch"/g)?.length).toBe(2);
		expect(html).toContain("Compare — 38 match, 2 mismatch");
		// Mismatch row hiển thị expected → actual đúng số câu.
		expect(html).toContain("Q7</span>");
		expect(html).toContain("FALSE → TRUE");
		expect(html).toContain("A → D");
	});

	it("dòng thiếu số bị báo lỗi riêng, dòng hợp lệ vẫn compare", () => {
		const html = render("hello\n1. TRUE", fullTestSlots().slice(0, 1));
		expect(html).toContain("1 dòng cần sửa");
		expect(html).toContain("Dòng 1:");
		expect(html).toContain("Compare — 1 match");
	});

	it("số ngoài đề (41) → extra, không lẫn vào match/mismatch", () => {
		const html = render("41. X\n1. TRUE", fullTestSlots().slice(0, 1));
		expect(html).toContain(", 1 extra");
		expect(html.match(/data-status="extra"/g)?.length).toBe(1);
	});

	it("không có part nào gán → empty state hướng dẫn", () => {
		const html = render("1. A", []);
		expect(html).toContain("Chưa có câu hỏi nào được gán vào test");
	});
});

describe("AnswersCheckingPanel — Apply (phase-05 Task 5.3)", () => {
	it("confirm preview: chỉ liệt kê câu lệch theo part + nút áp dụng", () => {
		const slots = fullTestSlots();
		const key = matchingKey(slots)
			.split("\n")
			.map((line) =>
				line.startsWith("7. ")
					? "7. FALSE"
					: line.startsWith("21. ")
						? "21. A"
						: line,
			)
			.join("\n");
		const html = render(key, slots);
		expect(html).toContain("Sẽ đổi 2 câu ở 2 part:");
		expect(html).toContain("Passage 1: câu 7");
		expect(html).toContain("Passage 2: câu 21");
		expect(html).toContain("Áp dụng 2 thay đổi");
		expect(html).toContain("câu đã khớp không ghi lại");
	});

	it("key khớp toàn bộ → không có gì để ghi (lần 2 của Apply)", () => {
		const slots = fullTestSlots();
		const html = render(matchingKey(slots), slots);
		expect(html).toContain("Key khớp toàn bộ — không có gì để ghi.");
		expect(html).not.toContain("Áp dụng");
	});
});
