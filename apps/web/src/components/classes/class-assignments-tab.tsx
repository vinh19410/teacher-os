import { Link } from "@tanstack/react-router";
import {
	formatBand,
	hasGradableTask,
	isGradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { BookOpen, ChevronDown, Headphones, Mic, PenLine } from "lucide-react";
import {
	type ComponentType,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	fmtDueDisplay,
	fmtWhen,
	rollupStatus,
	studentSubmissionStatus,
} from "@/components/assignments/assignment-status";
import { StatusTag } from "@/components/assignments/status-tag";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import type { ClassAssignment, ClassGroup } from "@/lib/mock-data";

export interface LastAssignedTarget {
	assignedId?: string;
	baselineIds?: ReadonlySet<string>;
}

export interface ClassAssignmentsTabProps {
	classGroup: ClassGroup;
	onOpenAssignModal: () => void;
	/** #319: vào bằng `?tab=assignments` từ trang chấm — mở sẵn toàn bộ item. */
	assignmentsFocus?: boolean;
	/** Tăng mỗi lần vừa giao bài thành công để tự mở sẵn bài mới nhất đầu danh sách. */
	lastAssignedNonce?: number;
	/** Định danh mục tiêu vừa giao (hoặc baseline trước POST) để chờ đúng snapshot mới (#717). */
	lastAssignedTarget?: LastAssignedTarget;
}

/** Icon kỹ năng cho header accordion bài đã giao (#391, design SKILL_ICON);
 * kỹ năng lạ rơi về BookOpen. Không có data thanh kỹ năng theo học viên nên
 * chỉ dùng ở mức icon. */
const SKILL_ICON: Record<string, ComponentType<{ className?: string }>> = {
	writing: PenLine,
	reading: BookOpen,
	listening: Headphones,
	speaking: Mic,
	grammar: BookOpen,
	vocabulary: BookOpen,
};

/** Nút "Chấm bài" (Link, không phải button thật) — outline `size=sm` của
 * design v2 (#391, thay bản chép tay kiểu v1). */
const GRADE_LINK_BUTTON_CLASS = buttonVariants({
	variant: "outline",
	size: "sm",
});

/** Phần chấm tay (#319) của một target đã nộp đề Writing/Speaking: đã chấm
 * → tag band + link sửa điểm; chưa chấm → nút "Chấm bài". Target chưa có
 * attempt (chưa nộp) không render gì. */
function TargetGradeActions({
	target,
	studentName,
}: {
	target: ClassAssignment["targets"][number];
	studentName: string;
}) {
	if (!target.attemptId) return null;
	if (target.band != null && target.gradedAt) {
		return (
			<>
				<StatusTag tone="ok">
					{`Đã chấm · Band ${formatBand(target.band)}`}
				</StatusTag>
				<Link
					to="/grading/$attemptId"
					params={{ attemptId: target.attemptId }}
					className="rounded-xs font-medium text-primary text-xs outline-none hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
				>
					Xem / sửa điểm
				</Link>
			</>
		);
	}
	return (
		<Link
			to="/grading/$attemptId"
			params={{ attemptId: target.attemptId }}
			aria-label={`Chấm bài của ${studentName}`}
			className={GRADE_LINK_BUTTON_CLASS}
		>
			Chấm bài
		</Link>
	);
}

export function ClassAssignmentsTab({
	classGroup,
	onOpenAssignModal,
	assignmentsFocus = false,
	lastAssignedNonce = 0,
	lastAssignedTarget,
}: ClassAssignmentsTabProps) {
	const { data, studentById } = useData();
	const effectiveNowMs = Date.now();
	const todayVN = vietnamTodayISO(new Date(effectiveNowMs));

	// Bài đã giao cho lớp này, sắp mới nhất lên đầu
	const classAssignments = useMemo(() => {
		return (data.classAssignments ?? [])
			.filter((ca) => ca.classId === classGroup.id)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}, [data.classAssignments, classGroup.id]);

	/**
	 * Accordion (#391): mặc định mở item có bài đã nộp chờ chấm (fallback:
	 * item đầu) như design mở 1 item; `assignmentsFocus` (#319 — vào từ trang
	 * chấm) mở toàn bộ. Toggle của người dùng đè default.
	 */
	const defaultOpenIds = useMemo(() => {
		if (assignmentsFocus) {
			return new Set(classAssignments.map((ca) => ca.id));
		}
		const firstPending = classAssignments.find((ca) =>
			ca.targets.some(
				(t) => t.submittedAt !== null && !(t.band != null && t.gradedAt),
			),
		);
		const first = firstPending ?? classAssignments[0];
		return first ? new Set([first.id]) : new Set<string>();
	}, [classAssignments, assignmentsFocus]);

	const [userOpenIds, setUserOpenIds] = useState<Set<string> | null>(null);
	const newestId = classAssignments[0]?.id;
	const lastHandledNonceRef = useRef(0);

	useEffect(() => {
		if (!lastAssignedNonce) {
			lastHandledNonceRef.current = 0;
			return;
		}
		if (lastAssignedNonce === lastHandledNonceRef.current) {
			return;
		}
		const matchedById = lastAssignedTarget?.assignedId
			? classAssignments.find((ca) => ca.id === lastAssignedTarget.assignedId)
			: undefined;
		const matchedByBaseline = lastAssignedTarget?.baselineIds
			? classAssignments.find(
					(ca) => !lastAssignedTarget.baselineIds?.has(ca.id),
				)
			: undefined;
		const targetId = lastAssignedTarget
			? (matchedById?.id ?? matchedByBaseline?.id)
			: newestId;
		// Đợi DataProvider commit bản ghi mới nếu TanStack Query notifyManager đến sau 1 tick.
		if (!targetId) return;
		lastHandledNonceRef.current = lastAssignedNonce;
		setUserOpenIds((prev) => {
			const next = new Set(prev ?? defaultOpenIds);
			next.add(targetId);
			return next;
		});
	}, [
		lastAssignedNonce,
		lastAssignedTarget,
		classAssignments,
		newestId,
		defaultOpenIds,
	]);

	const toggleItem = (id: string) => {
		const base = new Set(userOpenIds ?? defaultOpenIds);
		if (base.has(id)) {
			base.delete(id);
		} else {
			base.add(id);
		}
		setUserOpenIds(base);
	};

	const totalTargetsCount = classAssignments.reduce(
		(acc, ca) => acc + ca.targets.length,
		0,
	);
	const doneTargetsCount = classAssignments.reduce(
		(acc, ca) => acc + ca.targets.filter((t) => t.submittedAt !== null).length,
		0,
	);
	const summaryText =
		classAssignments.length === 0
			? "Chưa giao bài"
			: `${doneTargetsCount}/${totalTargetsCount} đã nộp`;

	return (
		<Section
			className="max-sm:[&>div:first-child>h2]:min-w-0 max-sm:[&>div:first-child>h2]:flex-wrap max-sm:[&>div:first-child]:flex-wrap"
			title={
				<>
					Bài đã giao lớp này{" "}
					<span
						id="assign-summary"
						className="font-normal text-muted-foreground text-xs"
					>
						{summaryText}
					</span>
				</>
			}
			count={classAssignments.length}
			action={
				classAssignments.length > 0 ? (
					<Button
						id="list-assign-btn"
						variant="outline"
						size="sm"
						onClick={onOpenAssignModal}
					>
						+ Giao bài tập
					</Button>
				) : undefined
			}
		>
			{classAssignments.length === 0 ? (
				<div className="rounded-lg border border-border border-dashed p-6 text-center">
					<p className="text-muted-foreground text-sm">
						Chưa giao bài nào cho lớp này.
					</p>
					<div className="mt-4 flex justify-center">
						<Button size="sm" onClick={onOpenAssignModal}>
							Giao bài tập
						</Button>
					</div>
				</div>
			) : (
				<div id="assigned-list" className="flex flex-col gap-2">
					{classAssignments.map((ca) => {
						const rollup = rollupStatus(ca, todayVN, effectiveNowMs);
						const doneCount = ca.targets.filter(
							(t) => t.submittedAt !== null,
						).length;
						const promptRow = data.assignmentPrompts?.find(
							(p) => p.id === ca.promptId,
						);
						const skill = promptRow?.skill ?? "";
						const gradable = promptRow
							? hasGradableTask(promptRow)
							: isGradableSkill(skill);
						const SkillIcon = SKILL_ICON[skill] ?? BookOpen;
						const open = (userOpenIds ?? defaultOpenIds).has(ca.id);
						const pctDone =
							ca.targets.length > 0
								? Math.round((doneCount / ca.targets.length) * 100)
								: 0;

						return (
							<article
								key={ca.id}
								aria-label={`${doneCount} trên ${ca.targets.length} đã nộp`}
								className="assign-item rounded-lg border"
							>
								<button
									type="button"
									aria-expanded={open}
									onClick={() => toggleItem(ca.id)}
									className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-4 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex-nowrap"
								>
									<span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
										<SkillIcon aria-hidden="true" className="size-4" />
									</span>
									<span className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
										<span className="block truncate font-medium text-sm">
											{ca.title}
										</span>
										<span className="block text-muted-foreground text-xs">
											Hạn {fmtDueDisplay(ca.due, ca.dueAt)} ·{" "}
											<span
												className={cn(
													"tabular-nums",
													doneCount === ca.targets.length
														? "text-success"
														: doneCount === 0 && "text-warn",
												)}
											>
												{doneCount}/{ca.targets.length} đã nộp
											</span>
										</span>
									</span>
									<span className="flex flex-wrap items-center gap-2 pl-12 sm:shrink-0 sm:pl-0">
										{promptRow?.writing != null && <Tag>+ Writing</Tag>}
										<StatusTag tone={rollup.tone}>{rollup.label}</StatusTag>
									</span>
									<span className="hidden w-24 sm:block">
										<span className="block h-1.5 overflow-hidden rounded-full bg-muted">
											<span
												className="block h-full rounded-full bg-success"
												style={{ width: `${pctDone}%` }}
											/>
										</span>
									</span>
									<ChevronDown
										aria-hidden="true"
										className={cn(
											"ml-auto size-4 shrink-0 text-muted-foreground transition-transform sm:ml-0",
											open && "rotate-180",
										)}
									/>
								</button>
								{open && (
									<div
										id={`assign-body-${ca.id}`}
										className="sub-list divide-y divide-border border-border border-t"
									>
										{ca.targets.map((target) => {
											const s = studentById(target.studentId);
											const sub = studentSubmissionStatus(
												target,
												ca.due,
												todayVN,
												{ dueAt: ca.dueAt, nowMs: effectiveNowMs },
											);
											return (
												<div
													key={target.studentId}
													className="sub-row flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
												>
													<div className="flex min-w-0 items-center gap-2.5">
														<Avatar text={s?.avatar ?? "??"} size="sm" />
														<strong className="truncate font-medium text-foreground text-sm">
															{s?.name ?? target.studentId}
														</strong>
													</div>
													<div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end sm:gap-3">
														<span className="text-muted-foreground text-xs">
															{target.submittedAt
																? fmtWhen(target.submittedAt)
																: "Chưa có bài nộp"}
														</span>
														<StatusTag tone={sub.tone}>{sub.label}</StatusTag>
														{gradable && (
															<TargetGradeActions
																target={target}
																studentName={s?.name ?? target.studentId}
															/>
														)}
													</div>
												</div>
											);
										})}
									</div>
								)}
							</article>
						);
					})}
				</div>
			)}
		</Section>
	);
}
