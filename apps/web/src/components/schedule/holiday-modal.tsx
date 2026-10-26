/**
 * Hộp thoại "Tạo lịch nghỉ" trên /schedule (TOS-11, màn 3 wireframe). Nhập
 * tên (2–100), Từ/Đến ngày (≤ 30 ngày, không quá khứ), phạm vi (toàn tổ chức
 * | lớp chọn), phương thức Dời lịch. Bảng xem trước debounce 300ms khi form
 * hợp lệ; xác nhận gọi apply kèm `planHash` (I7); 409 `stale-preview` → tải
 * lại preview và báo lịch vừa thay đổi.
 */
import {
	HOLIDAY_MAX_DAYS,
	type HolidayDraft,
	type HolidayPreview,
	holidayDraftSchema,
} from "@teacher-os/api/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChipMulti } from "@/components/ui/chip-multi";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { applyHoliday, previewHoliday } from "@/lib/repos/holidays";
import { formatDayMonth, todayISOVietnam } from "@/lib/week-grid";
import { HolidayPreviewTable } from "./holiday-preview-table";

export interface HolidayModalClassOption {
	id: string;
	name: string;
}

export function HolidayModal({
	open,
	classes,
	onClose,
	onApplied,
}: {
	open: boolean;
	/** Lớp đang mở của tổ chức — cho radio "Chọn lớp học cụ thể". */
	classes: HolidayModalClassOption[];
	onClose: () => void;
	/** Gọi sau khi apply thành công (đã refresh snapshot bên ngoài). */
	onApplied: (shiftedCount: number) => void;
}) {
	const [name, setName] = useState("");
	const [fromDate, setFromDate] = useState("");
	const [toDate, setToDate] = useState("");
	const [scope, setScope] = useState<"org" | "classes">("org");
	const [classIds, setClassIds] = useState<string[]>([]);
	const [notify, setNotify] = useState(true);
	const [preview, setPreview] = useState<HolidayPreview | null>(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [applying, setApplying] = useState(false);
	const previewSeq = useRef(0);

	// Parse reactive — cùng schema contract server, lỗi inline hiện ngay.
	const parsed = useMemo(
		() =>
			holidayDraftSchema.safeParse({
				name,
				fromDate,
				toDate,
				scope,
				classIds,
				mode: "shift",
				notify,
			}),
		[name, fromDate, toDate, scope, classIds, notify],
	);
	const draft: HolidayDraft | null = parsed.success ? parsed.data : null;
	const draftRef = useRef<HolidayDraft | null>(null);
	draftRef.current = draft;
	const previewKey = draft
		? `${draft.fromDate}|${draft.toDate}|${draft.scope}|${draft.classIds.join(",")}`
		: null;

	useEffect(() => {
		if (!open) {
			previewSeq.current += 1;
			setName("");
			setFromDate("");
			setToDate("");
			setScope("org");
			setClassIds([]);
			setNotify(true);
			setPreview(null);
			setPreviewError(null);
			setApplying(false);
			return;
		}
		// Modal.tsx chuyển focus vào phần tử focusable đầu tiên (nút Đóng) trong
		// 1 rAF; lồng rAF thứ 2 để đặt focus vào ô Tên kỳ nghỉ theo AC bàn phím.
		const raf1 = requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				document
					.querySelector<HTMLInputElement>('[data-testid="holiday-name"]')
					?.focus();
			});
		});
		return () => cancelAnimationFrame(raf1);
	}, [open]);

	// Debounce 300ms — chỉ gọi preview khi form hợp lệ và các trường quyết định
	// lịch (fromDate/toDate/scope/classIds) thay đổi; sửa `name` (khi vẫn hợp lệ)
	// hoặc đổi `notify` không bắn lại request preview.
	useEffect(() => {
		if (!open || !previewKey || !draftRef.current) {
			previewSeq.current += 1;
			setPreview(null);
			setPreviewError(null);
			setPreviewLoading(false);
			return;
		}
		const seq = previewSeq.current + 1;
		previewSeq.current = seq;
		setPreviewLoading(true);
		const timer = setTimeout(() => {
			const currentDraft = draftRef.current;
			if (!currentDraft) return;
			previewHoliday(currentDraft)
				.then((result) => {
					if (previewSeq.current === seq) {
						setPreview(result);
						setPreviewError(null);
					}
				})
				.catch((cause: unknown) => {
					if (previewSeq.current === seq) {
						setPreview(null);
						setPreviewError(
							cause instanceof Error
								? cause.message
								: "Không tải được bảng xem trước",
						);
					}
				})
				.finally(() => {
					if (previewSeq.current === seq) setPreviewLoading(false);
				});
		}, 300);
		return () => clearTimeout(timer);
	}, [open, previewKey]);

	const today = todayISOVietnam();
	const nameError =
		name.trim().length > 0 &&
		(name.trim().length < 2 || name.trim().length > 100)
			? `Tên từ 2–100 ký tự (đang ${name.trim().length})`
			: undefined;
	const rangeError =
		fromDate && toDate && toDate < fromDate
			? "Ngày kết thúc phải từ ngày bắt đầu trở đi"
			: fromDate &&
					toDate &&
					(Date.parse(`${toDate}T00:00:00Z`) -
						Date.parse(`${fromDate}T00:00:00Z`)) /
						86_400_000 +
						1 >
						HOLIDAY_MAX_DAYS
				? `Khoảng nghỉ tối đa ${HOLIDAY_MAX_DAYS} ngày`
				: undefined;
	const classIdsError =
		scope === "classes" && classIds.length === 0
			? "Chọn ít nhất một lớp"
			: undefined;
	const formValid = parsed.success;

	const canConfirm =
		formValid &&
		!previewLoading &&
		preview !== null &&
		preview.shifts.length > 0 &&
		!applying;

	async function confirm() {
		if (!draft || !preview) return;
		setApplying(true);
		try {
			const result = await applyHoliday(draft, preview.planHash);
			toast.success(
				`Đã dời ${result.shiftedCount} buổi của ${result.classCount} lớp.`,
			);
			onApplied(result.shiftedCount);
			onClose();
		} catch (cause: unknown) {
			const code = cause instanceof Error ? cause.message : "request-failed";
			if (code === "stale-preview") {
				toast.error("Lịch vừa thay đổi, kiểm tra lại bảng xem trước.");
				if (draft) {
					const seq = previewSeq.current + 1;
					previewSeq.current = seq;
					setPreviewLoading(true);
					previewHoliday(draft)
						.then((result) => {
							if (previewSeq.current === seq) {
								setPreview(result);
								setPreviewError(null);
							}
						})
						.catch((reloadCause: unknown) => {
							if (previewSeq.current === seq) {
								setPreview(null);
								setPreviewError(
									reloadCause instanceof Error
										? reloadCause.message
										: "Không tải được bảng xem trước",
								);
							}
						})
						.finally(() => {
							if (previewSeq.current === seq) setPreviewLoading(false);
						});
				}
			} else if (code === "past-range") {
				toast.error("Khoảng ngày đã qua — chỉ dời buổi chưa diễn ra.");
			} else if (code === "no-sessions") {
				toast.error("Không có buổi học nào trong khoảng ngày đã chọn.");
			} else if (code === "too-large") {
				toast.error("Phạm vi quá lớn — chọn ít lớp hoặc khoảng ngắn hơn.");
			} else {
				toast.error("Không áp dụng được lịch nghỉ. Thử lại.");
			}
		} finally {
			setApplying(false);
		}
	}

	return (
		<Modal open={open} onClose={onClose} title="Tạo lịch nghỉ">
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					if (canConfirm) void confirm();
				}}
			>
				<Field
					label="Tên kỳ nghỉ"
					required
					error={nameError}
					help={`${name.trim().length}/100`}
				>
					<Input
						autoFocus
						data-testid="holiday-name"
						value={name}
						maxLength={120}
						onChange={(e) => setName(e.target.value)}
						placeholder="Nghỉ lễ 20/11"
					/>
				</Field>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Field label="Từ ngày" required error={rangeError}>
						<Input
							type="date"
							data-testid="holiday-from"
							min={today}
							value={fromDate}
							onChange={(e) => setFromDate(e.target.value)}
						/>
					</Field>
					<Field label="Đến ngày" required error={rangeError}>
						<Input
							type="date"
							data-testid="holiday-to"
							min={fromDate || today}
							value={toDate}
							onChange={(e) => setToDate(e.target.value)}
						/>
					</Field>
				</div>
				<fieldset className="flex flex-col gap-2">
					<legend className="font-medium text-sm">Phạm vi</legend>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="holiday-scope"
							checked={scope === "org"}
							onChange={() => setScope("org")}
						/>
						Toàn bộ tổ chức
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="holiday-scope"
							checked={scope === "classes"}
							onChange={() => setScope("classes")}
						/>
						Chọn lớp học cụ thể
					</label>
					{scope === "classes" && (
						<fieldset aria-label="Chọn lớp học cụ thể">
							<ChipMulti
								options={classes.map((cls) => ({
									value: cls.id,
									label: cls.name,
								}))}
								value={classIds}
								onChange={setClassIds}
							/>
						</fieldset>
					)}
					{classIdsError && (
						<p className="text-destructive text-xs" role="alert">
							{classIdsError}
						</p>
					)}
				</fieldset>
				<fieldset className="flex flex-col gap-1">
					<legend className="font-medium text-sm">Phương thức</legend>
					<label className="flex items-center gap-2 text-sm">
						<input type="radio" name="holiday-mode" checked readOnly />
						Dời lịch (+1 buổi vào cuối khóa)
					</label>
				</fieldset>

				<HolidayPreviewTable
					preview={preview}
					loading={previewLoading}
					error={previewError}
				/>

				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={notify}
						onChange={(e) => setNotify(e.target.checked)}
					/>
					Gửi thông báo
				</label>

				<div className="flex justify-end gap-2 border-border border-t border-solid pt-4">
					<Button type="button" variant="secondary" onClick={onClose}>
						Hủy bỏ
					</Button>
					<Button type="submit" disabled={!canConfirm}>
						{applying ? "Đang áp dụng…" : "Xác nhận áp dụng & Dời buổi"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}

/** Nhãn "Đã dời sang dd/MM" cho block lịch tuần — export thuần để test. */
export function makeupLabel(makeupDate: string): string {
	return `Đã dời sang ${formatDayMonth(makeupDate)}`;
}
