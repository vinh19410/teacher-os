import { Bell, Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import {
	useAcceptInvitation,
	useRejectInvitation,
	useStudentNotifications,
} from "@/lib/repos/student";

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

	return (
		<div className="relative">
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
						className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-line bg-bg shadow-[var(--elev-raised)]"
					>
						<div className="flex items-center justify-between border-line border-b px-4 py-3">
							<h3 className="font-semibold text-fg text-sm">Thông báo</h3>
							{count > 0 && (
								<span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-[11px] text-accent-blue">
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
											className="flex flex-col gap-2 p-3 transition-colors hover:bg-surface/50"
										>
											<div className="flex flex-col gap-1">
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

											<div className="flex items-center gap-2 pt-1">
												<button
													type="button"
													onClick={() => handleAccept(inv.id)}
													disabled={isCurrentProcessing}
													className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-accent-blue px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-accent-hover active:scale-95 disabled:opacity-50"
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
