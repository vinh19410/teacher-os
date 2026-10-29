import { createFileRoute } from "@tanstack/react-router";
import type { PublicPayView } from "@teacher-os/api/contracts";
import { env } from "@teacher-os/env/web";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import { useEffect, useRef, useState } from "react";
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
 * widely-shared Zalo links must not poll D1 forever. Polling also stops once
 * the server says the invoice is no longer payable (paid/void). Only a 404
 * means the link is gone; a network blip keeps the last good view.
 */
export const Route = createFileRoute("/pay/$token")({
	component: PayTokenRoute,
});

type LoadState = "ok" | "gone" | "error";

function PayTokenRoute() {
	const { token } = Route.useParams();
	const [view, setView] = useState<PublicPayView | null>(null);
	const [loadState, setLoadState] = useState<LoadState>("ok");
	const [openedAt] = useState(() => Date.now());
	const [refreshedAt, setRefreshedAt] = useState(openedAt);
	// Read by the interval callbacks, which close over the first render.
	const payableRef = useRef(true);

	useEffect(() => {
		let cancelled = false;
		const baseUrl = getServerUrl(env.VITE_SERVER_URL);
		const load = () =>
			fetch(`${baseUrl}/public/pay/${encodeURIComponent(token)}`)
				.then(async (res) => {
					if (res.status === 404) return "gone" as const;
					if (!res.ok) throw new Error(String(res.status));
					return (await res.json()) as PublicPayView;
				})
				.then((data) => {
					if (cancelled) return;
					if (data === "gone") {
						setLoadState("gone");
						return;
					}
					payableRef.current = data.payable;
					setView(data);
					setLoadState("ok");
				})
				.catch(() => {
					if (!cancelled) setLoadState("error");
				});
		void load();
		// One interval: a hidden tab (parent switched to the banking app)
		// only skips ticks; the interval ends at the cap or once not payable.
		const poll = window.setInterval(() => {
			const finished =
				!payableRef.current || Date.now() - refreshedAt >= POLL_CAP_MS;
			if (finished) window.clearInterval(poll);
			else if (
				shouldPollPayment({
					panelOpen: true,
					payable: true,
					openedAt: refreshedAt,
					now: Date.now(),
				})
			)
				void load();
		}, POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			window.clearInterval(poll);
		};
	}, [token, refreshedAt]);

	if (loadState === "gone") {
		return (
			<main className="grid min-h-screen place-items-center p-6">
				<p className="text-muted-foreground text-sm">
					Link thanh toán không tồn tại hoặc đã bị thu hồi.
				</p>
			</main>
		);
	}
	if (loadState === "error" && !view) {
		return (
			<main className="grid min-h-screen place-items-center gap-3 p-6">
				<p className="text-muted-foreground text-sm">
					Không tải được trang thanh toán. Kiểm tra kết nối mạng rồi thử lại.
				</p>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => setRefreshedAt(Date.now())}
				>
					Thử lại
				</Button>
			</main>
		);
	}
	if (!view) {
		return (
			<main className="grid min-h-screen place-items-center p-6">
				<p className="text-muted-foreground text-sm">Đang tải…</p>
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
		// PayPage v2: một card duy nhất căn giữa khung màn hình.
		<main className="grid min-h-screen place-items-center p-6">
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
	);
}
