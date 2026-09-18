import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/lib/data-store";
import { searchGlobal } from "@/lib/global-search";
import { NotifPanel } from "./notif-panel";

export function Topbar({
	title,
	onMenuClick,
	collapsed,
	onToggleCollapse,
}: {
	title: string;
	onMenuClick: () => void;
	collapsed: boolean;
	onToggleCollapse: () => void;
}) {
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
		<header className="topbar sticky top-0 z-20 flex items-center gap-4 border-line border-b border-solid px-6 py-3 backdrop-blur-[16px] [-webkit-backdrop-filter:blur(16px)]">
			<button
				type="button"
				aria-label="Menu"
				onClick={onMenuClick}
				className="grid app:hidden h-9 w-9 place-items-center rounded-sm border border-line-soft border-solid bg-bg text-fg-2 transition-colors duration-[150ms] hover:border-line hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					className="h-[17px] w-[17px]"
				>
					<path d="M4 7h16M4 12h16M4 17h16" />
				</svg>
			</button>
			<button
				type="button"
				onClick={onToggleCollapse}
				aria-label={
					collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"
				}
				title="Thu gọn/mở rộng thanh điều hướng"
				data-testid="sidebar-toggle"
				className="grid h-9 w-9 place-items-center rounded-sm border border-line-soft border-solid bg-bg text-fg-2 transition-colors duration-[150ms] hover:border-line hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none max-app:hidden"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					className="h-[17px] w-[17px]"
				>
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<path d="M9 4v16" />
				</svg>
			</button>
			<div className="font-display font-semibold text-lg tracking-[-0.01em]">
				{title}
			</div>
			<div
				ref={searchWrapRef}
				className="topbar-search relative ml-auto flex max-w-[360px] flex-1 items-center gap-2 rounded-sm border border-line-soft border-solid bg-surface px-3 py-2 transition-shadow focus-within:border-accent-blue focus-within:shadow-[var(--focus-ring)] max-app:hidden"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					className="h-[15px] w-[15px] shrink-0 text-meta"
				>
					<circle cx="11" cy="11" r="7" />
					<path d="M21 21l-4.3-4.3" />
				</svg>
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
					className="w-full border-none bg-transparent text-fg text-sm outline-none placeholder:text-meta"
				/>
				{showResults && (
					<div
						id="global-search-listbox"
						role="listbox"
						data-testid="global-search-results"
						className="absolute top-full left-0 z-50 mt-2 max-h-[360px] w-full min-w-[280px] overflow-y-auto rounded-lg border border-line border-solid bg-bg shadow-[var(--elev-raised)]"
					>
						{results.length === 0 ? (
							<div
								data-testid="global-search-empty"
								className="px-4 py-3 text-meta text-sm"
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
									className="flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface"
								>
									<span className="min-w-0">
										<span className="block truncate font-medium text-fg text-sm">
											{r.label}
										</span>
										{r.sublabel && (
											<span className="mt-[2px] block truncate text-[11px] text-meta">
												{r.sublabel}
											</span>
										)}
									</span>
									<span className="shrink-0 font-mono text-[10px] text-meta uppercase">
										{r.type === "student" ? "Học viên" : "Lớp"}
									</span>
								</button>
							))
						)}
					</div>
				)}
			</div>
			<div ref={bellWrapRef} className="relative max-app:ml-auto">
				<button
					type="button"
					aria-label="Thông báo"
					onClick={() => setNotifOpen((v) => !v)}
					className="relative grid h-9 w-9 place-items-center rounded-sm border border-line-soft border-solid bg-bg text-fg-2 transition-colors duration-[150ms] hover:border-line hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
						className="h-[17px] w-[17px]"
					>
						<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z" />
						<path d="M10 21a2 2 0 0 0 4 0" />
					</svg>
					{data.notifs.length > 0 && (
						<span
							data-testid="notif-badge"
							className="absolute top-[7px] right-2 h-2 w-2 rounded-full border-[1.5px] border-bg border-solid bg-danger"
						/>
					)}
				</button>
				{notifOpen && <NotifPanel notifs={data.notifs} />}
			</div>
		</header>
	);
}
