import { createFileRoute } from "@tanstack/react-router";
import type { PublicPayView } from "@teacher-os/api/contracts";
import { env } from "@teacher-os/env/web";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getServerUrl } from "@/lib/auth-client";
import {
	POLL_CAP_MS,
	POLL_INTERVAL_MS,
	shouldPollPayment,
} from "@/lib/repos/payments";

/**
 * Public pay page (#320) — reachable signed-out, the 128-bit token in the
 * URL is the capability. Data comes from /public/pay/:token which omits the
 * teacher's note and due date on purpose. Polling follows the shared rule:
 * 5 s, tab-visible only, hard 15-minute cap, then a manual refresh button —
 * widely-shared Zalo links must not poll D1 forever.
 */
export const Route = createFileRoute("/pay/$token")({
	component: PayTokenRoute,
});

function PayTokenRoute() {
	const { token } = Route.useParams();
	const [view, setView] = useState<PublicPayView | null>(null);
	const [failed, setFailed] = useState(false);
	const [openedAt] = useState(() => Date.now());
	const [refreshedAt, setRefreshedAt] = useState(openedAt);

	useEffect(() => {
		let cancelled = false;
		const baseUrl = getServerUrl(env.VITE_SERVER_URL);
		const load = () =>
			fetch(`${baseUrl}/public/pay/${encodeURIComponent(token)}`)
				.then(async (res) => {
					if (!res.ok) throw new Error(String(res.status));
					return (await res.json()) as PublicPayView;
				})
				.then((data) => {
					if (!cancelled) {
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
				payable: true,
				openedAt: refreshedAt,
				now: Date.now(),
			});
		const poll = window.setInterval(() => {
			if (!document.hidden && keepPolling()) void load();
		}, POLL_INTERVAL_MS);
		// Stop the interval once the cap elapses (checked on each tick).
		const cap = window.setInterval(() => {
			if (!keepPolling()) window.clearInterval(poll);
		}, POLL_CAP_MS / 60);
		return () => {
			cancelled = true;
			window.clearInterval(poll);
			window.clearInterval(cap);
		};
	}, [token, refreshedAt]);

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
	const pollExhausted = !shouldPollPayment({
		panelOpen: true,
		payable: true,
		openedAt: refreshedAt,
		now: Date.now(),
	});
	return (
		<main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
			<header>
				<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
					{view.orgName}
				</p>
				<h1 className="mt-1 font-display font-extrabold text-3xl leading-[0.95] tracking-[-0.045em]">
					{view.studentName}
				</h1>
			</header>
			<PaymentQrPanel data={view} />
			{view.payable && pollExhausted && (
				<Button
					variant="secondary"
					size="sm"
					className="self-start"
					onClick={() => setRefreshedAt(Date.now())}
				>
					Làm mới
				</Button>
			)}
		</main>
	);
}
