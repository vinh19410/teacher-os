import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { AddLessonModal } from "@/components/modals/add-lesson-modal";
import { AddModuleModal } from "@/components/modals/add-module-modal";
import { EditLessonModal } from "@/components/modals/edit-lesson-modal";
import { EditModuleModal } from "@/components/modals/edit-module-modal";
import {
	SyllabusMutationButtons,
	useSyllabusMutations,
} from "@/components/syllabus/syllabus-mutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Progress } from "@/components/ui/progress";
import { SectionLabel } from "@/components/ui/section-label";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { CLASS_TYPE_LABELS, type Syllabus } from "@/lib/mock-data";
import { useSyllabus } from "@/lib/repos/use-syllabus";
import {
	type DirectKernelAction,
	useDirectKernelAction,
} from "@/lib/use-direct-kernel-action";

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

function SyllabusDetailRoute() {
	const { syllabusId } = Route.useParams();
	const { syllabusById } = useSyllabus();
	const kernel = useDirectKernelAction();
	const sy = syllabusById(syllabusId);
	if (!sy) {
		throw notFound();
	}
	return <SyllabusDetail sy={sy} kernel={kernel} />;
}

function SyllabusDetail({
	sy,
	kernel,
}: {
	sy: Syllabus;
	kernel: DirectKernelAction;
}) {
	const navigate = useNavigate();
	const { classesForSyllabus } = useData();
	const { run, busy } = kernel;
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [addModuleOpen, setAddModuleOpen] = useState(false);
	const [editModuleId, setEditModuleId] = useState<string | null>(null);
	const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(
		null,
	);
	const [editLessonRef, setEditLessonRef] = useState<{
		moduleId: string;
		lessonId: string;
	} | null>(null);
	const mutations = useSyllabusMutations({
		syllabus: sy,
		isClassCopy: sy.classId !== null,
		run,
		busy,
	});

	const assigned = classesForSyllabus(sy.id);

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
						{sy.skills.length > 0 ? (
							sy.skills.map((sk) => <Tag key={sk}>{sk}</Tag>)
						) : (
							<Tag>{CLASS_TYPE_LABELS[sy.type]}</Tag>
						)}
						<Tag>{sy.level}</Tag>
					</div>
					<h1 className="font-display font-semibold text-[28px]">{sy.name}</h1>
					<p className="mt-2 max-w-[60ch] text-muted-fg text-sm">
						{sy.description}
					</p>
				</div>
				<div className="text-right">
					<div className="font-mono text-meta text-muted-fg text-xs">
						Đang dùng {assigned.length} lớp
					</div>
					<div className="mt-1 font-mono text-meta text-muted-fg text-xs">
						{sy.classId === null
							? "Template dùng chung"
							: "Bản sao của một lớp"}
					</div>
				</div>
			</Card>

			<div className="mb-6 grid grid-cols-2 gap-4 max-app:grid-cols-2">
				<StatCard num={String(sy.totalLessons)} label="tổng buổi" />
				<StatCard num={String(sy.modules.length)} label="module" />
			</div>

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

			{sy.modules.map((m, mi) => {
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
							<div className="flex flex-wrap items-center gap-3">
								<button
									type="button"
									onClick={() => setEditModuleId(m.id)}
									disabled={busy}
									className="rounded-sm px-1.5 py-0.5 text-muted-fg text-xs transition-colors duration-[150ms] hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-40"
								>
									Sửa
								</button>
								<SyllabusMutationButtons
									label={m.title}
									upDisabled={mi === 0}
									downDisabled={mi === sy.modules.length - 1}
									busy={busy}
									onUp={() => mutations.moveModule(mi, -1)}
									onDown={() => mutations.moveModule(mi, 1)}
									onDelete={() => mutations.requestDeleteModule(m)}
								/>
								<span className="font-mono text-[11px] text-muted-fg">
									{m.lessons.length} buổi
								</span>
							</div>
						</div>
						{!collapsed.has(m.id) && (
							<div className="block">
								{m.lessons.map((l, li) => (
									<div
										key={l.id}
										className="grid grid-cols-[1fr_auto] items-start gap-3 border-line-soft border-b border-solid px-5 py-3 last:border-b-0 hover:bg-surface-warm max-app:grid-cols-[1fr]"
									>
										<div>
											<div className="font-medium text-sm">{l.title}</div>
											<div className="mt-0.5 text-[11px] text-muted-fg">
												{l.materials}
											</div>
											<div className="mt-[3px] text-fg-2 text-xs leading-[1.4]">
												Mục tiêu: {l.objectives}
											</div>
										</div>
										<div className="flex flex-wrap items-center gap-2 max-app:pt-1">
											<button
												type="button"
												onClick={() =>
													setEditLessonRef({ moduleId: m.id, lessonId: l.id })
												}
												disabled={busy}
												className="rounded-sm px-1.5 py-0.5 text-muted-fg text-xs transition-colors duration-[150ms] hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-40"
											>
												Sửa
											</button>
											<SyllabusMutationButtons
												label={l.title}
												upDisabled={li === 0}
												downDisabled={li === m.lessons.length - 1}
												busy={busy}
												onUp={() => mutations.moveLesson(m.id, li, -1)}
												onDown={() => mutations.moveLesson(m.id, li, 1)}
												onDelete={() =>
													mutations.requestDeleteLesson(m.id, l.id, l.title)
												}
											/>
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
					<SectionLabel>Lớp đang dùng template này</SectionLabel>
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
										navigate({
											to: "/classes/$classId",
											params: { classId: c.id },
										}),
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
			{mutations.confirmModal}
		</div>
	);
}
