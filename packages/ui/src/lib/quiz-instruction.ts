import type { QuizPart } from "@teacher-os/api/lib/quiz-parts";
import { collapseWhitespace } from "@teacher-os/api/rich-text";

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
	shortans: /\banswer\s+the\s+questions?\b/i,
	fill_blank: /\bblank|\bfill\b/i,
};

/**
 * Tier-1 (specific/long) word-limit patterns evaluated in priority order so JS
 * RegExp leftmost-first matching never truncates `ONE WORD AND/OR A NUMBER` or
 * `ONE WORD ONLY` down to bare `ONE WORD`.
 */
const TIER1_WORD_LIMIT_PATTERNS: readonly RegExp[] = [
	/\b(no\s+more\s+th[ae]n\s+(?:one|two|three|four|five|\d+)\s+words?\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i,
	/\b(no\s+more\s+th[ae]n\s+(?:one|two|three|four|five|\d+)\s+words?)\b/i,
	/\b(only\s+one\s+word\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i,
	/\b(?:choose|write|use|using|with)\s+(only\s+one\s+word)\b/i,
	/\b(only\s+one\s+word)\b(?=\s+(?:from\s+the\b|for\s+each\b|in\s+each\b|per\b))/i,
	/\b(one\s+word\s+only\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i,
	/\b(one\s+word\s+only)\b/i,
	/\b(one\s+or\s+two\s+words(?:\s+only)?)\b/i,
	/\b((?:one|two|three|four|five|\d+)\s+words?\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i,
];

/**
 * Tier-2 (bare `ONE WORD`) patterns — only checked when Tier 1 returns null,
 * anchored to directive verbs or IELTS limit suffixes so ordinary prose such as
 * "Please change one word" never false-positives.
 */
const TIER2_WORD_LIMIT_PATTERNS: readonly RegExp[] = [
	/\b(?:choose|write|use|using|with)\s+(one\s+word)\b(?!\s+(?:only|and\s*\/\s*or|or)\b)/i,
	/\b(one\s+word)\b(?=\s+(?:from\s+the\b|for\s+each\b|in\s+each\b|per\b))/i,
];

/** Backward-compatible combined word-limit regex for callers testing presence. */
export const WORD_LIMIT_REGEX =
	/\b(?:no\s+more\s+th[ae]n\s+(?:one|two|three|four|five|\d+)\s+words?(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?|only\s+one\s+word\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?|one\s+word\s+only(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?|one\s+or\s+two\s+words(?:\s+only)?|(?:one|two|three|four|five|\d+)\s+words?\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?|(?:choose|write|use|using|with)\s+(?:only\s+)?one\s+word(?!\s+(?:only|and\s*\/\s*or|or)\b)|one\s+word(?=\s+(?:from\s+the\b|for\s+each\b|in\s+each\b|per\b)))\b/i;

/**
 * Matches the full word-limit phrase inside static `QUIZ_TYPE_DISPLAY`
 * fallbacks (`NO MORE THAN THREE WORDS AND/OR A NUMBER`, `NO MORE THAN THREE
 * WORDS`, `NO MORE THAN TWO WORDS`, `ONE WORD AND/OR A NUMBER`, `ONE WORD ONLY`)
 * so replacing with a narrower limit never leaves a dangling `AND/OR A NUMBER`.
 */
const FALLBACK_WORD_LIMIT_REGEX =
	/\b(?:no\s+more\s+than\s+(?:one|two|three|four|five|\d+)\s+words?(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?|one\s+word\s+only(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?|one\s+word\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i;

const DANGEROUS_CONTAINER_RE =
	/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_CLOSE_OR_BR_RE =
	/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr|blockquote|pre|td|th)\s*>/gi;
const ANY_TAG_RE = /<[^>]+>/g;
const PAIRED_OR_VOID_HTML_RE = /<\/[a-z][a-z0-9]*\s*>|<(?:br|hr|img)\b[^>]*>/i;
const BLOCK_TAG_START_RE =
	/^<(?:p|div|table|ul|ol|blockquote|h[1-6]|pre|hr)\b/i;
const BLOCK_TAG_TOKEN_RE =
	/<(\/?)(p|div|table|ul|ol|blockquote|h[1-6]|pre|hr)\b[^>]*>/gi;

const WORD_BANK_DIRECTIVE_RE =
	/\b(?:list\s+of\s+(?:words|phrases)|from\s+the\s+(?:list|box)|box\s+below|list\s+below|A\s*[-–—]\s*[A-Z])\b/i;
const ANSWER_SHEET_BOX_RE =
	/^write\s+(?:your\s+)?answers?\s+in\s+(?:the\s+)?boxes?\b/i;
const INLINE_MARKER_RE =
	/\[\d+\]|<strong(?:\s[^>]*)?>\s*\(\d+\)\s*<\/strong\s*>/gi;
const INLINE_SIBLING_BLOCK_RE = /^<(?:table|ul|ol|p|h[2-4])\b/i;

const TFNG_HEADER_RE =
	/^(?:do\s+the\s+following\s+statements?\s+agree\b|are\s+the\s+following\s+statements?\s+(?:true|yes)\b)/i;
const TFNG_BRIDGE_RE =
	/^(?:(?:write|choose|chose)\s*:?|(?:in\s+(?:the\s+)?boxes?\b[\s\S]*?(?:write|choose|chose)|on\s+your\s+answer\s+sheet\b[\s\S]*?(?:write|choose|chose))[\s:]*)$/i;
const TFNG_LEGEND_RE =
	/^(?:write\s+)?(true|false|yes|no|not\s+given)(?:\s*[-–—:]\s*|\s+)(?:if|when|the\s+statement|the\s+information|there\s+is|it\s+is)\b/i;
const TFNG_SELF_CONTAINED_TF_RE =
	/\btrue\b[\s\S]*\bfalse\b[\s\S]*\bnot\s+given\b/i;
const TFNG_SELF_CONTAINED_YN_RE = /\byes\b[\s\S]*\bno\b[\s\S]*\bnot\s+given\b/i;

function decodeBasicEntities(text: string): string {
	return text
		.replace(/&nbsp;/gi, " ")
		.replace(/&ndash;|&#8211;/gi, "–")
		.replace(/&mdash;|&#8212;/gi, "—")
		.replace(/&middot;/gi, "·")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&amp;/gi, "&");
}

function escapePlainHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * Strips dangerous containers (`<script>`, `<style>`, `<noscript>`,
 * `<template>`) and HTML markup consistently in both DOM and Node environments,
 * returning collapsed visible plain text.
 */
function toSafePlainText(input: string): string {
	const withoutContainers = input.replace(DANGEROUS_CONTAINER_RE, " ");
	const withBreaks = withoutContainers.replace(BLOCK_CLOSE_OR_BR_RE, " ");
	const withoutTags = withBreaks.replace(ANY_TAG_RE, "");
	return collapseWhitespace(decodeBasicEntities(withoutTags));
}

/** True when an instruction string has no visible text after stripping unsafe markup. */
export function isEffectivelyEmptyInstruction(
	input: string | null | undefined,
): boolean {
	if (!input) return true;
	return toSafePlainText(input).length === 0;
}

/**
 * Extracts and normalizes an IELTS word-limit phrase (e.g. `ONE WORD`,
 * `NO MORE THAN TWO WORDS`, `ONE WORD AND/OR A NUMBER`) from plain text or
 * HTML. Strips markup/hidden containers first and evaluates Tier-1 specific
 * patterns before anchored Tier-2 bare `ONE WORD`.
 */
export function extractWordLimit(text: string): string | null {
	const plain = toSafePlainText(text);
	if (!plain) return null;

	for (const pattern of TIER1_WORD_LIMIT_PATTERNS) {
		const match = pattern.exec(plain);
		if (match?.[1]) {
			return normalizeWordLimit(match[1]);
		}
	}
	for (const pattern of TIER2_WORD_LIMIT_PATTERNS) {
		const match = pattern.exec(plain);
		if (match?.[1]) {
			return normalizeWordLimit(match[1]);
		}
	}
	return null;
}

function normalizeWordLimit(raw: string): string {
	return raw
		.toUpperCase()
		.replace(/\bNO\s+MORE\s+THEN\b/g, "NO MORE THAN")
		.replace(/\s*\/\s*/g, "/")
		.replace(/\s+/g, " ")
		.trim();
}

export interface ResolvePartInstructionOptions {
	partBank?: readonly string[];
	matchedInstruction?: string | null;
	contextIntro?: string;
}

/**
 * Suy luận dòng hướng dẫn hiển thị cho một part (cụm/nhóm câu):
 * 1. Nếu có matchedInstruction từ intro được gán riêng cho part -> dùng luôn (unwrap `<p>` đơn an toàn).
 * 2. Nếu là summary/flow có Word Bank (partBank.length > 0) -> dùng hướng dẫn chọn từ danh sách thay vì "from the passage".
 * 3. Nếu là MCQ -> điều chỉnh A or B, A, B or C theo số lượng opts.
 * 4. Nếu là dạng completion và có chỉ thị giới hạn từ (trong contextIntro) -> thay trọn cụm giới hạn từ.
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
	if (
		options?.matchedInstruction &&
		!isEffectivelyEmptyInstruction(options.matchedInstruction)
	) {
		const raw = options.matchedInstruction.trim();
		// Chỉ bỏ thẻ bọc khi là MỘT thẻ <p>...</p> đơn (chống unwrap tham lam nhiều <p>).
		const pMatch = /^<p(?:\s[^>]*)?>([\s\S]*)<\/p\s*>$/i.exec(raw);
		if (pMatch && !/<\/p\b/i.test(pMatch[1] ?? "")) {
			return pMatch[1]?.trim() ?? raw;
		}
		return raw;
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
		const limitText = extractWordLimit(options.contextIntro);
		if (limitText && FALLBACK_WORD_LIMIT_REGEX.test(fallback)) {
			return fallback.replace(FALLBACK_WORD_LIMIT_REGEX, limitText);
		}
	}

	return fallback;
}

/**
 * Splits mixed HTML + plain-text intros into top-level blocks:
 * - Only block-level HTML tags (`p|div|table|ul|ol|blockquote|h1-h6|pre|hr`)
 *   form HTML block boundaries so inline tags like `<strong>ONE WORD</strong>`
 *   stay attached to their sentence.
 * - Text segments outside block tags are split on `\n` so flattened
 *   `part.intro` + `group.instruction` lines remain independently inspectable.
 * - Unclosed block tags never swallow subsequent sibling blocks.
 */
function splitMixedIntroBlocks(input: string): string[] {
	const trimmed = input.trim();
	if (!trimmed) return [];

	if (!PAIRED_OR_VOID_HTML_RE.test(trimmed)) {
		return trimmed
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
	}

	const blocks: string[] = [];
	const pushPlainLines = (segment: string) => {
		for (const line of segment.split(/\r?\n/)) {
			const cleanLine = line.trim();
			if (cleanLine) blocks.push(cleanLine);
		}
	};

	const stack: Array<{ tag: string; start: number }> = [];
	let cursor = 0;

	for (const match of trimmed.matchAll(BLOCK_TAG_TOKEN_RE)) {
		const raw = match[0];
		const isClose = match[1] === "/";
		const tag = (match[2] ?? "").toLowerCase();
		const index = match.index ?? 0;
		const isSelfClosing = !isClose && (tag === "hr" || /\/>$/.test(raw));

		if (stack.length === 0) {
			if (!isClose) {
				if (index > cursor) {
					pushPlainLines(trimmed.slice(cursor, index));
				}
				if (isSelfClosing) {
					blocks.push(raw);
					cursor = index + raw.length;
				} else {
					stack.push({ tag, start: index });
				}
			}
			continue;
		}

		if (!isClose) {
			// HTML5 auto-closes an unclosed <p> whenever another block tag opens.
			const top = stack[stack.length - 1];
			if (top?.tag === "p") {
				stack.pop();
				if (stack.length === 0) {
					const implicitP = trimmed.slice(top.start, index).trim();
					if (implicitP) blocks.push(implicitP);
					cursor = index;
					if (isSelfClosing) {
						blocks.push(raw);
						cursor = index + raw.length;
					} else {
						stack.push({ tag, start: index });
					}
					continue;
				}
			}
			if (!isSelfClosing) {
				stack.push({ tag, start: index });
			}
			continue;
		}

		// Close matching tag from top of stack; if mismatched, unwind to nearest match.
		let matchIdx = -1;
		for (let k = stack.length - 1; k >= 0; k -= 1) {
			if (stack[k]?.tag === tag) {
				matchIdx = k;
				break;
			}
		}
		if (matchIdx === -1) continue;

		const popped = stack[matchIdx];
		stack.length = matchIdx;
		if (stack.length === 0 && popped) {
			blocks.push(trimmed.slice(popped.start, index + raw.length).trim());
			cursor = index + raw.length;
		}
	}

	// Trailing unclosed block or remaining plain text.
	if (stack.length > 0 && stack[0]) {
		pushPlainLines(trimmed.slice(stack[0].start));
	} else if (cursor < trimmed.length) {
		pushPlainLines(trimmed.slice(cursor));
	}

	return blocks.filter(Boolean);
}

function joinMixedBlocks(blocks: readonly string[]): string {
	if (blocks.length === 0) return "";
	const hasAnyHtml = blocks.some((b) => PAIRED_OR_VOID_HTML_RE.test(b));
	if (!hasAnyHtml) {
		return blocks.join("\n");
	}
	return blocks
		.map((block) => {
			const trimmed = block.trim();
			if (BLOCK_TAG_START_RE.test(trimmed)) return trimmed;
			if (PAIRED_OR_VOID_HTML_RE.test(trimmed)) return `<p>${trimmed}</p>`;
			return `<p>${escapePlainHtml(trimmed)}</p>`;
		})
		.join("");
}

function splitOwnInstructionLines(html: string): string[] {
	const lines: string[] = [];
	for (const block of splitMixedIntroBlocks(html)) {
		const whole = toSafePlainText(block);
		if (whole) lines.push(whole);
		for (const piece of block.split(/<br\s*\/?>/gi)) {
			const clean = toSafePlainText(piece);
			if (clean) lines.push(clean);
		}
	}
	return lines;
}

function countInlineMarkers(block: string): number {
	const matches = block.match(INLINE_MARKER_RE);
	return matches ? matches.length : 0;
}

function isTfngSelfContained(clean: string): "tfng" | "ynng" | null {
	const hasCondition =
		/\b(?:if|when)\b/i.test(clean) || TFNG_HEADER_RE.test(clean);
	if (!hasCondition) return null;
	if (TFNG_SELF_CONTAINED_TF_RE.test(clean)) return "tfng";
	if (TFNG_SELF_CONTAINED_YN_RE.test(clean)) return "ynng";
	return null;
}

function detectTfngCluster(
	blocks: readonly string[],
	cleans: readonly string[],
	startIdx: number,
): { endIdx: number; targetType: "tfng" | "ynng" } | null {
	const clean = cleans[startIdx] ?? "";
	if (!clean) return null;

	const selfKind = isTfngSelfContained(clean);
	if (selfKind) {
		return { endIdx: startIdx, targetType: selfKind };
	}

	const isHeader = TFNG_HEADER_RE.test(clean);
	const isBridgeStart =
		TFNG_BRIDGE_RE.test(clean) &&
		startIdx + 1 < cleans.length &&
		TFNG_LEGEND_RE.test(cleans[startIdx + 1] ?? "");

	if (!isHeader && !isBridgeStart) return null;

	let endIdx = startIdx;
	let sawTf = false;
	let sawYn = false;
	let sawLegend = false;

	for (let j = startIdx + 1; j < blocks.length; j += 1) {
		const nextClean = cleans[j] ?? "";
		if (!nextClean) break;
		const legendMatch = TFNG_LEGEND_RE.exec(nextClean);
		if (legendMatch) {
			const label = (legendMatch[1] ?? "").toLowerCase();
			if (label === "true" || label === "false") sawTf = true;
			if (label === "yes" || label === "no") sawYn = true;
			sawLegend = true;
			endIdx = j;
			if (label === "not given") {
				break;
			}
			continue;
		}
		if (!sawLegend && TFNG_BRIDGE_RE.test(nextClean)) {
			endIdx = j;
			continue;
		}
		break;
	}

	const targetType: "tfng" | "ynng" = sawTf
		? "tfng"
		: sawYn
			? "ynng"
			: /\b(?:yes|views?\s+of\s+the\s+writer|claims?\s+of\s+the\s+writer)\b/i.test(
						clean,
					)
				? "ynng"
				: "tfng";

	return { endIdx, targetType };
}

function isAnotherCompletionAnchor(
	clean: string,
	currentTypeId: string,
): boolean {
	if (TFNG_HEADER_RE.test(clean)) return true;
	const hasAction =
		/\bcomplete\b|\banswer\s+the\s+questions?\b|\blabel\b|\bfill\b/i.test(
			clean,
		);
	if (!hasAction) return false;
	for (const [typeKey, regex] of Object.entries(COMPLETION_TYPE_REGEX)) {
		if (typeKey === currentTypeId) continue;
		if (regex.test(clean)) return true;
	}
	return false;
}

/**
 * Deduplicate & phân bổ preamble cho đề có `groups` (`hasGroupSource === true`)
 * hoặc đề trộn dạng không có marker `Questions X–Y` (`parts.length > 1`):
 * - Loại bỏ các block trong `introPreamble` trùng lặp với `instructionHtml` của các nhóm câu.
 * - Đối với nhóm câu chưa có `instructionHtml`, nhận diện và gom trọn cụm chỉ thị
 *   theo loại câu (completion nhiều dòng + inline body, `tfng`/`ynng` nhiều dòng),
 *   gán vào `matchedInstructionsByPartId` và loại khỏi preamble.
 * - Giữ nguyên các block preamble chung (ví dụ "Preamble CANARY", ghi chú tiếng Việt).
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

	const blocks = splitMixedIntroBlocks(introPreamble);
	if (blocks.length === 0) {
		return { cleanedPreamble: introPreamble, matchedInstructionsByPartId };
	}
	const cleans = blocks.map(toSafePlainText);

	// Danh sách text sạch của các nhóm đã có instruction riêng
	const ownFullTexts: string[] = [];
	const ownExactLines = new Set<string>();
	for (const part of parts) {
		if (
			!part.instructionHtml ||
			isEffectivelyEmptyInstruction(part.instructionHtml)
		) {
			continue;
		}
		const full = toSafePlainText(part.instructionHtml);
		if (full) {
			ownFullTexts.push(full);
			ownExactLines.add(full);
		}
		for (const line of splitOwnInstructionLines(part.instructionHtml)) {
			ownExactLines.add(line);
		}
	}

	// Danh sách nhóm còn thiếu instructionHtml
	const missingParts = parts.filter((p) =>
		isEffectivelyEmptyInstruction(p.instructionHtml),
	);

	const keptBlocks: string[] = [];

	for (let idx = 0; idx < blocks.length; idx += 1) {
		const block = blocks[idx];
		const clean = cleans[idx] ?? "";
		if (!block || !clean) continue;

		// 1. Kiểm tra trùng lặp với instructionHtml của nhóm đã có
		const isDuplicate =
			ownExactLines.has(clean) ||
			(clean.length >= 20 &&
				ownFullTexts.some(
					(own) =>
						own.includes(clean) || (own.length >= 20 && clean.includes(own)),
				));
		if (isDuplicate) {
			continue;
		}

		// 2a. Kiểm tra cụm TFNG / YNNG nhiều dòng cho nhóm đang thiếu instruction
		const tfngCluster = detectTfngCluster(blocks, cleans, idx);
		if (tfngCluster) {
			const targetIdx = missingParts.findIndex(
				(part) => part.typeId === tfngCluster.targetType,
			);
			if (targetIdx !== -1) {
				const targetPart = missingParts[targetIdx];
				const joined = joinMixedBlocks(
					blocks.slice(idx, tfngCluster.endIdx + 1),
				);
				if (targetPart && !isEffectivelyEmptyInstruction(joined)) {
					matchedInstructionsByPartId.set(targetPart.id, joined);
					missingParts.splice(targetIdx, 1);
					idx = tfngCluster.endIdx;
					continue;
				}
			}
		}

		// 2b. Kiểm tra gán cụm completion cho nhóm đang thiếu instruction
		const hasWordLimit = extractWordLimit(clean) !== null;
		const missingCompletionParts = missingParts.filter(
			(part) => part.typeId in COMPLETION_TYPE_REGEX,
		);
		let matchedPartIndex = -1;

		for (let i = 0; i < missingParts.length; i += 1) {
			const candidatePart = missingParts[i];
			if (!candidatePart) continue;
			const typeRegex = COMPLETION_TYPE_REGEX[candidatePart.typeId];
			const matchesType = typeRegex?.test(clean) ?? false;
			const isCandidateCompletion =
				candidatePart.typeId in COMPLETION_TYPE_REGEX;
			const hasDirectiveVerb =
				/\bcomplete\b|\banswer\s+the\s+questions?\b|\blabel\b|\bfill\b/i.test(
					clean,
				);

			if (
				(matchesType && (hasWordLimit || hasDirectiveVerb)) ||
				(missingCompletionParts.length === 1 &&
					hasWordLimit &&
					isCandidateCompletion)
			) {
				matchedPartIndex = i;
				break;
			}
		}

		if (matchedPartIndex !== -1) {
			const candidatePart = missingParts[matchedPartIndex];
			if (candidatePart) {
				let endIdx = idx;
				let clusterHasWordLimit = hasWordLimit;
				const isWordBankBlock = WORD_BANK_DIRECTIVE_RE.test(clean);

				// Peek block word-limit liền kề khi câu mở đầu chưa có word limit (cấm peek với word-bank summary)
				if (
					!clusterHasWordLimit &&
					!isWordBankBlock &&
					endIdx + 1 < blocks.length
				) {
					const nextClean = cleans[endIdx + 1] ?? "";
					if (
						nextClean &&
						extractWordLimit(nextClean) !== null &&
						!isAnotherCompletionAnchor(nextClean, candidatePart.typeId)
					) {
						endIdx += 1;
						clusterHasWordLimit = true;
					}
				}

				// Peek tối đa 1 dòng thuần hướng dẫn ghi vào answer sheet
				if (clusterHasWordLimit && endIdx + 1 < blocks.length) {
					const nextClean = cleans[endIdx + 1] ?? "";
					if (nextClean && ANSWER_SHEET_BOX_RE.test(nextClean)) {
						endIdx += 1;
					}
				}

				// Peek chuỗi sibling block inline (<table>/<ul>/<ol>/<p>/<h2>–<h4>) có >= 2 marker,
				// trim bỏ toàn bộ block đứng SAU block cuối chứa marker.
				let scanIdx = endIdx + 1;
				let markerTotal = 0;
				let lastMarkerIdx = -1;
				while (scanIdx < blocks.length) {
					const siblingBlock = blocks[scanIdx] ?? "";
					const siblingClean = cleans[scanIdx] ?? "";
					if (
						!siblingBlock ||
						!INLINE_SIBLING_BLOCK_RE.test(siblingBlock.trim())
					) {
						break;
					}
					if (
						detectTfngCluster(blocks, cleans, scanIdx) !== null ||
						(siblingClean &&
							isAnotherCompletionAnchor(siblingClean, candidatePart.typeId)) ||
						(siblingClean && extractWordLimit(siblingClean) !== null)
					) {
						break;
					}
					const count = countInlineMarkers(siblingBlock);
					if (count > 0) {
						markerTotal += count;
						lastMarkerIdx = scanIdx;
					}
					scanIdx += 1;
				}
				if (markerTotal >= 2 && lastMarkerIdx !== -1) {
					endIdx = lastMarkerIdx;
				}

				const joined = joinMixedBlocks(blocks.slice(idx, endIdx + 1));
				if (!isEffectivelyEmptyInstruction(joined)) {
					matchedInstructionsByPartId.set(candidatePart.id, joined);
					missingParts.splice(matchedPartIndex, 1);
					idx = endIdx;
					continue;
				}
			}
		}

		// 3. Không trùng và không tiêu thụ -> giữ lại trong preamble
		keptBlocks.push(block);
	}

	const cleanedPreamble = joinMixedBlocks(keptBlocks);

	return { cleanedPreamble, matchedInstructionsByPartId };
}
