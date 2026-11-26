import type { StudentClassSyllabusSummary } from "@teacher-os/api/contracts";
import { Mountain } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatVietnamFullDate } from "@/lib/vietnam-display-date";

export interface JourneySummitCardProps {
	classLevel?: string;
	className?: string;
	syllabus?: StudentClassSyllabusSummary | null;
	useModuleGrouping: boolean;
	heldCount: number;
	totalTeachingCount: number;
	clearedModulesCount: number;
	totalModulesCount: number;
	nextTeachingIndex: number | null;
	lastDatedISO: string | null;
}

export function JourneySummitCard({
	classLevel,
	className,
	syllabus,
	useModuleGrouping,
	heldCount,
	totalTeachingCount,
	clearedModulesCount,
	totalModulesCount,
	nextTeachingIndex,
	lastDatedISO,
}: JourneySummitCardProps) {
	const activeSyllabus = useModuleGrouping && syllabus ? syllabus : null;
	const trimmedLevel = classLevel?.trim() ?? "";
	const syllabusName = activeSyllabus?.name.trim() ?? "";
	const syllabusDesc = activeSyllabus?.description.trim() ?? "";
	const trimmedClassName = className?.trim() ?? "";

	const destinationTitle =
		trimmedLevel || syllabusName || trimmedClassName || "Lộ trình học";
	const showSyllabusSubtitle =
		syllabusName.length > 0 && syllabusName !== destinationTitle;

	const pct =
		totalTeachingCount > 0
			? Math.min(100, Math.round((heldCount / totalTeachingCount) * 100))
			: 0;
	const counterValue =
		totalModulesCount > 0
			? `${clearedModulesCount}/${totalModulesCount}`
			: `${heldCount}/${totalTeachingCount}`;
	const counterLabel =
		totalModulesCount > 0 ? "chặng đã vượt" : "buổi đã diễn ra";

	return (
		<div
			data-testid={activeSyllabus ? "journey-syllabus-header" : undefined}
			className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6"
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex min-w-0 flex-1 items-start gap-3.5 sm:gap-4">
					<span
						aria-hidden="true"
						className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
					>
						<Mountain className="size-6" />
					</span>
					<div className="min-w-0 flex-1">
						<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
							Đích đến của bạn
						</p>
						<p className="mt-0.5 break-words font-bold text-foreground text-xl tracking-tight sm:text-2xl">
							{destinationTitle}
						</p>
						{showSyllabusSubtitle && (
							<p className="mt-0.5 break-words font-medium text-foreground text-sm">
								{syllabusName}
							</p>
						)}
						{syllabusDesc && (
							<p className="mt-0.5 break-words text-muted-foreground text-xs">
								{syllabusDesc}
							</p>
						)}
						{lastDatedISO && (
							<p className="mt-1 text-muted-foreground text-xs tabular-nums sm:text-sm">
								{nextTeachingIndex === null &&
								totalTeachingCount > 0 &&
								heldCount >= totalTeachingCount
									? "Hoàn thành ngày"
									: "Về đích dự kiến"}{" "}
								{formatVietnamFullDate(lastDatedISO)}
							</p>
						)}
					</div>
				</div>

				<div className="shrink-0 text-left sm:text-right">
					<p className="font-semibold text-foreground text-xl tabular-nums tracking-tight sm:text-2xl">
						{counterValue}
					</p>
					<p className="text-muted-foreground text-xs">{counterLabel}</p>
				</div>
			</div>

			<div className="mt-4">
				<div
					role="progressbar"
					aria-label="Tiến độ hành trình học"
					aria-valuemin={0}
					aria-valuemax={totalTeachingCount}
					aria-valuenow={heldCount}
					className="h-2 w-full overflow-hidden rounded-full border border-border bg-muted"
				>
					<div
						className={cn(
							"h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none",
							pct >= 100 ? "bg-success" : "bg-primary",
						)}
						style={{ width: `${pct}%` }}
					/>
				</div>
				<div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-muted-foreground text-xs tabular-nums">
					<span>
						{pct}% hành trình
						{nextTeachingIndex !== null
							? ` · Bạn đang ở trước buổi ${nextTeachingIndex}`
							: ""}
					</span>
					<span>
						{heldCount}/{totalTeachingCount} buổi
					</span>
				</div>
			</div>
		</div>
	);
}
