import type { Notif } from "@/lib/mock-data";

const dotColors: Record<Notif["dot"], string> = {
	accent: "bg-accent-blue",
	danger: "bg-danger",
	warn: "bg-warn",
};

export function NotifPanel({ notifs }: { notifs: Notif[] }) {
	return (
		<div className="absolute top-full right-0 z-50 mt-2 max-h-[420px] w-[360px] overflow-y-auto rounded-lg border border-line border-solid bg-bg shadow-[var(--elev-raised)] max-app:fixed max-app:top-14 max-app:right-4 max-app:left-4 max-app:w-auto">
			<div className="border-line-soft border-b border-solid px-5 py-4 font-semibold text-sm">
				Thông báo
			</div>
			{notifs.length === 0 ? (
				<div
					data-testid="notif-empty"
					className="px-5 py-8 text-center text-muted-fg text-sm"
				>
					Chưa có thông báo nào
				</div>
			) : (
				notifs.map((n) => (
					<div
						key={n.id}
						className="flex gap-3 border-line-soft border-b border-solid px-5 py-3 last:border-b-0 hover:bg-surface"
					>
						<span
							className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColors[n.dot]}`}
						/>
						<div>
							<div className="text-xs leading-[1.4]">{n.text}</div>
							<div className="mt-[3px] font-mono text-[10px] text-meta">
								{n.time} · {n.channel}
							</div>
						</div>
					</div>
				))
			)}
		</div>
	);
}
