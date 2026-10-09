import { formatBand } from "@teacher-os/api/lib/ielts-band";
import { cn } from "@/lib/cn";

/** Vạch chia dưới thanh: 0…9. aria-hidden — screen reader đọc qua thumb. */
const TICKS = Array.from({ length: 10 }, (_, tick) => tick);

/**
 * Thanh slide band IELTS 0–9 bước 0.5 (#331). `value` là `null` khi chưa
 * chọn: thumb nằm giữa thanh (4.5) làm placeholder, số hiển thị `—`, thanh
 * mờ và `aria-valuetext="Chưa chấm"`. Bấm trúng đúng vị trí placeholder
 * không làm đổi giá trị (không bắn `change`), nên commit thêm ở
 * `onPointerUp` khi còn `null`.
 */
export function BandSlider({
	id,
	value,
	onChange,
	className,
	...aria
}: {
	id?: string;
	value: number | null;
	onChange(value: number): void;
	className?: string;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;
}) {
	const unset = value === null;
	const label = unset ? "—" : formatBand(value);
	return (
		<div className="flex items-center gap-3">
			<div className="min-w-0 flex-1">
				<input
					id={id}
					type="range"
					min={0}
					max={9}
					step={0.5}
					value={value ?? 4.5}
					aria-valuetext={unset ? "Chưa chấm" : label}
					// Test hook: jsdom assertions đọc attribute này thay vì so màu.
					data-unset={unset || undefined}
					onChange={(event) => onChange(Number(event.currentTarget.value))}
					onPointerUp={(event) => {
						if (value === null) onChange(Number(event.currentTarget.value));
					}}
					className={cn(
						// accent-color để CSS base (input[type=range] → var(--accent))
						// quyết định: thumb cam theo token, không ghim màu fg ở đây.
						"h-8 w-full cursor-pointer rounded-full transition-opacity duration-150 ease-[cubic-bezier(0.28,0,0.22,1)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
						unset && "opacity-40",
						className,
					)}
					{...aria}
				/>
				<div
					aria-hidden
					className="flex justify-between px-[7px] font-mono text-[10px] text-meta"
				>
					{TICKS.map((tick) => (
						<span key={tick}>{tick}</span>
					))}
				</div>
			</div>
			<span
				aria-hidden
				className="w-10 text-right font-mono text-lg tabular-nums"
			>
				{label}
			</span>
		</div>
	);
}
