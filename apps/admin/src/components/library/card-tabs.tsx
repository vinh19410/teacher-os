import { type KeyboardEvent, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Tab nhỏ dùng chung cho các thẻ (#424 Task 3.1) — tổng quát hóa pattern
 * `role=tablist/tab` + phím mũi tên/Home/End của tab part cũ (file bị
 * xóa ở phase 4). Badge đếm `aria-hidden` — accessible name chỉ là
 * `label`; tab có lỗi hiển thị chấm destructive cho người nhìn.
 */

export interface CardTab {
	id: string;
	label: string;
	/** Đếm hiển thị dạng badge mono (aria-hidden). */
	count?: number;
	/** Tab chứa field lỗi — chấm đỏ + sr-only "có lỗi". */
	hasError?: boolean;
}

/** Index tab tiếp theo theo phím mũi tên/Home/End (wrap vòng) — thuần,
 * tách ra để test không cần DOM tương tác. */
export function nextTabIndex(
	tabCount: number,
	currentIndex: number,
	move: 1 | -1 | "first" | "last",
): number {
	if (tabCount <= 0) return -1;
	if (move === "first") return 0;
	if (move === "last") return tabCount - 1;
	return (currentIndex + move + tabCount) % tabCount;
}

export function CardTabs({
	tabs,
	active,
	onSelect,
	idPrefix,
	size = "md",
	"aria-label": ariaLabel = "Các tab",
}: {
	tabs: readonly CardTab[];
	active: string;
	onSelect: (id: string) => void;
	/** Unique trong trang — tab/panel id suy ra từ đây. */
	idPrefix: string;
	size?: "md" | "sm";
	"aria-label"?: string;
}) {
	const tabRefs = useRef(new Map<string, HTMLButtonElement | null>());

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		const move =
			event.key === "ArrowRight" || event.key === "ArrowDown"
				? 1
				: event.key === "ArrowLeft" || event.key === "ArrowUp"
					? -1
					: event.key === "Home"
						? "first"
						: event.key === "End"
							? "last"
							: null;
		if (move === null) return;
		event.preventDefault();
		const index = tabs.findIndex((tab) => tab.id === active);
		const next = tabs[nextTabIndex(tabs.length, index, move)];
		if (!next) return;
		onSelect(next.id);
		tabRefs.current.get(next.id)?.focus();
	};

	return (
		<div
			role="tablist"
			aria-label={ariaLabel}
			className={cn(
				"flex flex-wrap gap-1 border-b",
				size === "sm" && "gap-0.5",
			)}
		>
			{tabs.map((tab) => {
				const selected = tab.id === active;
				return (
					<button
						key={tab.id}
						ref={(node) => {
							tabRefs.current.set(tab.id, node);
						}}
						type="button"
						role="tab"
						id={`${idPrefix}-tab-${tab.id}`}
						aria-selected={selected}
						aria-controls={`${idPrefix}-panel-${tab.id}`}
						tabIndex={selected ? 0 : -1}
						onClick={() => onSelect(tab.id)}
						onKeyDown={handleKeyDown}
						className={cn(
							"-mb-px inline-flex items-center gap-1.5 border-transparent border-b-2 font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
							size === "md" ? "px-3 py-2 text-sm" : "px-2 py-1 text-xs",
							selected && "border-primary border-b-2 text-foreground",
						)}
					>
						{tab.label}
						{tab.count !== undefined && (
							<span
								aria-hidden="true"
								className="rounded-sm bg-muted px-1 font-mono text-[10px] leading-4"
							>
								{tab.count}
							</span>
						)}
						{tab.hasError && !selected && (
							<span className="inline-flex items-center gap-1">
								<span
									aria-hidden="true"
									className="inline-block size-2 rounded-full bg-destructive"
								/>
								<span className="sr-only">có lỗi</span>
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
