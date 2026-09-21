import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClassScheduleTable } from "@/components/class-detail/class-schedule-table";
import { ClassSessionsManageModal } from "@/components/class-detail/class-sessions-manage-modal";
import { CurriculumManagementSection } from "@/components/class-detail/curriculum-management-section";
import type {
	OccurrenceActionResult,
	OccurrenceEditPayload,
} from "@/components/class-detail/session-actions-modal";
import { ClassAssignmentsTab } from "@/components/classes/class-assignments-tab";
import { AddStudentModal } from "@/components/modals/add-student-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Textarea } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { Tabs } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { formatSchedule } from "@/lib/format-schedule";
import { occurrenceSummary } from "@/lib/kernel-outcome";
import { CLASS_TYPE_LABELS, classMeta, fmtVND } from "@/lib/mock-data";
import { useClasses } from "@/lib/repos/use-classes";
import { rosterDebtByStudent } from "@/lib/tuition-from-kernel";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";

export const Route = createFileRoute("/_auth/classes/$classId")({
	component: ClassDetailRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<h1 className="font-display font-semibold text-xl">Không tìm thấy lớp</h1>
			<p className="mt-2 text-muted-fg text-sm">
				Lớp này không tồn tại hoặc dữ liệu demo đã được reset.
			</p>
			<Link
				to="/classes"
				className="mt-4 inline-block font-medium text-accent-blue text-sm hover:text-accent-active"
			>
				← Về danh sách lớp
			</Link>
		</Card>
	),
});

function ClassDetailRoute() {
	const { classId } = Route.useParams();
	const { dispatch, refresh } = useData();
	const navigate = useNavigate();

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
	const { syllabusById, studentById, data } = useData();
	const { run, isPending, busy } = useDirectKernelAction();
	const [tab, setTab] = useState("roster");
	const [manageOpen, setManageOpen] = useState(false);
	const [assignmentsView, setAssignmentsView] = useState<
		"list" | "assign" | "success"
	>("list");
	const [addStudentOpen, setAddStudentOpen] = useState(false);
	const [notes, setNotes] = useState<string | null>(null);

	const handleTabChange = (nextTab: string) => {
		setTab(nextTab);
		if (nextTab !== "assignments") {
			setAssignmentsView("list");
		}
	};
	const cls = classById(classId);

	if (!cls) {
		throw notFound();
	}
	const sy = syllabusById(cls.syllabusId) ?? null;
	const students = cls.studentIds
		.map(studentById)
		.filter((s) => s !== undefined);
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
	const rosterDebt = useMemo(
		() => rosterDebtByStudent(classId, data.enrollments, data.invoices),
		[classId, data.enrollments, data.invoices],
	);
	const openAssignmentsCount = useMemo(() => {
		return classAssignments.filter((ca) => {
			const submitted = ca.targets.filter((t) => t.submittedAt !== null).length;
			return submitted < ca.targets.length;
		}).length;
	}, [classAssignments]);
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
			<Card variant="white" className="mb-5 flex flex-wrap items-center gap-5">
				<div className="min-w-[200px] flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="font-display font-semibold text-[28px]">
							{cls.name}
						</h1>
						<Tag>{CLASS_TYPE_LABELS[cls.type]}</Tag>
					</div>
					<div className="mt-2 flex flex-wrap gap-4">
						<span className="font-mono text-meta text-xs">
							{classMeta(cls)}
						</span>
						<span className="font-mono text-meta text-xs">
							Lịch: {formatSchedule(cls.schedule)}
						</span>
						<span className="font-mono text-meta text-xs">
							Bắt đầu: {cls.startDate}
						</span>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{!(tab === "assignments" && assignmentsView !== "list") && (
						<Button
							size="sm"
							onClick={() => {
								setTab("assignments");
								setAssignmentsView("assign");
							}}
						>
							Giao bài tập
						</Button>
					)}
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setAddStudentOpen(true)}
					>
						+ Thêm học viên
					</Button>
				</div>
			</Card>

			<div className="mb-6 grid grid-cols-6 gap-4 max-lg:grid-cols-3 max-app:grid-cols-2">
				<StatCard num={String(cls.studentIds.length)} label="học viên" />
				<StatCard num={String(openAssignmentsCount)} label="bài đang mở" />
				<StatCard
					num={`${doneTargetsCount}/${totalTargetsCount}`}
					label="đã nộp trên bài mở"
				/>
				<StatCard
					num={`${cls.sessionsDone}/${cls.sessionsTotal}`}
					label="buổi đã học"
				/>
				<StatCard num={`${pct}%`} label="tiến độ" />
				<StatCard
					num={sy ? String(sy.totalLessons) : "—"}
					label="bài trong syllabus"
				/>
			</div>

			<Tabs
				tabs={[
					{ id: "roster", label: "Học viên" },
					{ id: "sessions", label: "Buổi học" },
					{ id: "assignments", label: "Bài tập" },
					{ id: "notes", label: "Ghi chú" },
				]}
				active={tab}
				onChange={handleTabChange}
			/>

			{tab === "assignments" && (
				<ClassAssignmentsTab
					key={classId}
					classGroup={cls}
					view={assignmentsView}
					onViewChange={setAssignmentsView}
				/>
			)}

			{tab === "roster" && (
				<Card className="p-0">
					<DataTable
						headers={[
							"Học viên",
							"Mục tiêu",
							"Còn lại",
							"Học phí",
							"Trạng thái",
						]}
						rows={students.map((s) => ({
							onClick: () =>
								navigate({
									to: "/students/$studentId",
									params: { studentId: s.id },
								}),
							cells: [
								<div key="s" className="flex items-center gap-2">
									<Avatar text={s.avatar} size="sm" />
									{s.name}
								</div>,
								<span key="t" className="font-mono text-meta text-xs">
									Band {s.targetBand} · {s.skills.join(", ")}
								</span>,
								<span key="r" className="font-mono">
									{s.pkg.remaining}/{s.pkg.total}
								</span>,
								(() => {
									// #216: per-class tuition debt. "Đã đủ" only when the
									// class has invoices and none outstanding; "—" when the
									// student has no invoice through this class's enrollments.
									const d = rosterDebt.get(s.id);
									if (!d || d.invoiceCount === 0) {
										return (
											<span key="fee" className="font-mono text-meta text-xs">
												—
											</span>
										);
									}
									if (d.outstanding > 0) {
										return (
											<span
												key="fee"
												className="font-mono font-semibold text-danger"
											>
												{fmtVND(d.outstanding)}
											</span>
										);
									}
									return (
										<span key="fee" className="font-mono text-meta text-xs">
											Đã đủ
										</span>
									);
								})(),
								s.atRisk ? (
									<Badge key="b" variant="danger">
										Rủi ro
									</Badge>
								) : (
									<Badge key="b" variant="success" dot>
										Ổn
									</Badge>
								),
							],
						}))}
					/>
				</Card>
			)}

			{tab === "sessions" && (
				<div className="space-y-6">
					<CurriculumManagementSection
						key={`curriculum-${cls.id}`}
						cls={cls}
						syllabus={sy}
						run={run}
						isPending={isPending}
						busy={busy}
					/>{" "}
					<ClassSessionsManageModal
						open={manageOpen}
						onClose={() => setManageOpen(false)}
						cls={cls}
						syllabus={sy}
						run={run}
						isPending={isPending}
						busy={busy}
					/>
					<div>
						<div className="mb-3 flex items-center justify-between">
							<SectionLabel>Lịch học & Tiến độ buổi học</SectionLabel>
							<Button
								variant="secondary"
								size="sm"
								disabled={!(sy && sy.classId === classId)}
								onClick={() => setManageOpen(true)}
							>
								Sắp xếp buổi
							</Button>
						</div>
						<ClassScheduleTable
							cls={cls}
							lessons={data.lessons.filter((l) => l.classId === classId)}
							legacyLessons={classLessons}
							syllabus={sy && sy.classId === classId ? sy : null}
							studentById={studentById}
							run={run}
							onComplete={handleCompleteOccurrence}
							onCancelOccurrence={handleCancelOccurrence}
							onSaveEdit={handleSaveOccurrenceEdit}
							isPending={isPending}
							busy={busy}
						/>
					</div>
				</div>
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

			<AddStudentModal
				key={`add-student-${cls.id}`}
				open={addStudentOpen}
				onClose={() => setAddStudentOpen(false)}
				classId={cls.id}
			/>
		</div>
	);
}
