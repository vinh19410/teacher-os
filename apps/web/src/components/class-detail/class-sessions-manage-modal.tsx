import { useState } from "react";
import { AddLessonModal } from "@/components/modals/add-lesson-modal";
import { AddModuleModal } from "@/components/modals/add-module-modal";
import { EditLessonModal } from "@/components/modals/edit-lesson-modal";
import { EditModuleModal } from "@/components/modals/edit-module-modal";
import { LessonBankMaterialsBadge } from "@/components/syllabus/lesson-bank-materials-badge";
import {
	LessonStatusBadge,
	lessonDotClassFor,
} from "@/components/syllabus/lesson-status";
import {
	SyllabusMutationButtons,
	useSyllabusMutations,
} from "@/components/syllabus/syllabus-mutations";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { ClassGroup } from "@/lib/mock-data";
import { useClassCurriculum } from "@/lib/repos/use-syllabus";
import type { DirectKernelAction } from "@/lib/use-direct-kernel-action";

export interface ClassSessionsManageModalProps {
	open: boolean;
	onClose: () => void;
	cls: ClassGroup;
	run: DirectKernelAction["run"];
	isPending: DirectKernelAction["isPending"];
	busy: boolean;
}

/**
 * Issue #221 — "Quản lý buổi" modal: the old curriculum card's tree lives
 * here, scoped to the class's own copy. Reordering lessons here is what
 * drives the topic shown on each schedule-table row (buổi N ↔ bài N).
 * Deliberately no course-level progress rollup — that lives in the page
 * header and schedule table.
 *
 * Issue #394: giáo trình của lớp đọc qua `useClassCurriculum` (nguồn sự thật
 * `syllabus.class_id`) — không còn placeholder/con-trỏ-lệch branch.
 */
export function ClassSessionsManageModal({
	open,
	onClose,
	cls,
	run,
	busy,
}: ClassSessionsManageModalProps) {
	const curriculum = useClassCurriculum(cls.id);
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
		target: curriculum ? { kind: "class", classId: cls.id } : null,
		syllabus: curriculum,
		isClassCopy: true,
		run,
		busy,
	});
	const sy = curriculum;
	if (!sy) return null;

	return (
		<Modal open={open} onClose={onClose} title="Quản lý buổi của lớp">
			<div className="flex flex-col gap-4">
				<p className="text-muted-foreground text-xs">
					Thứ tự buổi quyết định chủ đề hiển thị trên lịch lớp.
				</p>

				<div className="max-h-[60vh] overflow-y-auto pr-1">
					{sy.modules.length === 0 && (
						<div className="rounded-lg border border-border border-solid bg-background p-6 text-center text-muted-foreground">
							<p className="text-sm">
								Bản sao chưa có module nào. Nhấn <strong>+ Thêm module</strong>{" "}
								để bổ sung.
							</p>
						</div>
					)}
					{sy.modules.map((m, mi) => {
						return (
							<div
								key={m.id}
								data-testid="module-card"
								className="mb-4 overflow-hidden rounded-lg border border-border bg-card"
							>
								<div className="flex flex-wrap items-center justify-between gap-4 border-border border-b bg-muted/40 px-5 py-4">
									<h3 className="font-semibold text-sm">{m.title}</h3>
									<div className="flex flex-wrap items-center gap-3">
										<button
											type="button"
											onClick={() => setEditModuleId(m.id)}
											disabled={busy}
											className="rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors duration-[150ms] hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
									</div>
								</div>
								<div>
									{m.lessons.map((l, li) => (
										<div
											key={l.id}
											className="grid grid-cols-[20px_1fr_auto] items-start gap-3 border-border border-b border-solid px-5 py-3 last:border-b-0 hover:bg-muted/40 max-app:grid-cols-[20px_1fr]"
										>
											<span
												className={`lesson-dot mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${lessonDotClassFor(l.status)}`}
											/>
											<div>
												<div className="font-medium text-sm">{l.title}</div>
												<div className="mt-0.5 text-[11px] text-muted-foreground">
													{l.materials}
													<LessonBankMaterialsBadge
														count={l.bankMaterials?.length ?? 0}
													/>
												</div>
											</div>
											<div className="flex flex-wrap items-center gap-2 max-app:col-start-2 max-app:pt-1">
												<LessonStatusBadge status={l.status} />
												<button
													type="button"
													onClick={() =>
														setEditLessonRef({
															moduleId: m.id,
															lessonId: l.id,
														})
													}
													disabled={busy}
													className="rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors duration-[150ms] hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
										className="mt-2 w-full px-5 pb-3 text-left font-medium text-primary text-xs hover:text-primary"
									>
										+ Thêm buổi học
									</button>
								</div>
							</div>
						);
					})}
				</div>

				<div className="flex justify-end border-border border-t border-solid pt-3">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setAddModuleOpen(true)}
					>
						+ Thêm module
					</Button>
				</div>
			</div>

			<AddModuleModal
				open={addModuleOpen}
				onClose={() => setAddModuleOpen(false)}
				target={{ kind: "class", classId: cls.id }}
			/>
			<EditModuleModal
				open={editModuleId !== null}
				onClose={() => setEditModuleId(null)}
				target={{ kind: "class", classId: cls.id }}
				moduleId={editModuleId}
			/>
			<AddLessonModal
				open={addLessonModuleId !== null}
				onClose={() => setAddLessonModuleId(null)}
				target={{ kind: "class", classId: cls.id }}
				moduleId={addLessonModuleId}
				showStatus
			/>
			<EditLessonModal
				open={editLessonRef !== null}
				onClose={() => setEditLessonRef(null)}
				target={{ kind: "class", classId: cls.id }}
				moduleId={editLessonRef?.moduleId ?? null}
				lessonId={editLessonRef?.lessonId ?? null}
				showStatus
			/>
			{mutations.confirmModal}
		</Modal>
	);
}
