import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { resolveClassExpectedEndDate } from "@teacher-os/api/class-opening-email";
import { evaluateClassStartDateEditability } from "@teacher-os/api/class-start-date";
import {
	CLASS_ERROR_CODES,
	RECORDING_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { canManageClassStatus } from "@teacher-os/auth/role";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtDue } from "@/components/assignments/assignment-status";
import { ClassRosterTab } from "@/components/class-detail/class-roster-tab";
import { ClassSessionsManageModal } from "@/components/class-detail/class-sessions-manage-modal";
import { ClassSessionsSection } from "@/components/class-detail/class-sessions-section";
import { ClassSharedMaterialsTab } from "@/components/class-detail/class-shared-materials-tab";
import { CurriculumManagementSection } from "@/components/class-detail/curriculum-management-section";
import type {
	OccurrenceActionResult,
	OccurrenceEditPayload,
} from "@/components/class-detail/session-actions-modal";
import { AssignClassPromptModal } from "@/components/classes/assign-class-prompt-modal";
import {
	ClassAssignmentsTab,
	type LastAssignedTarget,
} from "@/components/classes/class-assignments-tab";
import { ClassStudyPackSection } from "@/components/classes/class-study-pack-section";
import { AddClassSessionModal } from "@/components/modals/add-class-session-modal";
import { ClassStatusModal } from "@/components/modals/class-status-modal";
import {
	ConfirmOpeningModal,
	type OpeningRosterEntry,
} from "@/components/modals/confirm-opening-modal";
import { EditClassFeeModal } from "@/components/modals/edit-class-fee-modal";
import { EditClassModal } from "@/components/modals/edit-class-modal";
import { EnrollStudentModal } from "@/components/modals/enroll-student-modal";
import { ImportSyllabusModal } from "@/components/modals/import-syllabus-modal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { Section } from "@/components/ui/section";
import { SectionLabel } from "@/components/ui/section-label";
import { Tabs } from "@/components/ui/tabs";
import { VocabDeckList } from "@/components/vocab/vocab-deck-list";
import {
	formatSessionDate,
	resolveClassSessions,
	sessionLessonInfo,
	sessionStatus,
} from "@/lib/class-sessions";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import { formatSchedule } from "@/lib/format-schedule";
import { isHttpError } from "@/lib/kernel-load-state";
import { occurrenceSummary } from "@/lib/kernel-outcome";
import { CLASS_TYPE_LABELS, fmtVND } from "@/lib/mock-data";
import { makeupDateForShift } from "@/lib/repos/holidays";
import { notificationLogsAllQueryKey } from "@/lib/repos/notifications";
import { useClasses } from "@/lib/repos/use-classes";
import { useClassCurriculum } from "@/lib/repos/use-syllabus";
import { rosterDebtByStudent } from "@/lib/tuition-from-kernel";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";
import { todayISOVietnam } from "@/lib/week-grid";

const CLASS_DETAIL_TABS = [
	"sessions-practice",
	"roster",
	"curriculum",
	"materials",
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
	const queryClient = useQueryClient();
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
		const failureCode =
			result.kind === "definite-failure"
				? (result.code ??
					(isHttpError(result.error) ? result.error.code : undefined))
				: undefined;
		if (
			result.kind === "committed" ||
			result.kind === "outcome-unknown" ||
			failureCode === CLASS_ERROR_CODES.CLASS_PAUSED ||
			failureCode === RECORDING_ERROR_CODES.LOCKED
		) {
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
			code: failureCode,
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
	const handleDeleteOccurrence = (dateISO: string) =>
		runOccurrenceWrite(
			{ type: "delete-session-occurrence", classId, date: dateISO },
			"Đã xóa buổi học.",
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
	const [addSessionOpen, setAddSessionOpen] = useState(false);
	const [importSyllabusOpen, setImportSyllabusOpen] = useState(false);
	const [practiceMode, setPracticeMode] = useState<"sessions" | "study-pack">(
		"sessions",
	);
	const [assignModalOpen, setAssignModalOpen] = useState(false);
	const [assignSessionDate, setAssignSessionDate] = useState<string | null>(
		null,
	);
	const [lastAssigned, setLastAssigned] = useState<{
		classId: string;
		nonce: number;
		target?: LastAssignedTarget;
	}>({ classId, nonce: 0 });
	const [addStudentOpen, setAddStudentOpen] = useState(false);
	const [feeModalOpen, setFeeModalOpen] = useState(false);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [statusModalOpen, setStatusModalOpen] = useState(false);
	const [confirmOpeningOpen, setConfirmOpeningOpen] = useState(false);
	const [notes, setNotes] = useState<string | null>(null);
	const resetLastAssigned = () => setLastAssigned({ classId, nonce: 0 });
	useEffect(() => {
		if (lastAssigned.classId !== classId) {
			setAssignModalOpen(false);
			setAssignSessionDate(null);
			setConfirmOpeningOpen(false);
			setLastAssigned({ classId, nonce: 0 });
		}
	}, [classId, lastAssigned.classId]);
	const handleTabChange = (nextTab: string) => {
		setTab(nextTab);
		if (nextTab !== "sessions-practice") {
			setPracticeMode("sessions");
			resetLastAssigned();
		}
	};
	const sy = useClassCurriculum(classId);
	const cls = classById(classId);
	const isPaused = cls?.status === "paused";
	const canToggleStatus = canManageClassStatus(data.viewer?.role ?? "teacher");
	const classLessonsForClass = useMemo(
		() => data.lessons.filter((l) => l.classId === classId),
		[data.lessons, classId],
	);
	const classSessionsForClass = useMemo(
		() => (data.classSessions ?? []).filter((cs) => cs.classId === classId),
		[data.classSessions, classId],
	);
	const hasRealSessions =
		classLessonsForClass.length > 0 || classSessionsForClass.length > 0;
	const isManual =
		!sy &&
		(cls?.schedulingMode === "manual" || classSessionsForClass.length > 0);
	const holidayCancelDatesForClass = useMemo(
		() =>
			(data.holidayCancels ?? [])
				.filter((hc) => hc.classId === classId)
				.map((hc) => hc.date),
		[data.holidayCancels, classId],
	);
	const holidayShiftsForClass = useMemo(
		() =>
			(data.holidayShifts ?? [])
				.filter((hs) => hs.classId === classId)
				.map((hs) => ({
					originalDate: hs.originalDate,
					makeupDate: hs.makeupDate,
				})),
		[data.holidayShifts, classId],
	);
	const startDateEditability = cls
		? evaluateClassStartDateEditability({
				schedule: cls.schedule,
				sessionsTotal: cls.sessionsTotal,
				isManual,
				lessons: classLessonsForClass.map((l) => ({
					date: l.date ?? null,
					status: l.status,
					enrollmentKey: l.sid,
					attendance: l.attendance,
					attendanceNote: l.attendanceNote,
				})),
				holidayCancelDates: holidayCancelDatesForClass,
				holidayShifts: holidayShiftsForClass,
			})
		: { editable: false as const, reason: "class-started" as const };
	const canAddManualSession =
		!isPaused && !sy && (isManual || classLessonsForClass.length === 0);
	const canImportSyllabus =
		!sy &&
		classSessionsForClass.length === 0 &&
		classLessonsForClass.length === 0;

	useEffect(() => {
		if (!sy && manageOpen) setManageOpen(false);
		const closedByPause =
			isPaused && (addSessionOpen || addStudentOpen || confirmOpeningOpen);
		if (!canAddManualSession && addSessionOpen) setAddSessionOpen(false);
		if (!canImportSyllabus && importSyllabusOpen) setImportSyllabusOpen(false);
		if (isPaused && addStudentOpen) setAddStudentOpen(false);
		if (isPaused && confirmOpeningOpen) setConfirmOpeningOpen(false);
		if (closedByPause) {
			toast.error("Lớp đang tạm dừng — thao tác này tạm khóa.");
		}
	}, [
		isPaused,
		sy,
		manageOpen,
		canAddManualSession,
		addSessionOpen,
		addStudentOpen,
		confirmOpeningOpen,
		canImportSyllabus,
		importSyllabusOpen,
	]);

	if (!cls) {
		throw notFound();
	}
	const isOpeningConfirmed =
		(cls.openingAnnouncementVersion ?? 0) > 0 ||
		Boolean(cls.openingConfirmedAt);
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
	const validAssignSessions = useMemo(() => {
		const resolved = resolveClassSessions({
			cls,
			lessons: classLessonsForClass,
			syllabus: sy,
			classSessions: classSessionsForClass,
		});
		const projected =
			!resolved.isManual &&
			classLessonsForClass.length === 0 &&
			resolved.sessions !== null;
		if (
			projected ||
			!resolved.sessions ||
			!resolved.sessions.every((s) => s.mode === "v2")
		) {
			return [];
		}
		const shifts = data.holidayShifts ?? [];
		return resolved.sessions
			.filter((s) => {
				const st = sessionStatus(s);
				const shifted =
					s.rows.length === 0 &&
					makeupDateForShift({ holidayShifts: shifts }, cls.id, s.dateISO) !==
						null;
				return st !== "holiday" && st !== "cancelled" && !shifted;
			})
			.map((s) => {
				const info = sessionLessonInfo(s, sy);
				const dateText = formatSessionDate(s.dateISO);
				return {
					dateISO: s.dateISO,
					label: info.title
						? `Buổi ${s.index} · ${dateText} — ${info.title}`
						: `Buổi ${s.index} · ${dateText}`,
				};
			});
	}, [
		cls,
		classLessonsForClass,
		sy,
		classSessionsForClass,
		data.holidayShifts,
	]);
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
	const openingRoster = useMemo<OpeningRosterEntry[]>(() => {
		const seen = new Set<string>();
		const entries: OpeningRosterEntry[] = [];
		for (const sid of cls.studentIds) {
			if (seen.has(sid)) continue;
			const student = studentById(sid);
			if (student) {
				seen.add(sid);
				entries.push({ student, isInvited: false });
			}
		}
		for (const sid of cls.invitedStudentIds ?? []) {
			if (seen.has(sid)) continue;
			const student = studentById(sid);
			if (student) {
				seen.add(sid);
				entries.push({ student, isInvited: true });
			}
		}
		return entries;
	}, [cls.studentIds, cls.invitedStudentIds, studentById]);

	const effectiveOpeningSessionsTotal = useMemo(() => {
		if (!isManual && cls.sessionsTotal === 0 && sy) {
			const lessonCount = sy.modules.reduce(
				(sum, mod) => sum + mod.lessons.length,
				0,
			);
			if (lessonCount > 0) return lessonCount;
		}
		return cls.sessionsTotal;
	}, [isManual, cls.sessionsTotal, sy]);

	const openingSessionEndDate = useMemo(
		() =>
			resolveClassExpectedEndDate({
				startDate: cls.startDate,
				scheduleRaw: cls.schedule,
				sessionsTotal: effectiveOpeningSessionsTotal,
				isManual,
				lessons: classLessonsForClass,
				classSessions: classSessionsForClass,
				holidayShiftOriginalDates: holidayShiftsForClass.map(
					(s) => s.originalDate,
				),
				holidayCancelDates: holidayCancelDatesForClass,
			}),
		[
			cls.startDate,
			cls.schedule,
			effectiveOpeningSessionsTotal,
			isManual,
			classLessonsForClass,
			classSessionsForClass,
			holidayShiftsForClass,
			holidayCancelDatesForClass,
		],
	);

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
				kicker={
					<span className="inline-flex flex-wrap items-center gap-2">
						<span>
							{CLASS_TYPE_LABELS[cls.type]} · {formatSchedule(cls.schedule)} ·{" "}
							{cls.mode}
						</span>
						<Badge
							variant={isPaused ? "muted" : "success"}
							dot={!isPaused}
							data-testid="class-status-badge"
						>
							{isPaused ? "Tạm dừng" : "Đang hoạt động"}
						</Badge>
						{isOpeningConfirmed && (
							<Badge variant="success" data-testid="opening-confirmed-badge">
								Đã chốt khai giảng
							</Badge>
						)}
					</span>
				}
				title={cls.name}
				action={
					<>
						{canToggleStatus && (
							<Button
								variant="outline"
								size="sm"
								disabled={isPaused}
								title={
									isPaused
										? "Lớp đang tạm dừng — tạm khóa chốt khai giảng"
										: undefined
								}
								onClick={() => setConfirmOpeningOpen(true)}
							>
								{isOpeningConfirmed
									? "Thông báo khai giảng"
									: "Chốt khai giảng"}
							</Button>
						)}
						{canToggleStatus && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setStatusModalOpen(true)}
							>
								{isPaused ? "Mở lại lớp" : "Tạm dừng lớp"}
							</Button>
						)}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditModalOpen(true)}
						>
							Chỉnh sửa
						</Button>
						{sy ? (
							<Button
								size="sm"
								onClick={() => {
									setTab("sessions-practice");
									setManageOpen(true);
								}}
							>
								Sắp xếp buổi
							</Button>
						) : canAddManualSession ? (
							<Button size="sm" onClick={() => setAddSessionOpen(true)}>
								+ Thêm buổi học
							</Button>
						) : null}
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
					sub={cls.startDate.trim() ? `Từ ${fmtDue(cls.startDate)}` : undefined}
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
					{ id: "sessions-practice", label: "Buổi học & luyện tập" },
					{ id: "roster", label: "Học viên" },
					{ id: "curriculum", label: "Giáo trình" },
					{ id: "materials", label: "Tài liệu chung" },
					{ id: "vocab", label: "Từ vựng" },
					{ id: "notes", label: "Ghi chú" },
				]}
				active={tab}
				onChange={handleTabChange}
			/>

			{tab === "vocab" && <VocabDeckList classId={classId} />}
			{tab === "sessions-practice" && (
				<div className="space-y-4">
					<fieldset
						aria-label="Chế độ luyện tập"
						className="inline-flex rounded-md bg-muted p-1"
					>
						<button
							type="button"
							aria-pressed={practiceMode === "sessions"}
							onClick={() => setPracticeMode("sessions")}
							className={cn(
								"rounded-sm px-3 py-1.5 font-medium text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								practiceMode === "sessions"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{"Buổi học & bài giao"}
						</button>
						<button
							type="button"
							aria-pressed={practiceMode === "study-pack"}
							onClick={() => {
								setPracticeMode("study-pack");
								resetLastAssigned();
							}}
							className={cn(
								"rounded-sm px-3 py-1.5 font-medium text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								practiceMode === "study-pack"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							Bộ đề tự học
						</button>
					</fieldset>

					{practiceMode === "study-pack" ? (
						<ClassStudyPackSection
							key={`study-pack-${cls.id}`}
							classId={cls.id}
						/>
					) : (
						<div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start [&>*]:min-w-0">
							<ClassSessionsSection
								cls={cls}
								lessons={classLessonsForClass}
								legacyLessons={classLessons}
								syllabus={sy}
								classSessions={classSessionsForClass}
								holidayShifts={data.holidayShifts}
								sessionMeetings={data.sessionMeetings}
								classAssignments={classAssignments}
								onOpenAssignForSession={(dateISO) => {
									setAssignSessionDate(dateISO);
									setAssignModalOpen(true);
								}}
								onRefresh={refresh}
								studentById={studentById}
								run={run}
								onComplete={handleCompleteOccurrence}
								onCancelOccurrence={handleCancelOccurrence}
								onSaveEdit={handleSaveOccurrenceEdit}
								onDeleteOccurrence={handleDeleteOccurrence}
								onAddSession={
									canAddManualSession
										? () => setAddSessionOpen(true)
										: undefined
								}
								onImportSyllabus={
									canImportSyllabus
										? () => setImportSyllabusOpen(true)
										: undefined
								}
								isPending={isPending}
								busy={busy}
							/>
							<ClassAssignmentsTab
								key={`assign-${classId}`}
								classGroup={cls}
								onOpenAssignModal={() => {
									setAssignSessionDate(null);
									setAssignModalOpen(true);
								}}
								assignmentsFocus={assignmentsFocus}
								lastAssignedNonce={
									lastAssigned.classId === cls.id ? lastAssigned.nonce : 0
								}
								lastAssignedTarget={
									lastAssigned.classId === cls.id
										? lastAssigned.target
										: undefined
								}
								run={run}
								isPending={isPending}
								busy={busy}
							/>
						</div>
					)}
				</div>
			)}

			{tab === "roster" && (
				<div className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-muted-foreground text-sm">
							Học phí:{" "}
							{cls.tuitionFee ? `${fmtVND(cls.tuitionFee)} / học viên` : "—"}
						</p>
						<div className="flex gap-2">
							{!isPaused && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setAddStudentOpen(true)}
								>
									+ Thêm học viên vào lớp
								</Button>
							)}
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
						hasRealSessions={hasRealSessions}
						run={run}
						isPending={isPending}
						busy={busy}
					/>
				</Section>
			)}

			{tab === "materials" && (
				<ClassSharedMaterialsTab key={`materials-${cls.id}`} classId={cls.id} />
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
				key={`manage-sessions-${cls.id}`}
				open={manageOpen && Boolean(sy)}
				onClose={() => setManageOpen(false)}
				cls={cls}
				lessons={classLessonsForClass}
				classSessions={classSessionsForClass}
				run={run}
				isPending={isPending}
				busy={busy}
			/>
			<AddClassSessionModal
				key={`add-session-${cls.id}`}
				open={addSessionOpen && canAddManualSession}
				onClose={() => setAddSessionOpen(false)}
				cls={cls}
				existingDateISOs={classSessionsForClass.map((cs) => cs.date)}
			/>
			<ImportSyllabusModal
				key={`import-sessions-${cls.id}`}
				open={importSyllabusOpen && canImportSyllabus}
				onClose={() => setImportSyllabusOpen(false)}
				classId={cls.id}
			/>
			<EnrollStudentModal
				key={`enroll-student-${cls.id}`}
				open={addStudentOpen && !isPaused}
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
			<EditClassModal
				key={`edit-class-${cls.id}`}
				open={editModalOpen}
				onClose={() => setEditModalOpen(false)}
				cls={cls}
				hasRealSessions={hasRealSessions}
				isManual={isManual}
				startDateLocked={!startDateEditability.editable}
				startDateLockReason={startDateEditability.reason}
				canEditStartDate={canToggleStatus}
				existingClasses={data.classes}
			/>
			<ClassStatusModal
				key={`class-status-${cls.id}`}
				open={statusModalOpen}
				onClose={() => setStatusModalOpen(false)}
				cls={cls}
			/>
			<ConfirmOpeningModal
				key={`confirm-opening-${cls.id}`}
				open={confirmOpeningOpen && !isPaused}
				onClose={() => setConfirmOpeningOpen(false)}
				cls={cls}
				hasRealSessions={hasRealSessions}
				isManual={isManual}
				startDateLocked={!startDateEditability.editable}
				startDateLockReason={startDateEditability.reason}
				expectedEndDate={openingSessionEndDate}
				effectiveSessionsTotal={effectiveOpeningSessionsTotal}
				roster={openingRoster}
				onConfirmed={async () => {
					await refresh();
					await queryClient.invalidateQueries({
						queryKey: notificationLogsAllQueryKey,
					});
				}}
			/>
			<AssignClassPromptModal
				key={`assign-prompt-${cls.id}`}
				open={assignModalOpen}
				onClose={() => {
					setAssignModalOpen(false);
					setAssignSessionDate(null);
				}}
				classGroup={cls}
				sessions={validAssignSessions}
				defaultSessionDate={assignSessionDate}
				onAssigned={(info) =>
					setLastAssigned((prev) => ({
						classId: cls.id,
						nonce: (prev.classId === cls.id ? prev.nonce : 0) + 1,
						target: {
							assignedId: info.assignedId,
							baselineIds: info.baselineIds,
						},
					}))
				}
				onRequestAddStudent={
					isPaused
						? undefined
						: () => {
								setAssignModalOpen(false);
								handleTabChange("roster");
								setAddStudentOpen(true);
							}
				}
			/>
		</div>
	);
}
