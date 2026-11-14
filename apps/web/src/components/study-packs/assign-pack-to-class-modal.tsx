import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
	KernelHolidaySummary,
	StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fmtDue } from "@/components/assignments/assignment-status";
import { buildStudyPackSchedulePreview } from "@/components/classes/class-study-pack-section";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	DatePickerInput,
	TimeInput24h,
} from "@/components/ui/date-picker-input";
import { Field, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import {
	assignStudyPackToClass,
	fetchClassStudyPacks,
} from "@/lib/repos/study-pack";

const MAX_EXPANDED_HOLIDAY_DAYS = 90;

function expandOrgHolidays(
	holidays: readonly KernelHolidaySummary[],
): { date: string; name: string }[] {
	const result: { date: string; name: string }[] = [];
	for (const holiday of holidays) {
		if (holiday.scope !== "org") continue;
		let cursor = holiday.fromDate;
		for (let i = 0; i < MAX_EXPANDED_HOLIDAY_DAYS; i++) {
			result.push({ date: cursor, name: holiday.name });
			if (cursor >= holiday.toDate) break;
			cursor = addDaysISO(cursor, 1);
		}
	}
	return result;
}

function getAssignErrorMessage(err: unknown): string {
	const status =
		err && typeof err === "object" && "status" in err ? err.status : null;
	const code =
		err && typeof err === "object" && "studyPackErrorCode" in err
			? err.studyPackErrorCode
			: null;
	if (status === 409 && code === "study pack was cancelled") {
		return "Bộ đề này vừa bị huỷ. Vui lòng kiểm tra lại.";
	}
	if (status === 409) {
		return "Bộ đề này đang chạy trên lớp với lịch khác.";
	}
	if (status === 404) {
		return "Không tìm thấy lớp học hoặc bộ đề đã chọn.";
	}
	return "Không thể gán bộ đề. Vui lòng kiểm tra lại.";
}

export interface AssignPackToClassModalProps {
	open: boolean;
	onClose: () => void;
	pack: Pick<
		StudyPackSummaryView,
		"id" | "title" | "dayCount" | "itemCount" | "status"
	>;
	onAssigned?: (classId: string) => void | Promise<void>;
}

/**
 * Modal for assigning the opened study pack to an active class with
 * holiday-aware schedule preview using DatePickerInput and TimeInput24h.
 */
export function AssignPackToClassModal({
	open,
	onClose,
	pack,
	onAssigned,
}: AssignPackToClassModalProps) {
	const { data } = useData();
	const queryClient = useQueryClient();
	const todayVN = vietnamTodayISO();

	const activeClasses = useMemo(
		() => (data.classes ?? []).filter((c) => c.status === "active"),
		[data.classes],
	);

	const [selectedClassId, setSelectedClassId] = useState("");
	const [startDate, setStartDate] = useState(todayVN);
	const [startDateInvalid, setStartDateInvalid] = useState(false);
	const [releaseTime, setReleaseTime] = useState("06:00");
	const [releaseTimeInvalid, setReleaseTimeInvalid] = useState(false);
	const [dueTime, setDueTime] = useState("17:00");
	const [dueTimeInvalid, setDueTimeInvalid] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [assignedClassId, setAssignedClassId] = useState<string | null>(null);

	const wasOpenRef = useRef(false);

	// Reset form state only on closed -> open transitions so live store updates
	// never wipe user inputs or the post-assignment confirmation view.
	useEffect(() => {
		const justOpened = open && !wasOpenRef.current;
		wasOpenRef.current = open;
		if (!justOpened) return;
		setSelectedClassId(activeClasses[0]?.id ?? "");
		setStartDate(vietnamTodayISO());
		setStartDateInvalid(false);
		setReleaseTime("06:00");
		setReleaseTimeInvalid(false);
		setDueTime("17:00");
		setDueTimeInvalid(false);
		setFormError(null);
		setAssignedClassId(null);
	}, [open, activeClasses]);

	// Keep selectedClassId valid if active classes arrive asynchronously or change.
	useEffect(() => {
		if (!open || assignedClassId) return;
		if (
			selectedClassId &&
			activeClasses.some((c) => c.id === selectedClassId)
		) {
			return;
		}
		setSelectedClassId(activeClasses[0]?.id ?? "");
	}, [open, activeClasses, selectedClassId, assignedClassId]);

	const { data: classPacksData, isFetching: loadingClassSchedule } = useQuery({
		queryKey: ["class-study-packs", selectedClassId],
		queryFn: () => fetchClassStudyPacks(selectedClassId),
		enabled: open && selectedClassId !== "",
	});

	const effectiveHolidays = useMemo(() => {
		if (classPacksData?.holidays) return classPacksData.holidays;
		return expandOrgHolidays(data.holidays ?? []);
	}, [classPacksData?.holidays, data.holidays]);

	const alreadyAssigned = useMemo(
		() =>
			Boolean(
				classPacksData?.packs.some(
					(p) => p.packId === pack.id && p.status === "active",
				),
			),
		[classPacksData?.packs, pack.id],
	);

	const schedulePreview = useMemo(
		() =>
			buildStudyPackSchedulePreview(
				startDate,
				pack.dayCount,
				effectiveHolidays,
			),
		[startDate, pack.dayCount, effectiveHolidays],
	);

	const selectedClass = activeClasses.find((c) => c.id === selectedClassId);
	const assignedClass = activeClasses.find((c) => c.id === assignedClassId);
	const invalidTimeOrder =
		!releaseTimeInvalid &&
		!dueTimeInvalid &&
		releaseTime !== "" &&
		dueTime !== "" &&
		releaseTime >= dueTime;

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setFormError(null);
		if (!selectedClassId) {
			setFormError("Vui lòng chọn lớp học.");
			return;
		}
		if (startDateInvalid || !startDate) {
			setFormError("Vui lòng chọn ngày bắt đầu hợp lệ.");
			return;
		}
		if (releaseTimeInvalid || dueTimeInvalid || invalidTimeOrder) {
			setFormError("Giờ hạn nộp phải sau giờ mở bài.");
			return;
		}
		setSubmitting(true);
		try {
			await assignStudyPackToClass(selectedClassId, {
				packId: pack.id,
				startDate,
				releaseTime,
				dueTime,
			});
			await queryClient.invalidateQueries({
				queryKey: ["class-study-packs", selectedClassId],
			});
			toast.success(
				`Đã gán "${pack.title}" cho lớp ${selectedClass?.name ?? ""}.`.trim(),
			);
			setAssignedClassId(selectedClassId);
			await onAssigned?.(selectedClassId);
		} catch (err) {
			setFormError(getAssignErrorMessage(err));
			toast.error("Không thể gán bộ đề.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Gán bộ đề cho lớp"
			description={`${pack.title} (${pack.dayCount} ngày · ${pack.itemCount} bài tập)`}
			scrollableBody
		>
			{assignedClassId ? (
				<div className="space-y-4">
					<div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4 text-success">
						<CheckCircle2 className="mt-0.5 size-5 shrink-0" />
						<div className="space-y-1 text-sm">
							<p className="font-medium">
								Đã gán bộ đề cho lớp {assignedClass?.name ?? assignedClassId}.
							</p>
							<p className="text-xs opacity-90">
								Lịch học {pack.dayCount} ngày bắt đầu từ {fmtDue(startDate)} (
								{releaseTime} – {dueTime}).
							</p>
						</div>
					</div>
					<div className="flex flex-wrap justify-end gap-2">
						<Button type="button" variant="outline" onClick={onClose}>
							Đóng
						</Button>
						<Link
							to="/classes/$classId"
							params={{ classId: assignedClassId }}
							onClick={onClose}
							className={buttonVariants({ variant: "default" })}
						>
							Mở trang lớp học
							<ExternalLink className="size-4" />
						</Link>
					</div>
				</div>
			) : activeClasses.length === 0 ? (
				<div className="space-y-4">
					<p className="text-muted-foreground text-sm">
						Chưa có lớp học nào đang hoạt động để gán bộ đề.
					</p>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" onClick={onClose}>
							Đóng
						</Button>
						<Link
							to="/classes"
							onClick={onClose}
							className={buttonVariants({ variant: "default" })}
						>
							Quản lý lớp học
						</Link>
					</div>
				</div>
			) : (
				<form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
					<Field label="Chọn lớp học" required htmlFor="assign-pack-class">
						<Select
							id="assign-pack-class"
							value={selectedClassId}
							onChange={(e) => {
								setSelectedClassId(e.target.value);
								setFormError(null);
							}}
						>
							{activeClasses.map((cls) => (
								<option key={cls.id} value={cls.id}>
									{cls.name}
									{cls.level ? ` · ${cls.level}` : ""}
								</option>
							))}
						</Select>
					</Field>

					{alreadyAssigned && (
						<p
							role="status"
							className="rounded-md border border-border bg-muted px-3 py-2 text-muted-foreground text-xs"
						>
							Lớp này đang có bộ đề này ở trạng thái Đang chạy. Chọn khung giờ
							khác hoặc kiểm tra tại{" "}
							<Link
								to="/classes/$classId"
								params={{ classId: selectedClassId }}
								onClick={onClose}
								className="font-medium text-foreground underline"
							>
								trang lớp học
							</Link>
							.
						</p>
					)}

					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="assign-pack-start-date"
							className="font-medium text-foreground text-xs"
						>
							Ngày bắt đầu <span className="text-destructive">*</span>
						</label>
						<DatePickerInput
							id="assign-pack-start-date"
							required
							todayISO={todayVN}
							value={startDate}
							onChange={(nextIso) => {
								setStartDate(nextIso);
								setFormError(null);
							}}
							onInvalidChange={setStartDateInvalid}
							aria-invalid={startDateInvalid}
						/>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="assign-pack-release-time"
								className="font-medium text-foreground text-xs"
							>
								Giờ mở bài <span className="text-destructive">*</span>
							</label>
							<TimeInput24h
								id="assign-pack-release-time"
								required
								value={releaseTime}
								onChange={(next) => {
									setReleaseTime(next);
									setFormError(null);
								}}
								onInvalidChange={setReleaseTimeInvalid}
								aria-invalid={releaseTimeInvalid || invalidTimeOrder}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="assign-pack-due-time"
								className="font-medium text-foreground text-xs"
							>
								Giờ hạn nộp <span className="text-destructive">*</span>
							</label>
							<TimeInput24h
								id="assign-pack-due-time"
								required
								value={dueTime}
								onChange={(next) => {
									setDueTime(next);
									setFormError(null);
								}}
								onInvalidChange={setDueTimeInvalid}
								aria-invalid={dueTimeInvalid || invalidTimeOrder}
							/>
						</div>
					</div>

					{schedulePreview.days.length > 0 && (
						<div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
							<div className="flex items-center justify-between gap-2">
								<p className="font-medium text-foreground text-xs">
									Xem trước lịch mở bài ({schedulePreview.days.length} ngày học)
								</p>
								{loadingClassSchedule && (
									<span className="text-muted-foreground text-xs">
										Đang đồng bộ lịch nghỉ…
									</span>
								)}
							</div>
							{schedulePreview.skippedHolidays.length > 0 && (
								<p className="text-muted-foreground text-xs">
									Tự động bỏ qua ngày nghỉ:{" "}
									{schedulePreview.skippedHolidays
										.map((h) => `${fmtDue(h.date)} (${h.name})`)
										.join(", ")}
								</p>
							)}
							<ul className="max-h-36 space-y-1 overflow-y-auto text-xs tabular-nums">
								{schedulePreview.days.map((d) => (
									<li key={d.dayIndex} className="text-muted-foreground">
										Ngày {d.dayIndex} → {fmtDue(d.date)} ({releaseTime} –{" "}
										{dueTime})
									</li>
								))}
							</ul>
						</div>
					)}

					{formError && (
						<p role="alert" className="text-destructive text-sm">
							{formError}
						</p>
					)}

					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" variant="outline" onClick={onClose}>
							Huỷ
						</Button>
						<Button
							type="submit"
							disabled={
								submitting || pack.status !== "ready" || pack.dayCount === 0
							}
							className={cn(submitting && "cursor-wait")}
						>
							{submitting ? "Đang gán…" : "Xác nhận gán bộ đề"}
						</Button>
					</div>
				</form>
			)}
		</Modal>
	);
}
