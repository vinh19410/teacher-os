import { useNavigate } from "@tanstack/react-router";
import { ThemeToggle } from "@teacher-os/ui/components/theme-toggle";
import { Bell, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data-store";
import { searchGlobal } from "@/lib/global-search";
import { NotifPanel } from "./notif-panel";

/**
 * Actions bên phải header shell v2: ô tìm kiếm toàn cục (đến phase 8 thay
 * bằng trigger ⌘K — giữ nguyên hành vi + testid cho spec global-search),
 * chuông thông báo với panel và ThemeToggle.
 */
export function TopbarActions() {
	const navigate = useNavigate();
	const { data } = useData();
	const [notifOpen, setNotifOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const bellWrapRef = useRef<HTMLDivElement>(null);
	const searchWrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!notifOpen) return;
		const onDown = (e: MouseEvent) => {
			if (!bellWrapRef.current?.contains(e.target as Node)) setNotifOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [notifOpen]);

	useEffect(() => {
		if (!searchOpen) return;
		const onDown = (e: MouseEvent) => {
			if (!searchWrapRef.current?.contains(e.target as Node))
				setSearchOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [searchOpen]);

	const results = useMemo(
		() => (query.trim() ? searchGlobal(data, query) : []),
		[data, query],
	);

	function goTo(result: (typeof results)[number]) {
		if (result.type === "student") {
			navigate({
				to: "/students/$studentId",
				params: { studentId: result.id },
			});
		} else {
			navigate({ to: "/classes/$classId", params: { classId: result.id } });
		}
		setQuery("");
		setSearchOpen(false);
	}

	function submitSearch() {
		if (results.length > 0) goTo(results[0]);
	}

	const showResults = searchOpen && query.trim().length > 0;

	return (
		<>
			<div
				ref={searchWrapRef}
				className="relative hidden h-8 w-56 items-center gap-2 rounded-md border border-input px-3 text-sm transition-shadow focus-within:ring-[3px] focus-within:ring-ring/50 md:flex"
			>
				<Search
					aria-hidden="true"
					className="size-3.5 shrink-0 text-muted-foreground"
				/>
				<input
					type="text"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setSearchOpen(true);
					}}
					onFocus={() => setSearchOpen(true)}
					onKeyDown={(e) => {
						// Enter confirming an IME composition (Telex/VNI) must not
						// navigate mid-word — wait for it to land in the field.
						if (e.nativeEvent.isComposing) return;
						if (e.key === "Enter") submitSearch();
						if (e.key === "Escape") setSearchOpen(false);
					}}
					placeholder="Tìm học viên, lớp học…"
					role="combobox"
					aria-expanded={showResults}
					aria-controls="global-search-listbox"
					className="w-full border-none bg-transparent outline-none placeholder:text-muted-foreground"
				/>
				{showResults && (
					<div
						id="global-search-listbox"
						role="listbox"
						data-testid="global-search-results"
						className="absolute top-full left-0 z-50 mt-2 max-h-[360px] w-full min-w-[280px] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
					>
						{results.length === 0 ? (
							<div
								data-testid="global-search-empty"
								className="px-4 py-3 text-muted-foreground"
							>
								Không tìm thấy kết quả
							</div>
						) : (
							results.map((r) => (
								<button
									type="button"
									role="option"
									aria-selected="false"
									data-testid="global-search-result-item"
									key={`${r.type}-${r.id}`}
									onClick={() => goTo(r)}
									className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:text-primary"
								>
									<span className="min-w-0">
										<span className="block truncate font-medium">
											{r.label}
										</span>
										{r.sublabel && (
											<span className="mt-[2px] block truncate text-[11px] text-muted-foreground">
												{r.sublabel}
											</span>
										)}
									</span>
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase">
										{r.type === "student" ? "Học viên" : "Lớp"}
									</span>
								</button>
							))
						)}
					</div>
				)}
			</div>
			<div ref={bellWrapRef} className="relative">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Thông báo"
					aria-expanded={notifOpen}
					onClick={() => setNotifOpen((v) => !v)}
				>
					<Bell aria-hidden="true" />
					{data.notifs.length > 0 && (
						<span
							data-testid="notif-badge"
							className="absolute top-1.5 right-1.5 size-2 rounded-full border-2 border-background bg-destructive"
						/>
					)}
				</Button>
				{notifOpen && <NotifPanel notifs={data.notifs} />}
			</div>
			<ThemeToggle />
		</>
	);
}
