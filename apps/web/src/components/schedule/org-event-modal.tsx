import { useQueryClient } from "@tanstack/react-query";
import {
	type OrgEventDraft,
	orgEventDraftSchema,
} from "@teacher-os/api/contracts";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { HttpError } from "@/lib/kernel-load-state";
import { createEvent } from "@/lib/repos/events";

/** Thông báo lỗi tiếng Việt theo path lỗi của `orgEventDraftSchema`. */
const DRAFT_ERROR_MESSAGES: Record<string, string> = {
	title: "Tên sự kiện cần 2–100 ký tự.",
	date: "Ngày không hợp lệ (yyyy-mm-dd).",
	startTime: "Giờ bắt đầu không hợp lệ (HH:mm).",
	endTime: "Giờ kết thúc phải sau giờ bắt đầu (HH:mm).",
	note: "Ghi chú tối đa 500 ký tự.",
};

function draftErrors(
	draft: OrgEventDraft,
): Partial<Record<keyof OrgEventDraft, string>> {
	const parsed = orgEventDraftSchema.safeParse(draft);
	if (parsed.success) return {};
	const errors: Partial<Record<keyof OrgEventDraft, string>> = {};
	for (const issue of parsed.error.issues) {
		const path = String(issue.path[0] ?? "");
		errors[path as keyof OrgEventDraft] ??=
			DRAFT_ERROR_MESSAGES[path] ?? "Dữ liệu chưa hợp lệ.";
	}
	return errors;
}

/**
 * Hộp thoại tạo sự kiện vận hành (TOS-14, D3/D6): lỗi inline theo
 * `orgEventDraftSchema` (một nguồn luật với server), tạo xong sự kiện hiển thị
 * ngay trong view đang mở — `createEvent` cập nhật snapshot cache tại chỗ,
 * không refetch toàn bộ snapshot.
 */
export function OrgEventModal({
	open,
	defaultDate,
	onClose,
}: {
	open: boolean;
	/** Ngày neo mặc định của view đang mở (yyyy-mm-dd). */
	defaultDate: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [title, setTitle] = useState("");
	const [date, setDate] = useState(defaultDate);
	const [startTime, setStartTime] = useState("");
	const [endTime, setEndTime] = useState("");
	const [note, setNote] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const draft: OrgEventDraft = { title, date, startTime, endTime, note };
	const errors = draftErrors(draft);
	const invalid = Object.keys(errors).length > 0;
	// Lỗi inline chỉ hiện sau lần submit đầu (hoặc khi đã gõ xong một trường
	// có nội dung) — không xát lỗi vào người dùng đang nhập.
	const showError = (field: keyof OrgEventDraft): string | undefined =>
		submitted || title.length > 0 ? errors[field] : undefined;

	const reset = () => {
		setTitle("");
		setDate(defaultDate);
		setStartTime("");
		setEndTime("");
		setNote("");
		setSubmitted(false);
		setServerError(null);
		setSaving(false);
	};

	const close = () => {
		onClose();
		reset();
	};

	const submit = async () => {
		setSubmitted(true);
		if (invalid || saving) return;
		setSaving(true);
		setServerError(null);
		try {
			await createEvent(queryClient, {
				...draft,
				title: draft.title.trim(),
				note: draft.note,
			});
			toast.success("Đã tạo sự kiện vận hành.");
			close();
		} catch (error) {
			setSaving(false);
			if (error instanceof HttpError) {
				if (error.status >= 400 && error.status < 500) {
					setServerError(
						error.reason === "invalid body"
							? "Dữ liệu chưa hợp lệ — kiểm tra lại các trường."
							: `Không tạo được sự kiện (${error.status}).`,
					);
					return;
				}
			}
			toast.error("Không tạo được sự kiện — thử lại.");
		}
	};

	return (
		<Modal
			open={open}
			onClose={close}
			title="Tạo sự kiện vận hành"
			footer={
				<div className="flex justify-end gap-2">
					<Button type="button" variant="outline" onClick={close}>
						Hủy
					</Button>
					<Button
						type="submit"
						form="org-event-form"
						disabled={saving}
						data-testid="org-event-submit"
					>
						<CalendarPlus aria-hidden className="size-4" />
						{saving ? "Đang tạo…" : "Tạo sự kiện"}
					</Button>
				</div>
			}
		>
			<form
				id="org-event-form"
				className="gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}
			>
				<Field
					label="Tên sự kiện *"
					htmlFor="org-event-title"
					error={showError("title")}
					help="Ví dụ: Họp chuyên môn giáo viên."
				>
					<input
						id="org-event-title"
						className={inputCls}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						aria-invalid={Boolean(showError("title"))}
						maxLength={200}
					/>
				</Field>
				<Field
					label="Ngày *"
					htmlFor="org-event-date"
					error={showError("date")}
				>
					<input
						id="org-event-date"
						type="date"
						className={inputCls}
						value={date}
						onChange={(e) => setDate(e.target.value)}
						aria-invalid={Boolean(showError("date"))}
					/>
				</Field>
				<div className="grid grid-cols-2 gap-4">
					<Field
						label="Từ giờ *"
						htmlFor="org-event-start"
						error={showError("startTime")}
					>
						<input
							id="org-event-start"
							type="time"
							className={inputCls}
							value={startTime}
							onChange={(e) => setStartTime(e.target.value)}
							aria-invalid={Boolean(showError("startTime"))}
						/>
					</Field>
					<Field
						label="Đến giờ *"
						htmlFor="org-event-end"
						error={showError("endTime")}
					>
						<input
							id="org-event-end"
							type="time"
							className={inputCls}
							value={endTime}
							onChange={(e) => setEndTime(e.target.value)}
							aria-invalid={Boolean(showError("endTime"))}
						/>
					</Field>
				</div>
				<Field
					label="Ghi chú"
					htmlFor="org-event-note"
					error={showError("note")}
					help="Tùy chọn, tối đa 500 ký tự."
				>
					<textarea
						id="org-event-note"
						className={`${inputCls} h-20 py-2`}
						value={note}
						onChange={(e) => setNote(e.target.value)}
						aria-invalid={Boolean(showError("note"))}
						maxLength={600}
					/>
				</Field>
				{serverError && (
					<p role="alert" className="text-destructive text-sm">
						{serverError}
					</p>
				)}
			</form>
		</Modal>
	);
}
