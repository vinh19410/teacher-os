import {
	INVOICE_PAYMENT_METHOD_LABEL,
	type InvoicePaymentMethod,
} from "@teacher-os/api/contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { parseVndAmount } from "@/lib/format-currency";
import { fmtVND } from "@/lib/mock-data";
import {
	type DebtLedgerRow,
	invoiceRemaining,
} from "@/lib/tuition-from-kernel";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const NOTE_MAX = 255;
const METHOD_OPTIONS: ReadonlyArray<{
	value: InvoicePaymentMethod;
	label: string;
}> = [
	{ value: "transfer", label: INVOICE_PAYMENT_METHOD_LABEL.transfer },
	{ value: "cash", label: INVOICE_PAYMENT_METHOD_LABEL.cash },
	{ value: "other", label: INVOICE_PAYMENT_METHOD_LABEL.other },
];

/**
 * #450 — ghi nhận thu học phí một phần/toàn bộ trên Sổ công nợ. Lưu một dòng
 * `payment_transaction` (provider "manual") qua command bus; server chặn vượt
 * nợ (422) và idempotent trên `clientRequestId` (sinh 1 lần mỗi lần mở hộp
 * thoại, giữ nguyên qua mọi lần bấm Lưu). Số liệu Phải đóng · Đã thu · Nợ của
 * khoản đang chọn tra theo `row.openInvoiceIds` — tôn trọng scope filter lớp
 * đang active trên /debts.
 */
export function RecordPaymentModal({
	open,
	onClose,
	row,
}: {
	open: boolean;
	onClose: () => void;
	row: DebtLedgerRow | null;
}) {
	const { data } = useData();
	const [invoiceId, setInvoiceId] = useState("");
	const [amount, setAmount] = useState("");
	const [method, setMethod] = useState<InvoicePaymentMethod>("transfer");
	const [note, setNote] = useState("");
	const [amountError, setAmountError] = useState<string | undefined>();
	const [noteError, setNoteError] = useState<string | undefined>();
	const [clientRequestId, setClientRequestId] = useState(() =>
		crypto.randomUUID(),
	);
	const {
		saving,
		error,
		setError,
		notice,
		submitBlocked,
		run,
		reconcile,
		reset,
	} = useKernelFormSubmit();

	// Re-opening must not inherit the previous session's selection, values,
	// field errors, or idempotency key — each dialog session is one receipt.
	useEffect(() => {
		if (open) {
			setInvoiceId(row?.openInvoiceIds[0] ?? "");
			setAmount("");
			setMethod("transfer");
			setNote("");
			setAmountError(undefined);
			setNoteError(undefined);
			setClientRequestId(crypto.randomUUID());
			reset();
		}
	}, [open, row, reset]);

	// Hóa đơn còn nợ của đúng dòng đang chọn (đã sort due tăng dần).
	const openInvoices = useMemo(() => {
		if (!row) return [];
		return row.openInvoiceIds
			.map((id) => data.invoices.find((inv) => inv.id === id))
			.filter((inv): inv is NonNullable<typeof inv> => inv !== undefined);
	}, [row, data.invoices]);

	const selected = openInvoices.find((inv) => inv.id === invoiceId);
	const remaining = selected ? invoiceRemaining(selected) : 0;
	const parsedAmount = parseVndAmount(amount);
	const afterAmount =
		parsedAmount !== null ? Math.max(0, remaining - parsedAmount) : remaining;
	const afterLabel =
		remaining > 0 && afterAmount === 0 ? "Đã thu đủ" : "Còn nợ";

	function resetFields() {
		setAmount("");
		setMethod("transfer");
		setNote("");
		setAmountError(undefined);
		setNoteError(undefined);
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			resetFields();
			onClose();
		}
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving || submitBlocked || !selected) return;
		const parsed = parseVndAmount(amount);
		const amountMessage =
			amount.trim() === ""
				? "Vui lòng nhập số tiền thực thu."
				: parsed === null || parsed <= 0
					? "Số tiền phải là số nguyên dương, tối đa 12 chữ số."
					: undefined;
		const noteMessage =
			note.trim().length > NOTE_MAX
				? `Ghi chú tối đa ${NOTE_MAX} ký tự.`
				: undefined;
		setAmountError(amountMessage);
		setNoteError(noteMessage);
		if (amountMessage !== undefined || noteMessage !== undefined) return;

		const result = await run({
			type: "record-invoice-payment",
			invoiceId: selected.id,
			payload: {
				clientRequestId,
				amount: parsed ?? 0,
				method,
				note: note.trim(),
			},
		});
		if (!result) return;
		if (result.kind === "refreshed") {
			resetFields();
			onClose();
			return;
		}
		if (result.kind === "definite-failure") {
			if (result.status === 422 && result.reason === "invoice-settled") {
				// Nothing was written; sync the store so the dialog shows the
				// settled figures, then explain. Stays open — the error must be
				// readable (reconcile clears `error`, so set it after).
				await reconcile();
				setError(
					"Hóa đơn đã được ghi nhận đủ trước đó — không lưu thêm phiếu thu.",
				);
				return;
			}
			if (result.status === 422) {
				// amount-exceeds-debt: nothing written; refresh the store so the
				// dialog's remaining figure matches the server, keep editing.
				await reconcile();
				setError(
					"Số tiền vượt số dư còn nợ của khoản đang chọn — đã cập nhật số nợ mới.",
				);
				return;
			}
			if (result.status === 409) {
				// The idempotency key is burned for this org with other content —
				// mint a fresh one so the next save is not a permanent 409.
				await reconcile();
				setError(
					"Mã phiếu thu đã được dùng cho nội dung khác — đã tạo mã mới, vui lòng kiểm tra lại.",
				);
				setClientRequestId(crypto.randomUUID());
				return;
			}
			// Other 4xx: the hook already set the generic "not saved" copy.
			return;
		}
		// committed / outcome-unknown: the notice + reconcile affordance keep
		// the dialog open — a possibly-saved write is never blindly replayed.
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title={`Ghi nhận thu tiền học phí — ${row?.name ?? "học viên"}`}
		>
			<form noValidate onSubmit={submit}>
				{openInvoices.length > 1 ? (
					<Field
						label="Khoản thu *"
						help="Học viên có nhiều khoản còn nợ — chọn khoản cần thu."
					>
						<Select
							aria-label="Chọn khoản thu"
							value={invoiceId}
							onChange={(e) => setInvoiceId(e.target.value)}
						>
							{openInvoices.map((inv) => (
								<option key={inv.id} value={inv.id}>
									{`Hạn ${inv.due || "—"} · Còn nợ ${fmtVND(invoiceRemaining(inv))}`}
								</option>
							))}
						</Select>
					</Field>
				) : null}
				<p
					className="text-muted-foreground text-xs"
					data-testid="payment-summary"
				>
					{selected
						? `Phải đóng ${fmtVND(selected.amount)} · Đã thu ${fmtVND(selected.paidAmount)} · Còn nợ ${fmtVND(remaining)}`
						: "Không có khoản còn nợ nào."}
				</p>
				<Field label="Số tiền thực thu lần này (VND) *" error={amountError}>
					<CurrencyInput
						placeholder="2,000,000"
						value={amount}
						onChange={(next) => {
							setAmount(next);
							if (amountError) setAmountError(undefined);
						}}
					/>
				</Field>
				<div className="flex justify-end">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							setAmount(remaining > 0 ? String(remaining) : "");
							setAmountError(undefined);
						}}
						disabled={remaining <= 0 || saving}
					>
						{`Thu toàn bộ ${fmtVND(remaining)}`}
					</Button>
				</div>
				<Field label="Phương thức *">
					<div
						role="radiogroup"
						aria-label="Phương thức thu"
						className="flex flex-wrap gap-4"
					>
						{METHOD_OPTIONS.map((option) => (
							<label
								key={option.value}
								className="flex items-center gap-2 text-sm"
							>
								<input
									type="radio"
									name="payment-method"
									value={option.value}
									checked={method === option.value}
									onChange={() => setMethod(option.value)}
								/>
								{option.label}
							</label>
						))}
					</div>
				</Field>
				<Field label="Ghi chú" error={noteError}>
					<Input
						type="text"
						value={note}
						onChange={(e) => {
							setNote(e.target.value);
							if (noteError) setNoteError(undefined);
						}}
						placeholder="VD: Đợt 1, thu tại lớp…"
						maxLength={NOTE_MAX}
					/>
				</Field>
				<p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
					{`Số dư còn nợ sau giao dịch này: ${fmtVND(afterAmount)} → Trạng thái chuyển sang: ${afterLabel}`}
				</p>
				<div className="flex flex-col gap-2 empty:hidden">
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
					<Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
						Hủy
					</Button>
					<Button
						type="submit"
						size="sm"
						disabled={saving || submitBlocked || !selected}
					>
						Lưu phiếu thu học phí
					</Button>
				</div>
			</form>
		</Modal>
	);
}
