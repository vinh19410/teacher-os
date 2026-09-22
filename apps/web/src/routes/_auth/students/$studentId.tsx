import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { CreateReportModal } from "@/components/modals/create-report-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { PARENT_REPORTS_ENABLED } from "@/lib/features";
import { invoiceCode, invoiceType } from "@/lib/format-invoice";
import { averageBand, fmtVND } from "@/lib/mock-data";
import { useStudents } from "@/lib/repos/use-students";

export const Route = createFileRoute("/_auth/students/$studentId")({
	component: StudentDetailRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<h1 className="font-display font-semibold text-xl">
				Không tìm thấy học viên
			</h1>
			<p className="mt-2 text-muted-fg text-sm">
				Học viên này không tồn tại hoặc dữ liệu demo đã được reset.
			</p>
			<Link
				to="/students"
				className="mt-4 inline-block font-medium text-accent-blue text-sm hover:text-accent-active"
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
const INV_STATUS_LABEL: Record<string, string> = {
	paid: "Đã thu",
	overdue: "Quá hạn",
	unpaid: "Chưa thu",
};
const INV_VARIANT: Record<string, "success" | "danger" | "warn"> = {
	paid: "success",
	overdue: "danger",
	unpaid: "warn",
};

function StudentDetailRoute() {
	const { studentId } = Route.useParams();
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
	const assignments = data.assignments.filter((a) => a.sid === studentId);

	return (
		<div>
			<Card variant="white" className="mb-5 flex flex-wrap items-center gap-5">
				<Avatar text={student.avatar} size="lg" />
				<div className="min-w-[200px] flex-1">
					<h1 className="font-display font-semibold text-[28px]">
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
						<div className="mb-3 font-mono text-[11px] text-meta uppercase tracking-[0.06em]">
							Gói học
						</div>
						{student.hasPackage ? (
							<div className="flex flex-col gap-4">
								{[
									["Tổng buổi", String(student.pkg.total)],
									["Đã học", String(student.pkg.done)],
									["Còn lại", String(student.pkg.remaining)],
									["Đơn giá", fmtVND(student.pkg.price)],
									["Hình thức", student.pkg.mode],
									["Hết hạn dự kiến", student.pkg.expiry],
								].map(([k, v], i) => (
									<div key={k} className="flex items-center justify-between">
										<span className="font-mono text-meta text-xs">{k}</span>
										<span
											className={
												i === 2 && student.pkg.remaining <= 3
													? "font-mono font-semibold text-danger"
													: "font-mono"
											}
										>
											{v}
										</span>
									</div>
								))}
								<Progress
									className="mt-2"
									value={(student.pkg.done / student.pkg.total) * 100}
									variant={student.pkg.remaining <= 3 ? "low" : "default"}
								/>
							</div>
						) : (
							<p className="text-muted-fg text-sm">
								Chưa có gói — thêm học viên vào lớp để có gói học.
							</p>
						)}
					</Card>
					<Card variant="white">
						<div className="mb-3 font-mono text-[11px] text-meta uppercase tracking-[0.06em]">
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
						<div className="mt-5 mb-3 font-mono text-[11px] text-meta uppercase tracking-[0.06em]">
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
				<Card variant="white" className="p-0">
					<DataTable
						headers={["Mã", "Loại", "Số tiền", "Ngày", "Trạng thái"]}
						rows={invoices.map((inv) => ({
							cells: [
								invoiceCode(inv.id),
								invoiceType(inv.type),
								<span key={inv.id} className="font-mono">
									{fmtVND(inv.amount)}
								</span>,
								inv.date,
								<Badge key={`${inv.id}-b`} variant={INV_VARIANT[inv.status]}>
									{INV_STATUS_LABEL[inv.status]}
								</Badge>,
							],
						}))}
					/>
				</Card>
			)}

			{tab === "assign" && (
				<Card variant="white" className="p-0">
					<DataTable
						headers={["Bài tập", "Loại", "Hạn", "Band", "Trạng thái"]}
						rows={assignments.map((a) => ({
							onClick: undefined,
							cells: [
								<Link
									key={a.id}
									to="/assignments/$assignmentId"
									params={{ assignmentId: a.id }}
									className="font-medium text-accent-blue hover:text-accent-active"
								>
									{a.title}
								</Link>,
								a.type,
								a.due,
								a.scores ? (
									<span
										key={`${a.id}-band`}
										className="font-mono font-semibold text-accent-blue"
									>
										{averageBand(a.scores).toFixed(1)}
									</span>
								) : (
									"—"
								),
								a.status === "graded"
									? "Đã chấm"
									: a.status === "late"
										? "Trễ"
										: "Chưa nộp",
							],
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
