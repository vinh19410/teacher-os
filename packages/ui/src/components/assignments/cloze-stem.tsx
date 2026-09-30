import {
	countBlanks,
	parseTableStem,
	splitStemByMarker,
	TABLECOMP_TYPE,
} from "@teacher-os/ui/lib/cloze";

/**
 * Shared student-facing stem renderer (phase-03 FR5). One implementation for
 * BOTH preview surfaces and the take screen — the marker regex lives only in
 * `@teacher-os/ui/lib/cloze` (`splitStemByMarker` / `countBlanks`), never
 * here.
 *
 *  - 1 marker → before-text + a sized blank input + after-text. Consecutive
 *    completion rows render in sequence and reconstruct the passage.
 *  - 0 markers → the stem verbatim (legacy prompts, FR7 backward compat).
 *  - tablecomp stems with the `[table] r{h} c{c}:` prefix → a labeled row
 *    "Hàng h — Cột c: <row> / <col>" plus the input (labeled list layout, no
 *    full grid reconstruction this phase).
 *
 * Two modes (RT#8 — take payloads carry NO answer key):
 *  - preview (teacher surfaces): `answer` sizes the blank
 *    (`max(trimmed.length, 2) + 4`ch). The key is used ONLY for that width —
 *    it must never leak into the student paper (the e2e leak-checks pin
 *    this).
 *  - interactive (take screen): pass `onChange` (+ `value`) to get a
 *    controlled, editable blank sized by the LEARNER value
 *    (`max(MIN_BLANK_WIDTH_CH, value.length + 2)`ch) — the answer key never
 *    sizes an interactive blank, so width is not a key-length oracle.
 */

/** Interactive width floor (ch) — equals the preview floor `max(len,2)+4`
 * so an empty learner blank sizes like the shortest preview blank. */
const MIN_BLANK_WIDTH_CH = 6;

function blankInput({
	widthCh,
	number,
	value,
	onChange,
}: {
	widthCh: number;
	number?: number;
	value?: string;
	onChange?: (value: string) => void;
}) {
	const ariaLabel =
		number === undefined ? "Chỗ điền đáp án" : `Điền đáp án câu ${number}`;
	const className =
		"mx-[2px] rounded-sm border-line border-b-2 bg-bg px-1 align-baseline font-mono text-sm";
	const style = { width: `${widthCh}ch` };
	if (onChange) {
		return (
			<input
				aria-label={ariaLabel}
				className={className}
				style={style}
				value={value ?? ""}
				onChange={(event) => onChange(event.target.value)}
			/>
		);
	}
	return (
		<input
			readOnly
			aria-label={ariaLabel}
			className={className}
			style={style}
		/>
	);
}

export function ClozeStemText({
	stem,
	answer,
	value,
	onChange,
	typeId,
	number,
}: {
	stem: string;
	/** Auto-grading key — preview-mode input width only, never rendered. */
	answer?: string;
	/** Learner's current answer (interactive mode). */
	value?: string;
	/** Interactive mode: report edits. Its presence switches the blank to an
	 * editable controlled input sized by `value`, never by `answer`. */
	onChange?: (value: string) => void;
	/** Type id when known — tablecomp stems get the labeled-row layout. */
	typeId?: string;
	number?: number;
}) {
	const interactive = onChange !== undefined;
	const widthCh = interactive
		? Math.max(MIN_BLANK_WIDTH_CH, (value ?? "").length + 2)
		: Math.max((answer ?? "").trim().length, 2) + 4;
	if (typeId === TABLECOMP_TYPE) {
		const ref = parseTableStem(stem);
		if (ref) {
			const titles =
				ref.rowTitle || ref.colTitle
					? ` ${ref.rowTitle} / ${ref.colTitle}`
					: "";
			return (
				<>
					<span>
						Hàng {ref.row} — Cột {ref.col}:{titles}
					</span>
					{blankInput({ widthCh, number, value, onChange })}
				</>
			);
		}
		// A hand-typed tablecomp stem: fall through to the marker layout.
	}
	if (countBlanks(stem) === 0) return <>{stem}</>;
	const [before, after] = splitStemByMarker(stem);
	return (
		<>
			{before}
			{blankInput({ widthCh, number, value, onChange })}
			{after}
		</>
	);
}
