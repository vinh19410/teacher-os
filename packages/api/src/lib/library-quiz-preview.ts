import type { LibraryPartInput, LibrarySkill } from "../library-contracts";
import { inferQuestionTypes } from "./infer-question-types";
import type { QuizPart } from "./quiz-parts";
import { buildQuizParts } from "./quiz-parts";

/** View dạng câu cho `inferQuestionTypes` — `opts`/`pin` nullish về null. */
function inferable(question: LibraryPartInput["questions"][number]): {
	stem: string;
	opts: readonly string[] | null;
	answer: string;
	type: string | null;
	pin: unknown;
} {
	return {
		stem: question.stem,
		opts: question.opts ?? null,
		answer: question.answer,
		type: question.type ?? null,
		pin: question.pin ?? null,
	};
}

/** Cờ nhóm mà runtime take screen học viên CHƯA có hiệu ứng (D7) — preview
 * không giả lập, chỉ hiển thị ghi chú. */
export type UnsupportedGroupFlag =
	| "answersInline"
	| "splitContent"
	| "dragDrop";

/** Paper chrome cho QuizPaper — subset structurally khớp `QuizPaperDetail`
 * của packages/ui (api không được import ui; caller truyền thẳng được). */
export interface LibraryQuizViewDetail {
	skill: LibrarySkill;
	type: string;
	band: string;
	intro: string;
	prompt: string;
	passage: string;
	cueTopic: string;
	cuePoints: string;
	audioName: string;
	imageUrl: string;
	optionBank: string[];
}

/** Kết quả chuyển 1 part thư viện → dữ liệu take screen (hợp đồng hiển thị
 * cho preview admin #433 và luồng clone thư viện → học viên sau này). */
export interface LibraryQuizView {
	detail: LibraryQuizViewDetail;
	parts: QuizPart[];
	/** Nhóm bật cờ mà runtime học viên chưa hỗ trợ — caller hiển thị ghi chú. */
	unsupportedGroupFlags: {
		groupLabel: string;
		flags: UnsupportedGroupFlag[];
	}[];
}

/** Strip key: chỉ 4 field payload học viên thật (`studentQuizQuestionSchema`
 * strict — RT#6). Hàm PURE: không mutate `input` (object có thể dùng chung từ
 * `savedInputs` cache — red-team RT7) và KHÔNG lọc câu (RT14 — giữ 1-1 index
 * để `group.startIndex/count` và `q` khớp cây đề). */
export function libraryPartToQuizView(
	input: LibraryPartInput,
	opts: { skill: LibrarySkill; qOffset: number },
): LibraryQuizView {
	const detail: LibraryQuizViewDetail = {
		skill: opts.skill,
		type: input.type,
		band: input.band,
		intro: input.intro,
		prompt: "",
		passage: input.passage,
		cueTopic: "",
		cuePoints: "",
		audioName: input.audioName ?? "",
		imageUrl: input.imageUrl,
		// Passthrough: schema cấm bank part-level khi có nhóm nên nhánh groups
		// luôn rỗng ở đây — copy để pure (không trả mảng dùng chung).
		optionBank: [...input.optionBank],
	};

	if (input.groups.length === 0) {
		// Nhóm ngầm — hành vi take screen: infer theo type đề, intro có thể
		// tách section theo marker (buildQuizParts quyết).
		const effective = inferQuestionTypes(
			input.questions.map(inferable),
			input.type,
		);
		return {
			detail,
			parts: buildQuizParts(
				input.questions.map((question, index) => ({
					stem: question.stem,
					opts: question.opts ?? null,
					type: effective[index] ?? input.type,
					pin: question.pin ?? null,
				})),
				input.type,
				input.intro,
				opts.qOffset,
			),
			unsupportedGroupFlags: [],
		};
	}

	const parts: QuizPart[] = [];
	const unsupportedGroupFlags: LibraryQuizView["unsupportedGroupFlags"] = [];
	for (const group of input.groups) {
		const slice = input.questions.slice(
			group.startIndex,
			group.startIndex + group.count,
		);
		// Infer theo type NHÓM (RT9): câu draft chưa khai type ở nhóm sau phải
		// nhận type nhóm đó, không phải type nhóm đầu của part.
		const effective = inferQuestionTypes(slice.map(inferable), group.type);
		const qStart = opts.qOffset + group.startIndex + 1;
		const label =
			group.count === 1
				? `Questions ${qStart}`
				: `Questions ${qStart}–${qStart + group.count - 1}`;
		parts.push({
			id: `part-${parts.length + 1}`,
			label,
			qStart,
			typeId: group.type,
			instructionHtml: group.instruction,
			...(group.optionBank.length > 0
				? { optionBank: [...group.optionBank] }
				: {}),
			source: "group",
			questions: slice.map((question, offset) => ({
				q: opts.qOffset + group.startIndex + offset,
				number: opts.qOffset + group.startIndex + offset + 1,
				stem: question.stem,
				opts: question.opts ?? null,
				type: effective[offset] ?? group.type,
				pin: question.pin ?? null,
			})),
		});
		const flags: UnsupportedGroupFlag[] = [];
		if (group.answersInline) flags.push("answersInline");
		if (group.splitContent) flags.push("splitContent");
		if (group.dragDrop) flags.push("dragDrop");
		if (flags.length > 0) {
			unsupportedGroupFlags.push({ groupLabel: label, flags });
		}
	}
	return { detail, parts, unsupportedGroupFlags };
}
