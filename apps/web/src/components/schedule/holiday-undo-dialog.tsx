/**
 * Hộp thoại xác nhận "Xóa kỳ nghỉ (Hoàn tác)" (TOS-13 D8, issue #448):
 * hiển thị tên kỳ nghỉ, khoảng ngày, và số buổi sẽ khôi phục / thu hồi dựa
 * trên snapshot (`holidayShifts` + `holidayCancels`). Khi xác nhận gọi
 * `deleteHoliday(id)`:
 * - 200: đóng hộp thoại, refresh snapshot, Toast thành công.
 * - 409 `makeup-touched`: giữ hộp thoại mở, hiển thị danh sách buổi bù đã
 *   bị điểm danh hoặc thay đổi.
 * - 422 `holiday-started`: hiển thị thông báo "Kỳ nghỉ đã bắt đầu".
 */
import type {
	KernelHolidayCancelRow,
	KernelHolidayShiftRow,
	KernelHolidaySummary,
} from "@teacher-os/api/contracts";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { deleteHoliday } from "@/lib/repos/holidays";
import { formatDayMonth } from "@/lib/week-grid";

export interface HolidayUndoDialogProps {
	holiday: KernelHolidaySummary | null;
	shifts?: KernelHolidayShiftRow[];
	cancels?: KernelHolidayCancelRow[];
	classes?: Array<{ id: string; name: string }>;
	onClose: () => void;
	onUndone: () => void;
}

interface TouchedMakeupItem {
	classId: string;
	makeupDate: string;
}

function readErrorDetails(cause: unknown): {
	code: string;
	status?: number;
	touched: TouchedMakeupItem[];
} {
	const code =
		cause != null &&
		typeof cause === "object" &&
		"holidayErrorCode" in cause &&
		typeof cause.holidayErrorCode === "string"
			? cause.holidayErrorCode
			: cause instanceof Error
				? cause.message
				: "request-failed";
	const status =
		cause != null &&
		typeof cause === "object" &&
		"status" in cause &&
		typeof cause.status === "number"
			? cause.status
			: undefined;
	const touched =
		cause != null &&
		typeof cause === "object" &&
		"touched" in cause &&
		Array.isArray(cause.touched)
			? cause.touched.filter(
					(item): item is TouchedMakeupItem =>
						item != null &&
						typeof item === "object" &&
						"classId" in item &&
						typeof item.classId === "string" &&
						"makeupDate" in item &&
						typeof item.makeupDate === "string",
				)
			: [];
	return { code, status, touched };
}

export function HolidayUndoDialog({
	holiday,
	shifts = [],
	cancels = [],
	classes = [],
	onClose,
	onUndone,
}: HolidayUndoDialogProps) {
	const [deleting, setDeleting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [touchedList, setTouchedList] = useState<TouchedMakeupItem[]>([]);

	const holidayId = holiday?.id ?? null;
	useEffect(() => {
		setDeleting(false);
		setErrorMessage(null);
		setTouchedList([]);
	}, [holidayId]);

	if (!holiday) return null;

	const matchingShifts = shifts.filter((s) =>
		s.holidayId
			? s.holidayId === holiday.id
			: holiday.fromDate <= s.originalDate && s.originalDate <= holiday.toDate,
	);
	const matchingCancels = cancels.filter((c) =>
		c.holidayId
			? c.holidayId === holiday.id
			: holiday.fromDate <= c.date && c.date <= holiday.toDate,
	);
	const classNameById = new Map(classes.map((c) => [c.id, c.name]));

	const rangeLabel =
		holiday.fromDate === holiday.toDate
			? formatDayMonth(holiday.fromDate)
			: `${formatDayMonth(holiday.fromDate)} – ${formatDayMonth(holiday.toDate)}`;

	const summaryLabel =
		holiday.mode === "cancel"
			? `Khôi phục ${matchingCancels.length} buổi đã hủy`
			: `Khôi phục ${matchingShifts.length} buổi gốc · Thu hồi ${matchingShifts.length} buổi bù`;

	async function handleConfirm() {
		if (!holiday) return;
		setDeleting(true);
		setErrorMessage(null);
		setTouchedList([]);
		try {
			const res = await deleteHoliday(holiday.id);
			toast.success(
				`Đã xóa kỳ nghỉ «${holiday.name}»: khôi phục ${res.restoredCount} buổi.`,
			);
			onUndone();
			onClose();
		} catch (cause: unknown) {
			const { code, status, touched } = readErrorDetails(cause);
			if (code === "makeup-touched") {
				setTouchedList(touched);
				setErrorMessage(
					touched.length > 0
						? "Không thể hoàn tác vì có buổi học bù đã điểm danh hoặc đã thay đổi:"
						: "Không thể hoàn tác vì lịch học của kỳ nghỉ đã thay đổi.",
				);
			} else if (code === "holiday-started") {
				setErrorMessage("Kỳ nghỉ đã bắt đầu — không thể hoàn tác.");
				toast.error("Kỳ nghỉ đã bắt đầu — không thể hoàn tác.");
			} else if (status === 404) {
				toast.error("Kỳ nghỉ không còn tồn tại.");
				onClose();
			} else {
				setErrorMessage("Không xóa được kỳ nghỉ. Thử lại.");
				toast.error("Không xóa được kỳ nghỉ. Thử lại.");
			}
		} finally {
			setDeleting(false);
		}
	}

	return (
		<Modal
			open={Boolean(holiday)}
			onClose={() => {
				if (!deleting) onClose();
			}}
			title="Xóa kỳ nghỉ (Hoàn tác)"
			footer={
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="secondary"
						onClick={onClose}
						disabled={deleting}
					>
						Hủy bỏ
					</Button>
					<Button
						type="button"
						variant="destructive"
						data-testid="holiday-undo-confirm"
						onClick={() => void handleConfirm()}
						disabled={deleting}
					>
						{deleting ? "Đang hoàn tác…" : "Xác nhận hoàn tác"}
					</Button>
				</div>
			}
		>
			<div className="space-y-3 text-sm" data-testid="holiday-undo-dialog">
				<div>
					<div className="font-semibold text-base">{holiday.name}</div>
					<div className="text-muted-foreground text-xs tabular-nums">
						Khoảng ngày: {rangeLabel}
					</div>
				</div>
				<div
					data-testid="holiday-undo-summary"
					className="rounded-md border bg-muted px-3 py-2 font-medium tabular-nums"
				>
					{summaryLabel}
				</div>
				{errorMessage && (
					<div
						role="alert"
						data-testid="holiday-undo-error"
						className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive-soft px-3 py-2 text-destructive text-xs"
					>
						<p className="font-medium">{errorMessage}</p>
						{touchedList.length > 0 && (
							<ul
								data-testid="holiday-undo-touched"
								className="list-inside list-disc space-y-0.5 tabular-nums"
							>
								{touchedList.map((item) => (
									<li key={`${item.classId}:${item.makeupDate}`}>
										{classNameById.get(item.classId) ?? item.classId} — Buổi bù{" "}
										{formatDayMonth(item.makeupDate)}
									</li>
								))}
							</ul>
						)}
					</div>
				)}
			</div>
		</Modal>
	);
}
