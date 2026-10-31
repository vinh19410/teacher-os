import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import type {
	NotificationEventGroup,
	NotificationEventType,
	NotificationLogQuery,
	NotificationLogRow,
	NotificationResendResponse,
	NotificationStatus,
} from "@teacher-os/api/contracts";
import { Eye, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fmtWhen } from "@/components/assignments/assignment-status";
import { StatusTag } from "@/components/assignments/status-tag";
import {
	NOTIFICATION_STATUS_LABELS,
	NotificationDetailDialog,
} from "@/components/notifications/notification-detail-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { DataTable } from "@/components/ui/data-table";
import { inputCls } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHead } from "@/components/ui/page-head";
import { isHttpError } from "@/lib/kernel-load-state";
import { formatDeliveryError } from "@/lib/notification-error";
import { reauth } from "@/lib/reauth";
import {
	NOTIFICATION_LOGS_PAGE_SIZE,
	notificationLogsAllQueryKey,
	notificationLogsQueryOptions,
	resendFailedNotifications,
	resendNotification,
} from "@/lib/repos/notifications";
/**
 * Màn [5] Nhật ký gửi thông báo (#454, plan TOS-21 phase 5). Bộ lọc sống
 * URL (?q=&event=&status=&page=) để reload/back/share giữ nguyên trạng thái;
 * search debounce 300ms; chip trạng thái hiển thị badge đếm do server tính
 * trên bộ lọc q + event.
 */

export interface NotificationsSearch {
	q?: string;
	event?: NotificationEventGroup;
	status?: NotificationStatus;
	page?: number;
}

/** Chuẩn hóa search params — giá trị lạ/mặc định rơi về undefined (URL sạch). */
export function validateNotificationsSearch(input: {
	q?: string | number;
	event?: string;
	status?: string;
	page?: string | number;
}): NotificationsSearch {
	const rawQ =
		typeof input.q === "string"
			? input.q
			: typeof input.q === "number"
				? String(input.q)
				: "";
	const q = rawQ.trim().length > 0 ? rawQ : undefined;
	const event = NOTIFICATION_EVENT_FILTERS.some((f) => f.id === input.event)
		? (input.event as NotificationEventGroup)
		: undefined;
	const status = (
		NOTIFICATION_STATUS_FILTERS as ReadonlyArray<{ id: string }>
	).some((f) => f.id === input.status)
		? (input.status as NotificationStatus)
		: undefined;
	const rawPage =
		typeof input.page === "number"
			? input.page
			: typeof input.page === "string" && input.page.trim() !== ""
				? Number(input.page)
				: Number.NaN;
	const page = Number.isInteger(rawPage) && rawPage >= 2 ? rawPage : undefined;
	return { q, event, status, page };
}

export const Route = createFileRoute("/_auth/notifications/")({
	validateSearch: validateNotificationsSearch,
	component: NotificationsRoute,
});

const NOTIFICATION_EVENT_FILTERS: ReadonlyArray<{
	label: string;
	id: "all" | NotificationEventGroup;
}> = [
	{ label: "Tất cả", id: "all" },
	{ label: "Mời vào lớp", id: "class_invite" },
	{ label: "Giao bài / Trả điểm", id: "assignment" },
	{ label: "Học phí", id: "tuition" },
	{ label: "Đổi lịch / Nghỉ lễ", id: "schedule" },
];
const EVENT_OPTIONS = NOTIFICATION_EVENT_FILTERS.map((f) => f.label);

const NOTIFICATION_STATUS_FILTERS: ReadonlyArray<{
	label: string;
	id: "all" | NotificationStatus;
}> = [
	{ label: "Tất cả", id: "all" },
	{ label: "Đang chờ", id: "queued" },
	{ label: "Đã gửi", id: "sent" },
	{ label: "Đã xem", id: "read" },
	{ label: "Lỗi gửi", id: "failed" },
];
const STATUS_OPTIONS = NOTIFICATION_STATUS_FILTERS.map((f) => f.label);

const EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
	class_enrolled: "Mời vào lớp",
	assignment_published: "Giao bài",
	grade_returned: "Trả điểm",
	invoice_issued: "Hóa đơn học phí",
	tuition_reminder: "Nhắc học phí",
	schedule_changed: "Đổi lịch",
	holiday_created: "Nghỉ lễ",
	self_study_released: "Bài tự học",
};

const CHANNEL_LABELS: Record<string, string> = {
	email: "Email",
	in_app: "In-app",
	"email,in_app": "Email + In-app",
};

/** Giá trị mặc định (all / rỗng / trang 1) không lên URL. */
function filtersToSearch(
	q: string,
	event: "all" | NotificationEventGroup,
	status: "all" | NotificationStatus,
	page: number,
): NotificationsSearch {
	return {
		...(q.trim() ? { q } : {}),
		...(event !== "all" ? { event } : {}),
		...(status !== "all" ? { status } : {}),
		...(page >= 2 ? { page } : {}),
	};
}

export function formatResendToast(res: NotificationResendResponse): {
	kind: "success" | "error";
	message: string;
} {
	if (res.requeued === 0 && res.skipped.length > 0) {
		return {
			kind: "error",
			message: `Bỏ qua ${res.skipped.length} thông báo do học viên chưa có email.`,
		};
	}
	const parts = [`Đã đưa ${res.requeued} thông báo về hàng đợi để gửi lại.`];
	if (res.skipped.length > 0) {
		parts.push(`Bỏ qua ${res.skipped.length} mục thiếu email.`);
	}
	if (res.remaining > 0) {
		parts.push(`Còn ${res.remaining} mục lỗi, bấm lại để gửi tiếp.`);
	}
	return {
		kind: "success",
		message: parts.join(" "),
	};
}

function NotificationsRoute() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const searchParams = useSearch({ from: "/_auth/notifications/" });

	const eventFilter: "all" | NotificationEventGroup =
		NOTIFICATION_EVENT_FILTERS.some((f) => f.id === searchParams.event)
			? (searchParams.event as "all" | NotificationEventGroup)
			: "all";
	const statusFilter: "all" | NotificationStatus =
		NOTIFICATION_STATUS_FILTERS.some((f) => f.id === searchParams.status)
			? (searchParams.status as "all" | NotificationStatus)
			: "all";
	const page = typeof searchParams.page === "number" ? searchParams.page : 1;

	// Query giữ state local rồi debounce 300ms lên URL — chuẩn trang /grading.
	const [query, setQuery] = useState(() => searchParams.q ?? "");
	const lastEmittedQuery = useRef(query);
	const [detailRow, setDetailRow] = useState<NotificationLogRow | null>(null);
	const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
	const queryParams: NotificationLogQuery = {
		...(searchParams.q ? { q: searchParams.q } : {}),
		...(eventFilter !== "all" ? { event: eventFilter } : {}),
		...(statusFilter !== "all" ? { status: statusFilter } : {}),
		...(page >= 2 ? { page } : {}),
	};
	const { data, error, isPending, isFetching } = useQuery(
		notificationLogsQueryOptions(queryParams),
	);

	useEffect(() => {
		if (isHttpError(error) && error.status === 401) {
			reauth();
		}
	}, [error]);

	const singleResendMutation = useMutation({
		mutationFn: (id: string) => resendNotification(id),
		onSuccess: async (res) => {
			const info = formatResendToast(res);
			if (info.kind === "error") {
				toast.error(info.message);
			} else {
				toast.success(info.message);
			}
			await queryClient.invalidateQueries({
				queryKey: notificationLogsAllQueryKey,
			});
		},
		onError: async (err) => {
			if (isHttpError(err) && err.status === 409) {
				toast.error(
					"Thông báo này đã được đưa vào hàng đợi hoặc không còn ở trạng thái lỗi.",
				);
				await queryClient.invalidateQueries({
					queryKey: notificationLogsAllQueryKey,
				});
				return;
			}
			toast.error("Không thể gửi lại thông báo. Vui lòng thử lại.");
		},
	});

	const bulkResendMutation = useMutation({
		mutationFn: () =>
			resendFailedNotifications({
				...(searchParams.q ? { q: searchParams.q } : {}),
				...(eventFilter !== "all" ? { event: eventFilter } : {}),
			}),
		onSuccess: async (res) => {
			setConfirmBulkOpen(false);
			const info = formatResendToast(res);
			if (info.kind === "error") {
				toast.error(info.message);
			} else {
				toast.success(info.message);
			}
			await queryClient.invalidateQueries({
				queryKey: notificationLogsAllQueryKey,
			});
		},
		onError: () => {
			toast.error("Không thể gửi lại các thông báo lỗi. Vui lòng thử lại.");
		},
	});

	function applyFilters(next: {
		q: string;
		event: "all" | NotificationEventGroup;
		status: "all" | NotificationStatus;
		page: number;
	}) {
		lastEmittedQuery.current = next.q;
		void navigate({
			to: "/notifications",
			search: filtersToSearch(next.q, next.event, next.status, next.page),
			replace: true,
		});
	}

	// q đổi từ phía URL (back/forward, link chia sẻ) → synced xuống state.
	useEffect(() => {
		const urlQ = searchParams.q ?? "";
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [searchParams.q]);

	// Ngừng gõ 300ms → đẩy q lên URL (reload/share giữ được từ khóa).
	useEffect(() => {
		const timer = setTimeout(() => {
			if (query === lastEmittedQuery.current) return;
			lastEmittedQuery.current = query;
			applyFilters({
				q: query,
				event: eventFilter,
				status: statusFilter,
				page: 1,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [query, eventFilter, statusFilter, navigate]);

	const rows = data?.rows ?? [];
	const total = data?.total ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / NOTIFICATION_LOGS_PAGE_SIZE));

	// Badge đếm chip trạng thái: server trả counts trên bộ lọc q + event.
	const statusChipCounts = (() => {
		if (!data) return undefined;
		const counts: Record<string, number> = {};
		for (const filter of NOTIFICATION_STATUS_FILTERS) {
			if (filter.id === "all") {
				counts[filter.label] = data.counts.all;
			} else {
				counts[filter.label] = data.counts[filter.id];
			}
		}
		return counts;
	})();

	const selectedEventLabel =
		NOTIFICATION_EVENT_FILTERS.find((f) => f.id === eventFilter)?.label ??
		"Tất cả";
	const selectedStatusLabel =
		NOTIFICATION_STATUS_FILTERS.find((f) => f.id === statusFilter)?.label ??
		"Tất cả";

	if (isPending) {
		return (
			<Card variant="white" className="mt-10">
				Đang tải nhật ký thông báo…
			</Card>
		);
	}

	if (error) {
		return (
			<Card variant="white" className="mx-auto mt-10 max-w-md text-center">
				<p className="text-foreground text-sm">
					Không tải được nhật ký thông báo. Thử tải lại trang.
				</p>
			</Card>
		);
	}

	const failedCount = data?.counts.failed ?? 0;
	const isResending =
		singleResendMutation.isPending || bulkResendMutation.isPending;
	const hasActiveFilter =
		Boolean(searchParams.q?.trim()) ||
		eventFilter !== "all" ||
		statusFilter !== "all";
	const showGlobalEmptyState =
		(data?.counts.all ?? 0) === 0 && !hasActiveFilter;

	return (
		<div className="min-w-0">
			<PageHead
				kicker={`${total} thông báo`}
				title="Nhật ký gửi thông báo (Email & In-app)"
				lead="Lịch sử gửi thông báo cho học viên qua email và trong ứng dụng: trạng thái gửi, thời gian gửi và lỗi nếu có."
				action={
					failedCount > 0 ? (
						<Button
							variant="secondary"
							size="sm"
							disabled={isResending}
							onClick={() => setConfirmBulkOpen(true)}
						>
							<RotateCcw aria-hidden="true" className="size-4" />
							<span>{`Gửi lại tất cả mục lỗi (${failedCount})`}</span>
						</Button>
					) : undefined
				}
			/>

			{showGlobalEmptyState ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="notifications-empty-state"
				>
					<h2 className="font-semibold text-foreground text-lg">
						Chưa có thông báo nào
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
						Khi hệ thống gửi thông báo mời vào lớp, trả điểm, học phí hoặc đổi
						lịch cho học viên, nhật ký gửi sẽ xuất hiện tại đây.
					</p>
				</Card>
			) : (
				<div className="flex min-w-0 flex-col gap-4">
					<Card className="flex flex-col gap-4 p-5">
						<div>
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Tìm theo học viên, email hoặc tiêu đề…"
								aria-label="Tìm theo học viên, email hoặc tiêu đề"
								className={inputCls}
							/>
						</div>

						<div className="flex flex-wrap gap-6">
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-foreground text-xs">
									Nhóm sự kiện
								</span>
								<ChipFilter
									options={EVENT_OPTIONS}
									value={selectedEventLabel}
									onChange={(label) => {
										const next =
											NOTIFICATION_EVENT_FILTERS.find((f) => f.label === label)
												?.id ?? "all";
										applyFilters({
											q: query,
											event: next,
											status: statusFilter,
											page: 1,
										});
									}}
									ariaLabel="Nhóm sự kiện"
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-foreground text-xs">
									Trạng thái
								</span>
								<ChipFilter
									options={STATUS_OPTIONS}
									value={selectedStatusLabel}
									onChange={(label) => {
										const next =
											NOTIFICATION_STATUS_FILTERS.find((f) => f.label === label)
												?.id ?? "all";
										applyFilters({
											q: query,
											event: eventFilter,
											status: next,
											page: 1,
										});
									}}
									ariaLabel="Trạng thái"
									counts={statusChipCounts}
								/>
							</div>
						</div>
					</Card>

					{rows.length === 0 ? (
						<Card variant="white" className="p-8 text-center">
							<p className="text-muted-foreground text-sm">
								Không có thông báo nào phù hợp với bộ lọc.
							</p>
						</Card>
					) : (
						<>
							{/* 375px: bảng cuộn ngang trong container, không cuộn trang. */}
							<div
								className="min-w-0 overflow-x-auto"
								data-testid="notifications-table"
							>
								<DataTable
									headers={[
										"Thời gian",
										"Người nhận",
										"Sự kiện",
										"Kênh",
										"Trạng thái",
										"",
									]}
									emptyMessage="Chưa có thông báo."
									rows={rows.map((row) => {
										const deliveryError =
											row.status === "failed"
												? formatDeliveryError(row.lastError, row.retryCount)
												: null;
										return {
											cells: [
												<span
													key="time"
													className="whitespace-nowrap text-muted-foreground text-xs tabular-nums"
												>
													{fmtWhen(row.createdAt)}
												</span>,
												<div key="recipient" className="min-w-[140px]">
													<div className="font-medium text-sm">
														{row.recipientName}
													</div>
													{row.recipientEmail && (
														<div className="text-muted-foreground text-xs">
															{row.recipientEmail}
														</div>
													)}
													{deliveryError && (
														<p
															className="mt-0.5 max-w-[260px] break-words text-destructive text-xs"
															title={deliveryError.fullText}
														>
															{deliveryError.shortText}
														</p>
													)}
												</div>,
												<span key="event" className="whitespace-nowrap text-sm">
													{EVENT_TYPE_LABELS[row.eventType] ?? row.eventType}
												</span>,
												<span
													key="channel"
													className="whitespace-nowrap text-sm"
												>
													{CHANNEL_LABELS[row.channels] ?? row.channels}
												</span>,
												<div key="status" className="whitespace-nowrap">
													<StatusTag
														tone={
															row.status === "failed"
																? "danger"
																: row.status === "queued"
																	? "warn"
																	: "ok"
														}
													>
														{NOTIFICATION_STATUS_LABELS[row.status]}
													</StatusTag>
												</div>,
												<div
													key="action"
													className="flex items-center justify-end gap-1.5 whitespace-nowrap"
												>
													{row.status === "failed" && (
														<Button
															variant="outline"
															size="sm"
															disabled={isResending}
															aria-label={`Gửi lại thông báo cho ${row.recipientName}`}
															onClick={() =>
																singleResendMutation.mutate(row.id)
															}
														>
															<RotateCcw
																aria-hidden="true"
																className="size-3.5"
															/>
															<span>Gửi lại</span>
														</Button>
													)}
													<Button
														variant="secondary"
														size="sm"
														aria-label={`Xem chi tiết thông báo cho ${row.recipientName}`}
														onClick={() => setDetailRow(row)}
													>
														<Eye aria-hidden="true" className="size-4" />
													</Button>
												</div>,
											],
										};
									})}
								/>
							</div>

							{/* Phân trang server-side — ?page sống trên URL. */}
							<div className="flex items-center justify-between gap-2">
								<p
									aria-live="polite"
									className="text-muted-foreground text-xs tabular-nums"
								>
									Trang {page} / {pageCount} · {total} thông báo
									{isFetching ? " · đang cập nhật…" : ""}
								</p>
								<div className="flex gap-2">
									<Button
										variant="secondary"
										size="sm"
										disabled={page <= 1}
										aria-label="Trang trước"
										onClick={() =>
											applyFilters({
												q: query,
												event: eventFilter,
												status: statusFilter,
												page: page - 1,
											})
										}
									>
										Trang trước
									</Button>
									<Button
										variant="secondary"
										size="sm"
										disabled={page >= pageCount}
										aria-label="Trang sau"
										onClick={() =>
											applyFilters({
												q: query,
												event: eventFilter,
												status: statusFilter,
												page: page + 1,
											})
										}
									>
										Trang sau
									</Button>
								</div>
							</div>
						</>
					)}
				</div>
			)}

			{detailRow && (
				<NotificationDetailDialog
					row={detailRow}
					open
					onClose={() => setDetailRow(null)}
				/>
			)}

			<Modal
				open={confirmBulkOpen}
				onClose={
					bulkResendMutation.isPending
						? () => undefined
						: () => setConfirmBulkOpen(false)
				}
				title="Gửi lại tất cả thông báo lỗi?"
				footer={
					<>
						<Button
							variant="secondary"
							size="sm"
							disabled={bulkResendMutation.isPending}
							onClick={() => setConfirmBulkOpen(false)}
						>
							Hủy
						</Button>
						<Button
							variant="primary"
							size="sm"
							disabled={bulkResendMutation.isPending}
							onClick={() => bulkResendMutation.mutate()}
						>
							Xác nhận gửi lại
						</Button>
					</>
				}
			>
				<p className="text-muted-foreground text-sm">
					{`Đưa ${failedCount} thông báo lỗi trong bộ lọc hiện tại về hàng đợi để gửi lại Email. Thông báo In-app trên cổng học viên không bị gửi trùng.`}
				</p>
			</Modal>
		</div>
	);
}
