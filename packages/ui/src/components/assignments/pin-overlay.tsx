import type { AssignmentQuestion } from "@teacher-os/api/contracts";

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
							aria-label={`Điền đáp án câu ${number}`}
							className="w-16 rounded-sm border border-line border-b-2 bg-bg/90 px-1 font-mono text-[11px]"
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
