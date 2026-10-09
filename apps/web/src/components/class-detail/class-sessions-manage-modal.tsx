import { useState } from "react";
import { AddLessonModal } from "@/components/modals/add-lesson-modal";
import { AddModuleModal } from "@/components/modals/add-module-modal";
import { EditLessonModal } from "@/components/modals/edit-lesson-modal";
import { EditModuleModal } from "@/components/modals/edit-module-modal";
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
import type { ClassGroup, Syllabus } from "@/lib/mock-data";
import type { DirectKernelAction } from "@/lib/use-direct-kernel-action";

export interface ClassSessionsManageModalProps {
	open: boolean;
	onClose: () => void;
	cls: ClassGroup;
	syllabus: Syllabus | null;
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
 */
export function ClassSessionsManageModal({
	open,
	onClose,
	cls,
	syllabus: sy,
	run,
	busy,
}: ClassSessionsManageModalProps) {
	const [addModuleOpen, setAddModuleOpen] = useState(false);
	const [editModuleId, setEditModuleId] = useState<string | null>(null);
	const [addLessonModuleId, setAddLessonModuleId] = useState<string | null>(
		null,
	);
	const [editLessonRef, setEditLessonRef] = useState<{
		moduleId: string;
		lessonId: string;
	} | null>(null);

	const validCopy = open && sy && sy.classId === cls.id;
	const mutations = useSyllabusMutations({
		syllabus: validCopy
			? sy
			: {
					id: "",
					name: "",
					level: "",
					type: "ielts",
					skills: [],
					description: "",
					totalLessons: 0,
					classId: null,
					sourceTemplateId: null,
					modules: [],
				},
		isClassCopy: true,
		run,
		busy,
	});

	return (
		<Modal open={open} onClose={onClose} title="Quản lý buổi của lớp">
			{!validCopy ? (
				<p className="text-muted-fg text-sm">
					Lớp chưa có bản sao giáo trình hợp lệ để quản lý buổi.
				</p>
			) : (
				<div className="flex flex-col gap-4">
					<p className="text-muted-fg text-xs">
						Thứ tự buổi quyết định chủ đề hiển thị trên lịch lớp.
					</p>

					<div className="max-h-[60vh] overflow-y-auto pr-1">
						{sy.modules.length === 0 && (
							<div className="rounded-lg border border-line-soft border-solid bg-bg p-6 text-center text-muted-fg">
								<p className="text-sm">
									Bản sao chưa có module nào. Nhấn{" "}
									<strong>+ Thêm module</strong> để bổ sung.
								</p>
							</div>
						)}
						{sy.modules.map((m, mi) => {
							return (
								<div
									key={m.id}
									className="mb-4 overflow-hidden rounded-lg border border-line-soft border-solid bg-bg"
								>
									<div className="flex flex-wrap items-center justify-between gap-4 border-line-soft border-b border-solid bg-surface-warm px-5 py-4">
										<h3 className="font-semibold text-sm">{m.title}</h3>
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
										</div>
									</div>
									<div>
										{m.lessons.map((l, li) => (
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
											className="mt-2 w-full px-5 pb-3 text-left font-medium text-hot text-xs hover:text-accent-active"
										>
											+ Thêm buổi học
										</button>
									</div>
								</div>
							);
						})}
					</div>

					<div className="flex justify-end border-line-soft border-t border-solid pt-3">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setAddModuleOpen(true)}
						>
							+ Thêm module
						</Button>
					</div>
				</div>
			)}

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
				showStatus
			/>
			<EditLessonModal
				open={editLessonRef !== null}
				onClose={() => setEditLessonRef(null)}
				syllabusId={cls.syllabusId}
				moduleId={editLessonRef?.moduleId ?? null}
				lessonId={editLessonRef?.lessonId ?? null}
				showStatus
			/>
			{mutations.confirmModal}
		</Modal>
	);
}
