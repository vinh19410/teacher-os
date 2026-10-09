import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AddClassModal } from "@/components/modals/add-class-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { PageHead } from "@/components/ui/page-head";
import { Progress } from "@/components/ui/progress";
import { useData } from "@/lib/data-store";
import { formatSchedule } from "@/lib/format-schedule";
import { CLASS_TYPE_LABELS, classMeta } from "@/lib/mock-data";
import { useClasses } from "@/lib/repos/use-classes";

export const Route = createFileRoute("/_auth/classes/")({
	component: ClassesRoute,
});

const FILTERS = ["Tất cả", "Trực tuyến", "Trực tiếp", "Đang học"];
const MODE_MAP: Record<string, string> = {
	"Trực tuyến": "Online",
	"Trực tiếp": "Offline",
};
// Contract #170: list pages keep their localized Vietnamese labels.
const SYLLABUS_LABEL = "Giáo trình";

export function ClassesRoute() {
	const navigate = useNavigate();
	const { classes } = useClasses();
	const { data } = useData();
	const [filter, setFilter] = useState("Tất cả");
	const [modalOpen, setModalOpen] = useState(false);

	const activeCount = classes.filter((c) => c.status === "active").length;

	const list =
		filter === "Tất cả"
			? classes
			: classes.filter((c) =>
					filter === "Đang học"
						? c.status === "active"
						: c.mode === (MODE_MAP[filter] ?? filter),
				);

	return (
		<div>
			<PageHead
				kicker={`${activeCount} lớp đang hoạt động`}
				title="Lớp học"
				action={<Button onClick={() => setModalOpen(true)}>+ Tạo lớp</Button>}
			/>
			<div className="mb-6">
				<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
			</div>
			{classes.length === 0 ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="classes-empty-state"
				>
					<h2 className="font-display font-extrabold text-lg">
						Chưa có lớp học nào
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Bấm "+ Tạo lớp" ở góc trên để xếp lịch, liên kết giáo trình và quản
						lý danh sách học viên.
					</p>
				</Card>
			) : list.length === 0 ? (
				<Card variant="white" className="p-8 text-center">
					<p className="font-mono text-meta text-xs">
						Không có lớp học nào phù hợp với bộ lọc.
					</p>
				</Card>
			) : (
				<div className="grid gap-6 md:grid-cols-2">
					{list.map((c, i) => {
						const sy = data.syllabi.find((s) => s.id === c.syllabusId);
						const pct =
							c.sessionsTotal > 0
								? (c.sessionsDone / c.sessionsTotal) * 100
								: 0;
						return (
							<button
								key={c.id}
								type="button"
								onClick={() =>
									navigate({
										to: "/classes/$classId",
										params: { classId: c.id },
									})
								}
								className="neu group rounded-md p-6 text-left transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
							>
								<div className="flex items-baseline justify-between gap-3 font-mono text-[11px] text-meta uppercase tracking-widest">
									<span>
										{String(i + 1).padStart(2, "0")} ·{" "}
										{CLASS_TYPE_LABELS[c.type]}
									</span>
									<span>{classMeta(c)}</span>
								</div>
								<h3 className="mt-4 font-display font-extrabold text-2xl tracking-[-0.02em] transition-colors group-hover:text-hot">
									{c.name}
								</h3>
								<div className="mt-2 font-mono text-meta text-sm">
									{formatSchedule(c.schedule)}
								</div>
								<div className="mt-1 flex items-center gap-3 text-xs">
									<span className="text-muted-fg">
										{c.studentIds.length} học viên
									</span>
									<span className="truncate text-meta">
										{SYLLABUS_LABEL}:{" "}
										{sy ? sy.name : <span className="font-mono">chưa gán</span>}
									</span>
								</div>
								{c.sessionsTotal > 0 && (
									<div className="mt-5">
										<Progress value={pct} />
										<div className="mt-1 font-mono text-[11px] text-meta">
											Tiến độ {c.sessionsDone}/{c.sessionsTotal} buổi
										</div>
									</div>
								)}
								<div className="mt-3">
									{c.status === "active" ? (
										<Badge variant="success" dot>
											Đang học
										</Badge>
									) : (
										<Badge variant="muted">Tạm dừng</Badge>
									)}
								</div>
							</button>
						);
					})}
				</div>
			)}
			<AddClassModal open={modalOpen} onClose={() => setModalOpen(false)} />
		</div>
	);
}
