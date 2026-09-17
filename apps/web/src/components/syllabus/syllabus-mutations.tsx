import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { KernelAction } from "@/lib/data-actions";
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
	"rounded-sm px-1.5 py-0.5 text-muted-fg text-xs transition-colors duration-[150ms] hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-40";

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
	isClassCopy,
	run,
	busy,
}: {
	syllabus: Syllabus;
	isClassCopy: boolean;
	run: KernelRun;
	busy: boolean;
}) {
	const [target, setTarget] = useState<DeleteTarget | null>(null);
	const syllabusId = syllabus.id;

	function moveModule(index: number, dir: -1 | 1) {
		const next = moveItem(syllabus.modules, index, dir);
		void run(
			`reorder-modules:${syllabusId}`,
			{
				type: "reorder-modules",
				syllabusId,
				moduleIds: next.map((m) => m.id),
			},
			"Đã đổi thứ tự module.",
		);
	}

	function moveLesson(moduleId: string, index: number, dir: -1 | 1) {
		const mod = syllabus.modules.find((m) => m.id === moduleId);
		if (!mod) return;
		const next = moveItem(mod.lessons, index, dir);
		void run(
			`reorder-lessons:${moduleId}`,
			{
				type: "reorder-lessons",
				syllabusId,
				moduleId,
				lessonIds: next.map((l) => l.id),
			},
			"Đã đổi thứ tự buổi học.",
		);
	}

	function confirmDelete() {
		if (!target) return;
		if (target.kind === "module") {
			void run(
				`delete-module:${target.module.id}`,
				{
					type: "delete-module",
					syllabusId,
					moduleId: target.module.id,
				},
				"Đã xóa module.",
			);
		} else {
			void run(
				`delete-lesson:${target.lessonId}`,
				{
					type: "delete-lesson",
					syllabusId,
					moduleId: target.moduleId,
					lessonId: target.lessonId,
				},
				"Đã xóa buổi học.",
			);
		}
		setTarget(null);
	}

	const n = target?.kind === "module" ? target.module.lessons.length : 0;
	const confirmCopy =
		target?.kind === "module"
			? isClassCopy
				? `Xóa module này sẽ xóa cả ${n} buổi học bên trong, kèm tiến độ đã điểm danh. Hành động này không thể hoàn tác.`
				: `Đây là giáo trình mẫu của tổ chức. Xóa module này sẽ xóa cả ${n} buổi học trên template (lớp đã import không bị ảnh hưởng). Không thể hoàn tác.`
			: "Xóa buổi học này? Hành động không thể hoàn tác.";

	const confirmModal = (
		<Modal
			open={target !== null}
			onClose={busy ? () => undefined : () => setTarget(null)}
			title={target?.kind === "module" ? "Xóa module?" : "Xóa buổi học?"}
		>
			<p className="text-muted-fg text-sm">{confirmCopy}</p>
			<div className="mt-4 flex justify-end gap-2">
				<Button
					variant="secondary"
					size="sm"
					disabled={busy}
					onClick={() => setTarget(null)}
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
			setTarget({ kind: "module", module }),
		requestDeleteLesson: (moduleId: string, lessonId: string, title: string) =>
			setTarget({ kind: "lesson", moduleId, lessonId, title }),
		confirmModal,
	};
}
