import { isAssignmentImageUrl } from "@teacher-os/api/contracts";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { isValidPin, pointerToPercent } from "@/lib/image-pin";
import type { QuestionItem } from "./assignment-presets";

/**
 * Pin editor (phase-04 FR3) for the image-based pairs — reading `diagram` +
 * listening `map` (skill-qualified upstream). Click on the image places the
 * next pin (the first question without one, appending a fresh question at
 * the 40 cap); clicking an existing pin selects its question row so the
 * answer grid scrolls into context. Coordinates are percents of the rendered
 * box (`pointerToPercent`) — pins survive any viewport scale. A dead URL
 * falls back to plain key entry with a visible warning.
 */

/**
 * Student-facing pin overlay (phase-04 FR5) — numbered pins at their
 * percents beside a fill-in input. Shared by the student preview paper and
 * the bank-list aside so the snapshot round-trip is assertable in e2e.
 * Answers NEVER render here (input is empty + readOnly).
 */
export function PinOverlay({
	imageUrl,
	items,
	qStart,
	imageAlt = "Ảnh đề",
}: {
	imageUrl: string;
	items: QuestionItem[];
	qStart: number;
	imageAlt?: string;
}) {
	const pinned = items
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => isValidPin(item.pin));
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
							readOnly
							aria-label={`Điền đáp án câu ${number}`}
							className="w-16 rounded-sm border border-line border-b-2 bg-bg/90 px-1 font-mono text-[11px]"
						/>
					</span>
				);
			})}
		</div>
	);
}

export function PinEditor({
	imageUrl,
	items,
	qStart,
	selectedIndex,
	onItemsChange,
	onSelect,
}: {
	imageUrl: string;
	items: QuestionItem[];
	/** Real question number of row 0 (`qStartOf`) — pins show `qStart+i`. */
	qStart: number;
	selectedIndex: number | null;
	onItemsChange: (items: QuestionItem[]) => void;
	onSelect: (index: number) => void;
}) {
	const boxRef = useRef<HTMLDivElement | null>(null);
	const [broken, setBroken] = useState(false);
	const safeUrl = imageUrl.trim();
	const showImage =
		safeUrl.length > 0 && isAssignmentImageUrl(safeUrl) && !broken;

	const placePin = (clientX: number, clientY: number) => {
		const box = boxRef.current?.getBoundingClientRect();
		if (!box) return;
		const pin = pointerToPercent(
			{ left: box.left, top: box.top, width: box.width, height: box.height },
			clientX,
			clientY,
		);
		if (!pin) return;
		const pending = items.findIndex((item) => !isValidPin(item.pin));
		if (pending >= 0) {
			onItemsChange(
				items.map((item, index) =>
					index === pending ? { ...item, pin } : item,
				),
			);
			onSelect(pending);
			return;
		}
		if (items.length >= 40) return; // `questions.max(40)` — same gate as the grid.
		onItemsChange([
			...items,
			{ stem: "", opts: null, answer: "", alts: "", pin },
		]);
		onSelect(items.length);
	};

	return (
		<div className="flex flex-col gap-2">
			<p className="font-medium text-muted-fg text-xs">
				Bấm lên ảnh để đặt ghim cho câu kế tiếp — bấm ghim đã có để chọn câu đó
				trong lưới bên dưới.
			</p>
			{showImage ? (
				<div
					ref={boxRef}
					role="application"
					aria-label="Ảnh đề — bấm để đặt ghim nhãn"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: a click-to-pin surface is intentionally focusable — keyboard parity exists (Enter/Space pins the center, pins are reachable buttons)
					tabIndex={0}
					onClick={(event) => {
						if (!(event.target instanceof HTMLElement)) return;
						// A click on an existing pin selects it (its own handler);
						// only bare-image clicks place a new pin.
						if (event.target.closest("[data-pin]")) return;
						placePin(event.clientX, event.clientY);
					}}
					onKeyDown={(event) => {
						// Keyboard parity: Enter/Space pins the image CENTER — the
						// teacher then drags-free percents via a fresh click if the
						// spot needs adjusting.
						if (
							event.target !== event.currentTarget ||
							(event.key !== "Enter" && event.key !== " ")
						)
							return;
						event.preventDefault();
						const box = boxRef.current?.getBoundingClientRect();
						if (!box || box.width <= 0) return;
						placePin(box.left + box.width / 2, box.top + box.height / 2);
					}}
					className="relative w-fit max-w-full cursor-crosshair overflow-hidden rounded-md border border-line"
				>
					<img
						src={safeUrl}
						alt="Ảnh đề"
						className="block max-h-72 w-auto max-w-full"
						referrerPolicy="no-referrer"
						loading="lazy"
						onError={() => setBroken(true)}
					/>
					{items.map((item, index) =>
						isValidPin(item.pin) ? (
							<button
								type="button"
								key={index}
								data-pin
								aria-label={`Chọn câu ${qStart + index} tại ghim`}
								onClick={(event) => {
									event.stopPropagation();
									onSelect(index);
								}}
								style={{
									left: `${item.pin.x}%`,
									top: `${item.pin.y}%`,
								}}
								className={cn(
									"absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border font-medium font-mono text-[11px] shadow-sm transition-colors",
									selectedIndex === index
										? "border-fg bg-fg text-bg"
										: "border-fg bg-bg text-fg hover:bg-surface-warm",
								)}
							>
								{qStart + index}
							</button>
						) : null,
					)}
				</div>
			) : (
				<div
					role="status"
					className="rounded-md border border-danger/30 bg-surface p-2 text-danger text-xs"
				>
					{safeUrl
						? "Ảnh không tải được — kiểm tra lại link. Bạn vẫn nhập đáp án dạng text bên dưới."
						: "Dán link ảnh (https) để bắt đầu đặt ghim nhãn."}
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-muted-fg text-xs">
					{items.filter((item) => isValidPin(item.pin)).length}/{items.length}{" "}
					ghim đã đặt
				</span>
				{selectedIndex != null && isValidPin(items[selectedIndex]?.pin) && (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() =>
							onItemsChange(
								items.map((item, index) =>
									index === selectedIndex ? { ...item, pin: null } : item,
								),
							)
						}
					>
						Đặt lại ghim câu {qStart + (selectedIndex ?? 0)}
					</Button>
				)}
			</div>
		</div>
	);
}
