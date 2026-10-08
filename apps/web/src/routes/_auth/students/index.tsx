import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { InviteStudentModal } from "@/components/modals/invite-student-modal";
import { PendingInvitationsList } from "@/components/students/pending-invitations-list";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import { classMeta } from "@/lib/mock-data";
import { classesByStudent } from "@/lib/repos/enrollments";
import { usePendingInvitations } from "@/lib/repos/invitations";
import { useStudents } from "@/lib/repos/use-students";

export const Route = createFileRoute("/_auth/students/")({
	component: StudentsRoute,
});

const FILTERS = ["Tất cả", "Sắp hết buổi", "Nợ học phí", "Viết", "Nói"];
const FILTER_TAGS: Record<string, string[]> = {
	"Sắp hết buổi": ["sắp hết buổi"],
	"Nợ học phí": ["nợ học phí"],
	Viết: ["IELTS Writing", "Writing", "Viết"],
	Nói: ["IELTS Speaking", "Speaking", "Nói"],
};

export function StudentsRoute() {
	const navigate = useNavigate();
	const { students } = useStudents();
	const { data } = useData();
	const { data: invitations } = usePendingInvitations();
	const [filter, setFilter] = useState("Tất cả");
	const [activeTab, setActiveTab] = useState<"students" | "invitations">(
		"students",
	);
	const [inviteModalOpen, setInviteModalOpen] = useState(false);

	const pendingInvites = (invitations ?? []).filter(
		(inv) => inv.status === "pending",
	);
	const unpaidStudentIds = new Set(
		data.invoices.filter((i) => i.status !== "paid").map((i) => i.sid),
	);

	const attentionCount = students.filter(
		(s) =>
			s.tags.includes("nợ học phí") ||
			s.tags.includes("sắp hết buổi") ||
			(s.hasPackage && s.pkg.total > 0 && s.pkg.remaining <= 4) ||
			unpaidStudentIds.has(s.id),
	).length;

	const list =
		filter === "Tất cả"
			? students
			: students.filter((s) => {
					const tags = FILTER_TAGS[filter] ?? [filter];
					return s.tags.some((t) => tags.includes(t));
				});
	return (
		<div>
			<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<PageHead
					title="Học viên"
					lead={`${students.length} học viên đang học · ${pendingInvites.length} lời mời đang chờ · ${attentionCount} cần chú ý (nợ học phí / sắp hết gói)`}
				/>
				<Button
					variant="primary"
					onClick={() => setInviteModalOpen(true)}
					className="self-start sm:self-center"
				>
					<UserPlus className="h-4 w-4" />
					Mời học viên
				</Button>
			</div>

			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<div className="flex items-center gap-2 border-line border-b pb-1">
					<button
						type="button"
						onClick={() => setActiveTab("students")}
						className={cn(
							"-mb-[5px] border-b-2 px-3 py-1.5 font-medium text-sm transition-colors",
							activeTab === "students"
								? "border-hot font-semibold text-hot"
								: "border-transparent text-meta hover:text-fg",
						)}
					>
						Học viên ({students.length})
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("invitations")}
						className={cn(
							"-mb-[5px] flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-medium text-sm transition-colors",
							activeTab === "invitations"
								? "border-hot font-semibold text-hot"
								: "border-transparent text-meta hover:text-fg",
						)}
					>
						<span>Lời mời đang chờ</span>
						{pendingInvites.length > 0 && (
							<span className="inline-flex items-center justify-center rounded-full bg-warn-soft px-1.5 py-0.5 font-bold text-[10px] text-warn">
								{pendingInvites.length}
							</span>
						)}
					</button>
				</div>
				{activeTab === "students" && (
					<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
				)}
			</div>

			{activeTab === "invitations" ? (
				<PendingInvitationsList
					onInviteClick={() => setInviteModalOpen(true)}
				/>
			) : students.length === 0 ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="students-empty-state"
				>
					<h2 className="font-display font-semibold text-lg">
						Chưa có học viên nào
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Học viên sẽ tự xuất hiện tại đây khi đăng ký và đăng nhập student
						portal lần đầu. Giáo viên có thể thêm học viên vào lớp từ trang chi
						tiết lớp học.
					</p>
				</Card>
			) : list.length === 0 ? (
				<Card variant="white" className="p-8 text-center">
					<p className="font-mono text-meta text-xs">
						Không có học viên nào phù hợp với bộ lọc.
					</p>
				</Card>
			) : (
				<Card variant="white" className="p-0">
					<DataTable
						headers={["Học viên", "Lớp học", "Tags"]}
						emptyMessage="Chưa có học viên."
						rows={list.map((s) => {
							const classes = classesByStudent(data, s.id);
							return {
								onClick: () =>
									navigate({
										to: "/students/$studentId",
										params: { studentId: s.id },
									}),
								cells: [
									<div className="flex items-center gap-3" key="name">
										<Avatar text={s.avatar} size="sm" />
										<div>
											<div className="font-semibold text-sm">{s.name}</div>
											<div className="font-mono text-meta text-xs">
												{s.phone}
											</div>
										</div>
									</div>,
									<div key="classes" className="flex flex-col gap-1">
										{classes.length > 0 ? (
											classes.map((c) => (
												<div key={c.id}>
													<div className="flex items-center gap-1.5 font-medium text-sm">
														{c.name}
														{c.enrollmentStatus === "invited" && (
															<Badge
																variant="warn"
																className="px-1.5 py-0 text-[10px]"
															>
																Đã mời
															</Badge>
														)}
													</div>
													<div className="font-mono text-meta text-xs">
														{classMeta(c)}
													</div>
												</div>
											))
										) : (
											<span className="font-mono text-meta text-xs">
												Chưa có lớp
											</span>
										)}
									</div>,
									<div key="tags" className="flex flex-wrap gap-1">
										{s.tags.map((t) => (
											<Tag key={t}>{t}</Tag>
										))}
									</div>,
								],
							};
						})}
					/>
				</Card>
			)}

			<InviteStudentModal
				open={inviteModalOpen}
				onClose={() => setInviteModalOpen(false)}
			/>
		</div>
	);
}
