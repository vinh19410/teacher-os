import { useNavigate } from "@tanstack/react-router";
import { Bell, Building2, Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
	useAcceptInvitation,
	useMarkInboxRead,
	useRejectInvitation,
	useStudentInbox,
	useStudentNotifications,
} from "@/lib/repos/student";

/** Thời gian tương đối ngắn gọn kiểu "5 phút trước" (vi). */
function formatRelativeTime(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const minutes = Math.max(0, Math.floor(diffMs / 60_000));
	if (minutes < 1) return "Vừa xong";
	if (minutes < 60) return `${minutes} phút trước`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} giờ trước`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days} ngày trước`;
	return new Date(iso).toLocaleDateString("vi-VN", {
		day: "2-digit",
		month: "2-digit",
	});
}

/**
 * Chuông thông báo học viên trên shell v2: 2 phần — "Lời mời" (chấp nhận /
 * từ chối org, logic giữ nguyên v1) và "Thông báo" (inbox in-app TOS-21 D7:
 * bấm → đánh dấu đã đọc → mở link). Badge = lời mời pending + chưa đọc.
 */
export function NotificationBell() {
	const [isOpen, setIsOpen] = useState(false);
	const [processingId, setProcessingId] = useState<string | null>(null);

	const { data: notifications, isLoading } = useStudentNotifications();
	const { data: inbox, isLoading: isInboxLoading } = useStudentInbox();
	const acceptMutation = useAcceptInvitation();
	const rejectMutation = useRejectInvitation();
	const markReadMutation = useMarkInboxRead();
	const navigate = useNavigate();

	const pendingNotifications = (notifications ?? []).filter(
		(n) => n.status === "pending",
	);
	const inboxItems = inbox?.items ?? [];
	const unreadCount = inbox?.unread ?? 0;
	const count = pendingNotifications.length + unreadCount;

	const handleInboxItemClick = async (id: string, linkPath: string) => {
		try {
			await markReadMutation.mutateAsync(id);
		} catch (err) {
			console.error("Failed to mark inbox read", err);
		}
		setIsOpen(false);
		if (linkPath) {
			void navigate({ to: linkPath });
		}
	};

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
				aria-label={
					count > 0 ? `Thông báo (${count} mục chưa xử lý)` : "Thông báo"
				}
				className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
			>
				<Bell aria-hidden="true" />
				{count > 0 && (
					<span
						data-testid="notification-badge"
						aria-hidden="true"
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
							{isLoading || isInboxLoading ? (
								<div className="flex items-center justify-center p-6 text-muted-foreground text-xs">
									<Loader2 className="mr-2 size-4 animate-spin" />
									Đang tải thông báo...
								</div>
							) : pendingNotifications.length === 0 &&
								inboxItems.length === 0 ? (
								<div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground text-xs">
									<p>Chưa có thông báo</p>
								</div>
							) : (
								<>
									{pendingNotifications.length > 0 && (
										<section>
											<h4 className="px-4 pt-3 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
												Lời mời
											</h4>
											{pendingNotifications.map((inv) => {
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
														className="flex flex-col gap-2.5 p-3.5"
													>
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
											})}
										</section>
									)}

									{inboxItems.length > 0 && (
										<section>
											<h4 className="px-4 pt-3 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
												Thông báo
											</h4>
											<ul>
												{inboxItems.map((item) => {
													const isUnread = item.readAt === null;
													return (
														<li key={item.id}>
															<button
																type="button"
																data-testid="inbox-item"
																onClick={() =>
																	handleInboxItemClick(item.id, item.linkPath)
																}
																disabled={markReadMutation.isPending}
																className="flex w-full items-start gap-2.5 p-3.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
															>
																<span
																	aria-hidden="true"
																	className={cn(
																		"mt-1.5 size-2 shrink-0 rounded-full",
																		isUnread ? "bg-primary" : "bg-transparent",
																	)}
																/>
																<span className="flex min-w-0 flex-1 flex-col gap-1">
																	<span
																		className={cn(
																			"text-xs leading-relaxed",
																			isUnread
																				? "font-semibold"
																				: "font-normal",
																		)}
																	>
																		{item.title}
																	</span>
																	<span className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
																		{item.body}
																	</span>
																	<span className="font-mono text-[10px] text-muted-foreground">
																		{formatRelativeTime(item.createdAt)}
																	</span>
																</span>
															</button>
														</li>
													);
												})}
											</ul>
										</section>
									)}
								</>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
