import {
	type AssignmentQuestion,
	QUIZ_ANSWER_VALUE_MAX,
	type QuizVerdict,
} from "@teacher-os/api/contracts";
import { cn } from "@teacher-os/ui/lib/utils";

/**
 * Pin-validity guard — pins are percents of the image box, so only finite
 * `x`/`y` within the contract's 0–100 bounds may position a label (same rule
 * as web's editor-side `image-pin.ts`; kept private because that module also
 * owns the pointer math the editor needs).
 */
function isValidPin(pin: unknown): pin is { x: number; y: number } {
	if (!pin || typeof pin !== "object") return false;
	const { x, y } = pin as Record<string, unknown>;
	return (
		typeof x === "number" &&
		Number.isFinite(x) &&
		x >= 0 &&
		x <= 100 &&
		typeof y === "number" &&
		Number.isFinite(y) &&
		y >= 0 &&
		y <= 100
	);
}

/**
 * Ô pin tô theo verdict khi soi bài (undefined = take/preview, không đổi) —
 * cùng ngôn ngữ với cloze (issue #351).
 */
const VERDICT_PIN_CLASSES: Record<QuizVerdict, string> = {
	correct: "border-verdict-correct text-verdict-correct",
	wrong: "border-verdict-wrong text-verdict-wrong line-through",
	skipped: "border-dashed border-meta text-muted-fg",
};

/**
 * Student-facing pin overlay (phase-04 FR5) — numbered pins at their
 * percents beside a fill-in input. Shared by the teacher preview papers and
 * the bank-list aside so the snapshot round-trip is assertable in e2e; the
 * take screen reuses it with `answers`/`onAnswer`.
 *
 * Display-only by default: the input is empty + `readOnly` and answers NEVER
 * render here. Passing `onAnswer` switches each pin input to a controlled,
 * editable learner input wired through `answers` — preview callers pass
 * neither and are unaffected.
 */
export function PinOverlay({
	imageUrl,
	items,
	qStart,
	imageAlt = "Ảnh đề",
	answers,
	onAnswer,
	verdicts,
}: {
	imageUrl: string;
	items: AssignmentQuestion[];
	/** Real question number of row 0 (`qStartOf`) — pins show `qStart+i`. */
	qStart: number;
	imageAlt?: string;
	/** Learner answers keyed by the `items` array offset (take screen). */
	answers?: Record<number, string>;
	/** Take-screen edit callback for the pin input at `items` offset
	 * `index`. Its presence makes the pin inputs editable. */
	onAnswer?: (index: number, value: string) => void;
	/** Verdict theo offset `items` — chỉ review truyền; tô viền ô pin. */
	verdicts?: Record<number, QuizVerdict>;
}) {
	const pinned = items
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => isValidPin(item.pin));
	const interactive = onAnswer !== undefined;
	return (
		<div className="relative mt-3 w-fit max-w-full">
			<img
				src={imageUrl}
				alt={imageAlt}
				className="block max-h-72 w-auto max-w-full rounded-md border border-line"
				referrerPolicy="no-referrer"
				loading="lazy"
			/>
			{pinned.map(({ item, index }) => {
				const number = qStart + index;
				const verdict = verdicts?.[index];
				return (
					<span
						key={number}
						className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
						style={{
							left: `${item.pin?.x ?? 0}%`,
							top: `${item.pin?.y ?? 0}%`,
						}}
					>
						<span className="flex h-5 w-5 items-center justify-center rounded-full border border-fg bg-bg font-medium font-mono text-[10px]">
							{number}
						</span>
						<input
							readOnly={!interactive}
							// Cap bằng contract autosave (code-review F2).
							maxLength={QUIZ_ANSWER_VALUE_MAX}
							aria-label={`Điền đáp án câu ${number}`}
							// disabled:opacity-100 — fieldset review disabled không được
							// làm mờ màu verdict của ô pin (#351).
							className={cn(
								"w-16 rounded-sm border border-line border-b-2 bg-bg/90 px-1 font-mono text-[11px] disabled:opacity-100",
								verdict && VERDICT_PIN_CLASSES[verdict],
							)}
							value={interactive ? (answers?.[index] ?? "") : undefined}
							onChange={
								interactive
									? (event) => onAnswer?.(index, event.target.value)
									: undefined
							}
						/>
					</span>
				);
			})}
		</div>
	);
}
