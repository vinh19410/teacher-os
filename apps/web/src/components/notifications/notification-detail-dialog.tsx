import type { NotificationLogRow } from "@teacher-os/api/contracts";
import { Modal } from "@/components/ui/modal";

/** Nhãn tiếng Việt của trạng thái — dùng chung với bảng (export cho test). */
export const NOTIFICATION_STATUS_LABELS: Record<
	NotificationLogRow["status"],
	string
> = {
	queued: "Đang chờ",
	sent: "Đã gửi",
	read: "Đã xem",
	failed: "Lỗi gửi",
};

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="font-medium text-muted-foreground text-xs">{label}</div>
			<div className="mt-0.5 whitespace-pre-wrap text-foreground text-sm">
				{children}
			</div>
		</div>
	);
}

function fmt(iso: string | null): string {
	if (!iso) return "—";
	try {
		return new Intl.DateTimeFormat("vi-VN", {
			timeZone: "Asia/Ho_Chi_Minh",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		}).format(new Date(iso));
	} catch {
		return iso;
	}
}

/**
 * Dialog chi tiết 1 thông báo (#454, phase 5) — nội dung thư email/in-app:
 * tiêu đề, nội dung, Reply-To, tên người gửi, sent_at, read_at, retry_count
 * và last_error (chỉ hiện khi có lỗi).
 */
export function NotificationDetailDialog({
	row,
	open,
	onClose,
}: {
	row: NotificationLogRow;
	open: boolean;
	onClose: () => void;
}) {
	return (
		<Modal open={open} onClose={onClose} title={row.title}>
			<div className="flex flex-col gap-4">
				<div className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
					{row.body}
				</div>
				<Field label="Người nhận">
					{row.recipientName}
					{row.recipientEmail ? ` · ${row.recipientEmail}` : ""}
				</Field>
				<Field label="Người gửi">{row.senderName || "—"}</Field>
				<Field label="Reply-To">{row.replyToEmail || "—"}</Field>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Gửi lúc">{fmt(row.sentAt)}</Field>
					<Field label="Đọc lúc">{fmt(row.readAt)}</Field>
				</div>
				<Field label="Số lần thử lại">{String(row.retryCount)}</Field>
				{row.lastError && <Field label="Lỗi gửi">{row.lastError}</Field>}
			</div>
		</Modal>
	);
}
