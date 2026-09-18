import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function AssignmentsRoute({
	initialFilter = "Tất cả",
}: {
	initialFilter?: string;
} = {}) {
	const navigate = useNavigate();
	const { data } = useData();
	const [filter, setFilter] = useState(initialFilter);

	const pendingCount = data.assignments.filter(
		(a) => a.status !== "graded",
	).length;

	const list =
		filter === "Tất cả"
			? data.assignments
			: data.assignments.filter((a) => a.status === STATUS_MAP[filter]);

	return (
		<div>
			<PageHead
				title="Bài tập"
				lead={`${data.assignments.length} bài tập · ${pendingCount} cần xử lý`}
			/>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
				<Button onClick={() => navigate({ to: "/assignments/new" })}>
					+ Tạo bài tập
				</Button>
			</div>
			{data.assignments.length === 0 ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="assignments-empty-state"
				>
					<h2 className="font-display font-semibold text-lg">
						Chưa có bài tập nào
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Bài tập được đồng bộ từ lớp học hoặc theo từng học viên. Hãy tạo lớp
						học hoặc thêm học viên để bắt đầu quản lý và chấm bài tập.
					</p>
					<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
						<Button onClick={() => navigate({ to: "/classes" })}>
							Quản lý lớp học
						</Button>
						<Button
							variant="secondary"
							onClick={() => navigate({ to: "/students" })}
						>
							Quản lý học viên
						</Button>
					</div>
				</Card>
			) : list.length === 0 ? (
				<Card variant="white" className="p-8 text-center">
					<p className="font-mono text-meta text-xs">
						Không có bài tập nào phù hợp với bộ lọc.
					</p>
				</Card>
			) : (
				<Card variant="white" className="p-0">
					<DataTable
						headers={[
							"Bài tập",
							"Học viên",
							"Loại",
							"Hạn",
							"Trạng thái",
							"Band",
						]}
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
			)}
		</div>
	);
}
