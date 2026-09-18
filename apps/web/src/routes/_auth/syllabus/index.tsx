import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AddSyllabusModal } from "@/components/modals/add-syllabus-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { PageHead } from "@/components/ui/page-head";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { CLASS_TYPE_LABELS } from "@/lib/mock-data";
import { useSyllabus } from "@/lib/repos/use-syllabus";

export const Route = createFileRoute("/_auth/syllabus/")({
	component: SyllabusRoute,
});

const FILTERS = ["Tất cả", "Viết", "Nói", "Đọc", "Nghe"];
const SKILL_MAP: Record<string, string> = {
	Viết: "Writing",
	Nói: "Speaking",
	Đọc: "Reading",
	Nghe: "Listening",
};

function SyllabusRoute() {
	const navigate = useNavigate();
	const { templates } = useSyllabus();
	const { classesForSyllabus } = useData();
	const [filter, setFilter] = useState("Tất cả");
	const [modalOpen, setModalOpen] = useState(false);

	const list =
		filter === "Tất cả"
			? templates
			: templates.filter((s) => {
					const wireSkill = SKILL_MAP[filter] ?? filter;
					return s.skills.includes(wireSkill);
				});

	return (
		<div>
			<PageHead
				title="Giáo trình"
				lead={`${templates.length} template · ${templates.reduce((sum, s) => sum + s.totalLessons, 0)} buổi tổng cộng`}
			/>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<ChipFilter options={FILTERS} value={filter} onChange={setFilter} />
				<Button onClick={() => setModalOpen(true)}>+ Tạo syllabus</Button>
			</div>
			<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
				{list.map((sy) => {
					const inUse = classesForSyllabus(sy.id).length;
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
									{sy.skills.length > 0 ? (
										sy.skills.map((sk) => <Tag key={sk}>{sk}</Tag>)
									) : (
										<Tag>{CLASS_TYPE_LABELS[sy.type]}</Tag>
									)}
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
									<span className="font-mono text-meta text-xs">Module</span>
									<span className="font-mono text-meta text-xs">
										{sy.modules.length}
									</span>
								</div>
							</div>
							<div className="mt-4 flex flex-wrap items-center gap-2">
								<Badge variant={inUse > 0 ? "accent" : "muted"}>
									Đang dùng {inUse} lớp
								</Badge>
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
