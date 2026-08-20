import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export function AddSyllabusModal({
	open,
	onClose,
	onCreated,
}: {
	open: boolean;
	onClose: () => void;
	onCreated?: (id: string) => void;
}) {
	const [name, setName] = useState("");
	const [level, setLevel] = useState("Band 6.5");
	const [skill, setSkill] = useState("Writing");
	const [description, setDescription] = useState("");
	const [total, setTotal] = useState("10");
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!name.trim()) {
			setError("Vui lòng nhập tên syllabus.");
			return;
		}
		const result = await run({
			type: "add-syllabus",
			payload: {
				id: "",
				name: name.trim(),
				level,
				skill,
				description: description.trim(),
				totalLessons: Number.parseInt(total, 10) || 10,
			},
		});
		// Close/reset/navigate only after the refreshed result — a committed
		// id without the snapshot would navigate into a stale-store 404.
		if (result?.kind === "refreshed") {
			setName("");
			setDescription("");
			onClose();
			if (result.id && onCreated) onCreated(result.id);
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			setName("");
			setDescription("");
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Tạo syllabus mới"
		>
			<form onSubmit={submit}>
				<Field label="Tên syllabus *" error={error}>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="VD: IELTS Writing 7.0"
					/>
				</Field>
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Field label="Trình độ">
						<Select value={level} onChange={(e) => setLevel(e.target.value)}>
							<option>Band 5.5</option>
							<option>Band 6.0</option>
							<option>Band 6.5</option>
							<option>Band 7.0</option>
							<option>Band 7.5+</option>
						</Select>
					</Field>
					<Field label="Kỹ năng">
						<Select value={skill} onChange={(e) => setSkill(e.target.value)}>
							<option>Writing</option>
							<option>Speaking</option>
							<option>Reading</option>
							<option>Listening</option>
						</Select>
					</Field>
				</div>
				<Field label="Mô tả">
					<Textarea
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Mô tả lộ trình và mục tiêu…"
					/>
				</Field>
				<Field label="Số buổi dự kiến">
					<Input
						type="number"
						value={total}
						onChange={(e) => setTotal(e.target.value)}
					/>
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
						Tạo
					</Button>
				</div>
			</form>
		</Modal>
	);
}
