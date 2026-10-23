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
	[/invalid type for skill/i, "Dạng bài không thuộc kỹ năng này."],
	[/question type must match its group/i, "Dạng câu phải trùng dạng của nhóm."],
	[/first group must start at 0/i, "Nhóm câu bị chồng hoặc hở số câu."],
	[/groups must be contiguous/i, "Nhóm câu bị chồng hoặc hở số câu."],
	[
		/group counts must cover every question/i,
		"Nhóm câu bị chồng hoặc hở số câu.",
	],
	[/duplicate group id/i, "Nhóm câu bị chồng hoặc hở số câu."],
	[
		/optionBank lives on groups when groups exist/i,
		"Ngân hàng đáp án nằm ở từng nhóm khi có nhóm.",
	],
	[
		/part type must equal first group type/i,
		"Dạng bài của part phải trùng nhóm đầu.",
	],
	[
		/inline answers need a completion type/i,
		"Chỉ dạng điền từ mới đặt ô trả lời trong nội dung.",
	],
	[
		/inline question needs exactly one blank/i,
		"Câu điền từ cần đúng một ô trống ____.",
	],
	[
		/answer set needs at least two questions/i,
		"Khóa tập đáp án cần ít nhất hai câu.",
	],
	[
		/answer set must stay inside one group/i,
		"Các câu cùng khóa tập đáp án phải nằm trong một nhóm.",
	],
	[/missing part/i, "Thiếu part — chưa có nội dung ở slot này."],
];

/** Dịch message thô của schema sang tiếng Việt; null khi không khớp rule nào. */
export function messageLabel(message: string): string | null {
	for (const [pattern, label] of MESSAGE_LABELS) {
		if (pattern.test(message)) return label;
	}
	return null;
}

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
	groups: "Nhóm câu",
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
			if (labels.at(-1) === "Nhóm câu") {
				labels[labels.length - 1] = `Nhóm câu ${Number(segment) + 1}`;
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
