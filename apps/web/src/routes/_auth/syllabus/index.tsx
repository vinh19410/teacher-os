import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AddSyllabusModal } from "@/components/modals/add-syllabus-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { PageHead } from "@/components/ui/page-head";
import { Progress } from "@/components/ui/progress";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/_auth/syllabus/")({
	component: SyllabusRoute,
});

const FILTERS = ["Tất cả", "Writing", "Speaking", "Reading"];

function SyllabusRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	const [filter, setFilter] = useState("Tất cả");
	const [modalOpen, setModalOpen] = useState(false);

	const list =
		filter === "Tất cả"
			? data.syllabi
			: data.syllabi.filter((s) => s.skill === filter);

	return (
		<div>
			<PageHead title="Syllabus" lead="3 giáo trình · 37 buổi tổng cộng" />
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
				<Button onClick={() => setModalOpen(true)}>+ Tạo syllabus</Button>
			</div>
			<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
				{list.map((sy) => {
					const all = sy.modules.flatMap((m) => m.lessons);
					const done = all.filter((l) => l.status === "done").length;
					const pct =
						all.length > 0 ? Math.round((done / all.length) * 100) : 0;
					const assigned = data.classes.filter((c) => c.syllabusId === sy.id);
					return (
						<Card
							key={sy.id}
							variant="white"
							role="button"
							tabIndex={0}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									navigate({
										to: "/syllabus/$syllabusId",
										params: { syllabusId: sy.id },
									});
								}
							}}
							className="cursor-pointer transition-shadow duration-[150ms] hover:shadow-[var(--elev-raised)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
							onClick={() =>
								navigate({
									to: "/syllabus/$syllabusId",
									params: { syllabusId: sy.id },
								})
							}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex gap-1">
									<Tag>{sy.skill}</Tag>
									<Tag>{sy.level}</Tag>
								</div>
								<span className="font-mono text-meta text-xs">
									{sy.totalLessons} buổi
								</span>
							</div>
							<h3 className="mt-3 font-display font-semibold text-lg">
								{sy.name}
							</h3>
							<p className="mt-2 text-muted-fg text-sm leading-[1.45]">
								{sy.description}
							</p>
							<div className="mt-4">
								<div className="mb-1 flex justify-between">
									<span className="font-mono text-meta text-xs">Tiến độ</span>
									<span className="font-mono text-meta text-xs">
										{done}/{all.length}
									</span>
								</div>
								<Progress value={pct} />
							</div>
							<div className="mt-4 flex flex-wrap items-center gap-2">
								<span className="font-mono text-meta text-xs">Đã gán:</span>
								{assigned.length > 0 ? (
									assigned.map((c) => (
										<Badge key={c.id} variant="accent">
											{c.name.substring(0, 22)}
										</Badge>
									))
								) : (
									<span className="font-mono text-meta text-xs">Chưa gán</span>
								)}
							</div>
						</Card>
					);
				})}
			</div>
			<AddSyllabusModal
				open={modalOpen}
				onClose={() => setModalOpen(false)}
				onCreated={(id) =>
					navigate({ to: "/syllabus/$syllabusId", params: { syllabusId: id } })
				}
			/>
		</div>
	);
}
