import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { useState } from "react";
import {
	fmtDue,
	studentSubmissionStatus,
} from "@/components/assignments/assignment-status";
import { StatusTag } from "@/components/assignments/status-tag";
import { CreateReportModal } from "@/components/modals/create-report-modal";
import { InvoiceStatusCell } from "@/components/tuition/invoice-status-cell";
import { StudentTuitionSummary } from "@/components/tuition/student-tuition-summary";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Tabs } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { PARENT_REPORTS_ENABLED } from "@/lib/features";
import { invoiceCode, invoiceType } from "@/lib/format-invoice";
import { averageBand, classMeta, fmtVND } from "@/lib/mock-data";
import { classesByStudent } from "@/lib/repos/enrollments";
import {
	type StudentAssignmentRow,
	studentAssignmentRows,
} from "@/lib/repos/student-assignments";
import { useStudents } from "@/lib/repos/use-students";
import {
	effectiveInvoiceStatus,
	studentTuitionSummary,
} from "@/lib/tuition-from-kernel";

export const Route = createFileRoute("/_auth/students/$studentId")({
	component: StudentDetailRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<h1 className="font-display font-extrabold text-xl tracking-[-0.02em]">
				Không tìm thấy học viên
			</h1>
			<p className="mt-2 text-muted-fg text-sm">
				Học viên này không tồn tại hoặc dữ liệu demo đã được reset.
			</p>
			<Link
				to="/students"
				className="mt-4 inline-block font-medium text-hot text-sm hover:text-hot"
			>
				← Về danh sách học viên
			</Link>
		</Card>
	),
});

const STATUS_LABEL: Record<string, string> = {
	completed: "Đã học",
	upcoming: "Sắp tới",
	cancelled: "Đã hủy",
	absent: "Vắng",
};
const STATUS_VARIANT: Record<
	string,
	"success" | "accent" | "muted" | "danger"
> = {
	completed: "success",
	upcoming: "accent",
	cancelled: "muted",
	absent: "danger",
};

/** #317 — cells tab Bài tập theo nhánh kind: class row (flow #208) plain text
 * + StatusTag; grading row giữ hành vi cũ (link trang chấm, Band, text). */
function assignmentRowCells(row: StudentAssignmentRow, todayVN: string) {
	if (row.kind === "class") {
		const status = studentSubmissionStatus(
			{ submittedAt: row.submittedAt },
			row.due,
			todayVN,
		);
		return [
			<div className="flex flex-col gap-0.5">
				<span className="font-medium text-fg">{row.title}</span>
				{row.className !== "" && (
					<span className="font-mono text-meta text-xs">{row.className}</span>
				)}
			</div>,
			row.typeLabel ?? "—",
			fmtDue(row.due),
			"—",
			<StatusTag tone={status.tone}>{status.label}</StatusTag>,
		];
	}
	return [
		<Link
			to="/assignments/$assignmentId"
			params={{ assignmentId: row.id }}
			className="font-medium text-hot hover:text-hot"
		>
			{row.title}
		</Link>,
		row.typeLabel ?? "—",
		row.due === "" ? "—" : fmtDue(row.due),
		row.scores ? (
			<span className="font-mono font-semibold text-hot">
				{averageBand(row.scores).toFixed(1)}
			</span>
		) : (
			"—"
		),
		row.gradingStatus === "graded"
			? "Đã chấm"
			: row.gradingStatus === "late"
				? "Trễ"
				: "Chưa nộp",
	];
}

function StudentDetailRoute() {
	const { studentId } = Route.useParams();
	const navigate = useNavigate();
	const { studentById } = useStudents();
	const { data } = useData();
	const student = studentById(studentId);
	const [tab, setTab] = useState("profile");
	const [reportOpen, setReportOpen] = useState(false);

	if (!student) {
		throw notFound();
	}

	const lessons = data.lessons.filter((l) => l.sid === studentId);
	const invoices = data.invoices.filter((i) => i.sid === studentId);
	const assignments = studentAssignmentRows(data, studentId);
	const todayVN = vietnamTodayISO();
	const studentClasses = classesByStudent(data, studentId);

	return (
		<div>
			<Link
				to="/students"
				className="mb-4 inline-block font-mono text-meta text-xs hover:text-hot"
			>
				← Học viên
			</Link>
			<Card variant="white" className="mb-5 flex flex-wrap items-center gap-5">
				<Avatar text={student.avatar} size="lg" />
				<div className="min-w-[200px] flex-1">
					<h1 className="font-display font-extrabold text-3xl leading-[0.95] tracking-[-0.03em] max-app:text-2xl">
						{student.name}
					</h1>
					<div className="mt-2 flex flex-wrap gap-4">
						<span className="font-mono text-meta text-xs">
							{student.phone} · Zalo: {student.zalo}
						</span>
						{student.email && (
							<span className="font-mono text-meta text-xs">
								Email: {student.email}
							</span>
						)}
						<span className="font-mono text-meta text-xs">
							Mục tiêu: Band {student.targetBand} ({student.skills.join(", ")})
						</span>
						{student.examDate && (
							<span className="font-mono text-meta text-xs">
								Thi: {student.examDate}
							</span>
						)}
					</div>
					<div className="mt-2 flex flex-wrap gap-1">
						{student.tags.map((t) => (
							<Tag key={t}>{t}</Tag>
						))}
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={() =>
							window.open(`https://zalo.me/${student.zalo}`, "_blank")
						}
					>
						Nhắn Zalo
					</Button>
					{PARENT_REPORTS_ENABLED && (
						<Button size="sm" onClick={() => setReportOpen(true)}>
							Tạo báo cáo
						</Button>
					)}
				</div>
			</Card>

			<Tabs
				tabs={[
					{ id: "profile", label: "Hồ sơ" },
					{ id: "history", label: "Lịch sử buổi" },
					{ id: "tuition", label: "Học phí" },
					{ id: "assign", label: "Bài tập" },
				]}
				active={tab}
				onChange={setTab}
			/>

			{tab === "profile" && (
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Card variant="white">
						<div className="mb-3 font-mono text-[11px] text-meta uppercase tracking-[0.18em]">
							Lớp học
						</div>
						{studentClasses.length > 0 ? (
							<div className="flex flex-col gap-4">
								{studentClasses.map((c) => (
									<div key={c.id}>
										<div className="flex items-center gap-2">
											<Link
												to="/classes/$classId"
												params={{ classId: c.id }}
												className="font-medium text-hot hover:text-hot"
											>
												{c.name}
											</Link>
											{c.enrollmentStatus === "invited" && (
												<Badge
													variant="warn"
													className="px-1.5 py-0 text-[10px]"
												>
													Đã mời
												</Badge>
											)}
										</div>
										<div className="mt-1 font-mono text-meta text-xs">
											{classMeta(c)}
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-muted-fg text-sm">
								Chưa tham gia lớp học nào.
							</p>
						)}
					</Card>
					<Card variant="white">
						<div className="mb-3 font-mono text-[11px] text-meta uppercase tracking-[0.18em]">
							Phụ huynh
						</div>
						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between">
								<span className="font-mono text-meta text-xs">Tên</span>
								<span className="font-medium text-sm">
									{student.parent.name}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="font-mono text-meta text-xs">SĐT</span>
								<span className="font-mono">{student.parent.phone}</span>
							</div>
						</div>
						<div className="mt-5 mb-3 font-mono text-[11px] text-meta uppercase tracking-[0.18em]">
							Ghi chú nội bộ
						</div>
						<p className="rounded-sm bg-surface-warm p-3 text-fg-2 text-sm leading-[1.5]">
							{student.notes}
						</p>
					</Card>
				</div>
			)}

			{tab === "history" && (
				<Card variant="white" className="p-0">
					<DataTable
						headers={["Thứ", "Giờ", "Loại", "Chủ đề", "Trạng thái"]}
						rows={lessons.map((l) => ({
							cells: [
								`Thứ ${l.day + 1}`,
								l.time,
								l.type,
								l.topic,
								<Badge key={l.id} variant={STATUS_VARIANT[l.status]}>
									{STATUS_LABEL[l.status]}
								</Badge>,
							],
						}))}
					/>
				</Card>
			)}

			{tab === "tuition" && (
				<>
					<StudentTuitionSummary
						summary={studentTuitionSummary(
							studentId,
							data.classes,
							data.enrollments,
							data.invoices,
						)}
					/>
					<Card variant="white" className="p-0">
						<DataTable
							headers={["Mã", "Loại", "Số tiền", "Ngày", "Trạng thái"]}
							rows={invoices.map((inv) => {
								// #322 — "Quá hạn" suy ra từ `due`, cùng helper với roster.
								const status = effectiveInvoiceStatus(inv, todayVN);
								return {
									// #345 — click/Enter trên dòng mở trang chi tiết hóa đơn.
									onClick: () =>
										navigate({
											to: "/tuition/$invoiceId",
											params: { invoiceId: inv.id },
											search: {},
										}),
									cells: [
										invoiceCode(inv.id),
										invoiceType(inv.type),
										<span key={inv.id} className="font-mono">
											{fmtVND(inv.amount)}
										</span>,
										inv.date,
										<InvoiceStatusCell
											key={`${inv.id}-b`}
											invoice={inv}
											status={status}
										/>,
									],
								};
							})}
						/>
					</Card>
				</>
			)}

			{tab === "assign" && (
				<Card variant="white" className="p-0">
					<DataTable
						headers={["Bài tập", "Loại", "Hạn", "Band", "Trạng thái"]}
						rows={assignments.map((row) => ({
							onClick: undefined,
							cells: assignmentRowCells(row, todayVN),
						}))}
					/>
				</Card>
			)}

			{PARENT_REPORTS_ENABLED && (
				<CreateReportModal
					key={student.id}
					open={reportOpen}
					onClose={() => setReportOpen(false)}
					defaultStudentId={student.id}
				/>
			)}
		</div>
	);
}
