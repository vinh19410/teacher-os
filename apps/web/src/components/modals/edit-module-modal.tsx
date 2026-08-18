import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

export function EditModuleModal({
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
	const { syllabusById, dispatch } = useData();
	const mod = syllabusById(syllabusId)?.modules.find((m) => m.id === moduleId);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [loadedFor, setLoadedFor] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	if (moduleId && moduleId !== loadedFor && mod) {
		setTitle(mod.title);
		setDescription(mod.description ?? "");
		setLoadedFor(moduleId);
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!moduleId) return;
		if (!title.trim()) {
			setError("Vui lòng nhập tên module.");
			return;
		}
		setSaving(true);
		try {
			await dispatch({
				type: "edit-module",
				syllabusId,
				moduleId,
				payload: { title: title.trim(), description: description.trim() },
			});
		} finally {
			setSaving(false);
		}
		setError(undefined);
		onClose();
	}

	return (
		<Modal open={open} onClose={onClose} title="Sửa module">
			<form onSubmit={submit}>
				<Field label="Tên module *" error={error}>
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Tên module"
					/>
				</Field>
				<Field label="Mô tả ngắn">
					<Textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={2}
					/>
				</Field>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving}>
						Lưu thay đổi
					</Button>
				</div>
			</form>
		</Modal>
	);
}
