import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AddClassModal } from "@/components/modals/add-class-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { Progress } from "@/components/ui/progress";
import { useData } from "@/lib/data-store";
import { useClasses } from "@/lib/repos/use-classes";

export const Route = createFileRoute("/_auth/classes/")({
	component: ClassesRoute,
});

const FILTERS = ["Tất cả", "Online", "Offline", "Đang học"];

function ClassesRoute() {
	const navigate = useNavigate();
	const { classes } = useClasses();
	const { data } = useData();
	const [filter, setFilter] = useState("Tất cả");
	const [modalOpen, setModalOpen] = useState(false);

	const list =
		filter === "Tất cả"
			? classes
			: classes.filter((c) =>
					filter === "Đang học" ? c.status === "active" : c.mode === filter,
				);

	return (
		<div>
			<PageHead title="Lớp học" lead="3 lớp đang hoạt động" />
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
				<Button onClick={() => setModalOpen(true)}>+ Tạo lớp</Button>
			</div>
			<Card variant="white" className="p-0">
				<DataTable
					headers={[
						"Lớp",
						"Syllabus",
						"Sĩ số",
						"Tiến độ",
						"Lịch",
						"Trạng thái",
					]}
					rows={list.map((c) => {
						const sy = data.syllabi.find((s) => s.id === c.syllabusId);
						const pct =
							c.sessionsTotal > 0
								? (c.sessionsDone / c.sessionsTotal) * 100
								: 0;
						return {
							onClick: () =>
								navigate({
									to: "/classes/$classId",
									params: { classId: c.id },
								}),
							cells: [
								<div key="n">
									<div className="font-semibold text-sm">{c.name}</div>
									<div className="font-mono text-meta text-xs">
										{c.level} · {c.skill} · {c.mode}
									</div>
								</div>,
								sy ? (
									<span key="sy">{sy.name}</span>
								) : (
									<span key="sy" className="font-mono text-meta text-xs">
										Chưa gán
									</span>
								),
								<span key="c" className="font-mono">
									{c.studentIds.length}
								</span>,
								<div key="p" className="min-w-[100px]">
									<Progress
										value={pct}
										variant={pct >= 67 ? "default" : pct >= 34 ? "warn" : "low"}
									/>
									<div className="mt-[3px] font-mono text-meta text-xs">
										{c.sessionsDone}/{c.sessionsTotal} buổi
									</div>
								</div>,
								<span key="s" className="font-mono text-meta text-xs">
									{c.schedule}
								</span>,
								c.status === "active" ? (
									<Badge key="b" variant="success" dot>
										Đang học
									</Badge>
								) : (
									<Badge key="b" variant="muted">
										Tạm dừng
									</Badge>
								),
							],
						};
					})}
				/>
			</Card>
			<AddClassModal open={modalOpen} onClose={() => setModalOpen(false)} />
		</div>
	);
}
