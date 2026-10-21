import { useNavigate } from "@tanstack/react-router";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@teacher-os/ui/components/command";
import type { LucideIcon } from "lucide-react";
import {
	ClipboardList,
	ReceiptText,
	School,
	Search,
	UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { MockData } from "@/lib/mock-data";
import {
	buildSearchIndex,
	queryIndex,
	type SearchIndex,
	type SearchItem,
	type SearchResultKind,
} from "./search-index";

/**
 * Command palette ⌘K (phase 8) — trigger "Tìm kiếm… ⌘K" trên topbar design v2
 * (ẩn dưới md, dưới md là nút icon) + dialog palette tìm lớp, học viên, bài
 * tập, hóa đơn và trang nav rồi điều hướng bằng router thật.
 *
 * Nguồn dữ liệu: snapshot kernel đã có ở client qua useData() — KHÔNG gọi API
 * mới; store chưa tải → trạng thái "Đang tải…" (CommandSearch nhận `null`).
 */

const KIND_ICONS: Record<SearchResultKind, LucideIcon> = {
	class: School,
	student: UserRound,
	assignment: ClipboardList,
	invoice: ReceiptText,
	nav: Search,
};

/** ⌘K trong palette (input của palette) → ⌘K đóng lại; ngoài palette luôn mở
 * (chuẩn GitHub/Linear — chord có meta/ctrl không thuộc về field nào: không
 * editor nào trong app bind ⌘K). */

export function CommandSearch({ data }: { data: MockData | null }) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const desktopTriggerRef = useRef<HTMLButtonElement>(null);
	const iconTriggerRef = useRef<HTMLButtonElement>(null);

	const index: SearchIndex = useMemo(() => buildSearchIndex(data), [data]);

	// Query rỗng → nhóm Điều hướng (mục lục nhanh); có query → kết quả lọc.
	const visibleGroups = useMemo(
		() =>
			query.trim()
				? queryIndex(index, query)
				: index.groups.filter((group) => group.kind === "nav"),
		[index, query],
	);
	const total = visibleGroups.reduce(
		(sum, group) => sum + group.items.length,
		0,
	);

	/** Đóng/mở từ mọi đường (⌘K, click, Esc, chọn kết quả): luôn dọn query và
	 * trả focus về trigger. base-ui chỉ tự trả focus khi mở bằng click; ⌘K mở
	 * từ bất kỳ đâu nên tự trả bằng tay. */
	const handleOpenChange = useCallback((next: boolean) => {
		setOpen(next);
		if (next) return;
		setQuery("");
		requestAnimationFrame(() => {
			const desktop = desktopTriggerRef.current;
			// Dưới md trigger w-56 display:none (offsetParent null) → nút icon.
			const trigger =
				desktop && desktop.offsetParent !== null
					? desktop
					: iconTriggerRef.current;
			trigger?.focus();
		});
	}, []);

	// ⌘K / Ctrl+K toàn cục. Dep `open` để closure luôn thấy trạng thái mới.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "k" && event.key !== "K") return;
			if (!(event.metaKey || event.ctrlKey)) return;
			event.preventDefault();
			handleOpenChange(!open);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, handleOpenChange]);

	function selectItem(item: SearchItem) {
		if (item.kind === "nav") {
			navigate({ to: item.href });
		} else if (item.kind === "student") {
			navigate({
				to: "/students/$studentId",
				params: { studentId: item.id },
			});
		} else if (item.kind === "class") {
			navigate({ to: "/classes/$classId", params: { classId: item.id } });
		} else if (item.kind === "assignment") {
			navigate({
				to: "/assignments/$assignmentId",
				params: { assignmentId: item.id },
			});
		} else {
			navigate({
				to: "/tuition/$invoiceId",
				params: { invoiceId: item.id },
			});
		}
		handleOpenChange(false);
	}

	return (
		<>
			{/* Trigger desktop theo design v2: khung w-56 + Kbd ⌘K, ẩn dưới md. */}
			<button
				type="button"
				ref={desktopTriggerRef}
				data-testid="command-search-trigger"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => handleOpenChange(true)}
				className="hidden h-8 w-56 items-center gap-2 rounded-md border bg-muted/50 px-2 text-muted-foreground text-sm shadow-xs outline-none transition-shadow hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 md:inline-flex dark:bg-input/30"
			>
				<Search aria-hidden="true" className="size-4 shrink-0" />
				<span className="flex-1 text-left">Tìm kiếm…</span>
				<Kbd>⌘K</Kbd>
			</button>
			<Button
				variant="ghost"
				size="icon-sm"
				ref={iconTriggerRef}
				data-testid="command-search-trigger-icon"
				aria-label="Tìm kiếm"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => handleOpenChange(true)}
				className="md:hidden"
			>
				<Search aria-hidden="true" />
			</Button>

			<CommandDialog
				open={open}
				onOpenChange={handleOpenChange}
				title="Tìm kiếm"
			>
				<Command
					shouldFilter={false}
					className="rounded-none border-none bg-transparent"
				>
					<CommandInput
						placeholder="Tìm học viên, lớp học…"
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList data-testid="command-search-list">
						{!index.loaded ? (
							<div
								role="status"
								data-testid="command-search-loading"
								className="py-6 text-center text-muted-foreground text-sm"
							>
								Đang tải…
							</div>
						) : total === 0 ? (
							<CommandEmpty data-testid="command-search-empty">
								Không tìm thấy
							</CommandEmpty>
						) : (
							visibleGroups.map((group) => (
								<CommandGroup
									key={group.kind}
									heading={group.label}
									data-testid="command-search-group"
								>
									{group.items.map((item) => {
										const Icon = item.icon ?? KIND_ICONS[item.kind];
										return (
											<CommandItem
												key={`${item.kind}-${item.id}`}
												value={`${item.kind}:${item.id}`}
												onSelect={() => selectItem(item)}
												data-testid="command-search-item"
											>
												<Icon
													aria-hidden="true"
													className="text-muted-foreground"
												/>
												<span className="min-w-0 flex-1 truncate">
													{item.label}
												</span>
												{item.hint && (
													<span className="max-w-[45%] shrink-0 truncate text-muted-foreground text-xs">
														{item.hint}
													</span>
												)}
											</CommandItem>
										);
									})}
								</CommandGroup>
							))
						)}
					</CommandList>
					{/* Đếm kết quả cho screen reader (phase 8) — chỉ đọc khi mở. */}
					<p
						aria-live="polite"
						role="status"
						data-testid="command-search-count"
						className="sr-only"
					>
						{open ? `${total} kết quả` : ""}
					</p>
				</Command>
			</CommandDialog>
		</>
	);
}
