import { ASSIGNMENT_TEST_PRESETS } from "@teacher-os/api/contracts";
import type {
	LibraryPartIssue,
	LibrarySkill,
} from "@teacher-os/api/library-contracts";

/**
 * Dịch `LibraryPartIssue` (path kiểu dotted + message tiếng Anh từ contract
 * — MỘT nguồn sự thật) sang câu tiếng Việt cho UI. Server trả cùng shape
 * trong 400 NOT_READY nên mọi nguồn lỗi render qua đây.
 */

const MESSAGE_LABELS: ReadonlyArray<[RegExp, string]> = [
	[/passage required/i, "Cần có đoạn văn (passage)."],
	[/at least one question/i, "Cần ít nhất một câu hỏi có nội dung câu hỏi."],
	[/audio required/i, "Chưa có file audio cho part này."],
	[/https image required/i, "Ảnh diagram/map bắt buộc là URL https hợp lệ."],
	[/pin required/i, "Câu này chưa đặt ghim trên ảnh."],
	[/invalid part for skill/i, "Part không thuộc cấu trúc đề của kỹ năng này."],
	[/invalid type for part/i, "Dạng bài không hợp lệ cho part này."],
	[
		/optionBank only applies/i,
		"Ngân hàng đáp án chỉ dùng cho dạng trùng khớp có bank.",
	],
	[
		/bank must have 2/i,
		"Ngân hàng đáp án cần 2–8 mục và phủ mọi câu trùng khớp.",
	],
	[
		/answer must be a label/i,
		"Đáp án phải là một nhãn nằm trong ngân hàng đáp án.",
	],
	[/missing part/i, "Thiếu part — chưa có nội dung ở slot này."],
];

/** Message tiếng Anh của contract → câu tiếng Việt; lạ → nguyên văn. */
export function issueMessage(issue: LibraryPartIssue): string {
	for (const [pattern, label] of MESSAGE_LABELS) {
		if (pattern.test(issue.message)) return label;
	}
	return issue.message;
}

const FIELD_LABELS: Record<string, string> = {
	passage: "Passage",
	intro: "Hướng dẫn đề",
	transcript: "Transcript",
	note: "Ghi chú",
	imageUrl: "Ảnh",
	audio: "Audio",
	optionBank: "Ngân hàng đáp án",
	questions: "Câu hỏi",
	type: "Dạng bài",
	title: "Tiêu đề",
	part: "Part",
	source: "Nguồn",
};

/**
 * Path dotted → nhãn người dùng: `parts.s1.audio` → "Section 1 · Audio",
 * `parts.p2.questions.1.pin` → "Passage 2 · Câu hỏi 2 · Ghim". Số câu hỏi
 * là thứ tự trong part (server đánh theo index).
 */
export function issuePathLabel(path: string, skill: LibrarySkill): string {
	const slotLabel = (slot: string): string | undefined =>
		ASSIGNMENT_TEST_PRESETS[skill].slots.find((s) => s.part === slot)?.label;

	const segments = path.split(".");
	const labels: string[] = [];
	for (const [index, segment] of segments.entries()) {
		if (segment === "parts") {
			const slot = segments[index + 1];
			if (slot) labels.push(slotLabel(slot) ?? slot);
			continue;
		}
		if (/^\d+$/.test(segment)) {
			if (labels.at(-1) === "Câu hỏi") {
				labels[labels.length - 1] = `Câu hỏi ${Number(segment) + 1}`;
			}
			continue;
		}
		if (segment === "pin") {
			labels.push("Ghim trên ảnh");
			continue;
		}
		const label = FIELD_LABELS[segment];
		if (label) labels.push(label);
	}
	return labels.join(" · ");
}

/** Một dòng lý do chặn ready cho UI: "Section 1 · Audio — Chưa có file…". */
export function formatIssue(
	issue: LibraryPartIssue,
	skill: LibrarySkill,
): string {
	const path = issuePathLabel(issue.path, skill);
	return path ? `${path} — ${issueMessage(issue)}` : issueMessage(issue);
}
