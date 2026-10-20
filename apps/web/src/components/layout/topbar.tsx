import { ThemeToggle } from "@teacher-os/ui/components/theme-toggle";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommandSearch } from "@/components/command-search/command-search";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data-store";
import { NotifPanel } from "./notif-panel";

/**
 * Actions bên phải header shell v2: trigger ⌘K mở command palette (phase 8 —
 * thay ô tìm kiếm inline v1), chuông thông báo với panel và ThemeToggle.
 */
export function TopbarActions() {
	const { data } = useData();
	const [notifOpen, setNotifOpen] = useState(false);
	const bellWrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!notifOpen) return;
		const onDown = (e: MouseEvent) => {
			if (!bellWrapRef.current?.contains(e.target as Node)) setNotifOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [notifOpen]);

	return (
		<>
			<CommandSearch data={data} />
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
