import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/data-store";
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
	const bellWrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!notifOpen) return;
		const onDown = (e: MouseEvent) => {
			if (!bellWrapRef.current?.contains(e.target as Node)) setNotifOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [notifOpen]);

	function submitSearch() {
		const q = query.trim().toLowerCase();
		if (!q) return;
		const match = data.students.find((s) => s.name.toLowerCase().includes(q));
		if (match) {
			navigate({
				to: "/students/$studentId",
				params: { studentId: match.id },
			});
			setQuery("");
		}
	}

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
			<div className="topbar-search ml-auto flex max-w-[360px] flex-1 items-center gap-2 rounded-sm border border-line-soft border-solid bg-surface px-3 py-2 transition-shadow focus-within:border-accent-blue focus-within:shadow-[var(--focus-ring)] max-app:hidden">
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
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") submitSearch();
					}}
					placeholder="Tìm học viên, buổi học, hóa đơn…"
					className="w-full border-none bg-transparent text-fg text-sm outline-none placeholder:text-meta"
				/>
			</div>
			<div ref={bellWrapRef} className="relative">
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
					<span className="absolute top-[7px] right-2 h-2 w-2 rounded-full border-[1.5px] border-bg border-solid bg-danger" />
				</button>
				{notifOpen && <NotifPanel notifs={data.notifs} />}
			</div>
		</header>
	);
}
