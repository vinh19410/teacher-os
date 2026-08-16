import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { AddStudentModal } from "@/components/modals/add-student-modal";
import { AssignSyllabusModal } from "@/components/modals/assign-syllabus-modal";
import { SyllabusProgress } from "@/components/syllabus/syllabus-progress";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Textarea } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { Tabs } from "@/components/ui/tabs";
import { useData } from "@/lib/data-store";
import { dayDates } from "@/lib/mock-data";

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
	const { classById, syllabusById, studentById, data, dispatch } = useData();
	const cls = classById(classId);
	const [tab, setTab] = useState("roster");
	const [assignOpen, setAssignOpen] = useState(false);
	const [addStudentOpen, setAddStudentOpen] = useState(false);
	const [notes, setNotes] = useState<string | null>(null);

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
					<h1 className="font-display font-semibold text-[28px]">{cls.name}</h1>
					<div className="mt-2 flex flex-wrap gap-4">
						<span className="font-mono text-meta text-xs">
							{cls.level} · {cls.skill} · {cls.mode}
						</span>
						<span className="font-mono text-meta text-xs">
							Lịch: {cls.schedule}
						</span>
						<span className="font-mono text-meta text-xs">
							Bắt đầu: {cls.startDate}
						</span>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setAssignOpen(true)}
					>
						Đổi syllabus
					</Button>
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
				(sy ? (
					<SyllabusProgress syllabus={sy} />
				) : (
					<Card>
						<p className="font-mono text-meta text-xs">
							Lớp chưa được gán syllabus.
						</p>
						<Link
							to="/syllabus"
							className="mt-3 inline-block font-medium text-accent-blue text-sm hover:text-accent-active"
						>
							Chọn syllabus
						</Link>
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
										T{l.day + 1} {dayDates[l.day - 1]}/08
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
						onClick={() =>
							dispatch({
								type: "update-class-notes",
								classId: cls.id,
								notes: notes ?? cls.notes,
							})
						}
					>
						Lưu ghi chú
					</Button>
				</Card>
			)}

			<AssignSyllabusModal
				key={cls.id}
				open={assignOpen}
				onClose={() => setAssignOpen(false)}
				defaultSyllabusId={cls.syllabusId}
			/>
			<AddStudentModal
				open={addStudentOpen}
				onClose={() => setAddStudentOpen(false)}
			/>
		</div>
	);
}
