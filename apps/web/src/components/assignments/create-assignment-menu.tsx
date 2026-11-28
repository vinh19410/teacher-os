import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export interface CreateAssignmentMenuProps {
	onCreateSingle: () => void;
	onCreateTest: () => void;
}

export function CreateAssignmentMenu({
	onCreateSingle,
	onCreateTest,
}: CreateAssignmentMenuProps) {
	const [open, setOpen] = useState(false);
	const menuId = useId();
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

	useEffect(() => {
		if (!open) return;
		itemRefs.current[0]?.focus();

		const onPointerDown = (ev: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(ev.target as Node)
			) {
				setOpen(false);
			}
		};
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key === "Escape") {
				ev.stopPropagation();
				setOpen(false);
				triggerRef.current?.focus();
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	function handleMenuKeyDown(ev: React.KeyboardEvent<HTMLDivElement>) {
		const items = itemRefs.current.filter(
			(el): el is HTMLButtonElement => el !== null,
		);
		if (items.length === 0) return;
		const idx = items.indexOf(document.activeElement as HTMLButtonElement);
		if (ev.key === "ArrowDown") {
			ev.preventDefault();
			items[(idx + 1) % items.length]?.focus();
		} else if (ev.key === "ArrowUp") {
			ev.preventDefault();
			items[(idx - 1 + items.length) % items.length]?.focus();
		}
	}

	return (
		<div ref={containerRef} className="relative inline-flex">
			<Button
				ref={triggerRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((v) => !v)}
			>
				<Plus aria-hidden="true" className="size-4" />
				<span>Tạo bài tập</span>
				<ChevronDown aria-hidden="true" className="size-4" />
			</Button>
			{open && (
				<div
					id={menuId}
					role="menu"
					aria-label="Chọn loại bài tập cần tạo"
					onKeyDown={handleMenuKeyDown}
					className="absolute top-[calc(100%+6px)] right-0 z-30 min-w-64 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
				>
					<button
						ref={(el) => {
							itemRefs.current[0] = el;
						}}
						type="button"
						role="menuitem"
						onClick={() => {
							setOpen(false);
							onCreateSingle();
						}}
						className="grid w-full gap-0.5 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<span className="font-medium text-foreground text-sm">Bài lẻ</span>
						<span className="text-muted-foreground text-xs">
							Một phần thi, một kỹ năng
						</span>
					</button>
					<button
						ref={(el) => {
							itemRefs.current[1] = el;
						}}
						type="button"
						role="menuitem"
						onClick={() => {
							setOpen(false);
							onCreateTest();
						}}
						className="grid w-full gap-0.5 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<span className="font-medium text-foreground text-sm">
							Đề thi nhiều phần
						</span>
						<span className="text-muted-foreground text-xs">
							Ghép nhiều phần thành bài kiểm tra
						</span>
					</button>
				</div>
			)}
		</div>
	);
}
