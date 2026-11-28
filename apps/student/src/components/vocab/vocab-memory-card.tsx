import { cn } from "@/lib/cn";
import {
	VOCAB_MEMORY_LEVELS,
	type VocabMemoryLevel,
} from "./vocab-overview-helpers";

export interface VocabMemoryCardProps {
	learnedCount: number;
	matureCount: number;
	retention: number | null;
	levelDistribution: readonly [number, number, number, number, number];
	activeLevel: VocabMemoryLevel | null;
	onToggleLevel: (level: VocabMemoryLevel) => void;
}

export function VocabMemoryCard({
	learnedCount,
	matureCount,
	retention,
	levelDistribution,
	activeLevel,
	onToggleLevel,
}: VocabMemoryCardProps) {
	const tracked = levelDistribution.reduce((sum, count) => sum + count, 0);

	return (
		<div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
			<div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
				<div className="grid min-w-0 gap-0.5">
					<span
						data-testid="vocab-overview-learned"
						className="font-bold text-foreground text-xl tabular-nums tracking-tight sm:text-2xl"
					>
						{learnedCount}
					</span>
					<span className="text-muted-foreground text-xs sm:text-sm">
						từ đã thuộc
					</span>
				</div>
				<div className="grid min-w-0 gap-0.5">
					<span
						data-testid="vocab-overview-mature"
						className="font-bold text-foreground text-xl tabular-nums tracking-tight sm:text-2xl"
					>
						{matureCount}
					</span>
					<span className="text-muted-foreground text-xs sm:text-sm">
						từ thành thạo
					</span>
				</div>
				<div className="grid min-w-0 gap-0.5">
					<span className="font-bold text-foreground text-xl tabular-nums tracking-tight sm:text-2xl">
						{retention !== null ? `${retention}%` : "—"}
					</span>
					<span className="text-muted-foreground text-xs sm:text-sm">
						tỉ lệ nhớ
					</span>
				</div>
			</div>

			<div
				role="img"
				aria-label={`Phân bổ ${tracked} từ theo 5 cấp trí nhớ`}
				className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-muted ring-1 ring-border ring-inset"
			>
				{VOCAB_MEMORY_LEVELS.map((lv, idx) => {
					const count = levelDistribution[idx] ?? 0;
					if (count <= 0) return null;
					return (
						<span
							key={lv.level}
							style={{ flexGrow: count }}
							className={cn(
								"min-w-1 transition-[flex-grow] duration-300",
								lv.bgClass,
							)}
						/>
					);
				})}
			</div>

			<fieldset className="mt-4 grid min-w-0 grid-cols-2 gap-2 border-0 p-0 sm:grid-cols-5">
				<legend className="sr-only">Lọc bộ từ theo cấp trí nhớ</legend>
				{VOCAB_MEMORY_LEVELS.map((lv, idx) => {
					const count = levelDistribution[idx] ?? 0;
					const pressed = activeLevel === lv.level;
					return (
						<button
							key={lv.level}
							type="button"
							data-vocab-level={lv.level}
							aria-pressed={pressed}
							onClick={() => onToggleLevel(lv.level)}
							className={cn(
								"grid min-h-14 content-start justify-items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors duration-150 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								pressed
									? "border-primary bg-muted ring-1 ring-primary"
									: "border-transparent hover:bg-muted",
							)}
						>
							<span className="flex items-center gap-2 font-medium text-foreground text-sm">
								<span
									aria-hidden="true"
									className={cn(
										"size-2.5 shrink-0 rounded-[3px] ring-1 ring-input ring-inset",
										lv.bgClass,
									)}
								/>
								<span>{lv.name}</span>
							</span>
							<span className="text-muted-foreground text-xs tabular-nums">
								{count} từ · {lv.hint}
							</span>
						</button>
					);
				})}
			</fieldset>
		</div>
	);
}
