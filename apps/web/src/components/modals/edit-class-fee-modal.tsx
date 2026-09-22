import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { parseVndAmount } from "@/lib/format-currency";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export function EditClassFeeModal({
	open,
	onClose,
	classId,
	current,
}: {
	open: boolean;
	onClose: () => void;
	classId: string;
	current: number | null;
}) {
	const [fee, setFee] = useState(
		current !== null && current !== undefined ? String(current) : "",
	);
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	useEffect(() => {
		if (open) {
			setFee(current !== null && current !== undefined ? String(current) : "");
		}
	}, [open, current]);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;

		const parsed = parseVndAmount(fee);
		if (fee.trim() !== "" && (parsed === null || parsed < 1)) {
			setError("Học phí phải là số nguyên dương.");
			return;
		}

		const tuitionFee = fee.trim() === "" ? null : parsed;
		const result = await run({
			type: "update-class-tuition-fee",
			payload: { classId, tuitionFee },
		});
		if (result?.kind === "refreshed") {
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			onClose();
		}
	}

	return (
		<Modal open={open} onClose={onClose} title="Sửa học phí lớp">
			<form noValidate onSubmit={submit} className="flex flex-col gap-5">
				<Field label="Học phí / học viên (VND)" help="Để trống để xóa học phí">
					<CurrencyInput
						placeholder="Để trống để xóa học phí"
						value={fee}
						onChange={setFee}
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
						Lưu thay đổi
					</Button>
				</div>
			</form>
		</Modal>
	);
}
