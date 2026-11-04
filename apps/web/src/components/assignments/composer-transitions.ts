import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_OPTION_BANK_MAX,
} from "@teacher-os/api/contracts";
import {
	collapseWhitespace,
	htmlToPlainText,
	isEmptyRichText,
} from "@teacher-os/api/rich-text";
import { countBlanks } from "@teacher-os/ui/lib/cloze";
import {
	QUESTION_ALTS_MAX,
	QUESTION_ANSWER_MAX,
	QUESTION_EXPLANATION_MAX,
	QUESTION_EXPLANATION_RAW_MAX,
	QUESTION_MAX_COUNT,
	QUESTION_STEM_MAX,
} from "./answer-key-grid";
import {
	emptyComposer,
	emptyItem,
	isAutoSkill,
	isBankableType,
	isImageBased,
	kindOf,
	type QuestionItem,
	qStartOf,
} from "./assignment-presets";
import type { ComposerValue } from "./prompt-composer";

/**
 * Pure composer field transitions for `/assignments/new` (phase-01 FR5).
 * `new.tsx` owns the interaction (window.confirm is hoisted OUT of the
 * setState updater — React StrictMode double-fires updaters, red-team #8);
 * this module owns the state math so it can be unit tested.
 */

export type StructuralChangeKind = "skill" | "part" | "type";

/**
 * Classify the structural change carried by a patch, or null when the patch
 * is not structural. ChipFilter re-fires onChange for the already-selected
 * option — equal values must classify as null so a stray click neither
 * confirms nor wipes composed content (#269).
 */
export function structuralChangeKind(
	current: ComposerValue,
	patch: Partial<ComposerValue>,
): StructuralChangeKind | null {
	if (patch.skill !== undefined && patch.skill !== current.skill)
		return "skill";
	if (patch.part !== undefined && patch.part !== current.part) return "part";
	if (patch.type !== undefined && patch.type !== current.type) return "type";
	return null;
}

/**
 * Authored material whose loss would hurt: composed question content.
 * Meta fields (title/source/band/note) never trigger a confirm on their own;
 * imageUrl alone keeps its silent #269 reset (a stray URL must not pin the
 * teacher into a dialog). A typed option-bank row is authored content too —
 * losing it on a type change must be confirmed (phase-02 FR3).
 */
export function hasAuthoringContent(value: ComposerValue): boolean {
	if (
		value.items.some(
			(item) =>
				item.stem.trim() ||
				item.answer.trim() ||
				item.pin != null ||
				Boolean(item.explanation && !isEmptyRichText(item.explanation)),
		)
	)
		return true;
	if (value.optionBank.some((row) => row.trim())) return true;
	// Rich fields are HTML — emptiness must be measured on their plain text
	// (a bare "<p></p>" is NOT authored content). cuePoints stays plain (Q2).
	return Boolean(
		!isEmptyRichText(value.passage) ||
			!isEmptyRichText(value.prompt) ||
			!isEmptyRichText(value.intro) ||
			!isEmptyRichText(value.transcript) ||
			value.cueTopic.trim() ||
			value.cuePoints.trim(),
	);
}

/**
 * Apply a field patch exactly like the pre-grid editor did, plus the FR5
 * carry-over rule: `transcript` survives part/type changes within one skill;
 * `intro` still resets on every part/type change (TYPE_HINTS text is
 * type-specific — keeping it would re-open the #269 word-limit leak);
 * `imageUrl` keeps the #269 behavior of resetting on every part/type change.
 * Phase-02 FR3: the option bank survives only a bankable→bankable change
 * within one skill (labels are positional — a bank riding into a
 * non-bankable or cross-skill type would be meaningless); everything else
 * resets it. Skill changes still go through `emptyComposer` (full wipe,
 * including transcript — it is only carried within one skill).
 */
export function applyComposerFieldChange(
	current: ComposerValue,
	patch: Partial<ComposerValue>,
): ComposerValue {
	if (patch.skill !== undefined && patch.skill !== current.skill) {
		return {
			...current,
			...patch,
			...emptyComposer(patch.skill, patch.type ?? current.type),
		};
	}
	const partChanged = patch.part !== undefined && patch.part !== current.part;
	const typeChanged = patch.type !== undefined && patch.type !== current.type;
	if (partChanged || typeChanged) {
		const merged = { ...current, ...patch };
		const keepBank =
			isBankableType(current.skill, current.type) &&
			isBankableType(merged.skill, merged.type);
		return {
			...merged,
			intro: "",
			// Transcript is a shared listening resource — carried across
			// part/type changes within the same skill (FR5).
			transcript: merged.transcript,
			cueTopic: "",
			cuePoints: "",
			// Diagram URLs belong to one prompt — never let them leak
			// into the next type (#269 red-team #5).
			imageUrl: "",
			// Bank rows are positional labels (A–H / i–viii): keep them only
			// between two bankable types of the same skill (phase-02 FR3).
			optionBank: keepBank ? merged.optionBank : [],
			items: isAutoSkill(merged.skill) ? [emptyItem(merged.type)] : [],
		};
	}
	return { ...current, ...patch };
}

/**
 * Web mirror of the contract's option-bank rules (phase-02 FR2) — a draft
 * can half-fail here without ever hitting a blind 400. Returns the first
 * human-readable issue or null. Item-level rules (blank / over-cap row,
 * over-count) block BOTH statuses because the contract rejects them at
 * parse time; the bank ↔ answers rules gate `ready` only, exactly like the
 * contract superRefine.
 */
export function optionBankIssue(
	value: ComposerValue,
	status: "draft" | "ready",
): string | null {
	// #286 đề trộn dạng: bank áp khi type ĐỀ hoặc bất kỳ CÂU bankable —
	// mirror `optionBankKindFor` của contract (prompt-first, rồi câu đầu).
	const bankTypeId = isBankableType(value.skill, value.type)
		? value.type
		: (value.items.find(
				(item) => item.type && isBankableType(value.skill, item.type),
			)?.type ?? null);
	if (!bankTypeId) return null;
	if (value.optionBank.length > ASSIGNMENT_OPTION_BANK_MAX)
		return `Ngân hàng lựa chọn tối đa ${ASSIGNMENT_OPTION_BANK_MAX} mục.`;
	if (value.optionBank.some((row) => !row.trim() || row.trim().length > 200))
		return "Ngân hàng lựa chọn: điền nội dung cho mọi mục (1–200 ký tự).";
	if (status !== "ready") return null;
	// Chỉ các câu có kind hiệu dụng trùng bank mới dùng bank này — câu tự do
	// trong đề trộn không bị ép nhãn.
	const kind = kindOf(bankTypeId);
	const bankItems = value.items.filter(
		(item) => kindOf(item.type ?? value.type) === kind,
	);
	if (value.optionBank.length < 2)
		return "Ngân hàng lựa chọn cần tối thiểu 2 mục trước khi lưu sẵn sàng giao.";
	if (bankItems.length > ASSIGNMENT_OPTION_BANK_MAX)
		// Root cause first: more questions than labels can never be covered.
		return `Dạng này tối đa ${ASSIGNMENT_OPTION_BANK_MAX} câu — số nhãn chỉ có ${ASSIGNMENT_OPTION_BANK_MAX} giá trị.`;
	if (value.optionBank.length < bankItems.length)
		return `Ngân hàng lựa chọn phải phủ đủ ${bankItems.length} câu.`;
	const labels =
		kind === "letter" || kind === "roman"
			? ASSIGNMENT_ANSWER_CHOICES[kind]
			: null;
	if (labels) {
		for (const item of bankItems) {
			if (!item.answer.trim()) continue;
			const labelIndex = labels.indexOf(item.answer as never);
			if (labelIndex < 0 || labelIndex >= value.optionBank.length)
				return `Đáp án “${item.answer}” nằm ngoài Ngân hàng lựa chọn — khóa lại theo nhãn hiện có.`;
		}
	}
	const used = new Set<string>();
	for (const item of bankItems) {
		if ((item.type ?? value.type) !== "sentend") continue;
		if (!item.answer.trim()) continue;
		if (used.has(item.answer))
			return "Matching sentence endings: mỗi nhãn chỉ dùng cho đúng một câu.";
		used.add(item.answer);
	}
	return null;
}

/**
 * Web mirror of the phase-03 marker + caps rules (FR7). The `____` marker is
 * a pure stem convention (no contract change): exactly one marker is the
 * happy path, ZERO markers stays valid (legacy prompts + marker-exempt
 * tablecomp stems), TWO OR MORE would render broken previews and is a row
 * error. Caps mirror the contract's parse-time limits — the server only
 * replies with a field-less "invalid body", so these block BEFORE the 400,
 * in BOTH statuses (a draft carrying them can never save either).
 */
export function clozeStemIssue(
	value: ComposerValue,
	status: "draft" | "ready",
): string | null {
	if (!isAutoSkill(value.skill)) return null;
	if (value.items.length > QUESTION_MAX_COUNT)
		return `Tối đa ${QUESTION_MAX_COUNT} câu cho một phần — đang có ${value.items.length}.`;
	const qStart = qStartOf(value.skill, value.part);
	for (const [index, item] of value.items.entries()) {
		const number = qStart + index;
		const issue = clozeRowIssue(item, number);
		if (issue) return issue;
		if (
			status === "ready" &&
			(item.type ?? value.type) === "gap" &&
			countBlanks(item.stem) !== 1
		) {
			return `Câu ${number} dạng điền từ cần đúng 1 chỗ trống (____).`;
		}
	}
	return null;
}

/** Per-row marker + caps issue, numbered by the part's real question number. */
export function clozeRowIssue(
	item: QuestionItem,
	number: number,
): string | null {
	const blanks = countBlanks(item.stem);
	if (blanks >= 2)
		return `Câu ${number} có ${blanks} chỗ trống (____) — mỗi câu chỉ một chỗ trống.`;
	if (item.stem.trim().length > QUESTION_STEM_MAX)
		return `Câu ${number} vượt quá ${QUESTION_STEM_MAX} ký tự.`;
	if (item.answer.trim().length > QUESTION_ANSWER_MAX)
		return `Đáp án câu ${number} vượt quá ${QUESTION_ANSWER_MAX} ký tự.`;
	if (item.alts.length > QUESTION_ALTS_MAX)
		return `Danh sách nhận thêm của câu ${number} vượt quá ${QUESTION_ALTS_MAX} ký tự.`;
	if (typeof item.explanation === "string") {
		if (
			collapseWhitespace(htmlToPlainText(item.explanation)).length >
			QUESTION_EXPLANATION_MAX
		) {
			return `Giải thích câu ${number} vượt quá ${QUESTION_EXPLANATION_MAX} ký tự.`;
		}
		if (item.explanation.trim().length > QUESTION_EXPLANATION_RAW_MAX) {
			return `Giải thích câu ${number} vượt quá ${QUESTION_EXPLANATION_RAW_MAX} ký tự tính cả định dạng.`;
		}
	}
	return null;
}

/**
 * Web mirror of the phase-04 image-pin rules (FR2) — image-based pairs gate
 * `ready` on the image URL AND a pin per question, exactly like the contract
 * superRefine. Skill-qualified: writing task1's `map` never reaches here.
 */
export function imagePinIssue(
	value: ComposerValue,
	status: "draft" | "ready",
): string | null {
	if (!isImageBased(value.skill, value.type)) return null;
	if (status !== "ready") return null;
	if (!value.imageUrl.trim())
		return "Dán link ảnh (https) trước khi lưu sẵn sàng giao.";
	const qStart = qStartOf(value.skill, value.part);
	for (const [index, item] of value.items.entries()) {
		if (!item.pin)
			return `Câu ${qStart + index} chưa đặt ghim trên ảnh — bấm lên ảnh để đặt.`;
	}
	return null;
}
