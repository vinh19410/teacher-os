import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { AddLessonModal } from "@/components/modals/add-lesson-modal";
import { AddModuleModal } from "@/components/modals/add-module-modal";
import { AddStudentModal } from "@/components/modals/add-student-modal";
import { EditLessonModal } from "@/components/modals/edit-lesson-modal";
import { EditModuleModal } from "@/components/modals/edit-module-modal";
import { ImportSyllabusModal } from "@/components/modals/import-syllabus-modal";
import { SyllabusProgress } from "@/components/syllabus/syllabus-progress";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SectionLabel } from "@/components/ui/section-label";
import { Tabs } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { formatSchedule, lessonDayLabel } from "@/lib/format-schedule";
import { CLASS_TYPE_LABELS, classMeta } from "@/lib/mock-data";
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
	const [importOpen, setImportOpen] = useState(false);
	const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
	const [addModuleOpen, setAddModuleOpen] = useState(false);
	const [editModuleId, setEditModuleId] = useState<string | null>(null);
	const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(
		null,
	);
	const [editLessonRef, setEditLessonRef] = useState<{
		moduleId: string;
		lessonId: string;
	} | null>(null);
	const [tab, setTab] = useState("roster");
	const [addStudentOpen, setAddStudentOpen] = useState(false);
	const [notes, setNotes] = useState<string | null>(null);
	const cls = classById(classId);

	if (!cls) {
		throw notFound();
	}
	const sy = syllabusById(cls.syllabusId);
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
					{ id: "syllabus", label: "Giáo trình" },
					{ id: "schedule", label: "Lịch học" },
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

			{tab === "syllabus" &&
				(sy && sy.classId === classId ? (
					<div>
						<SyllabusProgress syllabus={sy} />
						<div className="mt-4 mb-3 flex items-center justify-between">
							<SectionLabel>Nội dung giáo trình của lớp</SectionLabel>
							<div className="flex gap-2">
								<Button
									variant="secondary"
									size="sm"
									onClick={() => setAddModuleOpen(true)}
								>
									+ Thêm module
								</Button>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => setConfirmRemoveOpen(true)}
								>
									Gỡ giáo trình
								</Button>
							</div>
						</div>
						{sy.modules.length === 0 && (
							<Card variant="white" className="p-6 text-center text-muted-fg">
								<p className="text-sm">
									Bản sao chưa có module nào. Nhấn{" "}
									<strong>+ Thêm module</strong> để bổ sung.
								</p>
							</Card>
						)}
						{sy.modules.map((m) => (
							<div
								key={m.id}
								className="mb-4 overflow-hidden rounded-lg border border-line-soft border-solid bg-bg"
							>
								<div className="flex flex-wrap items-center justify-between gap-4 border-line-soft border-b border-solid bg-surface-warm px-5 py-4">
									<h3 className="font-semibold text-sm">{m.title}</h3>
									<div className="flex items-center gap-3">
										<button
											type="button"
											onClick={() => setEditModuleId(m.id)}
											className="rounded-sm px-1.5 py-0.5 text-muted-fg text-xs transition-colors duration-[150ms] hover:bg-surface hover:text-fg"
										>
											Sửa
										</button>
										<span className="font-mono text-[11px] text-muted-fg">
											{m.lessons.length} buổi
										</span>
									</div>
								</div>
								<div>
									{m.lessons.map((l) => (
										<div
											key={l.id}
											className="flex items-center justify-between gap-3 border-line-soft border-b border-solid px-5 py-3 last:border-b-0 hover:bg-surface-warm"
										>
											<div>
												<div className="font-medium text-sm">{l.title}</div>
												<div className="mt-0.5 text-[11px] text-muted-fg">
													{l.materials}
												</div>
											</div>
											<button
												type="button"
												onClick={() =>
													setEditLessonRef({ moduleId: m.id, lessonId: l.id })
												}
												className="rounded-sm px-1.5 py-0.5 text-muted-fg text-xs transition-colors duration-[150ms] hover:bg-surface hover:text-fg"
											>
												Sửa
											</button>
										</div>
									))}
									<button
										type="button"
										onClick={() => setAddLessonModuleId(m.id)}
										className="mt-2 w-full px-5 pb-3 text-left font-medium text-accent-blue text-xs hover:text-accent-active"
									>
										+ Thêm buổi học
									</button>
								</div>
							</div>
						))}
					</div>
				) : cls.syllabusId === null ? (
					<Card variant="white" className="p-8 text-center">
						<p className="text-muted-fg text-sm">
							Lớp chưa có giáo trình. Nhập một bản sao từ template — chỉnh sửa
							trên lớp không ảnh hưởng template hay lớp khác.
						</p>
						<Button
							size="sm"
							className="mt-4"
							onClick={() => setImportOpen(true)}
						>
							Nhập từ template
						</Button>
					</Card>
				) : (
					// Legacy anomaly: pointer set but not this class's copy
					// (pre-migration data). Removing nulls the pointer only.
					<Card variant="white" className="p-8 text-center">
						<p className="text-muted-fg text-sm">
							Lớp có con trỏ giáo trình lệch (dữ liệu cũ) và không thể chỉnh
							sửa. Gỡ con trỏ để bắt đầu lại với một template.
						</p>
						<Button
							variant="secondary"
							size="sm"
							className="mt-4"
							onClick={() => setConfirmRemoveOpen(true)}
						>
							Gỡ giáo trình
						</Button>
					</Card>
				))}

			{tab === "schedule" && (
				<Card className="p-0">
					<DataTable
						headers={["Ngày", "Giờ", "Học viên", "Chủ đề", "Trạng thái"]}
						rows={classLessons.map((l) => {
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

			<ImportSyllabusModal
				key={`import-${cls.id}`}
				open={importOpen}
				onClose={() => setImportOpen(false)}
				classId={cls.id}
			/>
			<Modal
				open={confirmRemoveOpen}
				onClose={busy ? () => undefined : () => setConfirmRemoveOpen(false)}
				title="Gỡ giáo trình khỏi lớp?"
			>
				<p className="text-muted-fg text-sm">
					Nếu lớp đang giữ một bản sao giáo trình, toàn bộ cây (kèm tiến độ buổi
					học) sẽ bị xóa; nếu chỉ là con trỏ lệch (dữ liệu cũ), chỉ con trỏ được
					dọn. Template gốc và các lớp khác không bao giờ bị ảnh hưởng. Hành
					động này không thể hoàn tác.
				</p>
				<div className="mt-4 flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setConfirmRemoveOpen(false)}
						disabled={busy || isPending("remove-curriculum")}
					>
						Để lại
					</Button>
					<Button
						variant="danger"
						size="sm"
						disabled={busy || isPending("remove-curriculum")}
						onClick={() => {
							setConfirmRemoveOpen(false);
							void run(
								"remove-curriculum",
								{ type: "remove-curriculum", classId: cls.id },
								"Đã gỡ giáo trình.",
							);
						}}
					>
						{isPending("remove-curriculum") ? "Đang gỡ…" : "Gỡ giáo trình"}
					</Button>
				</div>
			</Modal>
			<AddModuleModal
				open={addModuleOpen}
				onClose={() => setAddModuleOpen(false)}
				syllabusId={cls.syllabusId}
			/>
			<EditModuleModal
				open={editModuleId !== null}
				onClose={() => setEditModuleId(null)}
				syllabusId={cls.syllabusId}
				moduleId={editModuleId}
			/>
			<AddLessonModal
				open={addLessonModuleId !== null}
				onClose={() => setAddLessonModuleId(null)}
				syllabusId={cls.syllabusId}
				moduleId={addLessonModuleId}
			/>
			<EditLessonModal
				open={editLessonRef !== null}
				onClose={() => setEditLessonRef(null)}
				syllabusId={cls.syllabusId}
				moduleId={editLessonRef?.moduleId ?? null}
				lessonId={editLessonRef?.lessonId ?? null}
			/>
			<AddStudentModal
				key={`add-student-${cls.id}`}
				open={addStudentOpen}
				onClose={() => setAddStudentOpen(false)}
				classId={cls.id}
			/>
		</div>
	);
}
