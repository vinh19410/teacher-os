import { type KeyboardEvent, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Tab theo slot part (`Passage 1..3` / `Section 1..4`, phase 6) — luôn
 * render từ `ASSIGNMENT_TEST_PRESETS` nên số slot là config, không
 * hard-code. A11y: role=tablist/tab, phím mũi tên trái/phải + Home/End
 * di chuyển và chọn, chấm đỏ đánh part có thay đổi chưa lưu, nhãn «Trống»
 * cho slot chưa có dữ liệu.
 */

export function PartTabs({
	slots,
	active,
	dirtySlots,
	filledSlots,
	onSelect,
}: {
	slots: ReadonlyArray<{ part: string; label: string }>;
	active: string;
	/** Slot có thay đổi chưa lưu (khớp chấm cảnh báo ở form). */
	dirtySlots: ReadonlySet<string>;
	/** Slot đã có nội dung đã lưu. */
	filledSlots: ReadonlySet<string>;
	onSelect: (slot: string) => void;
}) {
	const tabRefs = useRef(new Map<string, HTMLButtonElement | null>());

	const moveFocus = (offset: number | "first" | "last") => {
		const index = slots.findIndex((slot) => slot.part === active);
		const next =
			offset === "first"
				? 0
				: offset === "last"
					? slots.length - 1
					: (index + offset + slots.length) % slots.length;
		const target = slots[next];
		if (!target) return;
		onSelect(target.part);
		tabRefs.current.get(target.part)?.focus();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		switch (event.key) {
			case "ArrowRight":
			case "ArrowDown":
				event.preventDefault();
				moveFocus(1);
				break;
			case "ArrowLeft":
			case "ArrowUp":
				event.preventDefault();
				moveFocus(-1);
				break;
			case "Home":
				event.preventDefault();
				moveFocus("first");
				break;
			case "End":
				event.preventDefault();
				moveFocus("last");
				break;
		}
	};

	return (
		<div
			role="tablist"
			aria-label="Các part của bộ đề"
			className="flex flex-wrap gap-1 border-b"
		>
			{slots.map((slot) => {
				const selected = slot.part === active;
				const dirty = dirtySlots.has(slot.part);
				const filled = filledSlots.has(slot.part);
				return (
					<button
						key={slot.part}
						ref={(node) => {
							tabRefs.current.set(slot.part, node);
						}}
						type="button"
						role="tab"
						id={`tab-${slot.part}`}
						aria-selected={selected}
						aria-controls={`panel-${slot.part}`}
						tabIndex={selected ? 0 : -1}
						onClick={() => onSelect(slot.part)}
						onKeyDown={handleKeyDown}
						className={cn(
							"-mb-px inline-flex items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-2 font-medium text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
							selected
								? "border-border bg-card text-foreground"
								: "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
						)}
					>
						{slot.label}
						{dirty && (
							<span
								role="img"
								aria-label="Có thay đổi chưa lưu"
								title="Có thay đổi chưa lưu"
								className="inline-block size-2 rounded-full bg-amber-500"
							/>
						)}
						{!filled && !dirty && (
							<span className="text-[11px] text-muted-foreground">(Trống)</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
