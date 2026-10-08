import { cn } from "@teacher-os/ui/lib/utils";
import { useCallback, useState } from "react";

export interface PaymentQrData {
	amount: number;
	amountDue: number;
	paidAmount: number;
	status: string;
	payable: boolean;
	reason?: "NO_BANK_LINK" | "PAID";
	bank?: { brandName: string; accountNumber: string; holderName: string };
	memo?: string;
	qrUrl?: string;
}

export type PaymentQrStrings = {
	readonly title: string;
	readonly paidFull: string;
	readonly partial: (paid: string, total: string) => string;
	readonly noBankLink: string;
	readonly copyHint: string;
	readonly copied: string;
	readonly copy: string;
	readonly fields: {
		readonly bank: string;
		readonly account: string;
		readonly holder: string;
		readonly amount: string;
		readonly memo: string;
	};
};

/** Vietnamese defaults; apps may override (portal keeps the same copy). */
export const PAYMENT_QR_VI: PaymentQrStrings = {
	title: "Chuyển khoản theo QR dưới đây",
	paidFull: "Đã thanh toán đủ",
	partial: (paid, total) => `Đã nhận ${paid} / ${total}`,
	noBankLink: "Giáo viên chưa thiết lập nhận chuyển khoản",
	copyHint: "Giữ nguyên nội dung chuyển khoản để hệ thống tự xác nhận",
	copied: "Đã sao chép",
	copy: "Sao chép",
	fields: {
		bank: "Ngân hàng",
		account: "Số tài khoản",
		holder: "Chủ tài khoản",
		amount: "Số tiền",
		memo: "Nội dung",
	},
};

function useCopy() {
	const [copied, setCopied] = useState<string | null>(null);
	const copy = useCallback((label: string, value: string) => {
		void navigator.clipboard
			?.writeText(value)
			.then(() => setCopied(label))
			.catch(() => setCopied(null));
	}, []);
	return { copied, copy };
}

/**
 * Shared transfer-instructions panel (#320): QR image plus every field as
 * copyable text — the QR is only a guide, the text is what parents actually
 * re-type into their banking app. Used by the teacher modal, the public
 * /pay page and the student portal.
 */
export function PaymentQrPanel({
	data,
	strings = PAYMENT_QR_VI,
	formatAmount,
	className,
}: {
	data: PaymentQrData;
	strings?: PaymentQrStrings;
	/** Locale-aware VND formatting; defaults to vi-VN grouping. */
	formatAmount?: (n: number) => string;
	className?: string;
}) {
	const fmt = formatAmount ?? ((n: number) => `${n.toLocaleString("vi-VN")}đ`);
	const { copied, copy } = useCopy();

	const state = !data.payable
		? data.reason === "PAID"
			? "paid"
			: "nolink"
		: data.paidAmount > 0
			? "partial"
			: "open";

	const rows: Array<{ label: string; value: string; mono?: boolean }> =
		data.payable && data.bank
			? [
					{ label: strings.fields.bank, value: data.bank.brandName },
					{
						label: strings.fields.account,
						value: data.bank.accountNumber,
						mono: true,
					},
					{ label: strings.fields.holder, value: data.bank.holderName },
					{
						label: strings.fields.amount,
						value: fmt(data.amountDue),
						mono: true,
					},
					{ label: strings.fields.memo, value: data.memo ?? "", mono: true },
				]
			: [];

	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<p className="font-medium text-sm">{strings.title}</p>
			{state === "paid" && (
				<p className="rounded-md bg-success-soft p-3 font-medium text-sm text-success">
					{strings.paidFull}
				</p>
			)}
			{state === "nolink" && (
				<p className="rounded-md bg-warn-soft p-3 text-sm">
					{strings.noBankLink}
				</p>
			)}
			{state === "partial" && (
				<p className="rounded-md bg-warn-soft p-3 font-medium text-sm">
					{strings.partial(fmt(data.paidAmount), fmt(data.amount))}
				</p>
			)}
			{data.payable && data.bank && (
				<div className="flex flex-col items-center gap-4">
					{data.qrUrl ? (
						<img
							src={data.qrUrl}
							alt={`Mã QR chuyển khoản ${fmt(data.amountDue)} cho ${data.bank.holderName}`}
							className="h-64 w-64 border border-line"
						/>
					) : (
						<div className="flex h-64 w-64 items-center justify-center border border-line text-muted-fg text-xs">
							Không tạo được ảnh QR
						</div>
					)}
					<dl className="w-full">
						{rows.map((row) => (
							<div
								key={row.label}
								className="flex items-center justify-between gap-3 border-line border-b py-2 last:border-b-0"
							>
								<dt className="shrink-0 text-muted-fg text-xs">{row.label}</dt>
								<dd className="flex items-center gap-2 text-right">
									<span
										className={
											row.mono
												? "select-all font-mono text-xs"
												: "select-all text-xs"
										}
									>
										{row.value}
									</span>
									<button
										type="button"
										className="rounded-md px-2 py-1 text-hot text-xs hover:bg-hot/10 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
										onClick={() => copy(row.label, row.value)}
									>
										{copied === row.label ? strings.copied : strings.copy}
									</button>
								</dd>
							</div>
						))}
					</dl>
					<p className="text-center text-muted-fg text-xs" aria-live="polite">
						{copied ?? strings.copyHint}
					</p>
				</div>
			)}
		</div>
	);
}
