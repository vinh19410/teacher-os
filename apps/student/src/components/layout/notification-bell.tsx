import { Bell, Building2, Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
	useAcceptInvitation,
	useRejectInvitation,
	useStudentNotifications,
} from "@/lib/repos/student";

interface NotificationBellProps {
	variant?: "sidebar" | "compact";
}

export function NotificationBell({
	variant = "compact",
}: NotificationBellProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [processingId, setProcessingId] = useState<string | null>(null);

	const { data: notifications, isLoading } = useStudentNotifications();
	const acceptMutation = useAcceptInvitation();
	const rejectMutation = useRejectInvitation();

	const pendingNotifications = (notifications ?? []).filter(
		(n) => n.status === "pending",
	);
	const count = pendingNotifications.length;

	const handleAccept = async (id: string) => {
		setProcessingId(id);
		try {
			await acceptMutation.mutateAsync(id);
		} catch (err) {
			console.error("Failed to accept invitation", err);
		} finally {
			setProcessingId(null);
		}
	};

	const handleReject = async (id: string) => {
		setProcessingId(id);
		try {
			await rejectMutation.mutateAsync(id);
		} catch (err) {
			console.error("Failed to reject invitation", err);
		} finally {
			setProcessingId(null);
		}
	};
	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen]);

	return (
		<div className={cn("relative", variant === "sidebar" && "w-full")}>
			{variant === "sidebar" ? (
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					aria-expanded={isOpen}
					aria-label="Thông báo"
					className={cn(
						"flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-2 font-medium text-sm transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
						isOpen
							? "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
							: "text-muted-fg hover:bg-surface hover:text-fg",
					)}
				>
					<div className="flex items-center gap-3">
						<Bell className={cn("h-4 w-4", count > 0 && "text-hot")} />
						<span>Thông báo</span>
					</div>
					{count > 0 && (
						<span
							data-testid="notification-badge"
							className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 font-bold text-[11px] text-white leading-none shadow-sm"
						>
							{count}
						</span>
					)}
				</button>
			) : (
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					aria-expanded={isOpen}
					aria-label="Thông báo"
					className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-fg transition-colors hover:bg-surface hover:text-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
				>
					<Bell className="h-5 w-5" />
					{count > 0 && (
						<span
							data-testid="notification-badge"
							className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-bold text-[10px] text-white leading-none"
						>
							{count}
						</span>
					)}
				</button>
			)}
			{isOpen && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => setIsOpen(false)}
						aria-hidden="true"
					/>
					<div
						role="dialog"
						aria-label="Danh sách thông báo"
						className={cn(
							"z-50 rounded-[var(--radius-md)] border border-line bg-bg shadow-[var(--elev-raised)]",
							variant === "sidebar"
								? "fixed bottom-5 left-[268px] w-[360px] max-w-[calc(100vw-280px)]"
								: "absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] md:fixed md:top-auto md:right-auto md:bottom-5 md:left-[268px] md:mt-0 md:w-[360px] md:max-w-[calc(100vw-280px)]",
						)}
					>
						<div className="flex items-center justify-between border-line border-b px-4 py-3">
							<h3 className="font-semibold text-fg text-sm">Thông báo</h3>
							{count > 0 && (
								<span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-[11px] text-hot">
									{count} mới
								</span>
							)}
						</div>

						<div className="max-h-[380px] divide-y divide-line overflow-y-auto">
							{isLoading ? (
								<div className="flex items-center justify-center p-6 text-muted-fg text-xs">
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Đang tải thông báo...
								</div>
							) : count === 0 ? (
								<div className="flex flex-col items-center justify-center p-6 text-center text-muted-fg text-xs">
									<p>Không có thông báo mới</p>
								</div>
							) : (
								pendingNotifications.map((inv) => {
									const isCurrentProcessing = processingId === inv.id;
									const dateFormatted = new Date(
										inv.createdAt,
									).toLocaleDateString("vi-VN", {
										day: "2-digit",
										month: "2-digit",
										hour: "2-digit",
										minute: "2-digit",
									});

									return (
										<div
											key={inv.id}
											className="flex flex-col gap-2.5 p-3.5 transition-colors hover:bg-surface/50"
										>
											<div className="flex items-start gap-2.5">
												<span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-hot">
													<Building2 className="h-4 w-4" />
												</span>
												<div className="flex min-w-0 flex-1 flex-col gap-1">
													<p className="text-fg text-xs leading-relaxed">
														Giáo viên{" "}
														<strong className="font-semibold text-fg">
															{inv.inviterName || "Giáo viên"}
														</strong>{" "}
														đã mời bạn tham gia tổ chức{" "}
														<strong className="font-semibold text-fg">
															{inv.orgName || "Lớp học"}
														</strong>
														.
													</p>
													<span className="text-[11px] text-muted-fg">
														{dateFormatted}
													</span>
												</div>
											</div>

											<div className="flex items-center gap-2 pt-1">
												<button
													type="button"
													onClick={() => handleAccept(inv.id)}
													disabled={isCurrentProcessing}
													className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-hot px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-accent-hover active:scale-95 disabled:opacity-50"
												>
													{isCurrentProcessing ? (
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
													) : (
														<Check className="h-3.5 w-3.5" />
													)}
													<span>Chấp nhận</span>
												</button>

												<button
													type="button"
													onClick={() => handleReject(inv.id)}
													disabled={isCurrentProcessing}
													className="inline-flex items-center justify-center gap-1 rounded-md border border-line px-3 py-1.5 font-medium text-muted-fg text-xs transition-colors hover:bg-surface hover:text-fg active:scale-95 disabled:opacity-50"
												>
													<X className="h-3.5 w-3.5" />
													<span>Từ chối</span>
												</button>
											</div>
										</div>
									);
								})
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
