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

export const Route = createFileRoute("/_auth/students/")({
	component: StudentsRoute,
});

const FILTERS = ["Tất cả", "Sắp hết buổi", "Nợ học phí", "Writing", "Speaking"];

function StudentsRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	const [filter, setFilter] = useState("Tất cả");
	const [modalOpen, setModalOpen] = useState(false);

	const tagMap: Record<string, string> = {
		"Sắp hết buổi": "sắp hết buổi",
		"Nợ học phí": "nợ học phí",
		Writing: "IELTS Writing",
		Speaking: "IELTS Speaking",
	};
	const list =
		filter === "Tất cả"
			? data.students
			: data.students.filter((s) => s.tags.includes(tagMap[filter] ?? filter));

	return (
		<div>
			<PageHead
				title="Học viên"
				lead="5 học viên đang học · 2 cần chú ý (nợ học phí / sắp hết gói)"
			/>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
				<Button onClick={() => setModalOpen(true)}>+ Thêm học viên</Button>
			</div>
			<Card variant="white" className="p-0">
				<DataTable
					headers={["Học viên", "Gói", "Còn lại", "Tags", "Đơn giá"]}
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
								{s.pkg.total} buổi · {s.pkg.mode}
							</span>,
							<span key="remaining" className="font-mono">
								{s.pkg.remaining} / {s.pkg.total}
							</span>,
							<div key="tags" className="flex flex-wrap gap-1">
								{s.tags.map((t) => (
									<Tag key={t}>{t}</Tag>
								))}
							</div>,
							<span key="price" className="font-mono">
								{fmtVND(s.pkg.price)}
							</span>,
						],
					}))}
				/>
			</Card>
			<AddStudentModal open={modalOpen} onClose={() => setModalOpen(false)} />
		</div>
	);
}
