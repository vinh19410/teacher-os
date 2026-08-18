import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import type { SyllabusLessonStatus } from "@/lib/mock-data";

export function AddLessonModal({
	open,
	onClose,
	syllabusId,
	moduleId,
}: {
	open: boolean;
	onClose: () => void;
	syllabusId: string;
	moduleId: string | null;
}) {
	const { dispatch } = useData();
	const [title, setTitle] = useState("");
	const [objectives, setObjectives] = useState("");
	const [materials, setMaterials] = useState("");
	const [status, setStatus] = useState<SyllabusLessonStatus>("upcoming");
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!moduleId) return;
		if (!title.trim()) {
			setError("Vui lòng nhập tên buổi học.");
			return;
		}
		setSaving(true);
		try {
			await dispatch({
				type: "add-lesson",
				syllabusId,
				moduleId,
				payload: {
					title: title.trim(),
					objectives: objectives.trim(),
					materials: materials.trim(),
					status,
				},
			});
		} finally {
			setSaving(false);
		}
		setTitle("");
		setObjectives("");
		setMaterials("");
		setStatus("upcoming");
		setError(undefined);
		onClose();
	}

	return (
		<Modal open={open} onClose={onClose} title="Thêm buổi học">
			<form onSubmit={submit}>
				<Field label="Tên buổi học *" error={error}>
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="VD: Line chart — Mô tả xu hướng"
					/>
				</Field>
				<Field label="Mục tiêu">
					<Textarea
						value={objectives}
						onChange={(e) => setObjectives(e.target.value)}
						placeholder="Học viên sẽ học gì trong buổi này?"
						rows={2}
					/>
				</Field>
				<Field label="Tài liệu">
					<Input
						value={materials}
						onChange={(e) => setMaterials(e.target.value)}
						placeholder="VD: Cam 15 Test 1 Task 1"
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
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving}>
						Thêm buổi
					</Button>
				</div>
			</form>
		</Modal>
	);
}
