import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { AddLessonModal } from "@/components/modals/add-lesson-modal";
import { AddModuleModal } from "@/components/modals/add-module-modal";
import { AssignSyllabusModal } from "@/components/modals/assign-syllabus-modal";
import { EditLessonModal } from "@/components/modals/edit-lesson-modal";
import { EditModuleModal } from "@/components/modals/edit-module-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Progress } from "@/components/ui/progress";
import { SectionLabel } from "@/components/ui/section-label";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import type { SyllabusLesson } from "@/lib/mock-data";

export const Route = createFileRoute("/_auth/syllabus/$syllabusId")({
	component: SyllabusDetailRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<h1 className="font-display font-semibold text-xl">
				Không tìm thấy syllabus
			</h1>
			<p className="mt-2 text-muted-fg text-sm">
				Syllabus này không tồn tại hoặc dữ liệu demo đã được reset.
			</p>
			<Link
				to="/syllabus"
				className="mt-4 inline-block font-medium text-accent-blue text-sm hover:text-accent-active"
			>
				← Về danh sách syllabus
			</Link>
		</Card>
	),
});

const dotClass: Record<SyllabusLesson["status"], string> = {
	done: "bg-success",
	current: "bg-accent-blue shadow-[0_0_0_3px_var(--accent-soft)]",
	upcoming: "bg-line",
};

function statusBadge(status: SyllabusLesson["status"]) {
	if (status === "done")
		return (
			<Badge variant="success" dot>
				Đã dạy
			</Badge>
		);
	if (status === "current") return <Badge variant="accent">Đang học</Badge>;
	return <Badge variant="muted">Sắp tới</Badge>;
}

function SyllabusDetailRoute() {
	const { syllabusId } = Route.useParams();
	const { syllabusById, data } = useData();
	const sy = syllabusById(syllabusId);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [assignOpen, setAssignOpen] = useState(false);
	const [addModuleOpen, setAddModuleOpen] = useState(false);
	const [editModuleId, setEditModuleId] = useState<string | null>(null);
	const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(
		null,
	);
	const [editLessonRef, setEditLessonRef] = useState<{
		moduleId: string;
		lessonId: string;
	} | null>(null);

	if (!sy) {
		throw notFound();
	}

	const all = sy.modules.flatMap((m) => m.lessons);
	const done = all.filter((l) => l.status === "done").length;
	const current = all.find((l) => l.status === "current");
	const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;
	const assigned = data.classes.filter((c) => c.syllabusId === sy.id);

	function toggle(id: string) {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	return (
		<div>
			<Card variant="white" className="mb-5 flex flex-wrap items-center gap-5">
				<div className="min-w-[200px] flex-1">
					<div className="mb-2 flex gap-2">
						<Tag>{sy.skill}</Tag>
						<Tag>{sy.level}</Tag>
					</div>
					<h1 className="font-display font-semibold text-[28px]">{sy.name}</h1>
					<p className="mt-2 max-w-[60ch] text-muted-fg text-sm">
						{sy.description}
					</p>
				</div>
				<Button size="sm" onClick={() => setAssignOpen(true)}>
					Gán vào lớp
				</Button>
			</Card>

			<div className="mb-6 grid grid-cols-4 gap-4 max-app:grid-cols-2">
				<StatCard num={String(sy.totalLessons)} label="tổng buổi" />
				<StatCard
					num={String(done)}
					label="đã dạy"
					className="[&>div:first-child]:text-success"
				/>
				<StatCard
					num={current ? "1" : "0"}
					label="đang học"
					className="[&>div:first-child]:text-accent-blue"
				/>
				<StatCard num={String(sy.modules.length)} label="module" />
			</div>

			{current && (
				<Card className="mb-5 flex items-center gap-3">
					<span className="h-2 w-2 shrink-0 rounded-full bg-accent-blue" />
					<div>
						<div className="font-semibold text-sm">Buổi hiện tại</div>
						<div className="font-mono text-meta text-xs">
							{current.title} — {current.objectives}
						</div>
					</div>
				</Card>
			)}

			<div className="mb-3 flex items-center justify-between">
				<SectionLabel>Nội dung giáo trình</SectionLabel>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => setAddModuleOpen(true)}
				>
					+ Thêm module
				</Button>
			</div>

			{sy.modules.length === 0 && (
				<Card variant="white" className="p-8 text-center text-muted-fg">
					<p className="text-sm">
						Chưa có module nào. Nhấn <strong>+ Thêm module</strong> để bắt đầu
						xây dựng giáo trình.
					</p>
				</Card>
			)}

			{sy.modules.map((m) => {
				const mDone = m.lessons.filter((l) => l.status === "done").length;
				return (
					<div
						key={m.id}
						className="mb-4 overflow-hidden rounded-lg border border-line-soft border-solid bg-bg"
					>
						<div className="flex flex-wrap items-center justify-between gap-4 border-line-soft border-b border-solid bg-surface-warm px-5 py-4 transition-colors duration-[150ms] hover:bg-surface">
							<button
								type="button"
								onClick={() => toggle(m.id)}
								className="text-left"
							>
								<h3 className="font-semibold text-sm">{m.title}</h3>
							</button>
							<div className="flex items-center gap-3">
								<button
									type="button"
									onClick={() => setEditModuleId(m.id)}
									className="rounded-sm px-1.5 py-0.5 text-muted-fg text-xs transition-colors duration-[150ms] hover:bg-surface hover:text-fg"
								>
									Sửa
								</button>
								<span className="font-mono text-[11px] text-muted-fg">
									{mDone}/{m.lessons.length} buổi
								</span>
							</div>
						</div>
						{!collapsed.has(m.id) && (
							<div className="block">
								{m.lessons.map((l) => (
									<div
										key={l.id}
										className="grid grid-cols-[20px_1fr_auto] items-start gap-3 border-line-soft border-b border-solid px-5 py-3 last:border-b-0 hover:bg-surface-warm max-app:grid-cols-[20px_1fr]"
									>
										<span
											className={`lesson-dot mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[l.status]}`}
										/>
										<div>
											<div className="font-medium text-sm">{l.title}</div>
											<div className="mt-0.5 text-[11px] text-muted-fg">
												{l.materials}
											</div>
											<div className="mt-[3px] text-fg-2 text-xs leading-[1.4]">
												Mục tiêu: {l.objectives}
											</div>
										</div>
										<div className="flex items-center gap-2 max-app:col-start-2 max-app:pt-1">
											{statusBadge(l.status)}
											<button
												type="button"
												onClick={() =>
													setEditLessonRef({ moduleId: m.id, lessonId: l.id })
												}
												className="rounded-sm px-1.5 py-0.5 text-muted-fg text-xs transition-colors duration-[150ms] hover:bg-surface hover:text-fg"
											>
												Sửa
											</button>
										</div>
									</div>
								))}
								<button
									type="button"
									onClick={() => setAddLessonModuleId(m.id)}
									className="mt-2 w-full px-5 pb-3 text-left font-medium text-accent-blue text-xs hover:text-accent-active"
								>
									+ Thêm buổi học
								</button>
							</div>
						)}
					</div>
				);
			})}

			{assigned.length > 0 && (
				<div className="mt-6">
					<SectionLabel>Lớp đang dùng syllabus này</SectionLabel>
					<Card className="p-0">
						<DataTable
							headers={["Lớp", "Sĩ số", "Tiến độ", "Trạng thái"]}
							rows={assigned.map((c) => {
								const cpct =
									c.sessionsTotal > 0
										? (c.sessionsDone / c.sessionsTotal) * 100
										: 0;
								return {
									onClick: () =>
										void window.location.assign(`/classes/${c.id}`),
									cells: [
										<span key="n" className="font-medium text-sm">
											{c.name}
										</span>,
										<span key="s" className="font-mono">
											{c.studentIds.length}
										</span>,
										<Progress key="p" value={cpct} className="min-w-[100px]" />,
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
				</div>
			)}

			<AssignSyllabusModal
				open={assignOpen}
				onClose={() => setAssignOpen(false)}
				defaultSyllabusId={sy.id}
			/>
			<AddModuleModal
				open={addModuleOpen}
				onClose={() => setAddModuleOpen(false)}
				syllabusId={sy.id}
			/>
			<EditModuleModal
				open={editModuleId !== null}
				onClose={() => setEditModuleId(null)}
				syllabusId={sy.id}
				moduleId={editModuleId}
			/>
			<AddLessonModal
				open={addLessonModuleId !== null}
				onClose={() => setAddLessonModuleId(null)}
				syllabusId={sy.id}
				moduleId={addLessonModuleId}
			/>
			<EditLessonModal
				open={editLessonRef !== null}
				onClose={() => setEditLessonRef(null)}
				syllabusId={sy.id}
				moduleId={editLessonRef?.moduleId ?? null}
				lessonId={editLessonRef?.lessonId ?? null}
			/>
		</div>
	);
}
