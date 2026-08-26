import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AddLessonModal } from "@/components/modals/add-lesson-modal";
import { AddModuleModal } from "@/components/modals/add-module-modal";
import { EditLessonModal } from "@/components/modals/edit-lesson-modal";
import { EditModuleModal } from "@/components/modals/edit-module-modal";
import { ImportSyllabusModal } from "@/components/modals/import-syllabus-modal";
import {
	LessonStatusBadge,
	lessonDotClassFor,
} from "@/components/syllabus/lesson-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { SectionLabel } from "@/components/ui/section-label";
import {
	CLASS_TYPE_LABELS,
	type ClassGroup,
	type Syllabus,
} from "@/lib/mock-data";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";

export interface CurriculumManagementSectionProps {
	cls: ClassGroup;
	syllabus: Syllabus | null;
	defaultCollapsed?: boolean;
	collapsible?: boolean;
}

export function CurriculumManagementSection({
	cls,
	syllabus: sy,
	defaultCollapsed = false,
	collapsible = false,
}: CurriculumManagementSectionProps) {
	const { run, isPending, busy } = useDirectKernelAction();
	const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
	const [importOpen, setImportOpen] = useState(false);
	const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
	const [addModuleOpen, setAddModuleOpen] = useState(false);
	const [editModuleId, setEditModuleId] = useState<string | null>(null);
	const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(
		null,
	);
	const [editLessonRef, setEditLessonRef] = useState<{
		moduleId: string;
		lessonId: string;
	} | null>(null);

	const syLessons = sy?.modules.flatMap((m) => m.lessons) ?? [];
	const syDone = syLessons.filter((l) => l.status === "done").length;
	const syPct =
		syLessons.length > 0 ? Math.round((syDone / syLessons.length) * 100) : 0;

	return (
		<div>
			{sy && sy.classId === cls.id ? (
				<div>
					<Card
						variant="white"
						className="mb-4 flex flex-wrap items-center gap-4"
					>
						<div className="flex-1">
							<div className="flex items-center gap-2">
								<div className="font-semibold text-sm">{sy.name}</div>
								{collapsible && (
									<button
										type="button"
										onClick={() => setIsCollapsed((prev) => !prev)}
										className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 font-medium text-muted-fg text-xs transition-colors hover:bg-surface hover:text-fg"
										aria-expanded={!isCollapsed}
									>
										{isCollapsed ? (
											<>
												<ChevronRight className="h-3.5 w-3.5" />
												<span>
													Mở rộng ({sy.modules.length} chương · {syDone}/
													{syLessons.length} bài)
												</span>
											</>
										) : (
											<>
												<ChevronDown className="h-3.5 w-3.5" />
												<span>Thu gọn</span>
											</>
										)}
									</button>
								)}
							</div>
							<div className="font-mono text-meta text-xs">
								{sy.level} ·{" "}
								{sy.skills.length > 0
									? sy.skills.join(", ")
									: CLASS_TYPE_LABELS[sy.type]}{" "}
								· {sy.totalLessons} buổi
							</div>
						</div>
						<div className="text-right">
							<div className="font-mono font-semibold text-accent-blue text-xl">
								{syPct}%
							</div>
							<div className="font-mono text-meta text-xs">
								{syDone}/{syLessons.length} buổi
							</div>
						</div>
					</Card>
					<Progress value={syPct} className="mb-5" />

					{(!collapsible || !isCollapsed) && (
						<>
							<div className="mb-3 flex items-center justify-between">
								<SectionLabel>Nội dung giáo trình của lớp</SectionLabel>
								<div className="flex gap-2">
									<Button
										variant="secondary"
										size="sm"
										onClick={() => setAddModuleOpen(true)}
									>
										+ Thêm module
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => setConfirmRemoveOpen(true)}
									>
										Gỡ giáo trình
									</Button>
								</div>
							</div>
							{sy.modules.length === 0 && (
								<Card variant="white" className="p-6 text-center text-muted-fg">
									<p className="text-sm">
										Bản sao chưa có module nào. Nhấn{" "}
										<strong>+ Thêm module</strong> để bổ sung.
									</p>
								</Card>
							)}
							{sy.modules.map((m) => {
								const mDone = m.lessons.filter(
									(l) => l.status === "done",
								).length;
								return (
									<div
										key={m.id}
										className="mb-4 overflow-hidden rounded-lg border border-line-soft border-solid bg-bg"
									>
										<div className="flex flex-wrap items-center justify-between gap-4 border-line-soft border-b border-solid bg-surface-warm px-5 py-4">
											<h3 className="font-semibold text-sm">{m.title}</h3>
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
										<div>
											{m.lessons.map((l) => (
												<div
													key={l.id}
													className="grid grid-cols-[20px_1fr_auto] items-start gap-3 border-line-soft border-b border-solid px-5 py-3 last:border-b-0 hover:bg-surface-warm max-app:grid-cols-[20px_1fr]"
												>
													<span
														className={`lesson-dot mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${lessonDotClassFor(l.status)}`}
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
														<LessonStatusBadge status={l.status} />
														<button
															type="button"
															onClick={() =>
																setEditLessonRef({
																	moduleId: m.id,
																	lessonId: l.id,
																})
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
									</div>
								);
							})}
						</>
					)}
				</div>
			) : cls.syllabusId === "" ? (
				<Card variant="white" className="p-8 text-center">
					<p className="text-muted-fg text-sm">
						Lớp chưa có giáo trình. Nhập một bản sao từ template — chỉnh sửa
						trên lớp không ảnh hưởng template hay lớp khác.
					</p>
					<Button
						size="sm"
						className="mt-4"
						onClick={() => setImportOpen(true)}
					>
						Nhập từ template
					</Button>
				</Card>
			) : (
				// Legacy anomaly: pointer set but not this class's copy
				// (pre-migration data). Removing nulls the pointer only.
				<Card variant="white" className="p-8 text-center">
					<p className="text-muted-fg text-sm">
						Lớp có con trỏ giáo trình lệch (dữ liệu cũ) và không thể chỉnh sửa.
						Gỡ con trỏ để bắt đầu lại với một template.
					</p>
					<Button
						variant="secondary"
						size="sm"
						className="mt-4"
						onClick={() => setConfirmRemoveOpen(true)}
					>
						Gỡ giáo trình
					</Button>
				</Card>
			)}

			<ImportSyllabusModal
				key={`import-${cls.id}`}
				open={importOpen}
				onClose={() => setImportOpen(false)}
				classId={cls.id}
			/>
			<Modal
				open={confirmRemoveOpen}
				onClose={busy ? () => undefined : () => setConfirmRemoveOpen(false)}
				title="Gỡ giáo trình khỏi lớp?"
			>
				<p className="text-muted-fg text-sm">
					Nếu lớp đang giữ một bản sao giáo trình, toàn bộ cây (kèm tiến độ buổi
					học) sẽ bị xóa; nếu chỉ là con trỏ lệch (dữ liệu cũ), chỉ con trỏ được
					dọn. Template gốc và các lớp khác không bao giờ bị ảnh hưởng. Hành
					động này không thể hoàn tác.
				</p>
				<div className="mt-4 flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setConfirmRemoveOpen(false)}
						disabled={busy || isPending("remove-curriculum")}
					>
						Để lại
					</Button>
					<Button
						variant="danger"
						size="sm"
						disabled={busy || isPending("remove-curriculum")}
						onClick={() => {
							setConfirmRemoveOpen(false);
							void run(
								"remove-curriculum",
								{ type: "remove-curriculum", classId: cls.id },
								"Đã gỡ giáo trình.",
							);
						}}
					>
						{isPending("remove-curriculum") ? "Đang gỡ…" : "Gỡ giáo trình"}
					</Button>
				</div>
			</Modal>
			<AddModuleModal
				open={addModuleOpen}
				onClose={() => setAddModuleOpen(false)}
				syllabusId={cls.syllabusId}
			/>
			<EditModuleModal
				open={editModuleId !== null}
				onClose={() => setEditModuleId(null)}
				syllabusId={cls.syllabusId}
				moduleId={editModuleId}
			/>
			<AddLessonModal
				open={addLessonModuleId !== null}
				onClose={() => setAddLessonModuleId(null)}
				syllabusId={cls.syllabusId}
				moduleId={addLessonModuleId}
			/>
			<EditLessonModal
				open={editLessonRef !== null}
				onClose={() => setEditLessonRef(null)}
				syllabusId={cls.syllabusId}
				moduleId={editLessonRef?.moduleId ?? null}
				lessonId={editLessonRef?.lessonId ?? null}
			/>
		</div>
	);
}
