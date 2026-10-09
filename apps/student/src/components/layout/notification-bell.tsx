import { Bell, Building2, Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
	useAcceptInvitation,
	useRejectInvitation,
	useStudentNotifications,
} from "@/lib/repos/student";

/**
 * Chuông thông báo theo design `StudentPortal`: nút vuông `neu-sm` 36px với
 * badge số mono nền cam đè góc trên phải; panel lời mời `neu rounded-lg`,
 * nút Chấp nhận = primary (ink → cam hover), Từ chối = secondary (`neu-sm`).
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
				className="neu-sm relative grid h-9 w-9 place-items-center rounded-md text-fg-2 transition-colors duration-[150ms] hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
			>
				<Bell aria-hidden="true" className="h-[17px] w-[17px]" />
				{count > 0 && (
					<span
						data-testid="notification-badge"
						className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center bg-hot px-0.5 font-mono text-[10px] text-accent-on leading-none"
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
						className="neu absolute top-full right-0 z-50 mt-2 max-h-[420px] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg"
					>
						<div className="flex items-center justify-between border-line border-b px-4 py-3">
							<h3 className="font-semibold text-fg text-sm">Thông báo</h3>
							{count > 0 && (
								<span className="font-mono text-[10px] text-meta">
									{count} mới
								</span>
							)}
						</div>

						<div className="max-h-[380px] divide-y divide-line overflow-y-auto">
							{isLoading ? (
								<div className="flex items-center justify-center p-6 text-meta text-xs">
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Đang tải thông báo...
								</div>
							) : count === 0 ? (
								<div className="flex flex-col items-center justify-center p-6 text-center text-meta text-xs">
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
												<span className="neu-in mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-hot">
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
													<span className="font-mono text-[10px] text-meta">
														{dateFormatted}
													</span>
												</div>
											</div>

											<div className="flex items-center gap-2 pt-1">
												<button
													type="button"
													onClick={() => handleAccept(inv.id)}
													disabled={isCurrentProcessing}
													className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-fg px-3 py-1.5 font-medium text-bg text-xs transition-colors duration-150 hover:bg-hot hover:text-accent-on active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
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
													className={cn(
														"neu-sm inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 font-medium text-fg text-xs transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
													)}
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
