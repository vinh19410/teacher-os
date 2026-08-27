import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { averageBand } from "@/lib/mock-data";

export const Route = createFileRoute("/_auth/assignments/")({
	component: AssignmentsRoute,
});

const FILTERS = ["Tất cả", "Chưa nộp", "Trễ", "Đã chấm"];
const STATUS_MAP: Record<string, string> = {
	"Chưa nộp": "not-submitted",
	Trễ: "late",
	"Đã chấm": "graded",
};

function statusBadge(status: string) {
	if (status === "graded") return <Badge variant="success">Đã chấm</Badge>;
	if (status === "late") return <Badge variant="danger">Trễ</Badge>;
	return <Badge variant="warn">Chưa nộp</Badge>;
}

function AssignmentsRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	const [filter, setFilter] = useState("Tất cả");

	const list =
		filter === "Tất cả"
			? data.assignments
			: data.assignments.filter((a) => a.status === STATUS_MAP[filter]);

	return (
		<div>
			<PageHead title="Bài tập" lead="6 bài tập · 3 cần xử lý" />
			<div className="mb-4">
				<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
			</div>
			<Card variant="white" className="p-0">
				<DataTable
					headers={["Bài tập", "Học viên", "Loại", "Hạn", "Trạng thái", "Band"]}
					rows={list.map((a) => {
						const s = data.students.find((st) => st.id === a.sid);
						return {
							onClick: () =>
								navigate({
									to: "/assignments/$assignmentId",
									params: { assignmentId: a.id },
								}),
							cells: [
								<span key="t" className="font-medium text-sm">
									{a.title}
								</span>,
								<div key="s" className="flex items-center gap-2">
									<span className="text-sm">{s?.name}</span>
								</div>,
								<Tag key="ty">{a.type}</Tag>,
								<span key="d" className="font-mono text-meta text-xs">
									{a.due}
								</span>,
								statusBadge(a.status),
								a.scores ? (
									<span key="b" className="font-mono">
										{averageBand(a.scores).toFixed(1)}
									</span>
								) : (
									<span key="b" className="font-mono">
										—
									</span>
								),
							],
						};
					})}
				/>
			</Card>
		</div>
	);
}
