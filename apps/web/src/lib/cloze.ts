import type { QuestionItem } from "@/components/assignments/assignment-presets";

/**
 * Cloze + table-completion helpers (phase-03). The marker `____` (≥ 4
 * underscores) inside a question `stem` is a pure data convention — the
 * payload shape stays `{stem, opts, answer, alts}` and no contract field
 * changes. Marker semantics (FR7, red-team #14): exactly one marker is the
 * happy path, ZERO markers is valid (legacy prompts + tablecomp stems are
 * marker-exempt), TWO OR MORE is a per-row error. `countBlanks` is the one
 * shared counter for the composer validation AND both preview surfaces —
 * never re-implement the regex at a call site.
 */

/** Minimum blank form written into stems (also the display placeholder). */
export const CLOZE_MARKER = "____";
const CLOZE_MARKER_SOURCE = "_{4,}";
/** Matches one marker run anywhere in a stem. Stateless (no /g reuse). */
export const CLOZE_MARKER_PATTERN = new RegExp(CLOZE_MARKER_SOURCE);

/** `questions.max(40)` in `assignmentPromptCreateSchema` — sync-tested. */
export const CLOZE_MAX_BLANKS = 40;
/** `stem: z.string().trim().max(500)` in `assignmentPromptCreateSchema`. */
export const CLOZE_STEM_MAX = 500;
/** Non-functional cap: tokenize a full 20 000-char `passage` < 50 ms. */
export const CLOZE_TOKENIZE_PERF_CHARS = 20_000;
/** Render cap for the tokenized view — beyond this, hint "rút ngắn". */
export const CLOZE_RENDER_TOKEN_CAP = 5000;

/** The completion types that embed the click-to-blank editor. `shortans`
 * keeps the phase-01 plain text row; `tablecomp` gets the grid editor. */
export const CLOZE_EDITOR_TYPES: ReadonlySet<string> = new Set([
	"sent",
	"note",
	"summary",
	"flowchart",
	"form",
	"notes",
	"sent4",
	"flow",
]);
export const TABLECOMP_TYPE = "tablecomp";

/** Number of marker runs in `stem` (0 = legacy/verbatim, ≥ 2 = row error). */
export function countBlanks(stem: string): number {
	return stem.split(new RegExp(CLOZE_MARKER_SOURCE)).length - 1;
}

/**
 * Split `stem` at its FIRST marker → `[before, after]`. A markerless stem
 * passes through as `[stem, ""]` so legacy prompts render verbatim.
 */
export function splitStemByMarker(stem: string): [string, string] {
	const match = CLOZE_MARKER_PATTERN.exec(stem);
	if (!match) return [stem, ""];
	return [
		stem.slice(0, match.index),
		stem.slice(match.index + match[0].length),
	];
}

/** One segmented piece of the passage: `stem` carries exactly one marker. */
export interface ClozeSegment {
	stem: string;
	answer: string;
	alts: string;
}

/**
 * Parse the raw H5P-style syntax `*answer/alt1/alt2*` (FR1 raw mode).
 * `\*` is a literal asterisk both outside and inside a blank; an
 * UNTERMINATED `*` stays a literal (predictable over greedy). Blank content
 * splits on `/` — first part is the answer, the rest become `alts`
 * ("/"-separated, same convention as `QuestionItem.alts`). Segments split at
 * each blank; text after the last blank joins the last segment's stem.
 */
export function parseClozeRaw(text: string): ClozeSegment[] {
	const segments: ClozeSegment[] = [];
	let buffer = "";
	let index = 0;
	while (index < text.length) {
		const char = text[index];
		if (char === "\\" && text[index + 1] === "*") {
			buffer += "*";
			index += 2;
			continue;
		}
		if (char === "*") {
			let cursor = index + 1;
			let content = "";
			let closed = false;
			while (cursor < text.length) {
				if (text[cursor] === "\\" && text[cursor + 1] === "*") {
					content += "*";
					cursor += 2;
					continue;
				}
				if (text[cursor] === "*") {
					closed = true;
					break;
				}
				content += text[cursor];
				cursor += 1;
			}
			if (!closed) {
				// Unterminated: literal asterisk, keep scanning after it.
				buffer += "*";
				index += 1;
				continue;
			}
			const parts = content.split("/");
			const last = parts.length - 1;
			segments.push({
				stem: buffer + CLOZE_MARKER,
				answer: (parts[0] ?? "").trim(),
				alts: parts
					.slice(1, last + 1)
					.join("/")
					.trim(),
			});
			buffer = "";
			index = cursor + 1;
			continue;
		}
		buffer += char;
		index += 1;
	}
	if (segments.length === 0) return [];
	const lastSegment = segments[segments.length - 1];
	segments[segments.length - 1] = {
		...lastSegment,
		stem: lastSegment.stem + buffer,
	};
	return segments;
}

/** A visible word of the passage with its source offsets. */
export interface ClozeToken {
	text: string;
	start: number;
	end: number;
	index: number;
}

/**
 * Split on whitespace, keeping offsets so segments can slice the original
 * text (whitespace survives verbatim — FR "split bằng whitespace thuần").
 */
export function tokenizePassage(text: string): ClozeToken[] {
	const tokens: ClozeToken[] = [];
	for (const match of text.matchAll(/\S+/g)) {
		tokens.push({
			text: match[0],
			start: match.index,
			end: match.index + match[0].length,
			index: tokens.length,
		});
	}
	return tokens;
}

/** One teacher-made blank, kept in CLICK order (FR1). */
export interface ClozeBlankEntry {
	tokenIndex: number;
	answer: string;
	alts: string;
}

/** Toggle the blank on a token: add (clicked word becomes the answer) or remove. */
export function toggleClozeBlank(
	blanks: ClozeBlankEntry[],
	token: ClozeToken,
): ClozeBlankEntry[] {
	const existing = blanks.filter((blank) => blank.tokenIndex !== token.index);
	if (existing.length !== blanks.length) return existing;
	return [...blanks, { tokenIndex: token.index, answer: token.text, alts: "" }];
}

/**
 * Build segments from pasted text + clicked blanks (FR2). Segments are in
 * TEXT order — each item's `stem` is the gap before its blank plus the
 * marker, and the last segment also carries the trailing text, so the
 * preview renders `before [input] after` rows consecutively and reconstructs
 * the passage. Answers bind positionally even when the teacher clicked
 * out of order.
 */
export function buildClozeSegments(
	text: string,
	blanks: ClozeBlankEntry[],
): ClozeSegment[] {
	const tokens = tokenizePassage(text);
	const ordered = blanks
		.map((blank) => ({ blank, token: tokens[blank.tokenIndex] }))
		.filter((entry): entry is { blank: ClozeBlankEntry; token: ClozeToken } =>
			Boolean(entry.token),
		)
		.sort((a, b) => a.token.start - b.token.start);
	if (ordered.length === 0) return [];
	return ordered.map(({ blank, token }, position) => {
		const previous = position === 0 ? { end: 0 } : ordered[position - 1].token;
		const gap = text.slice(previous.end, token.start);
		const trailing =
			position === ordered.length - 1 ? text.slice(token.end) : "";
		return {
			stem: gap + CLOZE_MARKER + trailing,
			answer: blank.answer,
			alts: blank.alts,
		};
	});
}

/** Segments → existing wire shape (`opts: null` — text kinds have no options). */
export function segmentsToItems(segments: ClozeSegment[]): QuestionItem[] {
	return segments.map((segment) => ({
		stem: segment.stem,
		opts: null,
		answer: segment.answer.trim(),
		alts: segment.alts,
	}));
}

/**
 * Caps BEFORE writing items (FR2) — the server answers an over-cap body with
 * a field-less "invalid body", so the editor must never rely on it. Returns
 * one human-readable message per breached cap.
 */
export function clozeApplyIssues(segments: ClozeSegment[]): string[] {
	const issues: string[] = [];
	if (segments.length > CLOZE_MAX_BLANKS) {
		issues.push(
			`Tối đa ${CLOZE_MAX_BLANKS} chỗ trống cho một phần — đang có ${segments.length}. Bớt chỗ trống hoặc tách thành hai phần.`,
		);
	}
	segments.forEach((segment, index) => {
		if (segment.stem.trim().length > CLOZE_STEM_MAX) {
			issues.push(
				`Đoạn ${index + 1} vượt quá ${CLOZE_STEM_MAX} ký tự sau khi tách — thêm chỗ trống hoặc chia câu ngắn hơn.`,
			);
		}
	});
	return issues;
}

/* ------------------------------------------------------------------ */
/* tablecomp grid (FR4)                                                */
/* ------------------------------------------------------------------ */

/** The `[table] r{row} c{col}: <row title> / <col title>` stem prefix. */
export function buildTableStem(
	row: number,
	col: number,
	rowTitle: string,
	colTitle: string,
): string {
	return `[table] r${row} c${col}: ${rowTitle.trim()} / ${colTitle.trim()}`;
}

export interface TableStemRef {
	row: number;
	col: number;
	rowTitle: string;
	colTitle: string;
}

const TABLE_STEM_PATTERN = /^\[table\]\s*r(\d+)\s*c(\d+):\s*([^/]*)\/(.*)$/s;

/** Parse the prefix back for the preview's labeled rows (FR5). */
export function parseTableStem(stem: string): TableStemRef | null {
	const match = TABLE_STEM_PATTERN.exec(stem.trim());
	if (!match) return null;
	return {
		row: Number(match[1]),
		col: Number(match[2]),
		rowTitle: match[3].trim(),
		colTitle: match[4].trim(),
	};
}

export interface TableCellBlank {
	row: number;
	col: number;
	answer: string;
	alts: string;
}

export interface TableGridState {
	/** Column headers (top row of the grid). */
	colTitles: string[];
	/** Row labels (left column of the grid). */
	rowTitles: string[];
	/** Editable data cells, `[row][col]`. */
	cells: string[][];
	blanks: TableCellBlank[];
}

export function emptyTableGrid(rows = 2, cols = 2): TableGridState {
	return {
		colTitles: Array.from({ length: cols }, () => ""),
		rowTitles: Array.from({ length: rows }, () => ""),
		cells: Array.from({ length: rows }, () =>
			Array.from({ length: cols }, () => ""),
		),
		blanks: [],
	};
}

const hasBlankAt = (state: TableGridState, row: number, col: number) =>
	state.blanks.some((blank) => blank.row === row && blank.col === col);

/**
 * Click a cell to blank it (FR4): the content becomes the answer and the
 * cell clears; clicking a blanked cell restores the content; an empty cell
 * cannot be blanked (an empty answer can never grade).
 */
export function toggleTableCell(
	state: TableGridState,
	row: number,
	col: number,
): TableGridState {
	if (hasBlankAt(state, row, col)) {
		const blank = state.blanks.find(
			(entry) => entry.row === row && entry.col === col,
		);
		return {
			...state,
			blanks: state.blanks.filter(
				(entry) => !(entry.row === row && entry.col === col),
			),
			cells: state.cells.map((cells, rowIndex) =>
				rowIndex === row
					? cells.map((value, colIndex) =>
							colIndex === col ? (blank?.answer ?? "") : value,
						)
					: cells,
			),
		};
	}
	const content = state.cells[row]?.[col] ?? "";
	if (!content.trim()) return state;
	return {
		...state,
		blanks: [...state.blanks, { row, col, answer: content, alts: "" }],
		cells: state.cells.map((cells, rowIndex) =>
			rowIndex === row
				? cells.map((value, colIndex) => (colIndex === col ? "" : value))
				: cells,
		),
	};
}

/** Edit a cell's text — blanked cells are owned by their blank entry. */
export function updateTableCell(
	state: TableGridState,
	row: number,
	col: number,
	value: string,
): TableGridState {
	if (hasBlankAt(state, row, col)) return state;
	return {
		...state,
		cells: state.cells.map((cells, rowIndex) =>
			rowIndex === row
				? cells.map((cell, colIndex) => (colIndex === col ? value : cell))
				: cells,
		),
	};
}

/** Edit a blank's answer / alts through the cell popover (FR3 parity). */
export function updateTableBlank(
	state: TableGridState,
	row: number,
	col: number,
	patch: Partial<Pick<TableCellBlank, "answer" | "alts">>,
): TableGridState {
	return {
		...state,
		blanks: state.blanks.map((blank) =>
			blank.row === row && blank.col === col ? { ...blank, ...patch } : blank,
		),
	};
}

function dropBlanksForRemovedRow(state: TableGridState, row: number) {
	return state.blanks
		.filter((blank) => blank.row !== row)
		.map((blank) =>
			blank.row > row ? { ...blank, row: blank.row - 1 } : blank,
		);
}

function dropBlanksForRemovedCol(state: TableGridState, col: number) {
	return state.blanks
		.filter((blank) => blank.col !== col)
		.map((blank) =>
			blank.col > col ? { ...blank, col: blank.col - 1 } : blank,
		);
}

export function addTableRow(state: TableGridState): TableGridState {
	const cols = state.colTitles.length;
	return {
		...state,
		rowTitles: [...state.rowTitles, ""],
		cells: [...state.cells, Array.from({ length: cols }, () => "")],
	};
}

export function removeTableRow(
	state: TableGridState,
	row: number,
): TableGridState {
	if (state.rowTitles.length <= 1) return state;
	return {
		...state,
		rowTitles: state.rowTitles.filter((_, index) => index !== row),
		cells: state.cells.filter((_, index) => index !== row),
		blanks: dropBlanksForRemovedRow(state, row),
	};
}

export function addTableCol(state: TableGridState): TableGridState {
	return {
		...state,
		colTitles: [...state.colTitles, ""],
		cells: state.cells.map((cells) => [...cells, ""]),
	};
}

export function removeTableCol(
	state: TableGridState,
	col: number,
): TableGridState {
	if (state.colTitles.length <= 1) return state;
	return {
		...state,
		colTitles: state.colTitles.filter((_, index) => index !== col),
		cells: state.cells.map((cells) =>
			cells.filter((_, index) => index !== col),
		),
		blanks: dropBlanksForRemovedCol(state, col),
	};
}

/** Grid → segments (FR4): one per blank, marker-EXEMPT `[table]` stems. */
export function tableSegments(state: TableGridState): ClozeSegment[] {
	return state.blanks.map((blank) => ({
		stem: buildTableStem(
			blank.row + 1,
			blank.col + 1,
			state.rowTitles[blank.row] ?? "",
			state.colTitles[blank.col] ?? "",
		),
		answer: blank.answer,
		alts: blank.alts,
	}));
}

/** Same caps as the cloze path, applied to the grid's blanks (FR2 parity). */
export function tableApplyIssues(state: TableGridState): string[] {
	const issues: string[] = [];
	if (state.blanks.length > CLOZE_MAX_BLANKS) {
		issues.push(
			`Tối đa ${CLOZE_MAX_BLANKS} ô trống cho một phần — đang có ${state.blanks.length}.`,
		);
	}
	tableSegments(state).forEach((segment, index) => {
		if (segment.stem.trim().length > CLOZE_STEM_MAX) {
			issues.push(
				`Câu ${index + 1} (nhãn bảng) vượt quá ${CLOZE_STEM_MAX} ký tự — rút ngắn tiêu đề hàng/cột.`,
			);
		}
	});
	return issues;
}
