import {
	countBlanks,
	parseTableStem,
	splitStemByMarker,
	TABLECOMP_TYPE,
} from "@/lib/cloze";

/**
 * Shared student-facing stem renderer (phase-03 FR5). One implementation for
 * BOTH preview surfaces — the marker regex lives only in `@/lib/cloze`
 * (`splitStemByMarker` / `countBlanks`), never here.
 *
 *  - 1 marker → before-text + a sized blank input + after-text. Consecutive
 *    completion rows render in sequence and reconstruct the passage.
 *  - 0 markers → the stem verbatim (legacy prompts, FR7 backward compat).
 *  - tablecomp stems with the `[table] r{h} c{c}:` prefix → a labeled row
 *    "Hàng h — Cột c: <row> / <col>" plus the input (labeled list layout, no
 *    full grid reconstruction this phase).
 *
 * The answer is used ONLY for the input width — it must never leak into the
 * student paper (the e2e leak-checks pin this).
 */

function blankInput(answer: string, number?: number) {
	const width = Math.max(answer.trim().length, 2) + 4;
	return (
		<input
			readOnly
			aria-label={
				number === undefined ? "Chỗ điền đáp án" : `Điền đáp án câu ${number}`
			}
			className="mx-[2px] rounded-sm border-line border-b-2 bg-bg px-1 align-baseline font-mono text-sm"
			style={{ width: `${width}ch` }}
		/>
	);
}

export function ClozeStemText({
	stem,
	answer,
	typeId,
	number,
}: {
	stem: string;
	/** Auto-grading key — used for the input width only, never rendered. */
	answer: string;
	/** Type id when known — tablecomp stems get the labeled-row layout. */
	typeId?: string;
	number?: number;
}) {
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
					{blankInput(answer, number)}
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
			{blankInput(answer, number)}
			{after}
		</>
	);
}
