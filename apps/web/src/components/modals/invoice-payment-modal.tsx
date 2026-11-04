import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentTransactionItem } from "@teacher-os/api/contracts";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SectionTitle } from "@/components/ui/section-label";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import {
	fetchUnmatchedTransactions,
	ignoreTransaction,
	invoicePaymentQueryKey,
	invoicePaymentQueryOptions,
	invoiceTransactionsQueryKey,
	POLL_INTERVAL_MS,
	reconcileBankLink,
	rotatePayToken,
	shouldPollPayment,
	unmatchedTransactionsQueryKey,
} from "@/lib/repos/payments";

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
 * Payment poll + pay link dùng chung giữa "Thu học phí" modal và trang chi
 * tiết hóa đơn (#345). Polls every 5 s while `active`, tab-visible and within
 * the 15-minute cap; coming back to the tab resets the cap — a detail page
 * can legally outlive the modal's original horizon while the teacher waits
 * for a transfer.
 */
export function useInvoicePayment(invoiceId: string | null, active: boolean) {
	const baseUrl = getApiBaseUrl();
	const [openedAt, setOpenedAt] = useState(() => Date.now());

	useEffect(() => {
		const onVisible = () => {
			if (!document.hidden) setOpenedAt(Date.now());
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, []);

	const payment = useQuery({
		...invoicePaymentQueryOptions(invoiceId ?? "none", baseUrl),
		enabled: active && invoiceId !== null,
		refetchInterval: (query) => {
			const data = query.state.data;
			if (!data) return false;
			return shouldPollPayment({
				panelOpen: active,
				payable: data.payable,
				openedAt,
				now: Date.now(),
			})
				? POLL_INTERVAL_MS
				: false;
		},
	});
	const payLink = payment.data
		? `${window.location.origin}/pay/${payment.data.payToken}`
		: "";
	return { payment, payLink, openedAt };
}

/**
 * #345 — the kernel snapshot does NOT poll (staleTime Infinity, no
 * refetchInterval), so a transfer landing mid-session would leave the detail
 * header's amounts stale forever. Watch `paidAmount` by VALUE (not object
 * identity) and pull the shared caches forward exactly when money moved.
 * `baselinePaidAmount` là số tiền snapshot kernel đang hiển thị: snapshot
 * stale lúc mount (tiền về TRƯỚC khi mở trang) phải heal ngay ở lần observe
 * đầu — không được nuốt thành "baseline" của payment query. Ref keyed theo
 * invoice id để điều hướng /tuition/$a → /tuition/$b không invalidate giả.
 */
export function usePaidAmountWatch(
	invoiceId: string | null,
	paidAmount: number | undefined,
	baselinePaidAmount?: number,
) {
	const queryClient = useQueryClient();
	const seen = useRef<{ id: string; value: number } | null>(null);
	const invalidate = () => {
		if (invoiceId === null) return;
		void queryClient.invalidateQueries({
			queryKey: invoiceTransactionsQueryKey(invoiceId),
		});
		void queryClient.invalidateQueries({ queryKey: ["kernel"] });
	};
	useEffect(() => {
		if (invoiceId === null || paidAmount === undefined) return;
		const prev = seen.current;
		if (prev === null || prev.id !== invoiceId) {
			seen.current = { id: invoiceId, value: paidAmount };
			// Stale-on-mount: payment thấy khác snapshot → tiền đã về trước
			// lúc mở trang, heal header ngay thay vì coi đó là baseline.
			if (
				baselinePaidAmount !== undefined &&
				baselinePaidAmount !== paidAmount
			) {
				invalidate();
			}
			return;
		}
		if (prev.value === paidAmount) return;
		seen.current = { id: invoiceId, value: paidAmount };
		invalidate();
	}, [invoiceId, paidAmount, baselinePaidAmount, queryClient]);
}

/**
 * Copy link + rotate token with confirm, dùng chung modal và trang detail
 * (#345). `payable` chỉ ẩn rotate (link cũ vô nghĩa khi phiếu đã đủ tiền);
 * copy link vẫn hiện — /pay hiển thị trạng thái phiếu kể cả khi đã trả.
 * Modal cũ ẩn cả footer khi !payable; giữ hành vi đó ở modal bằng cách chỉ
 * mount component này khi `payable` (characterization test pin).
 */
export function InvoicePaymentActions({
	invoiceId,
	payable,
	payLink,
	active,
}: {
	invoiceId: string | null;
	payable: boolean;
	payLink: string;
	active: boolean;
}) {
	const baseUrl = getApiBaseUrl();
	const queryClient = useQueryClient();
	const { copiedLabel, copy } = useCopiedLabel();
	const [confirmRotate, setConfirmRotate] = useState(false);

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
		if (!active) setConfirmRotate(false);
	}, [active]);

	return (
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
				{payable &&
					(confirmRotate ? (
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
					))}
			</div>
			{payable && confirmRotate && (
				<p className="text-warn text-xs">
					Link cũ sẽ hết hiệu lực — phụ huynh vẫn lưu link cũ sẽ không mở được
					trang thanh toán.
				</p>
			)}
		</div>
	);
}

/**
 * "Thu học phí" modal (#320): shared QR panel + copy pay link + rotate pay
 * token (with confirm — parents may still hold the old link). Polls every
 * 5 s while open, tab-visible and within the 15-minute cap — the cap now
 * resets khi tab visible lại (#345, dùng chung hook với trang detail nên
 * hành vi áp cho cả modal; teacher quay lại tab vẫn nhận tiền mới).
 * (Zalo template
 * copy was dropped when /settings + workspace-settings API were removed in
 * #324 — follow-up if templates come back.)
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
	const { payment, payLink } = useInvoicePayment(invoiceId, open);

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Thu học phí"
			footer={
				payment.data?.payable ? (
					<InvoicePaymentActions
						invoiceId={invoiceId}
						payable={payment.data.payable}
						payLink={payLink}
						active={open}
					/>
				) : undefined
			}
		>
			{payment.data ? (
				<PaymentQrPanel data={payment.data} />
			) : (
				<p className="p-6 text-center text-muted-foreground text-sm">
					Đang tải…
				</p>
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
			<div className="flex flex-wrap items-start justify-between gap-4">
				<SectionTitle description="Giao dịch ngân hàng SePay chưa gán vào hóa đơn nào">
					Giao dịch chưa khớp{rows.length > 0 ? ` (${rows.length})` : ""}
				</SectionTitle>
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
				<p className="mb-3 text-muted-foreground text-xs" aria-live="polite">
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
				<p className="text-muted-foreground text-sm">
					Không có giao dịch nào chờ xử lý.
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="text-muted-foreground text-xs">
								<th className="py-2 pr-4 font-normal">Thời gian</th>
								<th className="py-2 pr-4 font-normal">Số tiền</th>
								<th className="py-2 pr-4 font-normal">Nội dung</th>
								<th className="py-2 pr-4 font-normal">Lý do</th>
								<th className="py-2 font-normal">Xử lý</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((tx: PaymentTransactionItem) => (
								<tr key={tx.id} className="border-border border-t">
									<td className="py-2 pr-4 text-muted-foreground text-xs">
										{tx.transactionDate}
									</td>
									<td className="py-2 pr-4 tabular-nums">
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
												className="select-chevron rounded-md border border-border bg-muted py-1 pr-9 pl-2 text-xs"
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
