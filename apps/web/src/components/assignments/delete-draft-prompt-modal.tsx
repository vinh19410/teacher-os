import { toast } from "sonner";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { AssignmentPrompt } from "@/lib/mock-data";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";

export interface DeleteDraftPromptModalProps {
	open: boolean;
	prompt: AssignmentPrompt | null;
	onClose: () => void;
	onDeleted: (promptId: string) => void;
}

export function DeleteDraftPromptModal({
	open,
	prompt,
	onClose,
	onDeleted,
}: DeleteDraftPromptModalProps) {
	const submit = useKernelFormSubmit();

	function handleRequestClose() {
		if (submit.saving) return;
		submit.reset();
		onClose();
	}

	async function handleConfirm() {
		if (!prompt) return;
		const res = await submit.run({
			type: "delete-assignment-prompt",
			promptId: prompt.id,
		});
		if (res?.kind === "refreshed") {
			toast.success("Đã xóa bản nháp");
			submit.reset();
			onDeleted(prompt.id);
		}
	}

	async function handleReconcile() {
		if (!prompt) return;
		const ok = await submit.reconcile();
		if (ok) {
			toast.success("Đã đồng bộ dữ liệu ngân hàng đề");
			submit.reset();
			onDeleted(prompt.id);
		}
	}

	if (!prompt) return null;

	return (
		<Modal
			open={open}
			onClose={handleRequestClose}
			title="Xóa bản nháp?"
			description={`“${prompt.title}” sẽ bị xóa khỏi ngân hàng đề. Bản nháp chưa giao cho lớp nào nên không ảnh hưởng học viên.`}
			footer={
				<div className="flex w-full items-center justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleRequestClose}
						disabled={submit.saving}
					>
						Giữ lại
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={handleConfirm}
						disabled={submit.saving || submit.submitBlocked}
					>
						{submit.saving ? "Đang xóa…" : "Xóa bản nháp"}
					</Button>
				</div>
			}
		>
			{submit.error && (
				<p role="alert" className="font-medium text-destructive text-sm">
					{submit.error}
				</p>
			)}
			{submit.notice && (
				<KernelSubmitNotice
					notice={submit.notice}
					onReconcile={handleReconcile}
					disabled={submit.saving}
				/>
			)}
		</Modal>
	);
}
