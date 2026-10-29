import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { CurriculumTarget } from "@/lib/data-actions";
import type { SyllabusLessonKind, SyllabusLessonStatus } from "@/lib/mock-data";
import { useTargetSyllabus } from "@/lib/repos/use-syllabus";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export function EditLessonModal({
	open,
	onClose,
	target,
	moduleId,
	lessonId,
	showKind,
	showStatus,
}: {
	open: boolean;
	onClose: () => void;
	target: CurriculumTarget;
	moduleId: string | null;
	lessonId: string | null;
	/** Chỉ màn hình syllabus bật — loại buổi là nội dung giáo trình (#154). */
	showKind?: boolean;
	/** Chỉ màn hình lớp học bật — syllabus không sửa trạng thái buổi học. */
	showStatus?: boolean;
}) {
	const lesson = useTargetSyllabus(target)
		?.modules.find((m) => m.id === moduleId)
		?.lessons.find((l) => l.id === lessonId);

	const [title, setTitle] = useState("");
	const [objectives, setObjectives] = useState("");
	const [materials, setMaterials] = useState("");
	const [kind, setKind] = useState<SyllabusLessonKind>("lesson");
	const [status, setStatus] = useState<SyllabusLessonStatus>("upcoming");
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();
	const [loadedFor, setLoadedFor] = useState<string | null>(null);

	if (lessonId && lessonId !== loadedFor && lesson) {
		setTitle(lesson.title);
		setObjectives(lesson.objectives === "—" ? "" : lesson.objectives);
		setMaterials(lesson.materials === "—" ? "" : lesson.materials);
		setKind(lesson.kind);
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
			target,
			moduleId,
			lessonId,
			payload: {
				title: title.trim(),
				objectives: objectives.trim(),
				materials: materials.trim(),
				// Không showKind → không gửi key kind: server + reducer sẽ giữ
				// nguyên loại buổi hiện tại (mirror showStatus, issue #154).
				...(showKind ? { kind } : {}),
				// Không showStatus → không gửi key status: server + reducer sẽ
				// giữ nguyên trạng thái hiện tại của buổi học.
				...(showStatus ? { status } : {}),
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
			<form noValidate onSubmit={submit}>
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
				{showKind && (
					<Field label="Loại buổi học">
						<Select
							value={kind}
							onChange={(e) => setKind(e.target.value as SyllabusLessonKind)}
						>
							<option value="lesson">Buổi học</option>
							<option value="midterm">Thi giữa kỳ</option>
							<option value="final">Thi cuối kỳ</option>
						</Select>
					</Field>
				)}
				{showStatus && (
					<Field label="Trạng thái">
						<Select
							value={status}
							onChange={(e) =>
								setStatus(e.target.value as SyllabusLessonStatus)
							}
						>
							<option value="upcoming">Sắp tới</option>
							<option value="current">Đang học</option>
							<option value="done">Đã dạy</option>
						</Select>
					</Field>
				)}
				<div className="flex flex-col gap-2 empty:hidden">
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
				<div className="flex justify-end gap-2 border-border border-t border-solid pt-4">
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
