import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export function AddModuleModal({
	open,
	onClose,
	syllabusId,
}: {
	open: boolean;
	onClose: () => void;
	syllabusId: string;
}) {
	const { syllabusById } = useData();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();
	const sy = syllabusById(syllabusId);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!title.trim()) {
			setError("Vui lòng nhập tên module.");
			return;
		}
		const result = await run({
			type: "add-module",
			syllabusId,
			payload: { title: title.trim(), description: description.trim() },
		});
		if (result?.kind === "refreshed") {
			setTitle("");
			setDescription("");
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			setTitle("");
			setDescription("");
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title={`Thêm module${sy ? ` — ${sy.name}` : ""}`}
		>
			<form noValidate onSubmit={submit}>
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
						Thêm module
					</Button>
				</div>
			</form>
		</Modal>
	);
}
