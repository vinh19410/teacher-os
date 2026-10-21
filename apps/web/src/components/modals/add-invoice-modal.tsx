import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { formatDateInputValue, isRealDateInputValue } from "@/lib/date-input";
import { parseVndAmount } from "@/lib/format-currency";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const NOTE_MAX = 500;

/**
 * Issue #61: create an invoice for an existing enrollment via
 * POST /api/invoices. Loại/Phương thức are intentionally absent — the
 * create contract is `.strict()` and the server defaults them.
 */
export function AddInvoiceModal({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { data } = useData();
	const [enrollmentId, setEnrollmentId] = useState("");
	const [amount, setAmount] = useState("");
	const [due, setDue] = useState(formatDateInputValue(new Date()));
	const [note, setNote] = useState("");
	const [enrollmentError, setEnrollmentError] = useState<string | undefined>();
	const [amountError, setAmountError] = useState<string | undefined>();
	const [dueError, setDueError] = useState<string | undefined>();
	const [noteError, setNoteError] = useState<string | undefined>();
	const { saving, error, notice, submitBlocked, run, reconcile, reset } =
		useKernelFormSubmit();

	// Re-opening must not inherit the previous session's selection, values,
	// field errors, or a committed/unknown notice (which blocks submit).
	// biome-ignore lint/correctness/useExhaustiveDependencies: open is the only reset trigger; the kernel snapshot (and thus data.enrollments) is always settled before this modal can render — the provider gates children on it
	useEffect(() => {
		if (open) {
			resetFields();
			reset();
		}
	}, [open]);

	const activeEnrollments = (data.enrollments ?? []).filter(
		(e) => e.status === "active",
	);

	function resetFields() {
		setEnrollmentId(activeEnrollments[0]?.id ?? "");
		setAmount("");
		setDue(formatDateInputValue(new Date()));
		setNote("");
		setEnrollmentError(undefined);
		setAmountError(undefined);
		setDueError(undefined);
		setNoteError(undefined);
	}

	const enrollmentOptions = activeEnrollments.map((enrollment) => {
		const student = data.students.find((s) => s.id === enrollment.studentId);
		const cls = data.classes.find((c) => c.id === enrollment.classId);
		return {
			id: enrollment.id,
			label: [student?.name ?? "Học viên", cls?.name]
				.filter(Boolean)
				.join(" · "),
		};
	});
	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		const hasEnrollmentError = !enrollmentId;
		const parsedAmount = parseVndAmount(amount);
		const amountMessage =
			amount.trim() === ""
				? "Vui lòng nhập số tiền."
				: parsedAmount === null
					? "Số tiền phải là số nguyên dương, tối đa 12 chữ số."
					: undefined;
		const hasDueError = !due || !isRealDateInputValue(due);
		const hasNoteError = note.trim().length > NOTE_MAX;
		setEnrollmentError(
			hasEnrollmentError ? "Vui lòng chọn học viên." : undefined,
		);
		setAmountError(amountMessage);
		setDueError(hasDueError ? "Vui lòng chọn ngày đến hạn hợp lệ." : undefined);
		setNoteError(hasNoteError ? "Ghi chú tối đa 500 ký tự." : undefined);
		if (
			hasEnrollmentError ||
			amountMessage !== undefined ||
			hasDueError ||
			hasNoteError
		) {
			return;
		}
		const trimmedNote = note.trim();
		const result = await run({
			type: "add-invoice",
			payload: {
				enrollmentId,
				amount: parsedAmount ?? 0,
				due,
				note: trimmedNote === "" ? undefined : trimmedNote,
			},
		});
		if (result?.kind === "refreshed") {
			resetFields();
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			resetFields();
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Tạo hóa đơn"
		>
			<form noValidate onSubmit={submit}>
				<Field
					label="Học viên *"
					error={enrollmentError}
					help={
						enrollmentOptions.length === 0
							? "Chưa có học viên nào đang theo lớp."
							: undefined
					}
				>
					<Select
						value={enrollmentId}
						onChange={(e) => setEnrollmentId(e.target.value)}
						disabled={enrollmentOptions.length === 0}
					>
						{enrollmentOptions.length === 0 ? (
							<option value="">—</option>
						) : (
							enrollmentOptions.map((option) => (
								<option key={option.id} value={option.id}>
									{option.label}
								</option>
							))
						)}
					</Select>
				</Field>
				<Field label="Số tiền (VND) *" error={amountError}>
					<CurrencyInput
						placeholder="400,000"
						value={amount}
						onChange={(next) => {
							setAmount(next);
							if (amountError) setAmountError(undefined);
						}}
					/>
				</Field>
				<Field label="Ngày đến hạn *" error={dueError}>
					<Input
						type="date"
						value={due}
						onChange={(e) => setDue(e.target.value)}
					/>
				</Field>
				<Field label="Ghi chú" error={noteError}>
					<Textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Ghi chú cho hóa đơn (tùy chọn)"
					/>
				</Field>
				<div className="flex flex-col gap-2">
					{error && (
						<p role="alert" className="text-destructive text-xs">
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
				<div className="flex justify-end gap-2 border-border border-t pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button
						type="submit"
						size="sm"
						disabled={saving || submitBlocked || enrollmentOptions.length === 0}
					>
						Tạo hóa đơn
					</Button>
				</div>
			</form>
		</Modal>
	);
}
