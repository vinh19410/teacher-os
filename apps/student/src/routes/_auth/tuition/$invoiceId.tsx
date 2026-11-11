import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { PaymentInstructions } from "@teacher-os/api/contracts";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { useEffect, useState } from "react";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import { POLL_CAP_MS, POLL_INTERVAL_MS } from "@/lib/repos/payments-portal";
import { fetchStudentInvoicePayment } from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/tuition/$invoiceId")({
	component: StudentTuitionDetailRoute,
});

/**
 * Chi tiết phiếu học phí trong portal (#320): shared QR panel + poll 5 s
 * (tab-visible, dừng sau 15 phút — cùng quy tắc với public /pay).
 */
function StudentTuitionDetailRoute() {
	const { invoiceId } = Route.useParams();
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const [openedAt] = useState(() => Date.now());
	const [reload, setReload] = useState(0);

	const payment = useQuery({
		queryKey: ["student", "invoice-payment", invoiceId, reload],
		queryFn: () => fetchStudentInvoicePayment(invoiceId),
	});

	useEffect(() => {
		if (!payment.data?.payable) return;
		const poll = window.setInterval(() => {
			if (!document.hidden && Date.now() - openedAt < POLL_CAP_MS) {
				setReload((n) => n + 1);
			}
		}, POLL_INTERVAL_MS);
		return () => window.clearInterval(poll);
	}, [payment.data?.payable, openedAt]);

	return (
		<StudentPageGate sessionEmail={sessionEmail}>
			{(me) => {
				if (payment.isLoading) {
					return (
						<div className="p-6">
							<p className="text-muted-foreground text-sm">Đang tải…</p>
						</div>
					);
				}
				if (payment.isError || !payment.data) {
					return (
						<div className="p-6">
							<p className="text-muted-foreground text-sm">
								Không mở được phiếu học phí này.
							</p>
						</div>
					);
				}
				const data: PaymentInstructions = payment.data;
				return (
					<div className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
						<header>
							<Link
								to="/tuition"
								className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em] hover:text-primary"
							>
								← Học phí
							</Link>
							<p className="mt-2 text-muted-foreground text-xs">
								{me.student.name}
							</p>
							<h1 className="mt-1 font-extrabold text-2xl tracking-[-0.02em]">
								<span className="font-mono text-primary">
									{data.invoiceCode}
								</span>
								{" · "}
								{data.amount.toLocaleString("vi-VN")}đ
							</h1>
							<div className="mt-4 grid grid-cols-2 gap-4">
								<div className="rounded-md rounded-xl border bg-card p-4 shadow-sm">
									<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
										Đã đóng
									</div>
									<div className="mt-2 font-medium font-mono text-foreground text-lg leading-none">
										{data.paidAmount.toLocaleString("vi-VN")}đ
									</div>
								</div>
								<div className="rounded-md bg-primary p-4">
									<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
										Còn lại
									</div>
									<div className="mt-2 font-medium font-mono text-lg text-primary leading-none">
										{data.amountDue.toLocaleString("vi-VN")}đ
									</div>
								</div>
							</div>
						</header>
						<PaymentQrPanel data={data} />
					</div>
				);
			}}
		</StudentPageGate>
	);
}
