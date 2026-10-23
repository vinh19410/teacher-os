import { Button } from "@teacher-os/ui/components/web-kit/button";
import { Input, Textarea } from "@teacher-os/ui/components/web-kit/field";
import {
	buildClozeSegments,
	CLOZE_MAX_BLANKS,
	CLOZE_RENDER_TOKEN_CAP,
	type ClozeBlankEntry,
	type ClozeToken,
	clickClozeToken,
	clozeApplyIssues,
	parseClozeRaw,
	segmentsToItems,
	tokenizePassage,
} from "@teacher-os/ui/lib/cloze";
import { cn } from "@teacher-os/ui/lib/utils";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { QuestionItem } from "./assignment-presets";

/**
 * Cloze click-to-blank editor (phase-03 FR1–FR3) for the completion types.
 * Two modes:
 *  - Visual: paste text → gate into the token view → click words to toggle
 *    blanks (the clicked word becomes the answer) → "Áp vào câu hỏi" segments
 *    the passage into the existing `{stem, answer, alts}` items (no schema
 *    change — stems carry the `____` marker instead).
 *  - Raw: H5P-style `*answer/alt1/alt2*` syntax parsed live.
 *
 * Caps (segment ≤ 500 chars, blanks ≤ 40) block BEFORE writing items — the
 * server only answers a generic "invalid body" (FR2). Overwriting composed
 * items asks first (FR2); the confirm is hoisted out of state updaters
 * (red-team #8 pattern). All segment math lives in `@teacher-os/ui/lib/cloze`.
 */

const TRANSCRIPT_TYPES = new Set(["form", "notes", "sent4", "flow"]);

/** An item that applying would overwrite (any authored content). */
export function hasItemContent(item: QuestionItem): boolean {
	if (item.stem.trim() || item.answer.trim() || item.alts.trim()) return true;
	return (item.opts ?? []).some((option) => option.trim());
}

const TokenButton = memo(function TokenButton({
	token,
	blankNumber,
	onToggle,
}: {
	token: ClozeToken;
	/** 1-based position in TEXT order (= the question number students see);
	 * 0 when the word is not blanked. */
	blankNumber: number;
	onToggle: (token: ClozeToken) => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={blankNumber > 0}
			aria-label={
				blankNumber > 0
					? `Chỗ trống ${blankNumber}: ${token.text}`
					: `Chọn từ: ${token.text}`
			}
			onClick={() => onToggle(token)}
			className={cn(
				"rounded-sm px-[2px] text-left align-baseline",
				blankNumber > 0
					? "border-primary bg-primary font-medium text-primary-foreground"
					: "hover:border-primary hover:bg-card hover:outline",
			)}
		>
			{token.text}
			{blankNumber > 0 && (
				<sup className="ml-[1px] font-mono text-[10px]">{blankNumber}</sup>
			)}
		</button>
	);
});

export function ClozeEditor({
	typeId,
	items,
	onApply,
	initialMode = "visual",
	initialStage = "paste",
	initialSource = "",
	initialBlanks = [],
	initialActiveBlank = null,
}: {
	typeId: string;
	/** Current grid items — applying replaces them (with a confirm when composed). */
	items: QuestionItem[];
	onApply: (items: QuestionItem[]) => void;
	/** The initial* props are a test/restore seam; the editor owns its state. */
	initialMode?: "visual" | "raw";
	initialStage?: "paste" | "tokens";
	initialSource?: string;
	initialBlanks?: ClozeBlankEntry[];
	initialActiveBlank?: number | null;
}) {
	const [mode, setMode] = useState<"visual" | "raw">(initialMode);
	const [stage, setStage] = useState<"paste" | "tokens">(initialStage);
	const [source, setSource] = useState(initialSource);
	const [blanks, setBlanks] = useState<ClozeBlankEntry[]>(initialBlanks);
	const [activeBlank, setActiveBlank] = useState<number | null>(
		initialActiveBlank,
	);

	const isListening = TRANSCRIPT_TYPES.has(typeId);
	const tokens = useMemo(() => tokenizePassage(source), [source]);
	// Blank badges follow TEXT order so the number on a word always matches
	// the question number students see; click order stays in the array (FR1).
	const blankNumberByToken = useMemo(() => {
		const numbers = new Map<number, number>();
		const ordered = [...blanks]
			.map((blank) => ({ blank, token: tokens[blank.tokenIndex] }))
			.filter((entry) => entry.token)
			.sort((a, b) => a.token.start - b.token.start);
		ordered.forEach((entry, position) => {
			numbers.set(entry.token.index, position + 1);
		});
		return numbers;
	}, [blanks, tokens]);
	const visibleTokens = tokens.slice(0, CLOZE_RENDER_TOKEN_CAP);
	const overRenderCap = tokens.length > CLOZE_RENDER_TOKEN_CAP;

	const rawSegments = useMemo(
		() => (mode === "raw" ? parseClozeRaw(source) : []),
		[mode, source],
	);
	const visualSegments = useMemo(
		() =>
			mode === "visual" && stage === "tokens"
				? buildClozeSegments(source, blanks)
				: [],
		[mode, stage, source, blanks],
	);
	const segments = mode === "raw" ? rawSegments : visualSegments;
	const issues = clozeApplyIssues(segments);
	const canApply = segments.length > 0 && issues.length === 0;
	const willReplace = items.some(hasItemContent);

	// Ref keeps `handleToggle` identity stable so the memoized TokenButtons
	// don't all re-render on every toggle (non-functional requirement).
	const blanksRef = useRef(blanks);
	blanksRef.current = blanks;
	const handleToggle = useCallback((token: ClozeToken) => {
		const result = clickClozeToken(blanksRef.current, token);
		setBlanks(result.blanks);
		setActiveBlank(result.openBlank);
	}, []);
	const updateBlank = (tokenIndex: number, patch: Partial<ClozeBlankEntry>) => {
		setBlanks((current) =>
			current.map((blank) =>
				blank.tokenIndex === tokenIndex ? { ...blank, ...patch } : blank,
			),
		);
	};
	const removeBlank = (tokenIndex: number) => {
		setBlanks((current) =>
			current.filter((blank) => blank.tokenIndex !== tokenIndex),
		);
		setActiveBlank(null);
	};
	const enterTokenStage = () => {
		setBlanks([]);
		setActiveBlank(null);
		setStage("tokens");
	};
	const backToPaste = () => {
		if (
			blanks.length > 0 &&
			!window.confirm(
				`Sửa văn bản sẽ xóa ${blanks.length} chỗ trống đã chọn. Tiếp tục?`,
			)
		)
			return;
		setBlanks([]);
		setActiveBlank(null);
		setStage("paste");
	};
	const handleApply = () => {
		if (!canApply) return;
		if (
			willReplace &&
			!window.confirm(
				`Áp vào câu hỏi sẽ thay thế ${items.length} câu hiện có. Tiếp tục?`,
			)
		)
			return;
		onApply(segmentsToItems(segments, items));
	};
	const activeEntry = blanks.find((blank) => blank.tokenIndex === activeBlank);

	return (
		<div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="font-medium text-muted-foreground text-xs">
					Soạn đoạn hoàn thành — bấm vào từ để tạo chỗ trống
				</p>
				<div className="flex gap-1.5">
					<button
						type="button"
						aria-pressed={mode === "visual"}
						onClick={() => setMode("visual")}
						className={cn(
							"rounded-full border px-[10px] py-[4px] font-medium text-xs",
							mode === "visual"
								? "border-primary bg-primary text-primary-foreground"
								: "border-border text-muted-foreground hover:border-primary",
						)}
					>
						Bấm từ
					</button>
					<button
						type="button"
						aria-pressed={mode === "raw"}
						onClick={() => setMode("raw")}
						className={cn(
							"rounded-full border px-[10px] py-[4px] font-medium text-xs",
							mode === "raw"
								? "border-primary bg-primary text-primary-foreground"
								: "border-border text-muted-foreground hover:border-primary",
						)}
					>
						Cú pháp thô
					</button>
				</div>
			</div>

			{mode === "visual" && stage === "paste" && (
				<div className="flex flex-col gap-2">
					<Textarea
						value={source}
						aria-label="Dán đoạn văn bản"
						placeholder={
							isListening
								? "Dán transcript hoặc đoạn cần hoàn thành (tối đa 20.000 ký tự)…"
								: "Dán tóm tắt / ghi chú / câu cần hoàn thành (tối đa 20.000 ký tự)…"
						}
						onChange={(event) => {
							// Token indexes shift with any edit — stale blanks would
							// bind answers to the wrong words, so they reset here.
							setSource(event.target.value);
							setBlanks([]);
						}}
						className="min-h-32"
					/>
					<div>
						<Button
							type="button"
							size="sm"
							disabled={!source.trim()}
							onClick={enterTokenStage}
						>
							Chọn chỗ trống
						</Button>
					</div>
				</div>
			)}

			{mode === "visual" && stage === "tokens" && (
				<div className="flex flex-col gap-2">
					<p className="text-muted-foreground text-xs">
						Bấm một từ để tạo chỗ trống (đáp án tự lấy từ từ đó); bấm chỗ trống
						đã có để sửa đáp án / nhận thêm hoặc bỏ.
					</p>
					<fieldset
						aria-label="Văn bản dạng từ bấm được"
						className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm leading-[1.9]"
					>
						{visibleTokens.map((token, position) => (
							<span key={token.index}>
								<TokenButton
									token={token}
									blankNumber={blankNumberByToken.get(token.index) ?? 0}
									onToggle={handleToggle}
								/>
								{position < visibleTokens.length - 1
									? source.slice(token.end, tokens[position + 1].start)
									: ""}
							</span>
						))}
						{overRenderCap && (
							<p role="status" className="mt-2 text-destructive text-xs">
								Văn bản quá dài — chỉ hiện {CLOZE_RENDER_TOKEN_CAP} từ đầu. Hãy
								rút ngắn đoạn trước khi đánh dấu chỗ trống.
							</p>
						)}
					</fieldset>
					<p className="font-medium text-muted-foreground text-xs">
						{blanks.length}/{CLOZE_MAX_BLANKS} chỗ trống · Số câu sẽ tạo:{" "}
						{segments.length}
					</p>
				</div>
			)}

			{mode === "raw" && (
				<div className="flex flex-col gap-2">
					<Textarea
						value={source}
						aria-label="Văn bản cú pháp thô"
						placeholder={
							"Dán văn bản, bọc đáp án bằng dấu *: Rains refill the *well/stepwell* each year. Dấu \\* in chữ * thường."
						}
						onChange={(event) => {
							// Edits shift token indexes — stale blanks would silently
							// re-bind answers to the wrong words, so reset them and
							// drop back to the paste stage for the visual mode.
							setSource(event.target.value);
							setBlanks([]);
							setStage("paste");
						}}
						className="min-h-32 font-mono"
					/>
					<p className="font-medium text-muted-foreground text-xs">
						Tìm thấy {rawSegments.length} chỗ trống · Số câu sẽ tạo:{" "}
						{segments.length}
					</p>
					{rawSegments.length > 0 && (
						<ol className="flex flex-col gap-0.5">
							{rawSegments.map((segment, index) => (
								<li key={`${index}-${segment.answer}`} className="text-xs">
									<span className="font-mono">{index + 1}.</span>{" "}
									{segment.answer}
									{segment.alts && (
										<span className="text-muted-foreground">
											{" "}
											+ {segment.alts}
										</span>
									)}
								</li>
							))}
						</ol>
					)}
				</div>
			)}

			{activeEntry && mode === "visual" && (
				<div
					role="dialog"
					aria-label="Sửa chỗ trống"
					className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
				>
					<p className="font-medium text-muted-foreground text-xs">
						Chỗ trống {blankNumberByToken.get(activeEntry.tokenIndex) ?? "—"}
					</p>
					<Input
						value={activeEntry.answer}
						aria-label="Đáp án chỗ trống"
						maxLength={200}
						onChange={(event) =>
							updateBlank(activeEntry.tokenIndex, {
								answer: event.target.value,
							})
						}
					/>
					<Input
						value={activeEntry.alts}
						aria-label="Chấp nhận thêm cho chỗ trống, cách nhau bằng /"
						placeholder="Nhận thêm: alt1 / alt2"
						maxLength={500}
						onChange={(event) =>
							updateBlank(activeEntry.tokenIndex, { alts: event.target.value })
						}
					/>
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant="danger"
							onClick={() => removeBlank(activeEntry.tokenIndex)}
						>
							Bỏ chỗ trống
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setActiveBlank(null)}
						>
							Đóng
						</Button>
					</div>
				</div>
			)}

			{issues.map((issue) => (
				<p key={issue} role="alert" className="text-destructive text-xs">
					{issue}
				</p>
			))}

			{(mode === "raw" || stage === "tokens") && (
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						disabled={!canApply}
						onClick={handleApply}
					>
						Áp vào câu hỏi
					</Button>
					{mode === "visual" && stage === "tokens" && (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={backToPaste}
						>
							Sửa lại văn bản
						</Button>
					)}
					{willReplace && (
						<span className="text-[11px] text-muted-foreground">
							Áp vào câu hỏi sẽ thay thế {items.length} câu hiện có.
						</span>
					)}
				</div>
			)}
		</div>
	);
}
