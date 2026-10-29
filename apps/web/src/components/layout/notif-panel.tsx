import type { Notif } from "@/lib/mock-data";

const dotColors: Record<Notif["dot"], string> = {
	accent: "bg-primary",
	danger: "bg-destructive",
	warn: "bg-warn",
};

/** Panel thông báo của shell v2 — popover token (border + shadow-md). */
export function NotifPanel({ notifs }: { notifs: Notif[] }) {
	return (
		<div className="absolute top-full right-0 z-50 mt-2 max-h-[420px] w-[360px] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md max-md:fixed max-md:top-14 max-md:right-4 max-md:left-4 max-md:w-auto">
			<div className="border-b px-5 py-4 font-semibold">Thông báo</div>
			{notifs.length === 0 ? (
				<div
					data-testid="notif-empty"
					className="px-5 py-8 text-center text-muted-foreground"
				>
					Chưa có thông báo nào
				</div>
			) : (
				notifs.map((n) => (
					<div
						key={n.id}
						className="flex gap-3 border-b px-5 py-3 transition-colors last:border-b-0 hover:text-primary"
					>
						<span
							className={`mt-1.5 size-2 shrink-0 rounded-full ${dotColors[n.dot]}`}
						/>
						<div>
							<div className="text-xs leading-[1.4]">{n.text}</div>
							<div className="mt-[3px] font-mono text-[10px] text-muted-foreground">
								{n.time} · {n.channel}
							</div>
						</div>
					</div>
				))
			)}
		</div>
	);
}
