import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { PaymentInstructions } from "@teacher-os/api/contracts";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { useEffect, useState } from "react";
import { POLL_CAP_MS, POLL_INTERVAL_MS } from "@/lib/repos/payments-portal";
import {
	fetchStudentInvoicePayment,
	fetchStudentMe,
} from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/tuition/$invoiceId")({
	component: StudentTuitionDetailRoute,
});

/**
 * Chi tiết phiếu học phí trong portal (#320): shared QR panel + poll 5 s
 * (tab-visible, dừng sau 15 phút — cùng quy tắc với public /pay).
 */
function StudentTuitionDetailRoute() {
	const { invoiceId } = Route.useParams();
	const me = useQuery({ queryKey: ["student-me"], queryFn: fetchStudentMe });
	const [openedAt] = useState(() => Date.now());
	const [reload, setReload] = useState(0);

	const payment = useQuery({
		queryKey: ["student-invoice-payment", invoiceId, reload],
		queryFn: () => fetchStudentInvoicePayment(invoiceId),
		retry: false,
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

	if (me.isLoading || payment.isLoading) {
		return (
			<div className="p-6">
				<p className="text-muted-fg text-sm">Đang tải…</p>
			</div>
		);
	}
	if (payment.isError || !payment.data) {
		return (
			<div className="p-6">
				<p className="text-muted-fg text-sm">
					Không mở được phiếu học phí này.
				</p>
			</div>
		);
	}
	const data: PaymentInstructions = payment.data;
	return (
		<div className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
			<header>
				<p className="text-muted-fg text-xs">{me.data?.student.name ?? ""}</p>
				<h1 className="font-semibold text-lg">
					{data.invoiceCode} · {data.amount.toLocaleString("vi-VN")}đ
				</h1>
			</header>
			<PaymentQrPanel data={data} />
		</div>
	);
}
