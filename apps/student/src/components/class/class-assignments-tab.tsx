import { Link } from "@tanstack/react-router";
import type {
	StudentAssignment,
	StudentClassLesson,
} from "@teacher-os/api/contracts";
import { hasGradableTask } from "@teacher-os/api/lib/ielts-band";
import { evaluateAssignmentDeadline } from "@teacher-os/api/vietnam-date";
import { buttonVariants } from "@teacher-os/ui/components/button";
import {
	Calendar,
	Check,
	ChevronDown,
	ChevronRight,
	ClipboardList,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type AssignmentTabFilter,
	buildSessionNumberByDate,
	STRICT_ISO_DATE_RE,
	scrollElementToCenterAndFocus,
} from "@/components/class/class-detail-helpers";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { Badge } from "@/components/ui/badge";
import {
	calculateIeltsBand,
	type DerivedAssignmentStatus,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";
import { cn } from "@/lib/cn";
import { formatAssignmentSkillLabel } from "@/lib/student-overview-selectors";
import { formatVietnamDateFromISO } from "@/lib/vietnam-display-date";

interface EnrichedAssignment {
	assignment: StudentAssignment;
	derived: DerivedAssignmentStatus;
	dueMs: number | null;
}

type AssignmentGroupKey = Exclude<AssignmentTabFilter, "all">;

function getAssignmentGroup(
	status: DerivedAssignmentStatus["status"],
): AssignmentGroupKey {
	if (status === "graded") return "graded";
	if (status === "submitted") return "submitted";
	return "todo";
}

function getAssignmentActionLabel(
	isSubmitted: boolean,
	status: DerivedAssignmentStatus["status"],
): string {
	if (!isSubmitted) return "Làm bài";
	return status === "graded" ? "Nhận xét" : "Xem lại";
}

function getDueSortMs(
	assignment: StudentAssignment,
	todayISO: string,
	nowMs: number,
): number | null {
	const deadline = evaluateAssignmentDeadline({
		due: assignment.due,
		dueAt: assignment.dueAt,
		submittedAt: assignment.submittedAt,
		todayISO,
		nowMs,
		legacyDateLate: false,
	});
	if (deadline.hasDueAt && deadline.dueAtMs !== null) {
		return deadline.dueAtMs;
	}
	if (deadline.dueDateISO && STRICT_ISO_DATE_RE.test(deadline.dueDateISO)) {
		const ms = Date.parse(`${deadline.dueDateISO}T00:00:00Z`);
		return Number.isFinite(ms) ? ms : null;
	}
	return null;
}

function compareNullable(
	a: number | null,
	b: number | null,
	direction: "asc" | "desc",
): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return direction === "asc" ? a - b : b - a;
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
			return derived.isLate
				? "border-warn/30 bg-warn-soft text-warn"
				: "border-border bg-muted text-foreground";
		default:
			return "text-muted-foreground";
	}
}

function dueTextClass(status: DerivedAssignmentStatus["status"]): string {
	if (status === "overdue") return "text-danger";
	if (status === "due-soon") return "text-warn";
	return "text-muted-foreground";
}

function AssignmentRow({
	classId,
	entry,
	sessionNumber,
	sessionLesson,
	open,
	onToggle,
	registerButtonRef,
}: {
	classId: string;
	entry: EnrichedAssignment;
	sessionNumber: number | null;
	sessionLesson: StudentClassLesson | null;
	open: boolean;
	onToggle: (assignmentId: string) => void;
	registerButtonRef: (
		assignmentId: string,
		el: HTMLButtonElement | null,
	) => void;
}) {
	const { assignment, derived } = entry;
	const detailId = `asg-detail-${assignment.id}`;
	const skillLabel = formatAssignmentSkillLabel(assignment.skill);
	const metaParts = [
		sessionNumber !== null ? `Buổi ${sessionNumber}` : null,
		skillLabel,
	].filter((part): part is string => Boolean(part));

	const isSubmitted = Boolean(
		assignment.submittedAt || assignment.gradedAt || assignment.scores,
	);
	const actionLabel = getAssignmentActionLabel(isSubmitted, derived.status);
	const canLinkQuiz = assignment.source === "class_assignment";
	const validSessionDate =
		assignment.sessionDate &&
		STRICT_ISO_DATE_RE.test(assignment.sessionDate) &&
		sessionLesson != null
			? assignment.sessionDate
			: null;
	const bandScore = calculateIeltsBand(assignment.scores);
	const needsTeacherGrading = hasGradableTask({
		skill: assignment.skill ?? "",
		hasWriting: assignment.hasWriting,
	});

	return (
		<li id={`asg-${assignment.id}`}>
			<div
				className={cn(
					"flex min-w-0 flex-wrap items-center gap-2 px-3 py-3 transition-colors duration-150 sm:px-4",
					open ? "bg-muted/40" : "hover:bg-muted/30",
				)}
			>
				<button
					type="button"
					ref={(el) => registerButtonRef(assignment.id, el)}
					aria-expanded={open}
					aria-controls={detailId}
					onClick={() => onToggle(assignment.id)}
					className="flex min-h-11 min-w-0 flex-1 basis-[200px] cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:shadow-[var(--focus-ring)]"
				>
					<span className="min-w-0 flex-1 basis-[140px]">
						{metaParts.length > 0 && (
							<span className="block text-muted-foreground text-xs tabular-nums">
								{metaParts.join(" · ")}
							</span>
						)}
						<span className="mt-0.5 block break-words font-medium text-foreground text-sm sm:text-base">
							{assignment.title}
						</span>
						{derived.dueText && (
							<span
								className={cn(
									"mt-0.5 block text-xs tabular-nums sm:text-sm",
									dueTextClass(derived.status),
								)}
							>
								{derived.dueText}
							</span>
						)}
					</span>

					<span className="flex max-w-full shrink-0 items-center gap-2">
						<Badge
							variant="outline"
							className={cn(
								"whitespace-normal text-left tabular-nums",
								statusChipClass(derived),
							)}
						>
							{derived.status === "graded" && (
								<Check aria-hidden="true" className="size-3 shrink-0" />
							)}
							{derived.statusLabel}
						</Badge>
						<ChevronDown
							aria-hidden="true"
							className={cn(
								"size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
								open && "rotate-180",
							)}
						/>
					</span>
				</button>

				{canLinkQuiz && (
					<Link
						to="/learn/quizzes/$assignmentId"
						params={{ assignmentId: assignment.id }}
						aria-label={
							isSubmitted
								? `Xem lại kết quả: ${assignment.title}`
								: `Làm bài: ${assignment.title}`
						}
						className={cn(
							buttonVariants({
								variant: isSubmitted ? "outline" : "default",
								size: "sm",
							}),
							"shrink-0",
						)}
					>
						{actionLabel}
					</Link>
				)}
			</div>

			<div
				id={detailId}
				hidden={!open}
				className="border-border/70 border-t bg-muted/40 px-4 py-4 text-sm"
			>
				{open ? (
					<div className="space-y-4">
						{validSessionDate && (
							<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3.5 py-2.5">
								<div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs sm:text-sm">
									<Calendar
										aria-hidden="true"
										className="size-4 shrink-0 text-muted-foreground"
									/>
									<span className="min-w-0 break-words">
										Gắn với{" "}
										{sessionNumber !== null ? `Buổi ${sessionNumber} · ` : ""}
										{formatVietnamDateFromISO(validSessionDate)}
										{sessionLesson?.topic?.trim()
											? ` — ${sessionLesson.topic.trim()}`
											: ""}
									</span>
								</div>
								<Link
									to="/classes/$classId/sessions/$date"
									params={{ classId, date: validSessionDate }}
									className={cn(
										buttonVariants({ variant: "outline", size: "sm" }),
										"shrink-0",
									)}
								>
									Xem buổi học
									<ChevronRight aria-hidden="true" className="size-3.5" />
								</Link>
							</div>
						)}

						{derived.status === "graded" && assignment.scores != null && (
							<div className="space-y-3 rounded-lg border bg-card p-4">
								<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
									Kết quả chấm điểm
								</p>
								{bandScore !== null && (
									<p className="font-bold text-foreground text-xl tabular-nums tracking-tight">
										Band {bandScore.toFixed(1)}
									</p>
								)}
								<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
									{[
										{ label: "Task", value: assignment.scores.task },
										{ label: "Coherence", value: assignment.scores.coherence },
										{ label: "Lexical", value: assignment.scores.lexical },
										{ label: "Grammar", value: assignment.scores.grammar },
									].map((criterion) => (
										<div
											key={criterion.label}
											className="min-w-0 rounded-md border bg-muted/40 px-3 py-2"
										>
											<p className="truncate text-muted-foreground text-xs">
												{criterion.label}
											</p>
											<p className="mt-0.5 font-semibold text-foreground text-sm tabular-nums">
												{criterion.value}
											</p>
										</div>
									))}
								</div>
							</div>
						)}

						{derived.status === "graded" &&
							assignment.scores == null &&
							assignment.gradedAt != null && (
								<div className="rounded-lg border bg-card p-4">
									<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
										Kết quả chấm điểm
									</p>
									<p className="mt-1.5 text-foreground text-sm">
										Giáo viên đã chốt trả bài. Mở bài nộp để xem chi tiết nhận
										xét.
									</p>
								</div>
							)}

						{derived.status === "submitted" && (
							<p className="text-muted-foreground text-sm">
								{needsTeacherGrading
									? "Bạn đã nộp bài. Giáo viên sẽ chấm và gửi nhận xét trong thời gian sớm nhất."
									: "Bạn đã hoàn thành và nộp bài tập này. Bạn có thể mở lại để xem chi tiết bài làm."}
							</p>
						)}

						{derived.status !== "graded" && derived.status !== "submitted" && (
							<p className="text-muted-foreground text-sm">
								{canLinkQuiz
									? "Mở bài tập để làm bài trực tiếp và nộp cho giáo viên."
									: "Bài tập này do giáo viên chấm điểm và cập nhật kết quả trực tiếp trên hệ thống."}
							</p>
						)}
					</div>
				) : null}
			</div>
		</li>
	);
}

export interface ClassAssignmentsTabProps {
	classId: string;
	assignments: StudentAssignment[];
	lessons: StudentClassLesson[];
	todayISO: string;
	nowMs: number;
	filter?: AssignmentTabFilter;
	onFilterChange?: (next: AssignmentTabFilter) => void;
	focusedAssignmentId?: string | null;
	onFocusHandled?: () => void;
}

export function ClassAssignmentsTab({
	classId,
	assignments,
	lessons,
	todayISO,
	nowMs,
	filter,
	onFilterChange,
	focusedAssignmentId,
	onFocusHandled,
}: ClassAssignmentsTabProps) {
	const [localFilter, setLocalFilter] = useState<AssignmentTabFilter>("all");
	const activeFilter = filter ?? localFilter;
	const setFilter = useCallback(
		(next: AssignmentTabFilter) => {
			if (onFilterChange) {
				onFilterChange(next);
			} else {
				setLocalFilter(next);
			}
		},
		[onFilterChange],
	);

	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
	const [gradedOpen, setGradedOpen] = useState(false);
	const rowBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
	const prevClassIdRef = useRef(classId);

	useEffect(() => {
		if (prevClassIdRef.current === classId) return;
		prevClassIdRef.current = classId;
		setLocalFilter("all");
		setExpandedIds(new Set());
		setGradedOpen(false);
	}, [classId]);

	const sessionNumberByDate = useMemo(
		() => buildSessionNumberByDate(lessons),
		[lessons],
	);
	const clickableLessonByDate = useMemo(() => {
		const map = new Map<string, StudentClassLesson>();
		for (const item of lessons) {
			if (item.date && item.status !== "holiday" && !map.has(item.date)) {
				map.set(item.date, item);
			}
		}
		return map;
	}, [lessons]);

	const enriched = useMemo<EnrichedAssignment[]>(
		() =>
			assignments.map((assignment) => ({
				assignment,
				derived: deriveAssignmentStatus(assignment, todayISO, nowMs),
				dueMs: getDueSortMs(assignment, todayISO, nowMs),
			})),
		[assignments, todayISO, nowMs],
	);

	const { todo, submitted, graded, overdueCount } = useMemo(() => {
		const buckets: Record<AssignmentGroupKey, EnrichedAssignment[]> = {
			todo: [],
			submitted: [],
			graded: [],
		};
		for (const item of enriched) {
			buckets[getAssignmentGroup(item.derived.status)].push(item);
		}
		buckets.todo.sort(
			(a, b) =>
				a.derived.sortOrder - b.derived.sortOrder ||
				compareNullable(a.dueMs, b.dueMs, "asc") ||
				a.assignment.id.localeCompare(b.assignment.id),
		);
		buckets.submitted.sort(
			(a, b) =>
				compareNullable(a.dueMs, b.dueMs, "asc") ||
				a.assignment.id.localeCompare(b.assignment.id),
		);
		buckets.graded.sort(
			(a, b) =>
				compareNullable(a.dueMs, b.dueMs, "desc") ||
				a.assignment.id.localeCompare(b.assignment.id),
		);
		return {
			todo: buckets.todo,
			submitted: buckets.submitted,
			graded: buckets.graded,
			overdueCount: buckets.todo.filter((i) => i.derived.status === "overdue")
				.length,
		};
	}, [enriched]);

	const registerButtonRef = useCallback(
		(assignmentId: string, el: HTMLButtonElement | null) => {
			if (el) {
				rowBtnRefs.current.set(assignmentId, el);
			} else {
				rowBtnRefs.current.delete(assignmentId);
			}
		},
		[],
	);

	const handleToggle = useCallback((assignmentId: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(assignmentId)) {
				next.delete(assignmentId);
			} else {
				next.add(assignmentId);
			}
			return next;
		});
	}, []);

	// Pha 1 → Pha 2 focus khi nhảy từ Tab Hành trình học sang bài cụ thể
	useEffect(() => {
		if (!focusedAssignmentId) return;
		const target = enriched.find(
			(item) => item.assignment.id === focusedAssignmentId,
		);
		if (!target) {
			onFocusHandled?.();
			return;
		}
		if (
			activeFilter !== "all" &&
			activeFilter !== getAssignmentGroup(target.derived.status)
		) {
			setFilter("all");
			return;
		}
		if (
			target.derived.status === "graded" &&
			activeFilter !== "graded" &&
			!gradedOpen
		) {
			setGradedOpen(true);
			return;
		}
		const btn = rowBtnRefs.current.get(focusedAssignmentId);
		if (!btn) return;
		setExpandedIds((prev) => {
			if (prev.has(focusedAssignmentId)) return prev;
			const next = new Set(prev);
			next.add(focusedAssignmentId);
			return next;
		});
		scrollElementToCenterAndFocus(btn);
		onFocusHandled?.();
	}, [
		focusedAssignmentId,
		enriched,
		activeFilter,
		gradedOpen,
		setFilter,
		onFocusHandled,
	]);

	if (assignments.length === 0) {
		return (
			<OverviewEmptyState
				icon="book"
				title="Chưa có bài tập nào"
				description="Giáo viên chưa giao bài tập nào cho bạn."
			/>
		);
	}

	const priorityItem = todo[0] ?? null;
	const nextActionable =
		todo.find((item) => item.assignment.source === "class_assignment") ?? null;
	const featuredItem = nextActionable ?? priorityItem;

	const filterOptions: readonly {
		id: AssignmentTabFilter;
		label: string;
		count?: number;
	}[] = [
		{ id: "all", label: "Tất cả" },
		{ id: "todo", label: "Cần làm", count: todo.length },
		{ id: "submitted", label: "Đã nộp", count: submitted.length },
		{ id: "graded", label: "Đã chấm", count: graded.length },
	];

	const renderList = (items: EnrichedAssignment[], emptyMessage: string) => {
		if (items.length === 0) {
			return (
				<p className="rounded-xl border border-border border-dashed px-4 py-4 text-muted-foreground text-sm">
					{emptyMessage}
				</p>
			);
		}
		return (
			<ul className="divide-y overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
				{items.map((entry) => {
					const sessionDate = entry.assignment.sessionDate;
					const sessionNumber = sessionDate
						? (sessionNumberByDate.get(sessionDate) ?? null)
						: null;
					const sessionLesson = sessionDate
						? (clickableLessonByDate.get(sessionDate) ?? null)
						: null;
					return (
						<AssignmentRow
							key={entry.assignment.id}
							classId={classId}
							entry={entry}
							sessionNumber={sessionNumber}
							sessionLesson={sessionLesson}
							open={expandedIds.has(entry.assignment.id)}
							onToggle={handleToggle}
							registerButtonRef={registerButtonRef}
						/>
					);
				})}
			</ul>
		);
	};

	const forceGradedOpen = activeFilter === "graded";
	const isGradedExpanded = forceGradedOpen || gradedOpen;

	return (
		<div className="space-y-6">
			{featuredItem ? (
				<div
					data-testid="assignments-todo-strip"
					className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-[1.5px] border-primary bg-card p-4 text-card-foreground shadow-sm sm:p-6"
				>
					<div className="min-w-0 flex-1 basis-[240px]">
						<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
							Việc cần làm
						</p>
						<p className="mt-1 font-bold text-foreground text-xl tabular-nums tracking-tight sm:text-2xl">
							{todo.length} bài cần làm
							{overdueCount > 0 && (
								<>
									{" · "}
									<span className="text-danger">{overdueCount} quá hạn</span>
								</>
							)}
						</p>
						<p className="mt-1 break-words text-muted-foreground text-sm">
							Ưu tiên:{" "}
							<strong className="font-semibold text-foreground">
								{featuredItem.assignment.title}
							</strong>
							{featuredItem.derived.dueText
								? ` · ${featuredItem.derived.dueText}`
								: ""}
						</p>
					</div>
					{nextActionable && (
						<Link
							to="/learn/quizzes/$assignmentId"
							params={{ assignmentId: nextActionable.assignment.id }}
							className={cn(
								buttonVariants({ variant: "default", size: "default" }),
								"shrink-0",
							)}
						>
							<ClipboardList aria-hidden="true" className="size-4" />
							Làm bài này
						</Link>
					)}
				</div>
			) : (
				<div
					data-testid="assignments-todo-strip"
					className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6"
				>
					<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
						Việc cần làm
					</p>
					<p className="mt-1 font-bold text-foreground text-xl tracking-tight sm:text-2xl">
						Bạn đã hoàn thành hết bài tập
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Bài mới sẽ xuất hiện ở đây sau mỗi buổi học.
					</p>
				</div>
			)}

			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-semibold text-foreground text-lg tracking-tight">
					Bài tập của bạn
				</h2>
				{/* biome-ignore lint/a11y/useSemanticElements: nhóm nút lọc dùng role="group" + aria-label theo pattern ChipFilter cho SR/e2e */}
				<div
					role="group"
					aria-label="Lọc bài tập"
					className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"
				>
					{filterOptions.map((opt) => {
						const active = activeFilter === opt.id;
						return (
							<button
								key={opt.id}
								type="button"
								aria-pressed={active}
								onClick={() => setFilter(opt.id)}
								className={cn(
									"inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-3 font-medium text-xs transition-colors duration-150 sm:text-sm",
									active
										? "bg-background font-semibold text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<span>{opt.label}</span>
								{opt.count !== undefined && (
									<span
										aria-hidden="true"
										className="text-muted-foreground tabular-nums"
									>
										({opt.count})
									</span>
								)}
							</button>
						);
					})}
				</div>
			</div>

			<div className="space-y-6">
				{(activeFilter === "all" || activeFilter === "todo") && (
					<section aria-labelledby="asg-group-todo" className="space-y-3">
						<div className="flex items-baseline justify-between gap-3">
							<h3
								id="asg-group-todo"
								className="font-semibold text-base text-foreground tracking-tight sm:text-lg"
							>
								Cần làm
							</h3>
							<span className="text-muted-foreground text-sm tabular-nums">
								{todo.length} bài
							</span>
						</div>
						{renderList(todo, "Không còn bài nào cần làm. Tuyệt vời!")}
					</section>
				)}

				{(activeFilter === "all" || activeFilter === "submitted") && (
					<section aria-labelledby="asg-group-submitted" className="space-y-3">
						<div className="flex items-baseline justify-between gap-3">
							<h3
								id="asg-group-submitted"
								className="font-semibold text-base text-foreground tracking-tight sm:text-lg"
							>
								Đã nộp
							</h3>
							<span className="text-muted-foreground text-sm tabular-nums">
								{submitted.length} bài
							</span>
						</div>
						{renderList(submitted, "Chưa có bài nào đã nộp đang chờ chấm.")}
					</section>
				)}

				{(activeFilter === "all" || activeFilter === "graded") && (
					<section aria-labelledby="asg-group-graded" className="space-y-3">
						<div className="flex items-baseline justify-between gap-3">
							<h3
								id="asg-group-graded"
								className="font-semibold text-base text-foreground tracking-tight sm:text-lg"
							>
								{forceGradedOpen ? (
									"Đã chấm"
								) : (
									<button
										type="button"
										aria-expanded={isGradedExpanded}
										aria-controls="asg-graded-list"
										onClick={() => setGradedOpen((v) => !v)}
										className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md text-left outline-none focus-visible:shadow-[var(--focus-ring)]"
									>
										<span>Đã chấm</span>
										<ChevronDown
											aria-hidden="true"
											className={cn(
												"size-4 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
												isGradedExpanded && "rotate-180",
											)}
										/>
									</button>
								)}
							</h3>
							<span className="text-muted-foreground text-sm tabular-nums">
								{graded.length} bài
							</span>
						</div>
						<div id="asg-graded-list" hidden={!isGradedExpanded}>
							{isGradedExpanded
								? renderList(graded, "Chưa có bài nào được chấm.")
								: null}
						</div>
					</section>
				)}
			</div>
		</div>
	);
}
