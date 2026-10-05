import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentTransactionItem } from "@teacher-os/api/contracts";
import { fillMessageTemplate } from "@teacher-os/api/lib/message-template";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fmtVND } from "@/lib/mock-data";
import {
	fetchUnmatchedTransactions,
	ignoreTransaction,
	invoicePaymentQueryKey,
	invoicePaymentQueryOptions,
	POLL_CAP_MS,
	POLL_INTERVAL_MS,
	reconcileBankLink,
	rotatePayToken,
	shouldPollPayment,
	unmatchedTransactionsQueryKey,
} from "@/lib/repos/payments";
import {
	getApiBaseUrl,
	workspaceSettingsQueryOptions,
} from "@/lib/repos/settings";

function useCopiedLabel() {
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
	const copy = (label: string, value: string) => {
		void navigator.clipboard
			?.writeText(value)
			.then(() => setCopiedLabel(label));
	};
	return { copiedLabel, copy };
}

/**
 * "Thu học phí" modal (#320): shared QR panel + copy pay link + copy the
 * org's Zalo debt template + rotate pay token (with confirm — parents may
 * still hold the old link). Polls every 5 s while open, tab-visible and
 * within the 15-minute cap.
 */
export function InvoicePaymentModal({
	invoiceId,
	open,
	onClose,
}: {
	invoiceId: string | null;
	open: boolean;
	onClose: () => void;
}) {
	const baseUrl = getApiBaseUrl();
	const queryClient = useQueryClient();
	const { copiedLabel, copy } = useCopiedLabel();
	const [confirmRotate, setConfirmRotate] = useState(false);
	const [openedAt] = useState(() => Date.now());

	const payment = useQuery({
		...invoicePaymentQueryOptions(invoiceId ?? "none", baseUrl),
		enabled: open && invoiceId !== null,
		refetchInterval: (query) => {
			const data = query.state.data;
			if (!data) return false;
			return shouldPollPayment({
				panelOpen: open,
				payable: data.payable,
				openedAt,
				now: Date.now(),
			})
				? POLL_INTERVAL_MS
				: false;
		},
	});
	const settings = useQuery({
		...workspaceSettingsQueryOptions(baseUrl),
		enabled: open,
	});

	const payLink = payment.data
		? `${window.location.origin}/pay/${payment.data.payToken}`
		: "";

	const rotate = useMutation({
		mutationFn: () => rotatePayToken(invoiceId ?? "", baseUrl),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: invoicePaymentQueryKey(invoiceId ?? ""),
			});
			setConfirmRotate(false);
		},
	});

	useEffect(() => {
		if (!open) setConfirmRotate(false);
	}, [open]);

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Thu học phí"
			footer={
				payment.data?.payable ? (
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap gap-2">
							<Button
								variant="secondary"
								size="sm"
								onClick={() => copy("link", payLink)}
							>
								{copiedLabel === "link"
									? "✓ Đã sao chép link"
									: "Sao chép link thanh toán"}
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={!settings.data || !payment.data}
								onClick={() =>
									copy(
										"tpl",
										fillMessageTemplate(
											settings.data?.tplDebt ?? "{{qr_link}}",
											{
												qr_link: payLink,
												amount: fmtVND(payment.data?.amountDue ?? 0),
												student_name: "",
											},
										),
									)
								}
							>
								{copiedLabel === "tpl"
									? "✓ Đã sao chép tin nhắn"
									: "Sao chép tin nhắc nợ"}
							</Button>
							{confirmRotate ? (
								<>
									<Button
										variant="primary"
										size="sm"
										disabled={rotate.isPending}
										onClick={() => rotate.mutate()}
									>
										{rotate.isPending ? "Đang tạo…" : "Xác nhận tạo link mới"}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setConfirmRotate(false)}
									>
										Không
									</Button>
								</>
							) : (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setConfirmRotate(true)}
								>
									Tạo link mới
								</Button>
							)}
						</div>
						{confirmRotate && (
							<p className="text-warn text-xs">
								Link cũ sẽ hết hiệu lực — phụ huynh vẫn lưu link cũ sẽ không mở
								được trang thanh toán.
							</p>
						)}
					</div>
				) : undefined
			}
		>
			{payment.data ? (
				<PaymentQrPanel data={payment.data} />
			) : (
				<p className="p-6 text-center text-muted-fg text-sm">Đang tải…</p>
			)}
		</Modal>
	);
}

const REASON_LABEL: Record<string, string> = {
	unknown_code: "Mã không tồn tại",
	invoice_paid: "Phiếu đã đủ tiền",
	no_code: "Không có mã học phí",
	foreign_code: "Chuyển khoản lạ",
};

/**
 * "Giao dịch chưa khớp" queue (#320) with the reconcile button. foreign_code
 * rows arrive redacted (content/code are null) and read "Chuyển khoản lạ".
 */
export function UnmatchedTransactions({
	openInvoices,
}: {
	/** Settleable invoices for "Gán vào phiếu": unpaid/overdue and paid rows
	 * with remaining debt (id + display label). */
	openInvoices: Array<{ id: string; label: string }>;
}) {
	const baseUrl = getApiBaseUrl();
	const queryClient = useQueryClient();
	const unmatched = useQuery({
		queryKey: unmatchedTransactionsQueryKey,
		queryFn: () => fetchUnmatchedTransactions(baseUrl),
	});
	const [targets, setTargets] = useState<Record<string, string>>({});
	const [busyId, setBusyId] = useState<string | null>(null);
	const [reconcile, setReconcile] = useState<
		| { kind: "idle" }
		| { kind: "running" }
		| { kind: "done"; matched: number; unmatched: number }
		| { kind: "cooldown" }
	>({ kind: "idle" });

	const invalidate = () => {
		void queryClient.invalidateQueries({
			queryKey: unmatchedTransactionsQueryKey,
		});
		void queryClient.invalidateQueries({ queryKey: ["kernel"] });
	};

	const runReconcile = async () => {
		setReconcile({ kind: "running" });
		try {
			const result = await reconcileBankLink(baseUrl);
			setReconcile({
				kind: "done",
				matched: result.matched,
				unmatched: result.unmatched,
			});
		} catch (err) {
			setReconcile(
				err instanceof Error && err.message === "RECONCILE_COOLDOWN"
					? { kind: "cooldown" }
					: { kind: "done", matched: 0, unmatched: 0 },
			);
		}
		invalidate();
	};

	const rows = unmatched.data ?? [];
	return (
		<div className="mt-8">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<h2 className="font-semibold text-xl">
					Giao dịch chưa khớp{rows.length > 0 ? ` (${rows.length})` : ""}
				</h2>
				<Button
					size="sm"
					variant="secondary"
					disabled={reconcile.kind === "running"}
					onClick={() => void runReconcile()}
				>
					{reconcile.kind === "running" ? "Đang đối soát…" : "Đối soát"}
				</Button>
			</div>
			{reconcile.kind === "done" && (
				<p className="mb-3 text-muted-fg text-xs" aria-live="polite">
					Đối soát xong: khớp {reconcile.matched}, chưa khớp{" "}
					{reconcile.unmatched}.
				</p>
			)}
			{reconcile.kind === "cooldown" && (
				<p className="mb-3 text-warn text-xs" aria-live="polite">
					Vừa đối soát, thử lại sau 1 phút.
				</p>
			)}
			{rows.length === 0 ? (
				<p className="text-muted-fg text-sm">
					Không có giao dịch nào chờ xử lý.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="text-muted-fg text-xs">
								<th className="py-2 pr-4">Thời gian</th>
								<th className="py-2 pr-4">Số tiền</th>
								<th className="py-2 pr-4">Nội dung</th>
								<th className="py-2 pr-4">Lý do</th>
								<th className="py-2">Xử lý</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((tx: PaymentTransactionItem) => (
								<tr key={tx.id} className="border-line border-t">
									<td className="py-2 pr-4 font-mono text-meta text-xs">
										{tx.transactionDate}
									</td>
									<td className="py-2 pr-4 font-mono">
										{tx.amount.toLocaleString("vi-VN")}đ
									</td>
									<td className="py-2 pr-4">
										{tx.unmatchedReason === "foreign_code"
											? "Chuyển khoản lạ"
											: (tx.content ?? "—")}
									</td>
									<td className="py-2 pr-4 text-xs">
										{REASON_LABEL[tx.unmatchedReason] ?? tx.unmatchedReason}
									</td>
									<td className="py-2">
										<div className="flex flex-wrap items-center justify-end gap-2">
											<select
												aria-label="Chọn hóa đơn để gán"
												className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
												value={targets[tx.id] ?? ""}
												onChange={(e) =>
													setTargets((prev) => ({
														...prev,
														[tx.id]: e.target.value,
													}))
												}
											>
												<option value="">— Chọn phiếu —</option>
												{openInvoices.map((inv) => (
													<option key={inv.id} value={inv.id}>
														{inv.label}
													</option>
												))}
											</select>
											<Button
												variant="ghost"
												size="sm"
												disabled={busyId === tx.id || !targets[tx.id]}
												onClick={() => {
													const invoiceId = targets[tx.id];
													if (!invoiceId) return;
													setBusyId(tx.id);
													void fetch(
														`${baseUrl}/api/payment-transactions/${tx.id}/assign`,
														{
															method: "POST",
															headers: {
																"Content-Type": "application/json",
															},
															credentials: "include",
															body: JSON.stringify({ invoiceId }),
														},
													)
														.then(() => invalidate())
														.finally(() => setBusyId(null));
												}}
											>
												{busyId === tx.id ? "…" : "Gán"}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												disabled={busyId === tx.id}
												onClick={() => {
													setBusyId(tx.id);
													void ignoreTransaction(tx.id, baseUrl).then(
														() => {
															setBusyId(null);
															invalidate();
														},
														() => setBusyId(null),
													);
												}}
											>
												Bỏ qua
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
