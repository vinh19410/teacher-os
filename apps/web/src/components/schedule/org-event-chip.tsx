import { useQueryClient } from "@tanstack/react-query";
import type { KernelEventRow } from "@teacher-os/api/contracts";
import { CalendarClock, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { HttpError } from "@/lib/kernel-load-state";
import { deleteEvent } from "@/lib/repos/events";
import { formatDayMonth } from "@/lib/week-grid";

/**
 * Chip sự kiện vận hành (TOS-14, D4): màu trung tính (muted) + icon lịch để
 * tách khỏi ca học; bấm mở chi tiết với nút Xóa (xác nhận 2 bước). Xóa xong
 * chip biến mất ngay — `deleteEvent` cập nhật snapshot cache tại chỗ (D6).
 */
export function OrgEventChip({
	event,
}: {
	event: Pick<
		KernelEventRow,
		"id" | "title" | "date" | "startTime" | "endTime" | "note"
	>;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const close = () => {
		setOpen(false);
		setConfirming(false);
		setDeleting(false);
	};

	const remove = async () => {
		setDeleting(true);
		try {
			await deleteEvent(queryClient, event.id);
			toast.success("Đã xóa sự kiện.");
			close();
		} catch (error) {
			setDeleting(false);
			setConfirming(false);
			if (error instanceof HttpError && error.status === 404) {
				// Đã bị xóa ở nơi khác — cache sẽ tự khớp ở lần refresh sau.
				toast.info("Sự kiện đã không còn tồn tại.");
				close();
				return;
			}
			toast.error("Không xóa được sự kiện — thử lại.");
		}
	};

	return (
		<>
			<button
				type="button"
				data-testid="org-event-chip"
				data-event-id={event.id}
				onClick={() => setOpen(true)}
				title="Sự kiện vận hành — bấm để xem chi tiết"
				className="org-event-chip mt-2 flex w-full cursor-pointer items-center gap-1.5 rounded-lg border border-border border-l-3 border-l-muted-foreground/40 bg-muted px-2.5 py-2 text-left transition-colors hover:bg-muted/70"
			>
				<CalendarClock
					aria-hidden
					className="size-3.5 shrink-0 text-muted-foreground"
				/>
				<span className="text-[11px] text-muted-foreground tabular-nums">
					{event.startTime}
				</span>
				<span className="truncate font-medium text-[13px]">{event.title}</span>
			</button>
			<Modal
				open={open}
				onClose={close}
				title={event.title}
				footer={
					<div className="flex justify-between gap-2">
						{confirming ? (
							<>
								<Button
									type="button"
									variant="outline"
									onClick={() => setConfirming(false)}
								>
									Hủy
								</Button>
								<Button
									type="button"
									variant="destructive"
									onClick={() => void remove()}
									disabled={deleting}
									data-testid="org-event-delete-confirm"
								>
									<Trash2 aria-hidden className="size-4" />
									{deleting ? "Đang xóa…" : "Xóa sự kiện"}
								</Button>
							</>
						) : (
							<>
								<span />
								<Button
									type="button"
									variant="destructive"
									onClick={() => setConfirming(true)}
									data-testid="org-event-delete"
								>
									<Trash2 aria-hidden className="size-4" />
									Xóa
								</Button>
							</>
						)}
					</div>
				}
			>
				<div className="space-y-2 text-sm">
					<p className="text-muted-foreground">
						Sự kiện vận hành · {formatDayMonth(event.date)} ·{" "}
						<span className="tabular-nums">
							{event.startTime}–{event.endTime}
						</span>
					</p>
					{event.note && <p className="whitespace-pre-line">{event.note}</p>}
					<p className="text-muted-foreground text-xs">
						Sự kiện không ảnh hưởng ca học, điểm danh hay nhắc việc.
					</p>
				</div>
			</Modal>
		</>
	);
}
