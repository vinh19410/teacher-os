import { createFileRoute } from "@tanstack/react-router";
import type { PublicPayView } from "@teacher-os/api/contracts";
import { env } from "@teacher-os/env/web";
import { useEffect, useState } from "react";
import { getServerUrl } from "@/lib/auth-client";

/**
 * Public pay page (#320) — reachable signed-out, the 128-bit token in the
 * URL is the capability. Full QR panel UI lands with PaymentQrPanel in the
 * same plan (phase 5); this route already serves the complete data.
 */
export const Route = createFileRoute("/pay/$token")({
	component: PayTokenRoute,
});

function PayTokenRoute() {
	const { token } = Route.useParams();
	const [view, setView] = useState<PublicPayView | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const baseUrl = getServerUrl(env.VITE_SERVER_URL);
		fetch(`${baseUrl}/public/pay/${encodeURIComponent(token)}`)
			.then(async (res) => {
				if (!res.ok) throw new Error(String(res.status));
				return (await res.json()) as PublicPayView;
			})
			.then((data) => {
				if (!cancelled) setView(data);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [token]);

	if (failed) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<p className="text-muted-fg text-sm">
					Link thanh toán không tồn tại hoặc đã bị thu hồi.
				</p>
			</main>
		);
	}
	if (!view) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<p className="text-muted-fg text-sm">Đang tải…</p>
			</main>
		);
	}
	return (
		<main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
			<header>
				<p className="text-muted-fg text-xs">{view.orgName}</p>
				<h1 className="font-semibold text-lg">{view.studentName}</h1>
			</header>
			<p className="text-sm">
				{view.payable
					? `Số tiền còn nợ: ${view.amountDue.toLocaleString("vi-VN")}đ`
					: "Hóa đơn này đã được thanh toán."}
			</p>
			{view.qrUrl && (
				<img src={view.qrUrl} alt="Mã QR chuyển khoản" className="w-64" />
			)}
		</main>
	);
}
