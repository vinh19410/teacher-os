import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { BillingTimelineEvent } from "@teacher-os/api/contracts";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fmtVND } from "@/lib/mock-data";
import { billingTimelineQueryOptions } from "@/lib/repos/payments";
import { type DebtLedgerRow, formatDue } from "@/lib/tuition-from-kernel";

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const vnMonthFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Ho_Chi_Minh",
	year: "numeric",
	month: "2-digit",
});

const vnDateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
	timeZone: "Asia/Ho_Chi_Minh",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatMonthLabel(iso: string): string {
	try {
		const parts = vnMonthFormatter.formatToParts(new Date(iso));
		const year = parts.find((p) => p.type === "year")?.value ?? "";
		const month = parts.find((p) => p.type === "month")?.value ?? "";
		if (year && month) return `Tháng ${month}/${year}`;
	} catch {
		// fallback below
	}
	return "Khác";
}

function formatEventTime(iso: string): string {
	try {
		return vnDateTimeFormatter.format(new Date(iso));
	} catch {
		return iso;
	}
}

interface MonthGroup {
	label: string;
	events: BillingTimelineEvent[];
}

function groupEventsByMonth(events: BillingTimelineEvent[]): MonthGroup[] {
	const groups: MonthGroup[] = [];
	const byLabel = new Map<string, MonthGroup>();
	for (const event of events) {
		const label = formatMonthLabel(event.at);
		let group = byLabel.get(label);
		if (!group) {
			group = { label, events: [] };
			byLabel.set(label, group);
			groups.push(group);
		}
		group.events.push(event);
	}
	return groups;
}

/**
 * Ngăn kéo (Sheet bên phải ở desktop, full-screen ở mobile 375px) hiển thị
 * dòng thời gian lịch sử hóa đơn & giao dịch của 1 học viên trên Sổ công nợ
 * (TOS-18 #452).
 */
export function BillingTimelineDrawer({
	open,
	row,
	onClose,
}: {
	open: boolean;
	row: DebtLedgerRow | null;
	onClose: () => void;
}) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const drawerRef = useRef<HTMLDivElement>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);

	useEffect(() => {
		onCloseRef.current = onClose;
	});

	const studentId = row?.studentId ?? "";
	const { data, isPending, isError, refetch } = useQuery({
		...billingTimelineQueryOptions(studentId),
		enabled: open && studentId.length > 0,
	});

	const groups = useMemo(
		() => groupEventsByMonth(data?.events ?? []),
		[data?.events],
	);

	const trapFocus = useCallback((e: KeyboardEvent) => {
		if (e.key !== "Tab" || !drawerRef.current) return;
		const focusables = Array.from(
			drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (
			e.shiftKey &&
			(document.activeElement === first ||
				document.activeElement === headingRef.current)
		) {
			e.preventDefault();
			last?.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first?.focus();
		}
	}, []);

	useEffect(() => {
		if (!open) return;
		previouslyFocused.current = document.activeElement as HTMLElement | null;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCloseRef.current();
			else trapFocus(e);
		};
		document.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		headingRef.current?.focus();
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
			previouslyFocused.current?.focus();
		};
	}, [open, trapFocus]);

	if (!open || !row) return null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: click backdrop tương đương phím Escape đã gắn trên document
		// biome-ignore lint/a11y/useKeyWithClickEvents: đóng bằng bàn phím qua Escape listener toàn cục
		<div
			ref={overlayRef}
			onClick={(e) => {
				if (e.target === overlayRef.current) onClose();
			}}
			className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]"
		>
			<div
				ref={drawerRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="billing-timeline-title"
				data-testid="billing-timeline-drawer"
				className="flex h-full w-full flex-col bg-card text-card-foreground shadow-xl sm:max-w-lg sm:border-l"
			>
				<div className="flex items-center justify-between border-b px-5 py-4">
					<h2
						id="billing-timeline-title"
						ref={headingRef}
						tabIndex={-1}
						className="font-semibold text-base tracking-tight outline-none"
					>
						{`Lịch sử hóa đơn & giao dịch — ${row.name}`}
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Đóng"
						className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<X className="size-4" />
					</button>
				</div>

				<div
					data-testid="billing-timeline-summary"
					className="grid grid-cols-3 gap-2 border-b bg-muted/30 px-5 py-3 text-xs"
				>
					<div>
						<div className="text-muted-foreground">Phải đóng</div>
						<div className="mt-0.5 font-mono font-semibold text-sm tabular-nums">
							{fmtVND(row.totalDue)}
						</div>
					</div>
					<div>
						<div className="text-muted-foreground">Đã thu</div>
						<div className="mt-0.5 font-mono font-semibold text-sm tabular-nums">
							{fmtVND(row.totalPaid)}
						</div>
					</div>
					<div>
						<div className="text-muted-foreground">Còn nợ</div>
						<div
							className={cn(
								"mt-0.5 font-mono font-semibold text-sm tabular-nums",
								row.remaining > 0 && "text-destructive",
							)}
						>
							{fmtVND(row.remaining)}
						</div>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto px-5 py-4">
					{isPending ? (
						<div
							data-testid="billing-timeline-loading"
							className="flex flex-col gap-3"
						>
							<div className="h-16 animate-pulse rounded-lg bg-muted" />
							<div className="h-16 animate-pulse rounded-lg bg-muted" />
							<div className="h-16 animate-pulse rounded-lg bg-muted" />
						</div>
					) : isError ? (
						<div
							data-testid="billing-timeline-error"
							className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-sm"
						>
							<p className="text-destructive">
								Không tải được lịch sử hóa đơn và giao dịch.
							</p>
							<div className="mt-3 flex justify-center">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => void refetch()}
								>
									Thử lại
								</Button>
							</div>
						</div>
					) : groups.length === 0 ? (
						<p
							data-testid="billing-timeline-empty"
							className="py-8 text-center text-muted-foreground text-sm"
						>
							Chưa có hóa đơn hoặc giao dịch nào.
						</p>
					) : (
						<div className="flex flex-col gap-5">
							{groups.map((group) => (
								<section key={group.label} className="flex flex-col gap-2.5">
									<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
										{group.label}
									</h3>
									<ol className="flex flex-col gap-2.5">
										{group.events.map((event) => {
											if (event.kind === "invoice_issued") {
												const dueLabel = event.due
													? `hạn ${formatDue(event.due)}`
													: "—";
												return (
													<li
														key={`inv-${event.invoiceId}`}
														data-testid="billing-timeline-item"
														className="rounded-lg border bg-background p-3 text-sm"
													>
														<div className="flex items-start justify-between gap-2">
															<div className="font-medium">
																{`Phát hành hóa đơn ${event.code} · ${event.type} · ${fmtVND(event.amount)}`}
															</div>
															<Badge
																variant={
																	event.status === "paid" ? "success" : "warn"
																}
															>
																{event.status === "paid"
																	? "Đã thu"
																	: "Chưa thu"}
															</Badge>
														</div>
														<div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
															<span>
																{`${dueLabel} · ${formatEventTime(event.at)}`}
															</span>
															<Link
																to="/tuition/$invoiceId"
																params={{ invoiceId: event.invoiceId }}
																onClick={onClose}
																className="font-mono underline decoration-border underline-offset-2 hover:text-foreground"
															>
																{event.code}
															</Link>
														</div>
													</li>
												);
											}

											const sourceLabel =
												event.source === "bank_hub"
													? "QR Bank-Hub"
													: `Thu thủ công · ${event.method || "Khác"}`;
											const trimmedNote = event.note.trim();
											const noteSuffix =
												trimmedNote.length > 0 ? ` — ${trimmedNote}` : "";

											return (
												<li
													key={`pay-${event.id}`}
													data-testid="billing-timeline-item"
													className="rounded-lg border bg-background p-3 text-sm"
												>
													<div className="flex items-start justify-between gap-2">
														<div className="font-medium">
															{`Thu ${fmtVND(event.amount)}`}
														</div>
														<Badge
															variant={
																event.source === "bank_hub"
																	? "success"
																	: "muted"
															}
														>
															{sourceLabel}
														</Badge>
													</div>
													<div className="mt-1 text-muted-foreground text-xs">
														{`${sourceLabel}${noteSuffix}`}
													</div>
													<div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
														<span>{formatEventTime(event.at)}</span>
														<Link
															to="/tuition/$invoiceId"
															params={{ invoiceId: event.invoiceId }}
															onClick={onClose}
															className="font-mono underline decoration-border underline-offset-2 hover:text-foreground"
														>
															{event.code}
														</Link>
													</div>
												</li>
											);
										})}
									</ol>
								</section>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
