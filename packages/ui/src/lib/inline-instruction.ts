import { sanitizeRichText } from "@teacher-os/ui/lib/rich-text-sanitize";

export interface InlineQuestionRef {
	q: number;
	number: number;
}

export interface InlineMarkerOccurrence {
	id: number;
	markerNum: number;
}

export const INLINE_ALLOWED_TAGS = [
	"p",
	"br",
	"strong",
	"em",
	"u",
	"s",
	"ul",
	"ol",
	"li",
	"a",
	"code",
	"pre",
	"hr",
	"blockquote",
	"h2",
	"h3",
	"h4",
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"th",
	"td",
] as const;

export type InlineAllowedTag = (typeof INLINE_ALLOWED_TAGS)[number];

export interface InlineElementAttrs {
	href?: string;
	target?: "_blank";
	rel?: "noopener noreferrer";
	colSpan?: number;
	rowSpan?: number;
}

export type InlineHtmlNode =
	| { kind: "text"; text: string }
	| { kind: "slot"; question: InlineQuestionRef; markerNumber: number }
	| {
			kind: "element";
			tag: InlineAllowedTag;
			attrs?: InlineElementAttrs;
			children: InlineHtmlNode[];
	  };

export interface ParsedInlineInstruction {
	nodes: InlineHtmlNode[];
	boundQuestionQs: Set<number>;
	isHtml: boolean;
}

const ALLOWED_TAG_SET: ReadonlySet<string> = new Set(INLINE_ALLOWED_TAGS);

// Mirrors RichTextBody's heuristic so plain-text vs HTML rendering stays consistent.
const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;
const PAIRED_OR_VOID_TAG_RE = /<\/[a-z][a-z0-9]*\s*>|<(?:br|hr|img)\b[^>]*>/i;
const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|#39);/i;

const LEAF_STRONG_MARKER_RE = /^\((\d+)\)$/;
const BRACKET_MARKER_RE = /\[(\d+)\]/g;
const POSITIVE_INT_RE = /^\d+$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME_RE = /^(?:https?|mailto|tel):/i;
const COLON_BEFORE_PATH_RE = /^[^/?#]*:/;

// Upper bound for offset-shifted IELTS marker numbers (Sections 1-4 run 1..40,
// leaving headroom while preventing years such as (1995) from forming deltas).
const MAX_OFFSET_MARKER_NUM = 60;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

type DraftNode =
	| { kind: "text"; text: string }
	| {
			kind: "strong-candidate";
			occId: number;
			markerNum: number;
			rawText: string;
	  }
	| {
			kind: "bracket-candidate";
			occId: number;
			markerNum: number;
			rawText: string;
	  }
	| {
			kind: "element";
			tag: InlineAllowedTag;
			attrs?: InlineElementAttrs;
			children: DraftNode[];
	  };

function isInlineAllowedTag(tag: string): tag is InlineAllowedTag {
	return ALLOWED_TAG_SET.has(tag);
}

function detectIsHtml(text: string): boolean {
	if (HTML_ENTITY_RE.test(text)) return true;
	if (!HTML_TAG_RE.test(text) || !PAIRED_OR_VOID_TAG_RE.test(text)) {
		return false;
	}
	if (typeof DOMParser === "undefined") return true;
	const doc = new DOMParser().parseFromString(text, "text/html");
	return doc.body.children.length > 0 || /<(br|img|hr)\b/i.test(text);
}

function stripAsciiControlAndSpaces(input: string): string {
	let result = "";
	for (let i = 0; i < input.length; i++) {
		const code = input.charCodeAt(i);
		if (code > 0x20 && code !== 0x7f) {
			result += input[i];
		}
	}
	return result;
}

function sanitizeHref(raw: string | null): string | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	const normalized = stripAsciiControlAndSpaces(trimmed);
	if (SCHEME_RE.test(normalized)) {
		return SAFE_SCHEME_RE.test(normalized) ? trimmed : undefined;
	}
	if (COLON_BEFORE_PATH_RE.test(normalized)) {
		return undefined;
	}
	return trimmed;
}

function parsePositiveSpan(raw: string | null): number | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	if (!POSITIVE_INT_RE.test(trimmed)) return undefined;
	const parsed = Number.parseInt(trimmed, 10);
	return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

function extractAllowedAttrs(
	el: Element,
	tag: InlineAllowedTag,
): InlineElementAttrs | undefined {
	const attrs: InlineElementAttrs = {};
	let hasAttr = false;

	if (tag === "a") {
		const href = sanitizeHref(el.getAttribute("href"));
		if (href) {
			attrs.href = href;
			attrs.target = "_blank";
			attrs.rel = "noopener noreferrer";
			hasAttr = true;
		}
	} else if (tag === "td" || tag === "th") {
		const colSpan = parsePositiveSpan(el.getAttribute("colspan"));
		if (colSpan !== undefined) {
			attrs.colSpan = colSpan;
			hasAttr = true;
		}
		const rowSpan = parsePositiveSpan(el.getAttribute("rowspan"));
		if (rowSpan !== undefined) {
			attrs.rowSpan = rowSpan;
			hasAttr = true;
		}
	}

	return hasAttr ? attrs : undefined;
}

function collectTextDraftNodes(
	text: string,
	occurrences: InlineMarkerOccurrence[],
): DraftNode[] {
	if (text.length === 0) return [];
	const nodes: DraftNode[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(BRACKET_MARKER_RE)) {
		const matchIndex = match.index ?? 0;
		const markerNum = Number(match[1]);
		if (!Number.isSafeInteger(markerNum) || markerNum < 1) {
			continue;
		}
		if (matchIndex > lastIndex) {
			nodes.push({ kind: "text", text: text.slice(lastIndex, matchIndex) });
		}
		const occId = occurrences.length;
		occurrences.push({ id: occId, markerNum });
		nodes.push({
			kind: "bracket-candidate",
			occId,
			markerNum,
			rawText: match[0],
		});
		lastIndex = matchIndex + match[0].length;
	}

	if (lastIndex < text.length) {
		nodes.push({ kind: "text", text: text.slice(lastIndex) });
	}

	return nodes;
}

function collectDomNode(
	node: Node,
	occurrences: InlineMarkerOccurrence[],
	insideAnchor = false,
): DraftNode[] {
	if (node.nodeType === TEXT_NODE) {
		const text = node.textContent ?? "";
		if (insideAnchor) {
			return text.length > 0 ? [{ kind: "text", text }] : [];
		}
		return collectTextDraftNodes(text, occurrences);
	}
	if (node.nodeType !== ELEMENT_NODE) {
		return [];
	}

	const el = node as Element;
	if (!insideAnchor && el.nodeName === "STRONG" && el.children.length === 0) {
		const rawText = el.textContent ?? "";
		const match = LEAF_STRONG_MARKER_RE.exec(rawText.trim());
		if (match) {
			const markerNum = Number(match[1]);
			if (Number.isSafeInteger(markerNum) && markerNum >= 1) {
				const occId = occurrences.length;
				occurrences.push({ id: occId, markerNum });
				return [
					{
						kind: "strong-candidate",
						occId,
						markerNum,
						rawText,
					},
				];
			}
		}
	}

	const childInsideAnchor = insideAnchor || el.nodeName === "A";
	const children: DraftNode[] = [];
	for (const child of Array.from(el.childNodes)) {
		children.push(...collectDomNode(child, occurrences, childInsideAnchor));
	}

	const tag = el.nodeName.toLowerCase();
	if (!isInlineAllowedTag(tag)) {
		return children;
	}

	const attrs = extractAllowedAttrs(el, tag);
	return [
		{
			kind: "element",
			tag,
			...(attrs ? { attrs } : {}),
			children,
		},
	];
}

function assignForDelta(
	occurrences: readonly InlineMarkerOccurrence[],
	eligibleQuestions: readonly InlineQuestionRef[],
	delta: number,
): Map<number, InlineQuestionRef> {
	const ordered = new Map<number, InlineQuestionRef>();
	const usedOccIds = new Set<number>();
	const matchedQs = new Set<number>();

	// Pass 1: ordered subsequence matching skips leading stray duplicates.
	let cursor = 0;
	for (const question of eligibleQuestions) {
		const target = question.number + delta;
		for (let i = cursor; i < occurrences.length; i++) {
			const occ = occurrences[i];
			if (occ.markerNum === target && !usedOccIds.has(occ.id)) {
				ordered.set(occ.id, question);
				usedOccIds.add(occ.id);
				matchedQs.add(question.q);
				cursor = i + 1;
				break;
			}
		}
	}

	if (ordered.size === eligibleQuestions.length) {
		return ordered;
	}

	// Pass 2: out-of-order fallback for multi-column tables (e.g. 1, 3, 2, 4).
	const extended = new Map(ordered);
	const extendedUsedOccIds = new Set(usedOccIds);
	for (const question of eligibleQuestions) {
		if (matchedQs.has(question.q)) continue;
		const target = question.number + delta;
		for (const occ of occurrences) {
			if (occ.markerNum === target && !extendedUsedOccIds.has(occ.id)) {
				extended.set(occ.id, question);
				extendedUsedOccIds.add(occ.id);
				matchedQs.add(question.q);
				break;
			}
		}
	}

	return extended.size > ordered.size ? extended : ordered;
}

/**
 * Maps detected marker occurrences to eligible questions with 1-to-1 binding,
 * supporting positive IELTS section offsets and out-of-order table layouts
 * while gating against incidental single-marker false positives.
 */
export function mapInlineMarkersToQuestions(
	occurrences: ReadonlyArray<{ id: number; markerNum: number }>,
	eligibleQuestions: readonly InlineQuestionRef[],
): Map<number, InlineQuestionRef> {
	const validOccurrences = occurrences.filter(
		(occ) => Number.isSafeInteger(occ.markerNum) && occ.markerNum >= 1,
	);
	if (validOccurrences.length === 0 || eligibleQuestions.length === 0) {
		return new Map();
	}

	const uniqueQuestions: InlineQuestionRef[] = [];
	const seenQs = new Set<number>();
	for (const question of eligibleQuestions) {
		if (!seenQs.has(question.q)) {
			seenQs.add(question.q);
			uniqueQuestions.push(question);
		}
	}

	const positiveDeltaSet = new Set<number>();
	for (const occ of validOccurrences) {
		if (occ.markerNum > MAX_OFFSET_MARKER_NUM) continue;
		for (const question of uniqueQuestions) {
			const delta = occ.markerNum - question.number;
			if (delta > 0) {
				positiveDeltaSet.add(delta);
			}
		}
	}
	const positiveDeltas = [...positiveDeltaSet].sort((a, b) => a - b);

	let bestDelta = 0;
	let bestAssignment = assignForDelta(validOccurrences, uniqueQuestions, 0);

	if (bestAssignment.size < uniqueQuestions.length) {
		for (const delta of positiveDeltas) {
			const candidate = assignForDelta(
				validOccurrences,
				uniqueQuestions,
				delta,
			);
			if (candidate.size > bestAssignment.size) {
				bestDelta = delta;
				bestAssignment = candidate;
				if (bestAssignment.size === uniqueQuestions.length) {
					break;
				}
			}
		}
	}

	const matchedCount = bestAssignment.size;
	const total = uniqueQuestions.length;
	if (matchedCount === 0) {
		return new Map();
	}

	if (total === 1) {
		if (bestDelta === 0) {
			return bestAssignment;
		}
		return validOccurrences.length === 1 ? bestAssignment : new Map();
	}

	if (bestDelta === 0) {
		return matchedCount >= 2 ? bestAssignment : new Map();
	}

	if (
		matchedCount === total ||
		(matchedCount >= 2 && matchedCount / total >= 0.5)
	) {
		return bestAssignment;
	}

	return new Map();
}

function pushMaterializedNode(
	target: InlineHtmlNode[],
	node: InlineHtmlNode,
): void {
	if (node.kind === "text") {
		if (node.text.length === 0) return;
		const prev = target[target.length - 1];
		if (prev && prev.kind === "text") {
			prev.text += node.text;
			return;
		}
	}
	target.push(node);
}

function materializeDraftNodes(
	drafts: readonly DraftNode[],
	assigned: ReadonlyMap<number, InlineQuestionRef>,
	boundQuestionQs: Set<number>,
): InlineHtmlNode[] {
	const result: InlineHtmlNode[] = [];

	for (const draft of drafts) {
		switch (draft.kind) {
			case "text":
				pushMaterializedNode(result, { kind: "text", text: draft.text });
				break;
			case "strong-candidate": {
				const question = assigned.get(draft.occId);
				if (question) {
					boundQuestionQs.add(question.q);
					pushMaterializedNode(result, {
						kind: "slot",
						question,
						markerNumber: draft.markerNum,
					});
				} else {
					pushMaterializedNode(result, {
						kind: "element",
						tag: "strong",
						children: [{ kind: "text", text: draft.rawText }],
					});
				}
				break;
			}
			case "bracket-candidate": {
				const question = assigned.get(draft.occId);
				if (question) {
					boundQuestionQs.add(question.q);
					pushMaterializedNode(result, {
						kind: "slot",
						question,
						markerNumber: draft.markerNum,
					});
				} else {
					pushMaterializedNode(result, { kind: "text", text: draft.rawText });
				}
				break;
			}
			case "element": {
				const children = materializeDraftNodes(
					draft.children,
					assigned,
					boundQuestionQs,
				);
				pushMaterializedNode(result, {
					kind: "element",
					tag: draft.tag,
					...(draft.attrs ? { attrs: draft.attrs } : {}),
					children,
				});
				break;
			}
		}
	}

	return result;
}

/**
 * Parses an instruction string (sanitizing HTML via DOMPurify + DOMParser, or
 * scanning plain text directly for `[N]` markers) into a safe AST and replaces
 * mapped question markers with inline answer slots.
 * Returns `null` when input is empty, HTML DOM APIs are unavailable, or no
 * valid mapping activates.
 */
export function parseInlineInstruction(
	html: string,
	eligibleQuestions: readonly InlineQuestionRef[],
): ParsedInlineInstruction | null {
	if (!html.trim() || eligibleQuestions.length === 0) {
		return null;
	}

	const isHtml = detectIsHtml(html);
	const occurrences: InlineMarkerOccurrence[] = [];
	let draftNodes: DraftNode[];

	if (isHtml) {
		if (typeof DOMParser === "undefined" || typeof document === "undefined") {
			return null;
		}
		const sanitized = sanitizeRichText(html);
		if (!sanitized.trim()) {
			return null;
		}
		const doc = new DOMParser().parseFromString(sanitized, "text/html");
		draftNodes = [];
		for (const child of Array.from(doc.body.childNodes)) {
			draftNodes.push(...collectDomNode(child, occurrences));
		}
	} else {
		draftNodes = collectTextDraftNodes(html, occurrences);
	}

	const assigned = mapInlineMarkersToQuestions(occurrences, eligibleQuestions);
	if (assigned.size === 0) {
		return null;
	}

	const boundQuestionQs = new Set<number>();
	const nodes = materializeDraftNodes(draftNodes, assigned, boundQuestionQs);

	return {
		nodes,
		boundQuestionQs,
		isHtml,
	};
}

/**
 * Formats an option bank entry for inline select dropdowns.
 * Returns just `choiceValue` for positional-only/empty entries; otherwise
 * returns `${choiceValue} — ${trimmedOrTruncated}` with an ellipsis.
 */
export function formatInlineBankOptionLabel(
	choiceValue: string,
	bankText: string | undefined,
	maxTextLen = 48,
): string {
	const trimmedChoice = choiceValue.trim();
	const trimmedBank = (bankText ?? "").trim();
	if (
		!trimmedBank ||
		trimmedBank.toLowerCase() === trimmedChoice.toLowerCase()
	) {
		return trimmedChoice;
	}

	const limit = Math.max(1, Math.floor(maxTextLen));
	const displayText =
		trimmedBank.length <= limit
			? trimmedBank
			: limit === 1
				? "…"
				: `${trimmedBank.slice(0, limit - 1).trimEnd()}…`;

	return `${trimmedChoice} — ${displayText}`;
}
