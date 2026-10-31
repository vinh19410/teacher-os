import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClassRosterTab } from "@/components/class-detail/class-roster-tab";
import { ClassSessionsManageModal } from "@/components/class-detail/class-sessions-manage-modal";
import { ClassSessionsSection } from "@/components/class-detail/class-sessions-section";
import { CurriculumManagementSection } from "@/components/class-detail/curriculum-management-section";
import type {
	OccurrenceActionResult,
	OccurrenceEditPayload,
} from "@/components/class-detail/session-actions-modal";
import { ClassAssignmentsTab } from "@/components/classes/class-assignments-tab";
import { SelfStudyPlanSection } from "@/components/classes/self-study-plan-section";
import { EditClassFeeModal } from "@/components/modals/edit-class-fee-modal";
import { EnrollStudentModal } from "@/components/modals/enroll-student-modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { Section } from "@/components/ui/section";
import { SectionLabel } from "@/components/ui/section-label";
import { Tabs } from "@/components/ui/tabs";
import { VocabDeckList } from "@/components/vocab/vocab-deck-list";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import { formatSchedule } from "@/lib/format-schedule";
import { occurrenceSummary } from "@/lib/kernel-outcome";
import { CLASS_TYPE_LABELS, fmtVND } from "@/lib/mock-data";
import { useClasses } from "@/lib/repos/use-classes";
import { useClassCurriculum } from "@/lib/repos/use-syllabus";
import { rosterDebtByStudent } from "@/lib/tuition-from-kernel";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";
import { todayISOVietnam } from "@/lib/week-grid";

const CLASS_DETAIL_TABS = [
	"sessions-practice",
	"roster",
	"curriculum",
	"vocab",
	"notes",
] as const;
export type ClassDetailTab = (typeof CLASS_DETAIL_TABS)[number];

/**
 * Giá trị `?tab=` cũ trước gộp tab (#391) — vẫn hợp lệ trong URL (link
 * "← Về lớp" của trang chấm #319 phát `tab=assignments` và e2e assert đúng
 * chuỗi này), được map sang tab gộp lúc render, không map trong
 * `validateSearch` để URL không bị normalize.
 */
const LEGACY_TAB_VALUES = ["sessions", "assignments"] as const;
export type LegacyClassDetailTab = (typeof LEGACY_TAB_VALUES)[number];

function isClassDetailTab(
	v: string,
): v is ClassDetailTab | LegacyClassDetailTab {
	return (
		(CLASS_DETAIL_TABS as readonly string[]).includes(v) ||
		(LEGACY_TAB_VALUES as readonly string[]).includes(v)
	);
}

export function validateClassDetailSearch(search: Record<string, unknown>): {
	tab?: ClassDetailTab | LegacyClassDetailTab;
} {
	const tab = search.tab;
	return typeof tab === "string" && isClassDetailTab(tab) ? { tab } : {};
}

export const Route = createFileRoute("/_auth/classes/$classId")({
	validateSearch: validateClassDetailSearch,
	component: ClassDetailRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<h1 className="font-semibold text-xl">Không tìm thấy lớp</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				Lớp này không tồn tại hoặc dữ liệu demo đã được reset.
			</p>
			<Link
				to="/classes"
				className="mt-4 inline-block font-medium text-primary text-sm hover:text-primary"
			>
				← Về danh sách lớp
			</Link>
		</Card>
	),
});

function ClassDetailRoute() {
	const { classId } = Route.useParams();
	const { dispatch, refresh } = useData();

	/**
	 * #98 threaded occurrence writes: ONE toast per action composed at this
	 * level from the server payload `{updated, skipped}` (+ reason guidance),
	 * plus the reconcile pass for committed/outcome-unknown results. The
	 * modal itself stays dispatch-free per the #91 callback contract.
	 */
	async function runOccurrenceWrite(
		action: Parameters<typeof dispatch>[0],
		successText: string,
	): Promise<OccurrenceActionResult> {
		const result = await dispatch(action);
		const summary = occurrenceSummary(result, successText);
		toast[summary.kind](summary.message);
		if (result.kind === "committed" || result.kind === "outcome-unknown") {
			await refresh();
		}
		// committed counts as landed for UX truthfulness: the write IS saved;
		// the toast prefix already carries the refetch caveat.
		const landed = result.kind === "refreshed" || result.kind === "committed";
		return {
			ok: landed,
			updated: "updated" in result ? result.updated : undefined,
			skipped: "skipped" in result ? result.skipped : undefined,
			reason:
				result.kind === "definite-failure" && "reason" in result
					? result.reason
					: undefined,
		};
	}

	const handleCompleteOccurrence = (dateISO: string) =>
		runOccurrenceWrite(
			{ type: "session-check-in", classId, date: dateISO },
			"Đã hoàn thành buổi.",
		);

	const handleCancelOccurrence = (dateISO: string) =>
		runOccurrenceWrite(
			{ type: "session-cancel", classId, date: dateISO },
			"Đã hủy buổi.",
		);

	const handleSaveOccurrenceEdit = (
		dateISO: string,
		payload: OccurrenceEditPayload,
	) =>
		runOccurrenceWrite(
			{ type: "session-edit", classId, date: dateISO, payload },
			payload.moveDate !== undefined ? "Đã dời buổi." : "Đã cập nhật buổi.",
		);
	const { classById } = useClasses();
	const { studentById, data } = useData();
	const { run, isPending, busy } = useDirectKernelAction();
	const search = Route.useSearch();
	// Giá trị legacy (sessions/assignments) map sang tab gộp lúc render; URL
	// giữ nguyên giá trị cũ cho tới khi người dùng bấm tab (#391).
	const activeTab =
		search.tab === "sessions" || search.tab === "assignments"
			? "sessions-practice"
			: (search.tab ?? "sessions-practice");
	// #319: vào bằng ?tab=assignments (nút "← Về lớp" của trang chấm) —
	// accordion bài đã giao mở sẵn toàn bộ item.
	const assignmentsFocus = search.tab === "assignments";
	const [tab, setTab] = useState<string>(activeTab);
	const [manageOpen, setManageOpen] = useState(false);
	const [assignmentsView, setAssignmentsView] = useState<
		"list" | "assign" | "success"
	>("list");
	const [practiceMode, setPracticeMode] = useState<"manual" | "self-study">(
		"manual",
	);
	const [addStudentOpen, setAddStudentOpen] = useState(false);
	const [feeModalOpen, setFeeModalOpen] = useState(false);
	const [notes, setNotes] = useState<string | null>(null);
	const handleTabChange = (nextTab: string) => {
		setTab(nextTab);
		if (nextTab !== "sessions-practice") {
			setAssignmentsView("list");
		}
	};
	const sy = useClassCurriculum(classId);
	const cls = classById(classId);

	if (!cls) {
		throw notFound();
	}
	const classLessons = data.lessons.filter((l) =>
		cls.studentIds.includes(l.sid),
	);
	const pct =
		cls.sessionsTotal > 0
			? Math.round((cls.sessionsDone / cls.sessionsTotal) * 100)
			: 0;
	const classAssignments = useMemo(() => {
		return (data.classAssignments ?? []).filter((ca) => ca.classId === classId);
	}, [data.classAssignments, classId]);
	// "Hôm nay" tính trong memo (#322): data đổi/reload là tính lại; tab mở
	// qua nửa đêm không tự chuyển "Quá hạn" cho tới khi có refetch — chấp nhận.
	const rosterDebt = useMemo(
		() =>
			rosterDebtByStudent(
				classId,
				data.enrollments,
				data.invoices,
				todayISOVietnam(),
			),
		[classId, data.enrollments, data.invoices],
	);
	const totalTargetsCount = useMemo(() => {
		return classAssignments.reduce((acc, ca) => acc + ca.targets.length, 0);
	}, [classAssignments]);
	const doneTargetsCount = useMemo(() => {
		return classAssignments.reduce(
			(acc, ca) =>
				acc + ca.targets.filter((t) => t.submittedAt !== null).length,
			0,
		);
	}, [classAssignments]);

	return (
		<div>
			<Link
				to="/classes"
				className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4")}
			>
				<ArrowLeft className="size-4" />
				Lớp học
			</Link>
			<PageHead
				kicker={`${CLASS_TYPE_LABELS[cls.type]} · ${formatSchedule(cls.schedule)} · ${cls.mode}`}
				title={cls.name}
				action={
					<>
						{assignmentsView === "list" && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setTab("sessions-practice");
									setAssignmentsView("assign");
								}}
							>
								Giao bài tập
							</Button>
						)}
						<Button
							size="sm"
							disabled={!sy}
							onClick={() => {
								setTab("sessions-practice");
								setManageOpen(true);
							}}
						>
							Sắp xếp buổi
						</Button>
					</>
				}
			/>

			<div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
				<StatCard
					num={String(cls.studentIds.length)}
					label={
						(cls.invitedStudentIds ?? []).length > 0
							? `học viên · ${cls.invitedStudentIds.length} chờ xác nhận`
							: "học viên"
					}
					sub={`Từ ${cls.startDate}`}
				/>
				<StatCard
					num={`${cls.sessionsDone}/${cls.sessionsTotal}`}
					label="buổi đã học"
					sub={`${pct}% giáo trình`}
				/>
				<StatCard
					num={sy ? String(sy.totalLessons) : "—"}
					label="bài trong syllabus"
				/>
				<StatCard
					num={String(totalTargetsCount - doneTargetsCount)}
					label="bài chờ nộp"
					sub={`Trên ${classAssignments.length} bài đã giao`}
				/>
			</div>

			<Tabs
				tabs={[
					{ id: "sessions-practice", label: "Sessions & practice" },
					{ id: "roster", label: "Học viên" },
					{ id: "curriculum", label: "Giáo trình" },
					{ id: "vocab", label: "Từ vựng" },
					{ id: "notes", label: "Ghi chú" },
				]}
				active={tab}
				onChange={handleTabChange}
			/>

			{tab === "vocab" && <VocabDeckList classId={classId} />}
			{tab === "sessions-practice" &&
				(assignmentsView !== "list" ? (
					<ClassAssignmentsTab
						key={classId}
						classGroup={cls}
						view={assignmentsView}
						onViewChange={setAssignmentsView}
					/>
				) : (
					<div className="grid gap-6 xl:grid-cols-2 xl:items-start">
						<ClassSessionsSection
							cls={cls}
							lessons={data.lessons.filter((l) => l.classId === classId)}
							legacyLessons={classLessons}
							syllabus={sy}
							studentById={studentById}
							run={run}
							onComplete={handleCompleteOccurrence}
							onCancelOccurrence={handleCancelOccurrence}
							onSaveEdit={handleSaveOccurrenceEdit}
							isPending={isPending}
							busy={busy}
						/>
						<div className="space-y-4">
							<fieldset
								aria-label="Chế độ giao bài"
								className="inline-flex rounded-md border border-border bg-background p-1"
							>
								<button
									type="button"
									aria-pressed={practiceMode === "manual"}
									onClick={() => setPracticeMode("manual")}
									className={cn(
										"rounded px-3 py-1 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
										practiceMode === "manual"
											? "bg-muted text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									Bài giao tay
								</button>
								<button
									type="button"
									aria-pressed={practiceMode === "self-study"}
									data-testid="practice-mode-self-study"
									onClick={() => setPracticeMode("self-study")}
									className={cn(
										"rounded px-3 py-1 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
										practiceMode === "self-study"
											? "bg-muted text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									Kế hoạch tự học
								</button>
							</fieldset>
							{practiceMode === "manual" ? (
								<ClassAssignmentsTab
									key={`assign-${classId}`}
									classGroup={cls}
									view="list"
									onViewChange={setAssignmentsView}
									assignmentsFocus={assignmentsFocus}
								/>
							) : (
								<SelfStudyPlanSection key={`ssp-${classId}`} classId={cls.id} />
							)}
						</div>
					</div>
				))}

			{tab === "roster" && (
				<div className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							Học phí:{" "}
							{cls.tuitionFee ? `${fmtVND(cls.tuitionFee)} / học viên` : "—"}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setAddStudentOpen(true)}
							>
								+ Thêm học viên vào lớp
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setFeeModalOpen(true)}
							>
								Sửa
							</Button>
						</div>
					</div>
					<ClassRosterTab
						cls={cls}
						data={data}
						studentById={studentById}
						rosterDebt={rosterDebt}
						run={run}
						busy={busy}
					/>
				</div>
			)}

			{tab === "curriculum" && (
				<Section title="Giáo trình">
					<CurriculumManagementSection
						key={`curriculum-${cls.id}`}
						cls={cls}
						run={run}
						isPending={isPending}
						busy={busy}
					/>
				</Section>
			)}

			{tab === "notes" && (
				<Card variant="white">
					<SectionLabel>Ghi chú lớp</SectionLabel>
					<Textarea
						value={notes ?? cls.notes}
						onChange={(e) => setNotes(e.target.value)}
						className="min-h-30"
					/>
					<Button
						variant="secondary"
						size="sm"
						className="mt-3"
						disabled={busy || isPending("class-notes")}
						onClick={() =>
							void run(
								"class-notes",
								{
									type: "update-class-notes",
									classId: cls.id,
									notes: notes ?? cls.notes,
								},
								"Đã lưu ghi chú.",
							)
						}
					>
						{isPending("class-notes") ? "Đang lưu…" : "Lưu ghi chú"}
					</Button>
				</Card>
			)}

			<ClassSessionsManageModal
				open={manageOpen}
				onClose={() => setManageOpen(false)}
				cls={cls}
				run={run}
				isPending={isPending}
				busy={busy}
			/>
			<EnrollStudentModal
				key={`enroll-student-${cls.id}`}
				open={addStudentOpen}
				onClose={() => setAddStudentOpen(false)}
				classId={cls.id}
			/>
			<EditClassFeeModal
				key={`edit-fee-${cls.id}`}
				open={feeModalOpen}
				onClose={() => setFeeModalOpen(false)}
				classId={cls.id}
				current={cls.tuitionFee}
			/>
		</div>
	);
}
