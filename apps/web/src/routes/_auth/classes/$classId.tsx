import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { CurriculumManagementSection } from "@/components/class-detail/curriculum-management-section";
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
import {
	buildClassSessions,
	formatSessionDate,
	sessionLessonInfo,
	sessionStatus,
	sessionStudents,
	sessionTimeRange,
} from "@/lib/class-sessions";
import { useData } from "@/lib/data-store";
import { formatSchedule, lessonDayLabel } from "@/lib/format-schedule";
import {
	CLASS_TYPE_LABELS,
	type ClassGroup,
	classMeta,
	type Lesson,
	type Student,
	type Syllabus,
} from "@/lib/mock-data";
import { useClasses } from "@/lib/repos/use-classes";
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
	const navigate = useNavigate();
	const { classById } = useClasses();
	const { syllabusById, studentById, data } = useData();
	const { run, isPending, busy } = useDirectKernelAction();
	const [tab, setTab] = useState("roster");
	const [addStudentOpen, setAddStudentOpen] = useState(false);
	const [notes, setNotes] = useState<string | null>(null);
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
					<Button size="sm" onClick={() => setAddStudentOpen(true)}>
						+ Thêm học viên
					</Button>
				</div>
			</Card>

			<div className="mb-6 grid grid-cols-4 gap-4 max-app:grid-cols-2">
				<StatCard num={String(cls.studentIds.length)} label="học viên" />
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
					{ id: "notes", label: "Ghi chú" },
				]}
				active={tab}
				onChange={setTab}
			/>

			{tab === "roster" && (
				<Card className="p-0">
					<DataTable
						headers={["Học viên", "Mục tiêu", "Còn lại", "Trạng thái"]}
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
						collapsible
						defaultCollapsed={Boolean(sy && sy.modules.length > 0)}
					/>
					<div>
						<div className="mb-3 flex items-center justify-between">
							<SectionLabel>Lịch học & Tiến độ buổi học</SectionLabel>
						</div>
						<ClassScheduleTable
							cls={cls}
							lessons={data.lessons.filter((l) => l.classId === classId)}
							legacyLessons={classLessons}
							syllabus={sy && sy.classId === classId ? sy : null}
							studentById={studentById}
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

/**
 * Tab "Buổi học" (issue #83 / #89): one row per session in true chronological order
 * when the class schedule + startDate can be derived — concrete date + time
 * range in one cell, the slot's students, the syllabus-mapped topic with module badge
 * and expandable lesson details (materials + objectives), and the
 * in-order-prefix status. Classes the helper cannot derive truthfully
 * (legacy free-text schedule, missing startDate, rows edited away from the
 * schedule via lesson-edit) render the original weekday-grouped 5-column table.
 */
function ClassScheduleTable({
	cls,
	lessons,
	legacyLessons,
	syllabus,
	studentById,
}: {
	cls: ClassGroup;
	/** Class-scoped rows (`classId`), not the student-scoped `classLessons`. */
	lessons: Lesson[];
	/** Student-scoped rows — exactly what the legacy fallback rendered. */
	legacyLessons: Lesson[];
	syllabus: Syllabus | null;
	studentById: (id: string) => Student | undefined;
}) {
	const [expandedIndices, setExpandedIndices] = useState<Set<number>>(
		new Set(),
	);

	const sessions = buildClassSessions({
		schedule: cls.schedule,
		startDate: cls.startDate,
		lessons,
	});

	if (sessions === null) {
		return (
			<Card className="p-0">
				<DataTable
					headers={["Ngày", "Giờ", "Học viên", "Chủ đề", "Trạng thái"]}
					rows={legacyLessons.map((l) => {
						const s = studentById(l.sid);
						return {
							cells: [
								<span key="d" className="font-mono text-meta text-xs">
									{lessonDayLabel(l.day)}
								</span>,
								<span key="t" className="font-mono">
									{l.time}
								</span>,
								s?.name ?? "",
								l.topic,
								l.status === "completed" ? (
									<Badge key="b" variant="success" dot>
										Đã học
									</Badge>
								) : l.status === "cancelled" ? (
									<Badge key="b" variant="danger">
										Đã hủy
									</Badge>
								) : (
									<Badge key="b" variant="accent">
										Sắp tới
									</Badge>
								),
							],
						};
					})}
				/>
			</Card>
		);
	}

	const toggleExpand = (index: number) => {
		setExpandedIndices((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	return (
		<Card className="p-0">
			<div className="w-full overflow-x-auto">
				<table className="w-full border-collapse text-sm">
					<thead>
						<tr>
							<th className="border-line border-b px-4 py-3 text-left font-medium font-mono text-[11px] text-muted-fg uppercase tracking-[0.04em]">
								Ngày & Giờ
							</th>
							<th className="border-line border-b px-4 py-3 text-left font-medium font-mono text-[11px] text-muted-fg uppercase tracking-[0.04em]">
								Học viên
							</th>
							<th className="border-line border-b px-4 py-3 text-left font-medium font-mono text-[11px] text-muted-fg uppercase tracking-[0.04em]">
								Chủ đề
							</th>
							<th className="border-line border-b px-4 py-3 text-left font-medium font-mono text-[11px] text-muted-fg uppercase tracking-[0.04em]">
								Trạng thái
							</th>
						</tr>
					</thead>
					<tbody>
						{sessions.map((s) => {
							const students = sessionStudents(s)
								.map((sid) => studentById(sid)?.name)
								.filter((name): name is string => name !== undefined)
								.join(", ");
							const status = sessionStatus(s);
							const info = sessionLessonInfo(s, syllabus);
							const isExpanded = expandedIndices.has(s.index);
							const hasDetails = Boolean(
								info.materials || info.objectives || info.lessonId,
							);

							return (
								<Fragment key={`session-${s.index}`}>
									<tr
										onClick={
											hasDetails ? () => toggleExpand(s.index) : undefined
										}
										tabIndex={hasDetails ? 0 : undefined}
										onKeyDown={
											hasDetails
												? (e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															toggleExpand(s.index);
														}
													}
												: undefined
										}
										aria-expanded={hasDetails ? isExpanded : undefined}
										className={`border-line-soft border-b transition-colors duration-[150ms] ${
											hasDetails
												? "cursor-pointer hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
												: ""
										}`}
									>
										<td className="px-4 py-3 text-left">
											<span className="font-mono text-meta text-xs">
												{formatSessionDate(s.dateISO)} · {sessionTimeRange(s)}
											</span>
										</td>
										<td className="px-4 py-3 text-left">{students || "—"}</td>
										<td className="px-4 py-3 text-left">
											<div className="flex items-center gap-2">
												{hasDetails ? (
													<button
														type="button"
														tabIndex={-1}
														onClick={(e) => {
															e.stopPropagation();
															toggleExpand(s.index);
														}}
														className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-fg hover:bg-surface hover:text-fg"
														aria-label={
															isExpanded
																? "Thu gọn chi tiết bài học"
																: "Mở rộng chi tiết bài học"
														}
														aria-expanded={isExpanded}
													>
														{isExpanded ? (
															<ChevronDown className="h-3.5 w-3.5" />
														) : (
															<ChevronRight className="h-3.5 w-3.5" />
														)}
													</button>
												) : (
													<span className="w-5 shrink-0" />
												)}
												<div className="flex flex-wrap items-center gap-1.5">
													{info.moduleTitle && (
														<span
															className="inline-flex max-w-[140px] items-center truncate rounded-md border border-line-soft bg-surface-warm/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-fg"
															title={info.moduleTitle}
														>
															{info.moduleTitle}
														</span>
													)}
													<span className="font-medium text-sm">
														{info.title ?? "—"}
													</span>
												</div>
											</div>
										</td>
										<td className="px-4 py-3 text-left">
											{status === "completed" ? (
												<Badge variant="success" dot>
													Đã học
												</Badge>
											) : status === "cancelled" ? (
												<Badge variant="danger">Đã hủy</Badge>
											) : (
												<Badge variant="accent">Sắp tới</Badge>
											)}
										</td>
									</tr>
									{hasDetails && isExpanded && (
										<tr
											key={`details-${s.index}`}
											className="border-line-soft border-b bg-surface-warm/30 text-xs"
											aria-label="Chi tiết lesson"
										>
											<td colSpan={4} className="px-6 py-3">
												<div className="space-y-1.5 pl-7">
													<div>
														<span className="font-medium text-muted-fg">
															Tài liệu:{" "}
														</span>
														<span className="text-fg-2">
															{info.materials || "Chưa có tài liệu"}
														</span>
													</div>
													<div>
														<span className="font-medium text-muted-fg">
															Mục tiêu:{" "}
														</span>
														<span className="text-fg-2">
															{info.objectives || "Chưa có mục tiêu"}
														</span>
													</div>
												</div>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
		</Card>
	);
}
