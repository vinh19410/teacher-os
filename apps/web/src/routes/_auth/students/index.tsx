import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AddStudentModal } from "@/components/modals/add-student-modal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { fmtVND } from "@/lib/mock-data";
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
	const [filter, setFilter] = useState("Tất cả");
	const [modalOpen, setModalOpen] = useState(false);

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
			<PageHead
				title="Học viên"
				lead={`${students.length} học viên đang học · ${attentionCount} cần chú ý (nợ học phí / sắp hết gói)`}
			/>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
				<Button onClick={() => setModalOpen(true)}>+ Thêm học viên</Button>
			</div>
			{students.length === 0 ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="students-empty-state"
				>
					<h2 className="font-display font-semibold text-lg">
						Chưa có học viên nào
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Bấm "+ Thêm học viên" ở góc trên để bắt đầu quản lý thông tin, gói
						học, học phí và bài tập.
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
						headers={["Học viên", "Gói", "Còn lại", "Tags", "Đơn giá"]}
						emptyMessage="Chưa có học viên."
						rows={list.map((s) => ({
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
										<div className="font-mono text-meta text-xs">{s.phone}</div>
									</div>
								</div>,
								<span key="pkg" className="font-mono text-meta text-xs">
									{s.hasPackage
										? `${s.pkg.total} buổi · ${s.pkg.mode}`
										: "Chưa có gói"}
								</span>,
								<span key="remaining" className="font-mono">
									{s.hasPackage ? `${s.pkg.remaining} / ${s.pkg.total}` : "—"}
								</span>,
								<div key="tags" className="flex flex-wrap gap-1">
									{s.tags.map((t) => (
										<Tag key={t}>{t}</Tag>
									))}
								</div>,
								<span key="price" className="font-mono">
									{s.hasPackage ? fmtVND(s.pkg.price) : "—"}
								</span>,
							],
						}))}
					/>
				</Card>
			)}
			<AddStudentModal open={modalOpen} onClose={() => setModalOpen(false)} />
		</div>
	);
}
