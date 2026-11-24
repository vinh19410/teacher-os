import { splitIntroBlocks } from "@teacher-os/api/lib/quiz-intro-sections";
import type { QuizPart } from "@teacher-os/api/lib/quiz-parts";
import {
	collapseWhitespace,
	htmlToPlainText,
	isEmptyRichText,
} from "@teacher-os/api/rich-text";

export const COMPLETION_TYPE_REGEX: Record<string, RegExp> = {
	summary: /\bsummary\b/i,
	flow: /\bflow[\s-]?chart\b/i,
	flowchart: /\bflow[\s-]?chart\b/i,
	notes: /\bnotes?\b/i,
	note: /\bnotes?\b/i,
	sent: /\bsentences?\b/i,
	sent4: /\bsent4|\bsentences?\b/i,
	tablecomp: /\btable\b/i,
	form: /\bform\b/i,
	diagram: /\bdiagram|\bmap\b/i,
	shortans: /\bquestions?\b/i,
	fill_blank: /\bblank|\bfill\b/i,
};

export const WORD_LIMIT_REGEX =
	/\b(?:(?:choose|write|use)\s+)?((?:no\s+more\s+than\s+(?:one|two|three|\d+)\s+words?(?:\s+(?:and\/or|or)\s+a\s+number)?|one\s+word\s+only(?:\s+(?:and\/or|or)\s+a\s+number)?|one\s+word\s+and\/or\s+a\s+number))\b/i;

export interface ResolvePartInstructionOptions {
	partBank?: readonly string[];
	matchedInstruction?: string | null;
	contextIntro?: string;
}

/**
 * Suy luận dòng hướng dẫn hiển thị cho một part (cụm/nhóm câu):
 * 1. Nếu có matchedInstruction từ intro được gán riêng cho part -> dùng luôn.
 * 2. Nếu là summary/flow có Word Bank (partBank.length > 0) -> dùng hướng dẫn chọn từ danh sách thay vì "from the passage".
 * 3. Nếu là MCQ -> điều chỉnh A or B, A, B or C theo số lượng opts.
 * 4. Nếu là dạng completion và có chỉ thị giới hạn từ (trong contextIntro hoặc fallback) -> chuẩn hóa giới hạn từ.
 * 5. Fallback về chuỗi mặc định.
 */
export function resolvePartInstruction(
	typeId: string,
	questions: ReadonlyArray<{
		type?: string | null;
		opts?: readonly string[] | null;
	}>,
	fallback: string,
	options?: ResolvePartInstructionOptions,
): string {
	if (options?.matchedInstruction?.trim()) {
		const raw = options.matchedInstruction.trim();
		// Bỏ tag bọc đơn giản nếu là text thuần trong <p>...</p> để khớp với ngữ cảnh inline
		const pMatch = /^<p(\s[^>]*)?>([\s\S]*)<\/p>$/i.exec(raw);
		return pMatch ? (pMatch[2]?.trim() ?? raw) : raw;
	}

	const hasBank = Boolean(options?.partBank && options.partBank.length > 0);
	if (
		(typeId === "summary" || typeId === "flow" || typeId === "flowchart") &&
		hasBank
	) {
		return typeId === "summary"
			? "Complete the summary using the list of words below."
			: "Complete the flow-chart using the list of words below.";
	}

	if (typeId === "mcq") {
		const mcqQuestions = questions.filter((q) => (q.type ?? typeId) === "mcq");
		if (mcqQuestions.length === 0) return fallback;
		const counts = new Set(
			mcqQuestions.map((q) =>
				q.opts?.length ? Math.min(q.opts.length, 4) : 4,
			),
		);
		if (counts.size === 1) {
			if (counts.has(2)) return "Choose the correct letter A or B.";
			if (counts.has(3)) return "Choose the correct letter A, B or C.";
			return fallback;
		}
		return "Choose the correct letter.";
	}

	const isCompletionType = typeId in COMPLETION_TYPE_REGEX;
	if (isCompletionType && options?.contextIntro) {
		const match = WORD_LIMIT_REGEX.exec(options.contextIntro);
		if (match?.[1]) {
			const limitText = match[1].toUpperCase();
			if (/one\s+word\s+only/i.test(fallback)) {
				return fallback.replace(/one\s+word\s+only/i, limitText);
			}
			if (/no\s+more\s+than\s+three\s+words/i.test(fallback)) {
				return fallback.replace(/no\s+more\s+than\s+three\s+words/i, limitText);
			}
		}
	}

	return fallback;
}

/**
 * Deduplicate preamble khi đề có `groups` (`hasGroupSource === true`):
 * - Loại bỏ các block trong `introPreamble` trùng lặp với `instructionHtml` của các nhóm câu.
 * - Đối với nhóm câu chưa có `instructionHtml`, nếu trong `introPreamble` có block chỉ thị
 *   neo theo loại câu đó (ví dụ "Complete the summary below. Write NO MORE THAN TWO WORDS..."),
 *   tiêu thụ block đó gán vào nhóm câu (`matchedInstructionsByPartId`) và loại khỏi preamble.
 * - Giữ nguyên các block preamble chung (ví dụ "Preamble CANARY", thời gian làm bài, v.v.).
 */
export function deduplicateGroupIntroPreamble(
	introPreamble: string,
	parts: readonly QuizPart[],
): {
	cleanedPreamble: string;
	matchedInstructionsByPartId: Map<string, string>;
} {
	const matchedInstructionsByPartId = new Map<string, string>();
	if (!introPreamble.trim() || parts.length === 0) {
		return { cleanedPreamble: introPreamble, matchedInstructionsByPartId };
	}

	const blocks = splitIntroBlocks(introPreamble);
	if (blocks.length === 0) {
		return { cleanedPreamble: introPreamble, matchedInstructionsByPartId };
	}

	// Danh sách plain text của các nhóm đã có instruction riêng
	const ownTexts = parts
		.filter((p) => p.instructionHtml && !isEmptyRichText(p.instructionHtml))
		.map((p) => collapseWhitespace(htmlToPlainText(p.instructionHtml ?? "")));

	// Danh sách nhóm còn thiếu instructionHtml
	const missingParts = parts.filter(
		(p) => !p.instructionHtml || isEmptyRichText(p.instructionHtml),
	);

	const keptBlocks: string[] = [];

	for (const block of blocks) {
		const clean = collapseWhitespace(htmlToPlainText(block));
		if (!clean) continue;

		// 1. Kiểm tra trùng lặp với instructionHtml của nhóm đã có
		const isDuplicate = ownTexts.some(
			(own) => own === clean || own.includes(clean) || clean.includes(own),
		);
		if (isDuplicate) {
			continue;
		}

		// 2. Kiểm tra gán cho nhóm đang thiếu instructionHtml
		let assignedPartId: string | null = null;
		for (let i = 0; i < missingParts.length; i++) {
			const candidatePart = missingParts[i];
			if (!candidatePart) continue;
			const typeRegex = COMPLETION_TYPE_REGEX[candidatePart.typeId];
			const hasWordLimit = WORD_LIMIT_REGEX.test(clean);
			const matchesType = typeRegex?.test(clean) ?? false;

			const isCandidateCompletion =
				candidatePart.typeId in COMPLETION_TYPE_REGEX;

			// Trùng dạng bài (như summary) hoặc là câu completion duy nhất có word-limit
			if (
				(matchesType && (hasWordLimit || /\bcomplete\b/i.test(clean))) ||
				(missingParts.length === 1 && hasWordLimit && isCandidateCompletion)
			) {
				assignedPartId = candidatePart.id;
				matchedInstructionsByPartId.set(candidatePart.id, block);
				missingParts.splice(i, 1);
				break;
			}
		}

		if (assignedPartId !== null) {
			continue;
		}

		// 3. Không trùng và không tiêu thụ -> giữ lại trong preamble
		keptBlocks.push(block);
	}

	const isHtml = /<\/?[a-z][^>]*>/i.test(introPreamble);
	const cleanedPreamble = keptBlocks.join(isHtml ? "" : "\n");

	return { cleanedPreamble, matchedInstructionsByPartId };
}
