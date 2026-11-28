import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type {
	PaymentInstructions,
	StudentInvoiceItem,
} from "@teacher-os/api/contracts";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { useEffect, useRef, useState } from "react";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import {
	POLL_INTERVAL_MS,
	shouldPollPayment,
} from "@/lib/repos/payments-portal";
import { fetchStudentInvoicePayment } from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/tuition/$invoiceId")({
	component: StudentTuitionDetailRoute,
});

const BACK_LINK_CLS =
	"inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em] hover:text-primary";

export function StudentTuitionDetailView({
	invoiceId,
	studentName,
	orgId,
}: {
	invoiceId: string;
	studentName: string;
	orgId: string;
}) {
	const queryClient = useQueryClient();
	const pollKey = `${orgId}:${invoiceId}`;
	const [pollWindow, setPollWindow] = useState(() => ({
		key: pollKey,
		openedAt: Date.now(),
	}));
	const [isHidden, setIsHidden] = useState(() =>
		typeof document !== "undefined" ? document.hidden : false,
	);

	useEffect(() => {
		setPollWindow((prev) =>
			prev.key === pollKey ? prev : { key: pollKey, openedAt: Date.now() },
		);
	}, [pollKey]);

	useEffect(() => {
		const onVisibilityChange = () => {
			const hidden = document.hidden;
			setIsHidden(hidden);
			if (!hidden) {
				setPollWindow({ key: pollKey, openedAt: Date.now() });
				const st = queryClient.getQueryState([
					"student",
					"invoice-payment",
					orgId,
					invoiceId,
				]);
				if (
					st?.status === "error" &&
					(st.data as PaymentInstructions | undefined)?.payable
				) {
					void queryClient.refetchQueries({
						queryKey: ["student", "invoice-payment", orgId, invoiceId],
						exact: true,
					});
				}
			}
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", onVisibilityChange);
	}, [pollKey, orgId, invoiceId, queryClient]);

	const activeOpenedAt =
		pollWindow.key === pollKey ? pollWindow.openedAt : Date.now();

	const payment = useQuery({
		queryKey: ["student", "invoice-payment", orgId, invoiceId],
		queryFn: () => fetchStudentInvoicePayment(invoiceId, orgId),
		staleTime: 0,
		refetchInterval: (query) => {
			if (isHidden || query.state.status === "error") return false;
			const current = query.state.data;
			if (!current) return false;
			return shouldPollPayment({
				panelOpen: true,
				payable: current.payable,
				openedAt: activeOpenedAt,
				now: Date.now(),
			})
				? POLL_INTERVAL_MS
				: false;
		},
	});

	const seenRef = useRef<{
		key: string;
		paidAmount: number;
		status: string;
	} | null>(null);

	const paidAmount = payment.data?.paidAmount;
	const status = payment.data?.status;

	useEffect(() => {
		if (paidAmount === undefined || status === undefined) return;

		const prev = seenRef.current;
		if (prev === null || prev.key !== pollKey) {
			seenRef.current = {
				key: pollKey,
				paidAmount,
				status,
			};
			const cachedInvoices = queryClient.getQueryData<StudentInvoiceItem[]>([
				"student",
				"invoices",
			]);
			const cachedItem = cachedInvoices?.find((item) => item.id === invoiceId);
			if (
				cachedItem &&
				(cachedItem.paidAmount !== paidAmount || cachedItem.status !== status)
			) {
				void queryClient.invalidateQueries({
					queryKey: ["student", "invoices"],
				});
			}
			return;
		}

		if (prev.paidAmount !== paidAmount || prev.status !== status) {
			seenRef.current = {
				key: pollKey,
				paidAmount,
				status,
			};
			void queryClient.invalidateQueries({ queryKey: ["student", "invoices"] });
		}
	}, [pollKey, invoiceId, paidAmount, status, queryClient]);

	if (payment.isLoading && !payment.data) {
		return (
			<div className="p-6">
				<p className="text-muted-foreground text-sm">Đang tải…</p>
			</div>
		);
	}

	if (!payment.data) {
		return (
			<div className="mx-auto flex w-full max-w-md flex-col gap-3 p-6">
				<Link to="/tuition" className={BACK_LINK_CLS}>
					← Học phí
				</Link>
				<p className="text-muted-foreground text-sm">
					Không mở được phiếu học phí này.
				</p>
			</div>
		);
	}

	const data: PaymentInstructions = payment.data;
	const isSettled =
		data.status === "paid" || data.reason === "PAID" || data.amountDue <= 0;
	const displayPaid = isSettled ? data.amount : data.paidAmount;
	const displayDue = isSettled ? 0 : data.amountDue;

	return (
		<div className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
			<header>
				<Link to="/tuition" className={BACK_LINK_CLS}>
					← Học phí
				</Link>
				<p className="mt-2 text-muted-foreground text-xs">{studentName}</p>
				<h1 className="mt-1 font-extrabold text-2xl tracking-[-0.02em]">
					<span className="font-mono text-primary">{data.invoiceCode}</span>
					{" · "}
					{data.amount.toLocaleString("vi-VN")}đ
				</h1>
				<div className="mt-4 grid grid-cols-2 gap-4">
					<div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
						<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
							Đã đóng
						</div>
						<div className="mt-2 break-words font-medium font-mono text-foreground text-lg tabular-nums leading-none">
							{displayPaid.toLocaleString("vi-VN")}đ
						</div>
					</div>
					<div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
						<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
							Còn lại
						</div>
						<div
							className={`mt-2 break-words font-medium font-mono text-lg tabular-nums leading-none ${
								displayDue > 0 ? "text-destructive" : "text-foreground"
							}`}
						>
							{displayDue.toLocaleString("vi-VN")}đ
						</div>
					</div>
				</div>
			</header>
			<PaymentQrPanel data={data} />
		</div>
	);
}

/**
 * Chi tiết phiếu học phí trong portal (#320): shared QR panel + poll 5 s
 * (tab-visible, dừng sau 15 phút — cùng quy tắc với public /pay).
 */
function StudentTuitionDetailRoute() {
	const { invoiceId } = Route.useParams();
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;

	return (
		<StudentPageGate sessionEmail={sessionEmail}>
			{(me) => (
				<StudentTuitionDetailView
					invoiceId={invoiceId}
					studentName={me.student.name}
					orgId={me.student.orgId}
				/>
			)}
		</StudentPageGate>
	);
}
