/**
 * #343 — Biểu đồ doanh thu trên /tuition: cột "Phát hành" (chip xám) +
 * cột "Đã thu" (accent cam) đè giữa theo bullet-style, cửa sổ Tháng/Quý/Năm.
 *
 * Kỹ thuật overlay: mỗi Bar dùng xAxisId riêng — hai band scale cùng hình
 * học nên cả hai bar đều được căn GIỮA slot thay vì xếp cạnh nhau (mặc định
 * recharts đặt 2 series cạnh nhau trong cùng category). Animation tắt hoàn
 * toàn theo DESIGN.md (không entrance choreography); selection toggle =
 * sunk + chữ cam (`bg-surface text-hot`, pattern chip phase 2); `role="img"`
 * + aria-label CHỈ bọc khối chart, không bọc toggle (nút focusable bên trong
 * role="img" vi phạm ARIA).
 */
import { useEffect } from "react";
import {
	Bar,
	BarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { cn } from "@/lib/cn";
import { fmtVND } from "@/lib/mock-data";
import type { RevenueBucket, RevenuePeriod } from "@/lib/tuition-from-kernel";

const PERIODS: Array<{ value: RevenuePeriod; label: string }> = [
	{ value: "month", label: "Tháng" },
	{ value: "quarter", label: "Quý" },
	{ value: "year", label: "Năm" },
];

const PERIOD_WINDOW_TEXT: Record<RevenuePeriod, string> = {
	month: "12 tháng gần nhất",
	quarter: "8 quý gần nhất",
	year: "5 năm gần nhất",
};

/** Bucket key → nhãn đầy đủ cho tooltip: "2026-10" → "Tháng 10/2026". */
function fullLabel(key: string, period: RevenuePeriod): string {
	if (period === "month") {
		const [y, m] = key.split("-");
		return `Tháng ${Number(m)}/${y}`;
	}
	if (period === "quarter") {
		const [y, q] = key.split("-Q");
		return `Quý ${Number(q)}/${y}`;
	}
	return `Năm ${key}`;
}

interface TooltipEntryProps {
	label: string;
	value: number;
	className?: string;
}

function TooltipEntry({ label, value, className }: TooltipEntryProps) {
	return (
		<div className={cn("flex items-center justify-between gap-4", className)}>
			<span>{label}</span>
			<span className="font-mono tabular-nums">{fmtVND(value)}</span>
		</div>
	);
}

function RevenueTooltip({
	active,
	payload,
	period,
}: {
	active?: boolean;
	payload?: Array<{ payload: RevenueBucket }>;
	period: RevenuePeriod;
}) {
	const bucket = payload?.[0]?.payload;
	if (!active || !bucket) return null;
	return (
		<div className="neu rounded-md px-3 py-2 text-xs">
			<p className="mb-1 font-medium">{fullLabel(bucket.key, period)}</p>
			<TooltipEntry
				label="Đã thu"
				value={bucket.collected}
				className="text-fg"
			/>
			<TooltipEntry
				label="Phát hành"
				value={bucket.issued}
				className="text-meta"
			/>
		</div>
	);
}

function AxisTick({
	x,
	y,
	payload,
}: {
	x?: number;
	y?: number;
	payload?: { value?: string };
}) {
	return (
		<text
			x={x}
			y={(y ?? 0) + 14}
			textAnchor="middle"
			className="font-mono"
			fill="var(--meta)"
		>
			{payload?.value}
		</text>
	);
}

export interface RevenueChartProps {
	buckets: RevenueBucket[];
	period: RevenuePeriod;
	/** Số hóa đơn bị loại do `createdAt` không đọc được — surf ra aria-label
	 * + console.warn, không im lặng với chỉ số tài chính (#343). */
	dropped: number;
	onPeriodChange: (period: RevenuePeriod) => void;
}

export function RevenueChart({
	buckets,
	period,
	dropped,
	onPeriodChange,
}: RevenueChartProps) {
	const collectedTotal = buckets.reduce((sum, b) => sum + b.collected, 0);
	const isEmpty = buckets.every((b) => b.issued === 0 && b.collected === 0);

	useEffect(() => {
		if (dropped > 0) {
			console.warn(
				`[revenue] bỏ qua ${dropped} hóa đơn không đọc được ngày phát hành — không nằm trong biểu đồ doanh thu.`,
			);
		}
	}, [dropped]);

	const ariaLabel =
		`Biểu đồ doanh thu ${PERIOD_WINDOW_TEXT[period]}, đã thu tổng ${fmtVND(collectedTotal)}` +
		(dropped > 0 ? `, bỏ qua ${dropped} hóa đơn không đọc được ngày` : "");

	return (
		<div className="p-6" data-testid="revenue-chart-section">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-display font-extrabold text-2xl tracking-[-0.045em]">
					Doanh thu
				</h2>
				{/* biome-ignore lint/a11y/useSemanticElements: role="group" + aria-label theo pattern ChipFilter cho SR/e2e */}
				<div role="group" aria-label="Kỳ doanh thu" className="flex gap-1">
					{PERIODS.map((p) => (
						<button
							type="button"
							key={p.value}
							aria-pressed={p.value === period}
							data-testid={`revenue-period-${p.value}`}
							onClick={() => onPeriodChange(p.value)}
							className={cn(
								"neu-sm rounded-md px-3 py-[5px] font-medium text-xs transition-colors duration-[150ms] ease-[cubic-bezier(0.28,0,0.22,1)]",
								"focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								p.value === period && "border-transparent bg-surface text-hot",
							)}
						>
							{p.label}
						</button>
					))}
				</div>
			</div>

			{isEmpty ? (
				<div
					className="neu-in flex min-h-[200px] items-center justify-center rounded-md"
					data-testid="revenue-chart-empty"
				>
					<p className="text-center text-meta text-sm">
						Chưa có hóa đơn nào trong {PERIOD_WINDOW_TEXT[period]}.
						{dropped > 0
							? ` ${dropped} hóa đơn không đọc được ngày phát hành nên không thể xếp kỳ.`
							: ""}
					</p>
				</div>
			) : (
				<>
					{/* role="img" chỉ bọc khối SVG chart — toggle nằm ngoài ở trên */}
					<div role="img" aria-label={ariaLabel}>
						<ResponsiveContainer width="100%" height={260}>
							<BarChart
								data={buckets}
								// margin.bottom giữ chỗ cho trục + nhãn tick trong đúng
								// chiều cao 260px của SVG — không có nó, recharts đẩy
								// baseline axis ra mép dưới và tick text bị clip mất.
								margin={{ top: 8, right: 0, bottom: 24, left: 0 }}
							>
								<XAxis
									dataKey="label"
									xAxisId="main"
									tick={<AxisTick />}
									interval="preserveStartEnd"
									axisLine={false}
									tickLine={false}
								/>
								{/* Hai axis ẩn cùng hình học với "main" — mỗi Bar căn
								    giữa slot riêng, tạo hiệu ứng đè bullet-style */}
								<XAxis xAxisId="backdrop" hide />
								<XAxis xAxisId="overlay" hide />
								<YAxis hide />
								<Tooltip
									cursor={{ fill: "var(--fg-soft)" }}
									content={<RevenueTooltip period={period} />}
								/>
								<Bar
									dataKey="issued"
									xAxisId="backdrop"
									maxBarSize={28}
									// Cột thường = chip xám (design `Tuition` chart).
									fill="var(--chip)"
									isAnimationActive={false}
								/>
								<Bar
									dataKey="collected"
									xAxisId="overlay"
									maxBarSize={17}
									fill="var(--accent)"
									isAnimationActive={false}
								/>
							</BarChart>
						</ResponsiveContainer>
					</div>
					<div className="mt-2 flex items-center gap-4 font-mono text-meta text-xs">
						<span className="flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className="inline-block h-2.5 w-2.5 rounded-[3px] bg-chip"
							/>
							Phát hành
						</span>
						<span className="flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className="inline-block h-2.5 w-2.5 rounded-[3px] bg-accent"
							/>
							Đã thu
						</span>
						{dropped > 0 && (
							<span data-testid="revenue-dropped-note">
								({dropped} hóa đơn bỏ qua do thiếu ngày)
							</span>
						)}
					</div>
				</>
			)}
		</div>
	);
}
