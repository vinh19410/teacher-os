import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { CurriculumTarget, KernelAction } from "@/lib/data-actions";
import type { Syllabus, SyllabusModule } from "@/lib/mock-data";
import { moveItem } from "@/lib/move-item";
import type { KernelCommandResult } from "@/lib/repos/kernel";

// Mirror DirectKernelAction.run — run trả kết quả để caller (import ghi đè)
// quyết định clear preview hay giữ lại (issue #152).
export type KernelRun = (
	key: string,
	action: KernelAction,
	successText: string,
) => Promise<KernelCommandResult>;

const textBtnClass =
	"rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors duration-[150ms] hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

type DeleteTarget =
	| { kind: "module"; module: SyllabusModule }
	| { kind: "lesson"; moduleId: string; lessonId: string; title: string };

export function SyllabusMutationButtons({
	label,
	upDisabled,
	downDisabled,
	busy,
	onUp,
	onDown,
	onDelete,
}: {
	label: string;
	upDisabled: boolean;
	downDisabled: boolean;
	busy: boolean;
	onUp: () => void;
	onDown: () => void;
	onDelete: () => void;
}) {
	return (
		<>
			<button
				type="button"
				aria-label={`Đưa ${label} lên`}
				disabled={busy || upDisabled}
				onClick={onUp}
				className={textBtnClass}
			>
				↑
			</button>
			<button
				type="button"
				aria-label={`Đưa ${label} xuống`}
				disabled={busy || downDisabled}
				onClick={onDown}
				className={textBtnClass}
			>
				↓
			</button>
			<button
				type="button"
				aria-label={`Xóa ${label}`}
				disabled={busy}
				onClick={onDelete}
				className={textBtnClass}
			>
				Xóa
			</button>
		</>
	);
}

export function useSyllabusMutations({
	syllabus,
	target,
	isClassCopy,
	run,
	busy,
}: {
	/** Null khi component render ngoài phạm vi có giáo trình — mọi op no-op. */
	syllabus: Syllabus | null;
	target: CurriculumTarget | null;
	isClassCopy: boolean;
	run: KernelRun;
	busy: boolean;
}) {
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

	function moveModule(index: number, dir: -1 | 1) {
		if (!target || !syllabus) return;
		const next = moveItem(syllabus.modules, index, dir);
		void run(
			`reorder-modules:${JSON.stringify(target)}`,
			{
				type: "reorder-modules",
				target,
				moduleIds: next.map((m) => m.id),
			},
			"Đã đổi thứ tự module.",
		);
	}

	function moveLesson(moduleId: string, index: number, dir: -1 | 1) {
		if (!target || !syllabus) return;
		const mod = syllabus.modules.find((m) => m.id === moduleId);
		if (!mod) return;
		const next = moveItem(mod.lessons, index, dir);
		void run(
			`reorder-lessons:${moduleId}`,
			{
				type: "reorder-lessons",
				target,
				moduleId,
				lessonIds: next.map((l) => l.id),
			},
			"Đã đổi thứ tự buổi học.",
		);
	}

	function confirmDelete() {
		if (!deleteTarget || !target) return;
		if (deleteTarget.kind === "module") {
			void run(
				`delete-module:${deleteTarget.module.id}`,
				{
					type: "delete-module",
					target,
					moduleId: deleteTarget.module.id,
				},
				"Đã xóa module.",
			);
		} else {
			void run(
				`delete-lesson:${deleteTarget.lessonId}`,
				{
					type: "delete-lesson",
					target,
					moduleId: deleteTarget.moduleId,
					lessonId: deleteTarget.lessonId,
				},
				"Đã xóa buổi học.",
			);
		}
		setDeleteTarget(null);
	}

	const n =
		deleteTarget?.kind === "module" ? deleteTarget.module.lessons.length : 0;
	const confirmCopy =
		deleteTarget?.kind === "module"
			? isClassCopy
				? `Xóa module này sẽ xóa cả ${n} buổi học bên trong, kèm tiến độ đã điểm danh. Hành động này không thể hoàn tác.`
				: `Đây là giáo trình mẫu của tổ chức. Xóa module này sẽ xóa cả ${n} buổi học trên template (lớp đã import không bị ảnh hưởng). Không thể hoàn tác.`
			: "Xóa buổi học này? Hành động không thể hoàn tác.";

	const confirmModal = (
		<Modal
			open={deleteTarget !== null}
			onClose={busy ? () => undefined : () => setDeleteTarget(null)}
			title={deleteTarget?.kind === "module" ? "Xóa module?" : "Xóa buổi học?"}
		>
			<p className="text-muted-foreground text-sm">{confirmCopy}</p>
			<div className="mt-4 flex justify-end gap-2">
				<Button
					variant="secondary"
					size="sm"
					disabled={busy}
					onClick={() => setDeleteTarget(null)}
				>
					Hủy
				</Button>
				<Button
					variant="danger"
					size="sm"
					disabled={busy}
					onClick={confirmDelete}
				>
					Xóa
				</Button>
			</div>
		</Modal>
	);

	return {
		busy,
		moveModule,
		moveLesson,
		requestDeleteModule: (module: SyllabusModule) =>
			setDeleteTarget({ kind: "module", module }),
		requestDeleteLesson: (moduleId: string, lessonId: string, title: string) =>
			setDeleteTarget({ kind: "lesson", moduleId, lessonId, title }),
		confirmModal,
	};
}
