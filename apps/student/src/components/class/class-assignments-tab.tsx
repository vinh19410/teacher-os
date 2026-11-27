import { Link } from "@tanstack/react-router";
import type { StudentAssignment } from "@teacher-os/api/contracts";
import { hasGradableTask } from "@teacher-os/api/lib/ielts-band";
import {
	addDaysISO,
	evaluateAssignmentDeadline,
	formatVietnamTimeHHMM,
	vietnamDateKeyOf,
} from "@teacher-os/api/vietnam-date";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { Calendar, Check, ChevronDown, ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";
import {
	type AssignmentTabFilter,
	isClassAssignmentDueNow,
	resolveAssignmentExpectedDateISO,
	STRICT_ISO_DATE_RE,
} from "@/components/class/class-detail-helpers";
import { Badge } from "@/components/ui/badge";
import {
	calculateIeltsBand,
	type DerivedAssignmentStatus,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";
import { cn } from "@/lib/cn";
import { formatAssignmentSkillLabel } from "@/lib/student-overview-selectors";
import { formatVietnamDateFromISO } from "@/lib/vietnam-display-date";

interface StudyPackPresentation {
	badgeLabel: string;
	badgeClass: string;
	scheduleLine: string | null;
	derived: DerivedAssignmentStatus;
	isSubmitted: boolean;
	isOverdue: boolean;
	isUpcoming: boolean;
}

interface EnrichedStudyPackItem {
	assignment: StudentAssignment;
	expectedDateISO: string | null;
	presentation: StudyPackPresentation;
}

type AssignmentGroupKey =
	| "dueNowTodo"
	| "upcomingTodo"
	| "submitted"
	| "graded";

function compareNullable(
	a: number | null | undefined,
	b: number | null | undefined,
	direction: "asc" | "desc" = "asc",
): number {
	const left = a ?? null;
	const right = b ?? null;
	if (left === right) return 0;
	if (left === null) return 1;
	if (right === null) return -1;
	return direction === "asc" ? left - right : right - left;
}

function compareNullableISO(a: string | null, b: string | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a.localeCompare(b);
}

function compareStudyPackItems(
	a: EnrichedStudyPackItem,
	b: EnrichedStudyPackItem,
): number {
	const byDate = compareNullableISO(a.expectedDateISO, b.expectedDateISO);
	if (byDate !== 0) return byDate;
	const byDay = compareNullable(
		a.assignment.studyPackDayIndex,
		b.assignment.studyPackDayIndex,
		"asc",
	);
	if (byDay !== 0) return byDay;
	const byPos = compareNullable(
		a.assignment.studyPackPosition,
		b.assignment.studyPackPosition,
		"asc",
	);
	if (byPos !== 0) return byPos;
	return a.assignment.id.localeCompare(b.assignment.id);
}

function formatShortDayMonth(dateISO: string): string {
	return `${dateISO.slice(8, 10)}/${dateISO.slice(5, 7)}`;
}

function formatExpectedDatePhrase(dateISO: string, todayISO: string): string {
	if (dateISO === todayISO) {
		return `Hôm nay (${formatShortDayMonth(dateISO)})`;
	}
	if (dateISO === addDaysISO(todayISO, 1)) {
		return `Ngày mai (${formatShortDayMonth(dateISO)})`;
	}
	return formatVietnamDateFromISO(dateISO);
}

function statusChipClass(derived: DerivedAssignmentStatus): string {
	switch (derived.status) {
		case "overdue":
			return "border-danger/30 bg-danger-soft text-danger";
		case "due-soon":
			return "border-warn/30 bg-warn-soft text-warn";
		case "graded":
			return "border-success/30 bg-success-soft text-success";
		case "submitted":
			return "border-border bg-muted text-muted-foreground";
		default:
			return "border-border bg-muted/50 text-muted-foreground";
	}
}

function deriveStudyPackPresentation(
	assignment: StudentAssignment,
	todayISO: string,
	nowMs: number,
): StudyPackPresentation {
	const expectedDateISO = resolveAssignmentExpectedDateISO(assignment);
	const derived = deriveAssignmentStatus(assignment, todayISO, nowMs);
	const isSubmitted = Boolean(
		assignment.submittedAt || assignment.gradedAt || assignment.scores,
	);
	const deadline = evaluateAssignmentDeadline({
		due: expectedDateISO ?? assignment.due,
		dueAt: assignment.dueAt,
		submittedAt: assignment.submittedAt,
		todayISO,
		nowMs,
		legacyDateLate: false,
	});

	let dueTimeSuffix = "";
	if (deadline.hasDueAt && deadline.dueAtMs !== null) {
		const hhmm = formatVietnamTimeHHMM(new Date(deadline.dueAtMs));
		if (hhmm) {
			dueTimeSuffix = ` · hạn ${hhmm}`;
		}
	}

	// 1. Đã nộp / đã chấm
	if (isSubmitted) {
		let earlySuffix = "";
		if (assignment.submittedAt != null && expectedDateISO != null) {
			const submittedMs = Date.parse(assignment.submittedAt);
			if (Number.isFinite(submittedMs)) {
				const submittedDateISO = vietnamDateKeyOf(new Date(submittedMs));
				if (submittedDateISO < expectedDateISO) {
					earlySuffix = " · Làm sớm";
				}
			}
		}
		const scheduleLine = expectedDateISO
			? `Dự kiến: ${formatExpectedDatePhrase(expectedDateISO, todayISO)}${earlySuffix}`
			: earlySuffix
				? earlySuffix.slice(3)
				: null;

		return {
			badgeLabel: derived.statusLabel,
			badgeClass: statusChipClass(derived),
			scheduleLine,
			derived,
			isSubmitted: true,
			isOverdue: false,
			isUpcoming: false,
		};
	}

	// 2. Quá hạn (kiểm tra trước Hôm nay để bài hôm nay qua dueAt 17:00 hiện Quá hạn)
	if (deadline.isOverdue) {
		const scheduleLine = expectedDateISO
			? `Dự kiến: ${formatExpectedDatePhrase(expectedDateISO, todayISO)} · quá hạn`
			: "Quá hạn hoàn thành";
		return {
			badgeLabel: "Quá hạn",
			badgeClass: "border-danger/30 bg-danger-soft text-danger",
			scheduleLine,
			derived,
			isSubmitted: false,
			isOverdue: true,
			isUpcoming: false,
		};
	}

	// 3. Đến hạn hôm nay
	if (expectedDateISO === todayISO) {
		return {
			badgeLabel: "Hôm nay",
			badgeClass: "border-warn/30 bg-warn-soft text-warn",
			scheduleLine: `Dự kiến: ${formatExpectedDatePhrase(expectedDateISO, todayISO)}${dueTimeSuffix}`,
			derived,
			isSubmitted: false,
			isOverdue: false,
			isUpcoming: false,
		};
	}

	// 4. Lịch sắp tới / có thể làm trước (không dùng "Sắp đến hạn" hay "Quá hạn")
	const isFuture =
		expectedDateISO !== null &&
		STRICT_ISO_DATE_RE.test(expectedDateISO) &&
		expectedDateISO > todayISO;
	return {
		badgeLabel: "Có thể làm trước",
		badgeClass: "border-border bg-muted/50 text-muted-foreground",
		scheduleLine: expectedDateISO
			? `Dự kiến: ${formatExpectedDatePhrase(expectedDateISO, todayISO)}${dueTimeSuffix}`
			: dueTimeSuffix
				? `Làm tự do${dueTimeSuffix}`
				: null,
		derived,
		isSubmitted: false,
		isOverdue: false,
		isUpcoming: isFuture,
	};
}

function getActionLabel(
	isSubmitted: boolean,
	status: DerivedAssignmentStatus["status"],
): string {
	if (!isSubmitted) return "Làm bài";
	return status === "graded" ? "Nhận xét" : "Xem lại";
}

const GROUP_META: Record<
	AssignmentGroupKey,
	{ title: string; collapsible?: boolean }
> = {
	dueNowTodo: { title: "Cần làm hôm nay & quá hạn" },
	upcomingTodo: { title: "Lịch sắp tới · Có thể làm trước" },
	submitted: { title: "Đã nộp" },
	graded: { title: "Đã chấm", collapsible: true },
};

function StudyPackAssignmentRow({
	item,
	expanded,
	onToggleExpand,
}: {
	item: EnrichedStudyPackItem;
	expanded: boolean;
	onToggleExpand: () => void;
}) {
	const { assignment, presentation } = item;
	const { badgeLabel, badgeClass, scheduleLine, derived, isSubmitted } =
		presentation;
	const band = calculateIeltsBand(assignment.scores);
	const canExpand =
		assignment.scores != null ||
		assignment.gradedAt != null ||
		assignment.submittedAt != null;
	const detailId = `assignment-detail-${assignment.id}`;
	const actionLabel = getActionLabel(isSubmitted, derived.status);

	const metaParts = [
		assignment.studyPackTitle?.trim() || null,
		assignment.studyPackDayIndex != null
			? `Ngày ${assignment.studyPackDayIndex}`
			: null,
		formatAssignmentSkillLabel(assignment.skill),
	].filter((part): part is string => Boolean(part));

	const rowSummaryContent = (
		<>
			<span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/50 text-muted-foreground">
				<ClipboardList aria-hidden="true" className="size-4" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex flex-wrap items-center gap-2">
					<span className="break-words font-medium text-foreground text-sm">
						{assignment.title}
					</span>
					{assignment.studyPackStatus === "cancelled" && (
						<Badge
							variant="outline"
							className="border-border bg-muted/40 text-[11px] text-muted-foreground"
						>
							Bộ đề đã huỷ
						</Badge>
					)}
				</span>
				{metaParts.length > 0 && (
					<span className="mt-0.5 block text-muted-foreground text-xs">
						{metaParts.join(" · ")}
					</span>
				)}
				{scheduleLine && (
					<span className="mt-0.5 flex items-center gap-1 text-muted-foreground text-xs tabular-nums">
						<Calendar aria-hidden="true" className="size-3 shrink-0" />
						{scheduleLine}
					</span>
				)}
			</span>
		</>
	);

	return (
		<li className="rounded-lg border border-border bg-card transition-colors">
			<div className="flex flex-wrap items-center gap-3 px-4 py-3">
				{canExpand ? (
					<button
						type="button"
						onClick={onToggleExpand}
						aria-expanded={expanded}
						aria-controls={detailId}
						className="flex min-w-0 flex-1 basis-[200px] cursor-pointer items-start gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						{rowSummaryContent}
					</button>
				) : (
					<div className="flex min-w-0 flex-1 basis-[200px] items-start gap-3">
						{rowSummaryContent}
					</div>
				)}

				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{band != null && (
						<span className="rounded-md bg-success-soft px-2 py-0.5 font-semibold text-success text-xs tabular-nums">
							Band {band.toFixed(1)}
						</span>
					)}
					<Badge
						variant="outline"
						data-testid="study-pack-status-badge"
						className={badgeClass}
					>
						{badgeLabel}
					</Badge>
					{assignment.source === "class_assignment" && (
						<Link
							to="/learn/quizzes/$assignmentId"
							params={{ assignmentId: assignment.id }}
							aria-label={`${isSubmitted ? "Xem lại kết quả" : "Làm bài"}: ${assignment.title}`}
							className={cn(
								buttonVariants({
									variant: isSubmitted ? "outline" : "default",
									size: "sm",
								}),
							)}
						>
							{actionLabel}
						</Link>
					)}
					{canExpand && (
						<button
							type="button"
							onClick={onToggleExpand}
							aria-label={expanded ? "Thu gọn chi tiết" : "Xem chi tiết bài"}
							className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							<ChevronDown
								aria-hidden="true"
								className={cn(
									"size-4 transition-transform duration-150",
									expanded && "rotate-180",
								)}
							/>
						</button>
					)}
				</div>
			</div>

			{canExpand && expanded && (
				<div
					id={detailId}
					className="space-y-3 border-border/70 border-t bg-muted/20 px-4 py-3 text-sm"
				>
					{assignment.scores != null ? (
						<div className="space-y-2">
							<div className="flex items-center justify-between text-xs">
								<span className="font-medium text-muted-foreground">
									Điểm từng tiêu chí IELTS
								</span>
								{band != null && (
									<span className="font-semibold text-foreground tabular-nums">
										Overall Band {band.toFixed(1)}
									</span>
								)}
							</div>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
								{(
									[
										["Task", assignment.scores.task],
										["Coherence", assignment.scores.coherence],
										["Lexical", assignment.scores.lexical],
										["Grammar", assignment.scores.grammar],
									] as const
								)
									.filter(([, score]) => typeof score === "number")
									.map(([label, score]) => (
										<div
											key={label}
											className="rounded-md border border-border bg-card px-2.5 py-1.5"
										>
											<span className="block text-[11px] text-muted-foreground">
												{label}
											</span>
											<span className="font-semibold text-foreground text-sm tabular-nums">
												{(score as number).toFixed(1)}
											</span>
										</div>
									))}
							</div>
						</div>
					) : assignment.gradedAt != null ? (
						<p className="text-muted-foreground text-xs">
							Giáo viên đã chốt trả bài. Mở “Nhận xét” để xem điểm và ghi chú
							chi tiết.
						</p>
					) : (
						<p className="text-muted-foreground text-xs">
							{hasGradableTask({
								skill: assignment.skill ?? "",
								hasWriting: assignment.hasWriting,
							})
								? "Bạn đã nộp bài. Giáo viên sẽ chấm và gửi nhận xét trong thời gian sớm nhất."
								: "Bạn đã hoàn thành và nộp bài tập này. Bạn có thể mở lại để xem chi tiết bài làm."}
						</p>
					)}
				</div>
			)}
		</li>
	);
}

export interface ClassAssignmentsTabProps {
	assignments: StudentAssignment[];
	todayISO: string;
	nowMs: number;
	filter?: AssignmentTabFilter;
	onFilterChange?: (next: AssignmentTabFilter) => void;
	onGoToJourney?: () => void;
}

export function ClassAssignmentsTab({
	assignments,
	todayISO,
	nowMs,
	filter,
	onFilterChange,
	onGoToJourney,
}: ClassAssignmentsTabProps) {
	const [localFilter, setLocalFilter] = useState<AssignmentTabFilter>("all");
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
	const [gradedOpen, setGradedOpen] = useState(false);

	const activeFilter = filter ?? localFilter;
	const handleFilterSelect = (next: AssignmentTabFilter) => {
		if (onFilterChange) {
			onFilterChange(next);
		} else {
			setLocalFilter(next);
		}
	};

	const studyPackAssignments = useMemo(
		() => assignments.filter((a) => Boolean(a.classStudyPackId)),
		[assignments],
	);

	const hasSessionHomework = useMemo(
		() =>
			assignments.some((a) => !a.classStudyPackId && Boolean(a.sessionDate)),
		[assignments],
	);
	const hasUnlinkedHomework = useMemo(
		() => assignments.some((a) => !a.classStudyPackId && !a.sessionDate),
		[assignments],
	);

	const enriched = useMemo<EnrichedStudyPackItem[]>(() => {
		return studyPackAssignments.map((assignment) => ({
			assignment,
			expectedDateISO: resolveAssignmentExpectedDateISO(assignment),
			presentation: deriveStudyPackPresentation(assignment, todayISO, nowMs),
		}));
	}, [studyPackAssignments, todayISO, nowMs]);

	const grouped = useMemo(() => {
		const dueNowTodo: EnrichedStudyPackItem[] = [];
		const upcomingTodo: EnrichedStudyPackItem[] = [];
		const submitted: EnrichedStudyPackItem[] = [];
		const graded: EnrichedStudyPackItem[] = [];

		for (const item of enriched) {
			if (item.presentation.isSubmitted) {
				if (item.presentation.derived.status === "graded") {
					graded.push(item);
				} else {
					submitted.push(item);
				}
			} else if (isClassAssignmentDueNow(item.assignment, todayISO)) {
				dueNowTodo.push(item);
			} else {
				upcomingTodo.push(item);
			}
		}

		dueNowTodo.sort(compareStudyPackItems);
		upcomingTodo.sort(compareStudyPackItems);
		submitted.sort(compareStudyPackItems);
		graded.sort(compareStudyPackItems);

		return { dueNowTodo, upcomingTodo, submitted, graded };
	}, [enriched, todayISO]);

	const toggleExpand = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	if (studyPackAssignments.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-xl border bg-card px-4 py-10 text-center shadow-sm">
				<div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
					<ClipboardList aria-hidden="true" className="size-5" />
				</div>
				<p className="font-medium text-[15px] text-foreground">
					Chưa có bộ đề tự học
				</p>
				<p className="mt-1 max-w-[44ch] text-[13px] text-muted-foreground">
					{hasSessionHomework
						? "Bài tập về nhà theo buổi đã được hiển thị trực tiếp bên trong từng buổi ở Tab Hành trình học."
						: hasUnlinkedHomework
							? "Lớp chưa được gán bộ đề tự học. Các bài tập khác của bạn nằm ở trang Bài tập chung."
							: "Khi giáo viên gán bộ đề tự học theo ngày cho lớp, toàn bộ bài sẽ hiện ở đây kèm ngày dự kiến."}
				</p>
				{hasSessionHomework ? (
					<div className="mt-4">
						<button
							type="button"
							onClick={() => onGoToJourney?.()}
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								"cursor-pointer",
							)}
						>
							Xem Hành trình học
						</button>
					</div>
				) : hasUnlinkedHomework ? (
					<div className="mt-4">
						<Link
							to="/assignments"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Xem tất cả bài tập
						</Link>
					</div>
				) : null}
			</div>
		);
	}

	const { dueNowTodo, upcomingTodo, submitted, graded } = grouped;
	const overdueCount = dueNowTodo.filter(
		(i) => i.presentation.isOverdue,
	).length;
	const primaryDueNow =
		dueNowTodo.find((i) => i.assignment.source === "class_assignment") ?? null;
	const primaryUpcoming =
		upcomingTodo.find((i) => i.assignment.source === "class_assignment") ??
		null;
	const todoTotalCount = dueNowTodo.length + upcomingTodo.length;

	const filterOptions: Array<{
		id: AssignmentTabFilter;
		label: string;
		count?: number;
	}> = [
		{ id: "all", label: "Tất cả" },
		{ id: "todo", label: "Chưa làm", count: todoTotalCount },
		{ id: "submitted", label: "Đã nộp", count: submitted.length },
		{ id: "graded", label: "Đã chấm", count: graded.length },
	];

	const visibleGroups: AssignmentGroupKey[] =
		activeFilter === "all"
			? ["dueNowTodo", "upcomingTodo", "submitted", "graded"]
			: activeFilter === "todo"
				? ["dueNowTodo", "upcomingTodo"]
				: activeFilter === "submitted"
					? ["submitted"]
					: ["graded"];

	const hasAnyInFilter = visibleGroups.some((k) => grouped[k].length > 0);

	return (
		<div className="space-y-5">
			{dueNowTodo.length > 0 ? (
				<div
					data-testid="assignments-todo-strip"
					className={cn(
						"flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
						overdueCount > 0
							? "border-danger/30 bg-danger-soft/40"
							: "border-warn/30 bg-warn-soft/50",
					)}
				>
					<div className="min-w-0 space-y-0.5">
						<div className="flex flex-wrap items-center gap-2 font-semibold text-foreground text-sm">
							<span>{dueNowTodo.length} bài cần làm</span>
							{overdueCount > 0 && (
								<span className="rounded-md bg-danger-soft px-2 py-0.5 font-medium text-danger text-xs">
									{overdueCount} quá hạn
								</span>
							)}
						</div>
						{primaryDueNow && (
							<p className="truncate text-muted-foreground text-xs">
								Ưu tiên: {primaryDueNow.assignment.title}
							</p>
						)}
					</div>
					{primaryDueNow && (
						<Link
							to="/learn/quizzes/$assignmentId"
							params={{ assignmentId: primaryDueNow.assignment.id }}
							className={buttonVariants({ variant: "default", size: "sm" })}
						>
							Làm bài này
						</Link>
					)}
				</div>
			) : upcomingTodo.length > 0 ? (
				<div
					data-testid="assignments-todo-strip"
					className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3"
				>
					<div className="min-w-0 space-y-0.5">
						<p className="font-semibold text-foreground text-sm">
							Bạn đã xong bài hôm nay
						</p>
						<p className="text-muted-foreground text-xs">
							Còn {upcomingTodo.length} bài sắp tới — có thể mở làm trước bất cứ
							lúc nào.
						</p>
					</div>
					{primaryUpcoming && (
						<Link
							to="/learn/quizzes/$assignmentId"
							params={{ assignmentId: primaryUpcoming.assignment.id }}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Làm bài này
						</Link>
					)}
				</div>
			) : (
				<div
					data-testid="assignments-todo-strip"
					className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-2.5 text-sm text-success"
				>
					<Check aria-hidden="true" className="size-4 shrink-0" />
					<span className="font-medium">Bạn đã hoàn thành hết bài tập</span>
				</div>
			)}

			<fieldset
				aria-label="Lọc bài tập"
				className="m-0 flex flex-wrap items-center gap-2 border-0 p-0"
			>
				{filterOptions.map((opt) => {
					const active = activeFilter === opt.id;
					return (
						<button
							key={opt.id}
							type="button"
							aria-pressed={active}
							onClick={() => handleFilterSelect(opt.id)}
							className={cn(
								"inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 font-medium text-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
								active
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-card text-foreground hover:bg-muted",
							)}
						>
							<span>{opt.label}</span>
							{typeof opt.count === "number" && (
								<span
									aria-hidden="true"
									className={cn(
										"rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
										active
											? "bg-primary-foreground/20 text-primary-foreground"
											: "bg-muted text-muted-foreground",
									)}
								>
									{opt.count}
								</span>
							)}
						</button>
					);
				})}
			</fieldset>

			{!hasAnyInFilter ? (
				<div className="rounded-lg border border-border border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
					Không có bài tập nào trong mục này.
				</div>
			) : (
				<div className="space-y-6">
					{visibleGroups.map((groupKey) => {
						const groupItems = grouped[groupKey];
						if (groupItems.length === 0) return null;
						const meta = GROUP_META[groupKey];
						const isGradedCollapsible =
							Boolean(meta.collapsible) && activeFilter === "all";
						const isGroupExpanded = isGradedCollapsible ? gradedOpen : true;

						return (
							<section
								key={groupKey}
								aria-label={meta.title}
								className="space-y-2.5"
							>
								{isGradedCollapsible ? (
									<button
										type="button"
										aria-expanded={gradedOpen}
										aria-controls="assignments-graded-list"
										onClick={() => setGradedOpen((prev) => !prev)}
										className="flex w-full cursor-pointer items-center justify-between rounded-md py-1 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wider outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
									>
										<span>
											{meta.title} ({groupItems.length})
										</span>
										<ChevronDown
											aria-hidden="true"
											className={cn(
												"size-4 transition-transform duration-150",
												gradedOpen && "rotate-180",
											)}
										/>
									</button>
								) : (
									<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
										{meta.title} ({groupItems.length})
									</h3>
								)}

								{isGroupExpanded && (
									<ul
										id={
											isGradedCollapsible
												? "assignments-graded-list"
												: undefined
										}
										className="space-y-2"
									>
										{groupItems.map((item) => (
											<StudyPackAssignmentRow
												key={item.assignment.id}
												item={item}
												expanded={expandedIds.has(item.assignment.id)}
												onToggleExpand={() => toggleExpand(item.assignment.id)}
											/>
										))}
									</ul>
								)}
							</section>
						);
					})}
				</div>
			)}
		</div>
	);
}
