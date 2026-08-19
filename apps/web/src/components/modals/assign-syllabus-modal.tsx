import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { useClasses } from "@/lib/repos/use-classes";

export function AssignSyllabusModal({
	open,
	onClose,
	defaultSyllabusId,
	defaultClassId,
}: {
	open: boolean;
	onClose: () => void;
	defaultSyllabusId?: string;
	defaultClassId?: string;
}) {
	const { classes } = useClasses();
	const { data, dispatch } = useData();
	const [classId, setClassId] = useState(
		defaultClassId ?? classes[0]?.id ?? "",
	);
	const [syllabusId, setSyllabusId] = useState(
		defaultSyllabusId ?? data.syllabi[0]?.id ?? "",
	);
	const [saving, setSaving] = useState(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (classId && syllabusId) {
			setSaving(true);
			try {
				await dispatch({ type: "assign-syllabus", classId, syllabusId });
			} finally {
				setSaving(false);
			}
		}
		onClose();
	}

	return (
		<Modal open={open} onClose={onClose} title="Gán syllabus vào lớp">
			<form onSubmit={submit}>
				<p className="text-muted-fg text-sm">Chọn lớp để gán syllabus.</p>
				<Field label="Lớp">
					<Select value={classId} onChange={(e) => setClassId(e.target.value)}>
						{classes.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Syllabus">
					<Select
						value={syllabusId}
						onChange={(e) => setSyllabusId(e.target.value)}
					>
						{data.syllabi.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</Select>
				</Field>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button variant="secondary" size="sm" onClick={onClose}>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving}>
						Gán syllabus
					</Button>
				</div>
			</form>
		</Modal>
	);
}
