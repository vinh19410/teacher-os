import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

export function AddModuleModal({
	open,
	onClose,
	syllabusId,
}: {
	open: boolean;
	onClose: () => void;
	syllabusId: string;
}) {
	const { syllabusById, dispatch } = useData();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [saving, setSaving] = useState(false);
	const sy = syllabusById(syllabusId);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!title.trim()) {
			setError("Vui lòng nhập tên module.");
			return;
		}
		setSaving(true);
		try {
			await dispatch({
				type: "add-module",
				syllabusId,
				payload: { title: title.trim(), description: description.trim() },
			});
		} finally {
			setSaving(false);
		}
		setTitle("");
		setDescription("");
		setError(undefined);
		onClose();
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={`Thêm module${sy ? ` — ${sy.name}` : ""}`}
		>
			<form onSubmit={submit}>
				<Field label="Tên module *" error={error}>
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="VD: Module 4 — Mock Test & Feedback"
					/>
				</Field>
				<Field label="Mô tả ngắn">
					<Textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Mục tiêu chính của module này…"
						rows={2}
					/>
				</Field>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving}>
						Thêm module
					</Button>
				</div>
			</form>
		</Modal>
	);
}
