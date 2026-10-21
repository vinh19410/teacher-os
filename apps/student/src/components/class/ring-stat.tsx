import type { LucideIcon } from "lucide-react";

/**
 * Ring stat của design-v2 `StudentClassDetail`: vòng tròn SVG tiến độ, icon +
 * giá trị ở giữa, nhãn + chú thích bên dưới. Dùng cho 4 số liệu của trang
 * chi tiết lớp (buổi học, chuyên cần, bài tập, band trung bình).
 */
export function RingStat({
	icon: Icon,
	value,
	max,
	display,
	label,
	sub,
}: {
	icon: LucideIcon;
	/** Tử số tiến độ (0 khi chưa có dữ liệu → vòng rỗng). */
	value: number;
	/** Mẫu số tiến độ; 0 → vòng rỗng thay vì chia 0. */
	max: number;
	/** Chuỗi hiển thị ở tâm vòng (không nhất thiết là %). */
	display: string;
	label: string;
	sub: string;
}) {
	const radius = 52;
	const circumference = 2 * Math.PI * radius;
	const pct = max > 0 ? Math.min(1, value / max) : 0;

	return (
		<div className="flex flex-col items-center rounded-lg rounded-xl border bg-card p-5 text-center shadow-sm">
			<div className="relative size-32">
				<svg
					viewBox="0 0 120 120"
					className="size-full -rotate-90"
					aria-hidden="true"
				>
					<circle
						cx="60"
						cy="60"
						r={radius}
						fill="none"
						strokeWidth="9"
						className="stroke-surface"
					/>
					<circle
						cx="60"
						cy="60"
						r={radius}
						fill="none"
						strokeWidth="9"
						strokeLinecap="round"
						className="stroke-hot transition-[stroke-dashoffset] duration-700"
						strokeDasharray={circumference}
						strokeDashoffset={circumference * (1 - pct)}
					/>
				</svg>
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
					<Icon aria-hidden="true" className="size-4 text-muted-foreground" />
					<span className="font-semibold text-foreground text-xl tabular-nums tracking-tight">
						{display}
					</span>
				</div>
			</div>
			<div className="mt-3 font-medium text-foreground">{label}</div>
			<div className="text-muted-foreground text-xs">{sub}</div>
		</div>
	);
}
