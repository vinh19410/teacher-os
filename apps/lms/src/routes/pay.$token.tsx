import { createFileRoute } from "@tanstack/react-router";
import type { PublicPayView } from "@teacher-os/api/contracts";
import { env } from "@teacher-os/env/web";
import { Button } from "@teacher-os/ui/components/button";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { ThemeToggle } from "@teacher-os/ui/components/theme-toggle";
import { useEffect, useState } from "react";
import { getServerUrl } from "@/lib/auth-client";
import {
	POLL_CAP_MS,
	POLL_INTERVAL_MS,
	shouldPollPayment,
} from "@/lib/payment-polling";

/**
 * Trang thanh toán công khai theo token 128-bit (`/pay/$token`).
 * Truy cập không cần đăng nhập; dữ liệu lấy từ `/public/pay/:token`.
 * Poll mỗi 5 giây khi tab đang mở, tối đa 15 phút rồi dừng để tránh
 * poll D1 vô hạn với link chia sẻ rộng rãi.
 */
export const Route = createFileRoute("/pay/$token")({
	component: PayTokenRoute,
});

function PayTokenRoute() {
	const { token } = Route.useParams();
	const [view, setView] = useState<PublicPayView | null>(null);
	const [failed, setFailed] = useState(false);
	const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
	const [pollExhausted, setPollExhausted] = useState(false);

	useEffect(() => {
		let cancelled = false;
		let payable = true;
		setPollExhausted(false);
		const baseUrl = getServerUrl(env.VITE_SERVER_URL);
		const load = () =>
			fetch(`${baseUrl}/public/pay/${encodeURIComponent(token)}`)
				.then(async (res) => {
					if (!res.ok) throw new Error(String(res.status));
					return (await res.json()) as PublicPayView;
				})
				.then((data) => {
					if (!cancelled) {
						payable = data.payable;
						setView(data);
						setFailed(false);
					}
				})
				.catch(() => {
					if (!cancelled) setFailed(true);
				});

		void load();

		const keepPolling = () =>
			shouldPollPayment({
				panelOpen: true,
				payable,
				openedAt: refreshedAt,
				now: Date.now(),
			});

		const poll = window.setInterval(() => {
			if (!document.hidden && keepPolling()) {
				void load();
			}
		}, POLL_INTERVAL_MS);

		const cap = window.setInterval(() => {
			if (!keepPolling()) {
				window.clearInterval(poll);
				if (!cancelled) setPollExhausted(true);
			}
		}, POLL_CAP_MS / 60);

		return () => {
			cancelled = true;
			window.clearInterval(poll);
			window.clearInterval(cap);
		};
	}, [token, refreshedAt]);

	return (
		<div className="relative min-h-svh bg-background text-foreground">
			<div className="fixed top-4 right-4 z-10">
				<ThemeToggle />
			</div>
			{failed ? (
				<main className="grid min-h-svh place-items-center p-6">
					<p className="text-muted-foreground text-sm">
						Link thanh toán không tồn tại hoặc đã bị thu hồi.
					</p>
				</main>
			) : !view ? (
				<main className="grid min-h-svh place-items-center p-6">
					<p className="text-muted-foreground text-sm">Đang tải…</p>
				</main>
			) : (
				<main className="grid min-h-svh place-items-center p-6">
					<div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center text-card-foreground shadow-sm">
						<div className="text-muted-foreground text-sm">{view.orgName}</div>
						<h1 className="mt-1 font-semibold text-2xl tracking-tight">
							{view.studentName}
						</h1>
						<PaymentQrPanel data={view} className="mt-6 items-center" />
						{view.payable && pollExhausted && (
							<Button
								variant="secondary"
								size="sm"
								className="mx-auto mt-4"
								onClick={() => setRefreshedAt(Date.now())}
							>
								Làm mới
							</Button>
						)}
					</div>
				</main>
			)}
		</div>
	);
}
