import { Bell, Building2, Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
	useAcceptInvitation,
	useRejectInvitation,
	useStudentNotifications,
} from "@/lib/repos/student";

/**
 * Chuông thông báo học viên trên shell v2: nút ghost icon + badge số đếm
 * (design: nền destructive, chữ trắng); panel popover token với nút Chấp
 * nhận (primary) / Từ chối (outline). Logic mời org giữ nguyên v1.
 */
export function NotificationBell() {
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
		<div className="relative">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-expanded={isOpen}
				aria-label="Thông báo"
				className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
			>
				<Bell aria-hidden="true" />
				{count > 0 && (
					<span
						data-testid="notification-badge"
						className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-destructive font-medium text-[10px] text-white leading-none"
					>
						{count}
					</span>
				)}
			</button>
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
						className="absolute top-full right-0 z-50 mt-2 max-h-[420px] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
					>
						<div className="flex items-center justify-between border-b px-4 py-3">
							<h3 className="font-semibold">Thông báo</h3>
							{count > 0 && (
								<span className="font-mono text-[10px] text-muted-foreground">
									{count} mới
								</span>
							)}
						</div>

						<div className="max-h-[380px] divide-y">
							{isLoading ? (
								<div className="flex items-center justify-center p-6 text-muted-foreground text-xs">
									<Loader2 className="mr-2 size-4 animate-spin" />
									Đang tải thông báo...
								</div>
							) : count === 0 ? (
								<div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground text-xs">
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
										<div key={inv.id} className="flex flex-col gap-2.5 p-3.5">
											<div className="flex items-start gap-2.5">
												<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
													<Building2 className="size-4" />
												</span>
												<div className="flex min-w-0 flex-1 flex-col gap-1">
													<p className="text-xs leading-relaxed">
														Giáo viên{" "}
														<strong className="font-semibold">
															{inv.inviterName || "Giáo viên"}
														</strong>{" "}
														đã mời bạn tham gia tổ chức{" "}
														<strong className="font-semibold">
															{inv.orgName || "Lớp học"}
														</strong>
														.
													</p>
													<span className="font-mono text-[10px] text-muted-foreground">
														{dateFormatted}
													</span>
												</div>
											</div>

											<div className="flex items-center gap-2 pt-1">
												<button
													type="button"
													onClick={() => handleAccept(inv.id)}
													disabled={isCurrentProcessing}
													className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs shadow-xs transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
												>
													{isCurrentProcessing ? (
														<Loader2 className="size-3.5 animate-spin" />
													) : (
														<Check className="size-3.5" />
													)}
													<span>Chấp nhận</span>
												</button>

												<button
													type="button"
													onClick={() => handleReject(inv.id)}
													disabled={isCurrentProcessing}
													className={cn(
														"inline-flex items-center justify-center gap-1 rounded-md border bg-background px-3 py-1.5 font-medium text-xs shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
													)}
												>
													<X className="size-3.5" />
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
