/**
 * Pure, DOM-free listening transcript classifier and formatter.
 *
 * Runs identically in browser, jsdom, and Node SSR (`renderToStaticMarkup`)
 * without referencing `document`, `window`, or `DOMParser`.
 */

export interface TranscriptTurn {
	speaker: string | null;
	paragraphs: string[];
}

export type TranscriptClassification =
	| { kind: "html" }
	| { kind: "plain"; text: string };

const MAX_SPEAKER_LABEL_LEN = 40;
const MAX_INLINE_ROSTER_SIZE = 24;
const MAX_INLINE_PARSE_LENGTH = 25_000;
const MONOLOGUE_SPLIT_MIN_CHARS = 550;
const MONOLOGUE_SPLIT_MIN_SENTENCES = 5;

const DANGEROUS_OR_HEAD_TAG_RE =
	/<(?:script|style|svg|iframe|object|embed|math|title|noscript|link|base)\b/i;
const FLAT_P_BR_PRESENT_RE = /<(?:p>|\/p>|br\s*\/?>)/i;
const FLAT_P_BR_STRIP_RE = /<\/?p>|<br\s*\/?>/gi;
const OPENING_HTML_TAG_RE = /<[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i;
const CLOSING_HTML_TAG_RE = /<\/[a-z][a-z0-9]*\s*>/i;
const VOID_HTML_TAG_RE = /<(?:br|hr|img)\b[^<>]*>/i;
const STRUCTURAL_HTML_TAG_RE =
	/<(?:head|body|html|meta|details|dialog|template|form|input|textarea|select|button|audio|video|source|track|marquee)\b[^<>]*>/i;

const SINGLE_PASS_ENTITY_RE =
	/&(?:nbsp|amp|lt|gt|quot|apos|rsquo|lsquo|ldquo|rdquo|mdash|ndash|#0*39|#x0*27);/gi;
const UNKNOWN_HTML_ENTITY_RE =
	/&(?:[a-z][a-z0-9]{1,31}|#\d{1,7}|#x[0-9a-f]{1,6});/i;

const ENTITY_DECODE_MAP: Readonly<Record<string, string>> = {
	"&nbsp;": " ",
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&apos;": "'",
	"&rsquo;": "\u2019",
	"&lsquo;": "\u2018",
	"&ldquo;": "\u201c",
	"&rdquo;": "\u201d",
	"&mdash;": "\u2014",
	"&ndash;": "\u2013",
};

const SPEAKER_ID_RE = /^Speaker\s+(\d+)$/i;
const LEADING_SPEAKER_ID_RE = /^Speaker\s+(\d+)\s*:\s*/i;
const GENERIC_SOLO_SPEAKER_RE = /^speaker(?:\s+\d+)?$/i;
const USEFUL_VOCAB_HEADING_RE = /^Useful\s+vocabulary\b/i;

const ALLOWED_SPEAKER_CHARS_RE = /^[\p{L}\p{N} .'\u2019()-]+$/u;
const POS_PAREN_RE = /\((?:n|v|adj|adv|prep|conj|phr|idiom)\)$/i;
const TRAILING_PAREN_RE = /\s*\(([^()]{1,24})\)$/;
const TITLE_WORD_RE = /^(?:Dr|Mr|Mrs|Ms|Prof|St)\.$/i;
const GLUED_TITLE_WORD_RE =
	/^(?:Dr|Mr|Mrs|Ms|Prof|St)\.\p{Lu}[\p{L}'\u2019-]*$/u;
const TITLE_BEFORE_DOT_RE = /\b(?:Dr|Mr|Mrs|Ms|Prof|St)$/i;
const UPPERCASE_START_RE = /^\p{Lu}/u;

const BLOCKED_SPEAKER_LABELS = new Set([
	"script",
	"note",
	"notes",
	"example",
	"examples",
	"part",
	"section",
	"transcript",
	"audio",
	"question",
	"questions",
	"answer",
	"answers",
	"tip",
	"tips",
	"summary",
	"time",
	"date",
	"address",
	"phone",
	"email",
	"headings",
	"topics",
	"warning",
	"remember",
	"rule",
	"result",
	"reason",
	"conclusion",
	"important",
	"first",
	"second",
	"third",
	"finally",
	"however",
	"now",
	"well",
	"yes",
	"no",
	"okay",
	"ok",
	"right",
	"sure",
	"also",
	"plus",
	"wait",
	"look",
	"listen",
	"here",
	"there",
	"today",
	"tomorrow",
	"yesterday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
	"caution",
	"hint",
	"notice",
	"total",
	"cost",
	"price",
	"fee",
	"name",
	"age",
	"postcode",
	"code",
	"number",
	"reference",
	"title",
	"topic",
	"subject",
	"location",
	"place",
	"venue",
	"hours",
	"open",
	"closed",
	"website",
	"contact",
	"tel",
	"fax",
	"ref",
	"step",
	"phase",
	"stage",
	"level",
	"band",
	"grade",
	"score",
	"point",
	"points",
	"item",
	"items",
	"option",
	"options",
	"choice",
	"choices",
	"type",
	"category",
	"class",
	"group",
	"list",
	"table",
	"chart",
	"map",
	"diagram",
	"figure",
	"fig",
	"page",
	"line",
	"track",
	"recording",
	"useful vocabulary",
	"vocabulary",
]);

const ABBREVIATIONS = new Set([
	"mr",
	"mrs",
	"ms",
	"dr",
	"prof",
	"st",
	"sr",
	"jr",
	"vs",
	"etc",
	"fig",
	"no",
	"inc",
	"ltd",
	"co",
	"jan",
	"feb",
	"mar",
	"apr",
	"jun",
	"jul",
	"aug",
	"sep",
	"sept",
	"oct",
	"nov",
	"dec",
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
	"sun",
	"dept",
	"approx",
	"est",
	"vol",
	"ed",
	"pp",
	"al",
]);

const DOTTED_ABBR_END_RE =
	/(?:^|[\s("“‘'])(?:e\.g|i\.e|u\.s|u\.k|u\.s\.a|ph\.d|a\.m|p\.m|b\.c|a\.d)$/i;
const DOMAIN_TLD_RE = /^(?:com|org|net|edu|gov|io|co|uk|vn|au|ca|nz|de|fr)\b/i;
const DISCOURSE_MARKER_RE =
	/^(?:["“‘']?\s*)?(?:first of all|firstly|secondly|thirdly|finally|however|moving on|now,|next,|for example|for instance|in addition|on the other hand|moreover|furthermore|so,|well,|right,|okay,|ok,|let['’]s (?:look|move|turn|talk|consider)|turning to|to conclude|in conclusion|to sum up|before we|before continuing|another\b|as for\b|meanwhile|in contrast|to begin with)\b/i;

function decodeStandardEntitiesOnce(text: string): string {
	return text.replace(SINGLE_PASS_ENTITY_RE, (match) => {
		const lower = match.toLowerCase();
		if (lower in ENTITY_DECODE_MAP) {
			return ENTITY_DECODE_MAP[lower] ?? match;
		}
		// Numeric apostrophe variants &#39;, &#039;, &#x27;
		return "'";
	});
}

/**
 * Classifies raw transcript content as rich HTML (must render through
 * `RichTextBody`'s single DOMPurify sink) or plain text (formatted via
 * `parseTranscript` and rendered as safe React text nodes).
 *
 * Flat Tiptap/legacy HTML containing strictly bare `<p>`/`<br>` tags with zero
 * attributes and zero other markup is extracted to plain text preserving line
 * and paragraph breaks. Plain text with HTML entities (e.g. `B&amp;B`) and no
 * HTML tags stays on the plain branch so newlines are never collapsed.
 */
export function classifyTranscriptInput(raw: string): TranscriptClassification {
	if (!raw.includes("<")) {
		return { kind: "plain", text: raw };
	}

	if (DANGEROUS_OR_HEAD_TAG_RE.test(raw)) {
		return { kind: "html" };
	}

	if (!raw.includes(">")) {
		return { kind: "plain", text: raw };
	}

	if (FLAT_P_BR_PRESENT_RE.test(raw)) {
		const withoutFlatTags = raw.replace(FLAT_P_BR_STRIP_RE, "");
		if (!withoutFlatTags.includes("<") && !withoutFlatTags.includes(">")) {
			// If flat HTML contains unknown entities outside our single-pass decode table,
			// delegate to RichTextBody so the browser decodes them faithfully.
			const withoutKnownEntities = withoutFlatTags.replace(
				SINGLE_PASS_ENTITY_RE,
				"",
			);
			if (UNKNOWN_HTML_ENTITY_RE.test(withoutKnownEntities)) {
				return { kind: "html" };
			}
			const extracted = decodeStandardEntitiesOnce(
				raw
					.replace(/<br\s*\/?>/gi, "\n")
					.replace(/<\/p>\s*<p>/gi, "\n\n")
					.replace(/<\/?p>/gi, "\n")
					.replace(/\r\n?/g, "\n")
					.replace(/\n{3,}/g, "\n\n")
					.trim(),
			);
			return { kind: "plain", text: extracted };
		}
	}

	if (
		(OPENING_HTML_TAG_RE.test(raw) && CLOSING_HTML_TAG_RE.test(raw)) ||
		VOID_HTML_TAG_RE.test(raw) ||
		STRUCTURAL_HTML_TAG_RE.test(raw)
	) {
		return { kind: "html" };
	}

	return { kind: "plain", text: raw };
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSpeakerLabel(label: string): string {
	const collapsed = label.trim().replace(/\s+/g, " ");
	const spMatch = SPEAKER_ID_RE.exec(collapsed);
	if (spMatch) {
		return `Speaker ${spMatch[1]}`;
	}
	return collapsed;
}

function isValidSpeakerLabel(
	rawLabel: string,
	options?: {
		allowLowercase?: boolean;
		allowSingleChar?: boolean;
		alreadyNormalized?: boolean;
	},
): boolean {
	const label = options?.alreadyNormalized
		? rawLabel
		: normalizeSpeakerLabel(rawLabel);
	if (label.length === 0 || label.length > MAX_SPEAKER_LABEL_LEN) {
		return false;
	}
	if (label.startsWith("(")) {
		return false;
	}
	if (!ALLOWED_SPEAKER_CHARS_RE.test(label)) {
		return false;
	}
	if (POS_PAREN_RE.test(label)) {
		return false;
	}
	if (!options?.alreadyNormalized && SPEAKER_ID_RE.test(label)) {
		return true;
	}
	// Reject digits in any non-"Speaker N" label (blocks Step 1, Phase 2, 09:30).
	if (/\d/.test(label)) {
		return false;
	}
	if (BLOCKED_SPEAKER_LABELS.has(label.toLowerCase())) {
		return false;
	}

	// Validate optional trailing balanced "(Name)" and disallow any other parens.
	let base = label;
	if (label.includes("(") || label.includes(")")) {
		const parenMatch = TRAILING_PAREN_RE.exec(label);
		if (!parenMatch) {
			return false;
		}
		const parenInner = (parenMatch[1] ?? "").trim();
		if (!parenInner || !UPPERCASE_START_RE.test(parenInner)) {
			return false;
		}
		base = label.slice(0, parenMatch.index).trim();
		if (!base || base.includes("(") || base.includes(")")) {
			return false;
		}
	}

	if (BLOCKED_SPEAKER_LABELS.has(base.toLowerCase())) {
		return false;
	}

	if (base.length === 1) {
		return Boolean(options?.allowSingleChar && /^[A-Z]$/.test(base));
	}

	if (!options?.allowLowercase && !UPPERCASE_START_RE.test(base)) {
		return false;
	}

	const words = base.split(" ");
	if (words.length < 1 || words.length > 4) {
		return false;
	}

	for (const word of words) {
		if (word.includes(".")) {
			if (!TITLE_WORD_RE.test(word) && !GLUED_TITLE_WORD_RE.test(word)) {
				return false;
			}
		}
	}

	return true;
}

interface ParsedLine {
	rawSpeakerId: string | null;
	leadingRole: string | null;
	body: string;
	hadBlankLineBefore: boolean;
	inGlossary: boolean;
}

function extractLeadingLineParts(
	line: string,
	allowSingleChar: boolean,
): {
	rawSpeakerId: string | null;
	leadingRole: string | null;
	body: string;
} {
	let rest = line;
	let rawSpeakerId: string | null = null;

	const spMatch = LEADING_SPEAKER_ID_RE.exec(rest);
	if (spMatch) {
		rawSpeakerId = `Speaker ${spMatch[1]}`;
		rest = rest.slice(spMatch[0].length).trimStart();
	}

	let leadingRole: string | null = null;
	// Strictly match leading role at index 0 followed by `:` + space or EOL.
	const roleMatch = /^([^:\n]{1,45}?)\s*:(?:\s+|$)/.exec(rest);
	if (roleMatch) {
		const candidate = normalizeSpeakerLabel(roleMatch[1] ?? "");
		if (
			!SPEAKER_ID_RE.test(candidate) &&
			isValidSpeakerLabel(candidate, {
				allowSingleChar,
				alreadyNormalized: true,
			})
		) {
			leadingRole = candidate;
			rest = rest.slice(roleMatch[0].length).trimStart();
		}
	}

	return { rawSpeakerId, leadingRole, body: rest };
}

function preprocessLines(normalized: string): ParsedLine[] {
	const rawLines = normalized.split("\n");

	// Pre-scan for standalone capitalized speaker header lines (e.g. `LISA:`, `Lectuerer:`)
	// so lowercase standalone headers like `joe:` in b38 are recognized only in files
	// that genuinely use standalone speaker headers.
	const standaloneCapitalized = new Map<string, string>();
	let standaloneHeaderCount = 0;
	for (const rawLine of rawLines) {
		const trimmed = rawLine.trim();
		if (!trimmed.endsWith(":") || USEFUL_VOCAB_HEADING_RE.test(trimmed)) {
			continue;
		}
		const m = /^([^:\n]{1,45}?)\s*:$/.exec(trimmed);
		if (!m) continue;
		const candidate = normalizeSpeakerLabel(m[1] ?? "");
		if (
			!SPEAKER_ID_RE.test(candidate) &&
			isValidSpeakerLabel(candidate, {
				allowSingleChar: false,
				alreadyNormalized: true,
			})
		) {
			standaloneHeaderCount += 1;
			const lower = candidate.toLowerCase();
			if (!standaloneCapitalized.has(lower)) {
				standaloneCapitalized.set(lower, candidate);
			}
		}
	}

	const result: ParsedLine[] = [];
	let pendingSpeaker: string | null = null;
	let sawBlankSinceLastContent = false;
	let inGlossary = false;

	for (const rawLine of rawLines) {
		const trimmed = rawLine.trim();
		if (trimmed.length === 0) {
			sawBlankSinceLastContent = true;
			continue;
		}

		if (USEFUL_VOCAB_HEADING_RE.test(trimmed)) {
			inGlossary = true;
			pendingSpeaker = null;
			result.push({
				rawSpeakerId: null,
				leadingRole: null,
				body: trimmed,
				hadBlankLineBefore: sawBlankSinceLastContent,
				inGlossary: true,
			});
			sawBlankSinceLastContent = false;
			continue;
		}

		if (inGlossary) {
			result.push({
				rawSpeakerId: null,
				leadingRole: null,
				body: trimmed,
				hadBlankLineBefore: sawBlankSinceLastContent,
				inGlossary: true,
			});
			sawBlankSinceLastContent = false;
			continue;
		}

		// Check if line is a standalone speaker header (e.g., `LISA:`, `joe:`, `Lectuerer:`)
		const standaloneMatch = trimmed.endsWith(":")
			? /^([^:\n]{1,45}?)\s*:$/.exec(trimmed)
			: null;
		if (standaloneMatch) {
			const rawCandidate = normalizeSpeakerLabel(standaloneMatch[1] ?? "");
			const isLowercaseName =
				standaloneHeaderCount > 0 && /^[a-z]{2,20}$/.test(rawCandidate);
			if (
				!SPEAKER_ID_RE.test(rawCandidate) &&
				isValidSpeakerLabel(rawCandidate, {
					allowLowercase: isLowercaseName,
					allowSingleChar: false,
					alreadyNormalized: true,
				})
			) {
				pendingSpeaker =
					standaloneCapitalized.get(rawCandidate.toLowerCase()) ?? rawCandidate;
				sawBlankSinceLastContent = false;
				continue;
			}
		}

		const extracted = extractLeadingLineParts(trimmed, true);

		if (pendingSpeaker !== null) {
			if (extracted.leadingRole === null) {
				// Merge pending standalone header with next line (including bare `Speaker N:` lines)
				if (extracted.body.length > 0) {
					result.push({
						rawSpeakerId: extracted.rawSpeakerId,
						leadingRole: pendingSpeaker,
						body: extracted.body,
						hadBlankLineBefore: false,
						inGlossary: false,
					});
					pendingSpeaker = null;
					sawBlankSinceLastContent = false;
					continue;
				}
			}
			pendingSpeaker = null;
		}

		if (extracted.body.length === 0) {
			// Skip bare label-only line (e.g. dangling `Speaker 1: Agent:`);
			// overall non-empty fallback handles transcripts that are ONLY labels.
			sawBlankSinceLastContent = false;
			continue;
		}

		result.push({
			rawSpeakerId: extracted.rawSpeakerId,
			leadingRole: extracted.leadingRole,
			body: extracted.body,
			hadBlankLineBefore: sawBlankSinceLastContent,
			inGlossary: false,
		});
		sawBlankSinceLastContent = false;
	}

	return result;
}

function isPrecededByTitleDot(text: string, boundaryEndIndex: number): boolean {
	// Walk backward past optional whitespace and closing quotes/brackets to check if the
	// punctuation character is `.` immediately preceded by a title abbreviation (`Mr.`, `Dr.`, etc.).
	let idx = boundaryEndIndex - 1;
	while (idx >= 0 && /\s/.test(text[idx] ?? "")) idx -= 1;
	while (idx >= 0 && /["”’)\]}]/.test(text[idx] ?? "")) idx -= 1;
	if (idx < 0 || text[idx] !== ".") return false;
	const beforeDot = text.slice(Math.max(0, idx - 12), idx);
	return TITLE_BEFORE_DOT_RE.test(beforeDot);
}

function discoverInlineSpeakers(
	lines: readonly ParsedLine[],
	lineStartCounts: ReadonlyMap<string, number>,
): { discovered: Set<string>; variantsByLower: Map<string, Set<string>> } {
	const counts = new Map<string, number>();
	const canonicalByLower = new Map<string, string>();
	const variantsByLower = new Map<string, Set<string>>();

	const recordVariant = (lower: string, variant: string) => {
		let set = variantsByLower.get(lower);
		if (!set) {
			set = new Set<string>();
			variantsByLower.set(lower, set);
		}
		set.add(variant);
	};

	for (const [label, n] of lineStartCounts) {
		const lower = label.toLowerCase();
		counts.set(lower, (counts.get(lower) ?? 0) + n);
		if (!canonicalByLower.has(lower)) {
			canonicalByLower.set(lower, label);
		}
		recordVariant(lower, label);
	}

	// Pattern 1 (with whitespace after sentence boundary): 1–3 word Title-Case / ALL-CAPS / title-prefixed (Unicode-safe; allows lowercase subsequent words like `Học viên` / `Tax officer`)
	const spacedRe =
		/(?:^|[.!?…]["”’)\]}]*(?:\s?\]?\[\d+\]\})?\s+)((?:(?:Dr|Mr|Mrs|Ms|Prof|St)\.\s*)?\p{Lu}[\p{L}'\u2019-]*(?:\s+[\p{L}'\u2019-]+){0,2}(?:\s*\(\p{Lu}[\p{L}'\u2019-]{1,20}\))?)\s*:(?=\s)/gu;

	// Pattern 2 (missing whitespace after sentence boundary): strict short ALL-CAPS, Title-Case single word, or Title+Name (Unicode-safe)
	const tightRe =
		/[.!?…]["”’)\]}]*(?:\s?\]?\[\d+\]\})?((?:(?:Dr|Mr|Mrs|Ms|Prof|St)\.\s*\p{Lu}\p{L}{1,20})|\p{Lu}{2,20}|\p{Lu}\p{Ll}{1,20})\s*:(?=\s|$)/gu;

	const record = (
		rawCandidate: string,
		line: string,
		matchStart: number,
		labelOffset: number,
	) => {
		if (matchStart > 0 && isPrecededByTitleDot(line, labelOffset)) {
			return;
		}
		const candidate = normalizeSpeakerLabel(rawCandidate);
		if (
			SPEAKER_ID_RE.test(candidate) ||
			!isValidSpeakerLabel(candidate, {
				allowSingleChar: false,
				alreadyNormalized: true,
			})
		) {
			return;
		}
		const lower = candidate.toLowerCase();
		counts.set(lower, (counts.get(lower) ?? 0) + 1);
		if (!canonicalByLower.has(lower)) {
			canonicalByLower.set(lower, candidate);
		}
		recordVariant(lower, candidate);
	};

	for (const line of lines) {
		if (line.inGlossary) continue;
		const body = line.body;

		spacedRe.lastIndex = 0;
		for (let m = spacedRe.exec(body); m !== null; m = spacedRe.exec(body)) {
			const label = m[1] ?? "";
			const labelOffset = m.index + m[0].indexOf(label);
			record(label, body, m.index, labelOffset);
		}

		tightRe.lastIndex = 0;
		for (let m = tightRe.exec(body); m !== null; m = tightRe.exec(body)) {
			const label = m[1] ?? "";
			const labelOffset = m.index + m[0].indexOf(label);
			record(label, body, m.index, labelOffset);
		}
	}

	const discovered = new Set<string>();
	for (const [lower, n] of counts) {
		if (n >= 2) {
			const canonical = canonicalByLower.get(lower);
			if (canonical) {
				discovered.add(canonical);
			}
		}
	}
	return { discovered, variantsByLower };
}

function buildRosterInlineRegex(
	roster: ReadonlySet<string>,
	variantsByLower?: ReadonlyMap<string, ReadonlySet<string>>,
): RegExp {
	const allLiterals = new Set<string>();
	for (const label of roster) {
		allLiterals.add(label);
		const variants = variantsByLower?.get(label.toLowerCase());
		if (variants) {
			for (const v of variants) {
				allLiterals.add(v);
			}
		}
	}
	const sorted = [...allLiterals].sort((a, b) => b.length - a.length);
	const patterns = sorted.map((label) => {
		// Allow flexible space after title dots (`Dr. Twain` matches `Dr.Twain`)
		return escapeRegex(label).replace(/\\\.\s*/g, "\\.\\s*");
	});
	patterns.push("[Ss](?:peaker|PEAKER)\\s+\\d+");
	return new RegExp(
		`(^|[.!?…]["”’)\\]}]*(?:\\s?\\]?\\[\\d+\\]\\})?\\s*)(${patterns.join("|")})\\s*:\\s*`,
		"g",
	);
}

function isSentenceEndDot(text: string, dotIndex: number): boolean {
	// Skip dots inside an ellipsis run (`...`) except the final dot
	if (text[dotIndex + 1] === ".") return false;

	// Skip decimals (`3.5`)
	const prevChar = dotIndex > 0 ? (text[dotIndex - 1] ?? "") : "";
	const nextChar = text[dotIndex + 1] ?? "";
	if (/\d/.test(prevChar) && /\d/.test(nextChar)) return false;

	// Skip domain names (`example.com`)
	if (DOMAIN_TLD_RE.test(text.slice(dotIndex + 1, dotIndex + 10))) {
		return false;
	}

	// Skip dotted abbreviations (`e.g.`, `U.S.`, `Ph.D.`, `a.m.`)
	const prefix = text.slice(Math.max(0, dotIndex - 16), dotIndex);
	if (DOTTED_ABBR_END_RE.test(prefix)) {
		return false;
	}

	// Skip common word abbreviations (`Mr.`, `Dr.`, `Prof.`, `etc.`)
	const wordMatch = /(?:^|[\s("“‘'])([A-Za-z]+)$/.exec(prefix);
	if (wordMatch) {
		const word = wordMatch[1] ?? "";
		if (ABBREVIATIONS.has(word.toLowerCase())) {
			return false;
		}
		// Single-letter initial (`J. K. Rowling`)
		if (word.length === 1) {
			return false;
		}
	}

	return true;
}

function tokenizeSentences(text: string): string[] {
	const sentences: string[] = [];
	let start = 0;
	const len = text.length;

	for (let i = 0; i < len; i += 1) {
		const ch = text[i];
		if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") {
			continue;
		}
		if (ch === "." && !isSentenceEndDot(text, i)) {
			continue;
		}

		let end = i + 1;
		while (end < len && /["”’)\]]/.test(text[end] ?? "")) {
			end += 1;
		}

		if (end >= len) {
			const tail = text.slice(start, end).trim();
			if (tail) sentences.push(tail);
			start = len;
			break;
		}

		// Case A: whitespace after sentence end followed by uppercase, quote+uppercase, or digit
		let wsEnd = end;
		while (wsEnd < len && /\s/.test(text[wsEnd] ?? "")) {
			wsEnd += 1;
		}
		if (wsEnd > end) {
			let look = wsEnd;
			while (look < len && /["“‘'(]/.test(text[look] ?? "")) {
				look += 1;
			}
			const nextStart = text[look] ?? "";
			if (/[\p{Lu}\d]/u.test(nextStart)) {
				const slice = text.slice(start, end).trim();
				if (slice) sentences.push(slice);
				start = wsEnd;
				i = wsEnd - 1;
			}
			continue;
		}

		// Case B: missing space between lowercase end and Capitalized word (`.Many`, `.Puffins`)
		const beforePunct = i > 0 ? (text[i - 1] ?? "") : "";
		const afterPunct = text.slice(end, end + 2);
		if (/[a-z"”’)]/.test(beforePunct) && /^[A-Z][a-z]/.test(afterPunct)) {
			const slice = text.slice(start, end).trim();
			if (slice) sentences.push(slice);
			start = end;
			i = end - 1;
		}
	}

	if (start < len) {
		const remainder = text.slice(start).trim();
		if (remainder) sentences.push(remainder);
	}

	return sentences;
}

/**
 * Splits an overly long unbroken paragraph (> 550 chars and >= 5 sentences) into
 * readable ~3–4 sentence paragraphs while preserving abbreviations, decimals,
 * domains, and lowercase quote continuations verbatim.
 */
export function splitMonologueParagraphs(text: string): string[] {
	const trimmed = text.trim();
	if (trimmed.length <= MONOLOGUE_SPLIT_MIN_CHARS) {
		return trimmed ? [trimmed] : [];
	}

	const sentences = tokenizeSentences(trimmed);
	if (sentences.length < MONOLOGUE_SPLIT_MIN_SENTENCES) {
		return [trimmed];
	}

	const groups: string[][] = [];
	let current: string[] = [];
	let currentLen = 0;

	for (const sentence of sentences) {
		const startsDiscourse = DISCOURSE_MARKER_RE.test(sentence);
		const shouldBreakBefore =
			current.length > 0 &&
			((startsDiscourse && (current.length >= 2 || currentLen >= 220)) ||
				(current.length >= 4 && currentLen >= 320) ||
				(current.length >= 3 && currentLen >= 450) ||
				currentLen >= 580);

		if (shouldBreakBefore) {
			groups.push(current);
			current = [sentence];
			currentLen = sentence.length;
		} else {
			current.push(sentence);
			currentLen += (current.length > 1 ? 1 : 0) + sentence.length;
		}
	}
	if (current.length > 0) {
		groups.push(current);
	}

	// Merge a trailing 1-sentence orphan into the previous group ONLY when
	// there are > 2 groups (never collapsing a 2-paragraph split back into 1 block).
	if (groups.length > 2) {
		const last = groups[groups.length - 1];
		const prev = groups[groups.length - 2];
		if (last && prev && last.length === 1) {
			const prevLen = prev.join(" ").length;
			if (prevLen <= 750) {
				prev.push(...last);
				groups.pop();
			}
		}
	}

	return groups.map((group) => group.join(" "));
}

/**
 * Parses a plain-text listening transcript into ordered speaker turns and
 * readable paragraphs. Lossless for all non-speaker-prefix content.
 */
export function parseTranscript(raw: string): TranscriptTurn[] {
	const normalized = raw
		.replace(/\r\n?/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	if (normalized.length === 0) {
		return [];
	}

	const lines = preprocessLines(normalized);
	if (lines.length === 0) {
		return [{ speaker: null, paragraphs: [normalized] }];
	}

	// Pass 2: Build speaker roster & unambiguous Speaker N -> Role alias map
	const spToRoles = new Map<string, Set<string>>();
	const lineStartCounts = new Map<string, number>();
	const canonicalByLower = new Map<string, string>();

	const rememberCanonical = (label: string): string => {
		const lower = label.includes(".")
			? label.toLowerCase().replace(/\.\s*/g, ".")
			: label.toLowerCase();
		const existing = canonicalByLower.get(lower);
		if (existing) return existing;
		canonicalByLower.set(lower, label);
		return label;
	};

	for (const line of lines) {
		if (line.inGlossary) continue;
		if (line.leadingRole) {
			const canonical = rememberCanonical(line.leadingRole);
			lineStartCounts.set(canonical, (lineStartCounts.get(canonical) ?? 0) + 1);
			if (line.rawSpeakerId) {
				let roles = spToRoles.get(line.rawSpeakerId);
				if (!roles) {
					roles = new Set<string>();
					spToRoles.set(line.rawSpeakerId, roles);
				}
				roles.add(canonical);
			}
		}
	}

	const unambiguousAlias = new Map<string, string>();
	for (const [spId, roles] of spToRoles) {
		if (roles.size === 1) {
			const sole = roles.values().next().value;
			if (sole) {
				unambiguousAlias.set(spId, sole);
			}
		}
	}

	const confirmedRoster = new Set<string>(lineStartCounts.keys());
	let variantsByLower: Map<string, Set<string>> | undefined;
	if (
		normalized.length <= MAX_INLINE_PARSE_LENGTH &&
		lineStartCounts.size < MAX_INLINE_ROSTER_SIZE
	) {
		const discovery = discoverInlineSpeakers(lines, lineStartCounts);
		variantsByLower = discovery.variantsByLower;
		for (const label of discovery.discovered) {
			confirmedRoster.add(rememberCanonical(label));
		}
	}

	const resolveSpeaker = (label: string | null): string | null => {
		if (!label) return null;
		const norm = normalizeSpeakerLabel(label);
		if (SPEAKER_ID_RE.test(norm)) {
			return unambiguousAlias.get(norm) ?? norm;
		}
		return rememberCanonical(norm);
	};

	// Pass 3: Bounded inline speaker splitting (runs for named rosters AND bare Speaker N: dialogues)
	const hasSpeakerIds = lines.some(
		(l) =>
			!l.inGlossary &&
			(l.rawSpeakerId !== null || /\bSpeaker\s+\d+\s*:/i.test(l.body)),
	);
	const canInlineSplit =
		confirmedRoster.size <= MAX_INLINE_ROSTER_SIZE &&
		normalized.length <= MAX_INLINE_PARSE_LENGTH &&
		(confirmedRoster.size > 0 || hasSpeakerIds);
	const inlineRe = canInlineSplit
		? buildRosterInlineRegex(confirmedRoster, variantsByLower)
		: null;

	const rawSegments: Array<{ speaker: string | null; text: string }> = [];
	let activeSpeaker: string | null = null;

	for (const line of lines) {
		if (line.inGlossary) {
			activeSpeaker = null;
			rawSegments.push({ speaker: null, text: line.body });
			continue;
		}

		const explicitSpeaker = line.leadingRole
			? resolveSpeaker(line.leadingRole)
			: line.rawSpeakerId
				? resolveSpeaker(line.rawSpeakerId)
				: null;

		if (line.hadBlankLineBefore && explicitSpeaker === null) {
			activeSpeaker = null;
		}

		const lineBaseSpeaker = explicitSpeaker ?? activeSpeaker;

		if (!inlineRe) {
			rawSegments.push({ speaker: lineBaseSpeaker, text: line.body });
			if (explicitSpeaker !== null) {
				activeSpeaker = explicitSpeaker;
			}
			continue;
		}

		inlineRe.lastIndex = 0;
		const matches: Array<{
			boundaryEnd: number;
			matchEnd: number;
			speaker: string;
			isSpeakerId: boolean;
		}> = [];

		for (
			let m = inlineRe.exec(line.body);
			m !== null;
			m = inlineRe.exec(line.body)
		) {
			const boundary = m[1] ?? "";
			const label = m[2] ?? "";
			const boundaryEnd = m.index + boundary.length;
			if (m.index > 0 && isPrecededByTitleDot(line.body, boundaryEnd)) {
				continue;
			}
			const normLabel = normalizeSpeakerLabel(label);
			const isSpeakerId = SPEAKER_ID_RE.test(normLabel);
			const resolved = resolveSpeaker(normLabel);
			if (!resolved) continue;
			matches.push({
				boundaryEnd,
				matchEnd: m.index + m[0].length,
				speaker: resolved,
				isSpeakerId,
			});
		}

		if (matches.length === 0) {
			rawSegments.push({ speaker: lineBaseSpeaker, text: line.body });
			if (explicitSpeaker !== null) {
				activeSpeaker = explicitSpeaker;
			}
			continue;
		}

		const first = matches[0];
		if (first && first.boundaryEnd > 0) {
			const leadText = line.body.slice(0, first.boundaryEnd).trim();
			if (leadText.length > 0) {
				rawSegments.push({ speaker: lineBaseSpeaker, text: leadText });
				if (explicitSpeaker !== null) {
					activeSpeaker = explicitSpeaker;
				}
			}
		}

		for (let i = 0; i < matches.length; i += 1) {
			const current = matches[i];
			if (!current) continue;
			const next = matches[i + 1];
			const end = next ? next.boundaryEnd : line.body.length;
			let segText = line.body.slice(current.matchEnd, end).trim();
			let segSpeaker = current.speaker;

			// Handle mid-line double prefix `Speaker N: Role: ...` without leaking `Role:` into text
			if (current.isSpeakerId && segText.length > 0) {
				const nested = extractLeadingLineParts(segText, false);
				if (nested.leadingRole !== null && nested.body.length > 0) {
					segSpeaker = resolveSpeaker(nested.leadingRole) ?? segSpeaker;
					segText = nested.body;
				}
			}

			if (segText.length > 0) {
				rawSegments.push({ speaker: segSpeaker, text: segText });
				activeSpeaker = segSpeaker;
			}
		}
	}

	// Pass 4: Merge consecutive turns with matching speaker & expand long monologues
	const turns: TranscriptTurn[] = [];
	for (const seg of rawSegments) {
		const trimmed = seg.text.trim();
		if (!trimmed) continue;
		const expanded = splitMonologueParagraphs(trimmed);
		const prev = turns[turns.length - 1];
		const sameSpeaker =
			prev !== undefined &&
			((prev.speaker === null && seg.speaker === null) ||
				(prev.speaker !== null &&
					seg.speaker !== null &&
					prev.speaker.toLowerCase() === seg.speaker.toLowerCase()));
		if (sameSpeaker && prev) {
			prev.paragraphs.push(...expanded);
		} else {
			turns.push({ speaker: seg.speaker, paragraphs: expanded });
		}
	}

	if (turns.length === 0) {
		return [{ speaker: null, paragraphs: [normalized] }];
	}

	// Suppress meaningless generic solo speaker labels (`SPEAKER`, `Speaker`, `Speaker 0/1`)
	const distinctSpeakers = new Set<string>();
	for (const turn of turns) {
		if (turn.speaker !== null) {
			distinctSpeakers.add(turn.speaker.toLowerCase());
		}
	}
	if (distinctSpeakers.size === 1) {
		const sole = distinctSpeakers.values().next().value;
		if (sole && GENERIC_SOLO_SPEAKER_RE.test(sole)) {
			const mergedParagraphs: string[] = [];
			for (const turn of turns) {
				mergedParagraphs.push(...turn.paragraphs);
			}
			return [{ speaker: null, paragraphs: mergedParagraphs }];
		}
	}

	return turns;
}
