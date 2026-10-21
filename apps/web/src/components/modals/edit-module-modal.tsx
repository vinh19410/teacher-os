import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { CurriculumTarget } from "@/lib/data-actions";
import { useTargetSyllabus } from "@/lib/repos/use-syllabus";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export function EditModuleModal({
	open,
	onClose,
	target,
	moduleId,
}: {
	open: boolean;
	onClose: () => void;
	target: CurriculumTarget;
	moduleId: string | null;
}) {
	const mod = useTargetSyllabus(target)?.modules.find((m) => m.id === moduleId);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();
	const [loadedFor, setLoadedFor] = useState<string | null>(null);

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
		const result = await run({
			type: "edit-module",
			target,
			moduleId,
			payload: { title: title.trim(), description: description.trim() },
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
			title="Sửa module"
		>
			<form noValidate onSubmit={submit}>
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
						Lưu thay đổi
					</Button>
				</div>
			</form>
		</Modal>
	);
}
