import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import type { SyllabusLessonStatus } from "@/lib/mock-data";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export function EditLessonModal({
	open,
	onClose,
	syllabusId,
	moduleId,
	lessonId,
}: {
	open: boolean;
	onClose: () => void;
	syllabusId: string;
	moduleId: string | null;
	lessonId: string | null;
}) {
	const { syllabusById } = useData();
	const lesson = syllabusById(syllabusId)
		?.modules.find((m) => m.id === moduleId)
		?.lessons.find((l) => l.id === lessonId);

	const [title, setTitle] = useState("");
	const [objectives, setObjectives] = useState("");
	const [materials, setMaterials] = useState("");
	const [status, setStatus] = useState<SyllabusLessonStatus>("upcoming");
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();
	const [loadedFor, setLoadedFor] = useState<string | null>(null);

	if (lessonId && lessonId !== loadedFor && lesson) {
		setTitle(lesson.title);
		setObjectives(lesson.objectives === "—" ? "" : lesson.objectives);
		setMaterials(lesson.materials === "—" ? "" : lesson.materials);
		setStatus(lesson.status);
		setLoadedFor(lessonId);
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!moduleId || !lessonId) return;
		if (!title.trim()) {
			setError("Vui lòng nhập tên buổi học.");
			return;
		}
		const result = await run({
			type: "edit-lesson",
			syllabusId,
			moduleId,
			lessonId,
			payload: {
				title: title.trim(),
				objectives: objectives.trim(),
				materials: materials.trim(),
				status,
			},
		});
		if (result?.kind === "refreshed") {
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) onClose();
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Sửa buổi học"
		>
			<form onSubmit={submit}>
				<Field label="Tên buổi học *" error={error}>
					<Input value={title} onChange={(e) => setTitle(e.target.value)} />
				</Field>
				<Field label="Mục tiêu">
					<Textarea
						value={objectives}
						onChange={(e) => setObjectives(e.target.value)}
						rows={2}
					/>
				</Field>
				<Field label="Tài liệu">
					<Input
						value={materials}
						onChange={(e) => setMaterials(e.target.value)}
					/>
				</Field>
				<Field label="Trạng thái">
					<Select
						value={status}
						onChange={(e) => setStatus(e.target.value as SyllabusLessonStatus)}
					>
						<option value="upcoming">Sắp tới</option>
						<option value="current">Đang học</option>
						<option value="done">Đã dạy</option>
					</Select>
				</Field>
				<div className="flex flex-col gap-2">
					{error && (
						<p role="alert" className="text-danger text-xs">
							{error}
						</p>
					)}
					{notice && (
						<KernelSubmitNotice
							notice={notice}
							onReconcile={reconcileAndFinish}
							disabled={saving}
						/>
					)}
				</div>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving || submitBlocked}>
						Lưu thay đổi
					</Button>
				</div>
			</form>
		</Modal>
	);
}
