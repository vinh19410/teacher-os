import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import {
	addDaysISO,
	formatVietnamTimeHHMM,
	parseTimeHHMM,
	vietnamDateTimeMs,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DatePickerInput,
	TimeInput24h,
} from "@/components/ui/date-picker-input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import type {
	AssignmentPrompt,
	ClassAssignment,
	ClassGroup,
} from "@/lib/mock-data";
import { fmtDayMonth, fmtDueDisplay } from "./assignment-status";

const MAX_STUDENTS_PER_ASSIGN = 100;

interface ClassFailureEntry {
	classId: string;
	className: string;
	message: string;
	outcomeUnknown?: boolean;
}

export interface AssignPromptToClassesModalProps {
	open: boolean;
	prompt: AssignmentPrompt | null;
	classes: readonly ClassGroup[];
	classAssignments: readonly ClassAssignment[];
	onClose: () => void;
	onAssigned: (assignedCount: number, dueDisplay: string) => void;
}

export function AssignPromptToClassesModal({
	open,
	prompt,
	classes,
	classAssignments,
	onClose,
	onAssigned,
}: AssignPromptToClassesModalProps) {
	const { dispatch, refresh } = useData();
	const [validationNowMs, setValidationNowMs] = useState(() => Date.now());
	const effectiveNowMs = validationNowMs;
	const todayVN = vietnamTodayISO(new Date(effectiveNowMs));

	const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
	const [due, setDue] = useState<string>(() => addDaysISO(todayVN, 7));
	const [dueTime, setDueTime] = useState<string>("21:00");
	const [dueDateInvalid, setDueDateInvalid] = useState(false);
	const [dueTimeInvalid, setDueTimeInvalid] = useState(false);
	const [touched, setTouched] = useState({
		class: false,
		date: false,
		time: false,
	});
	const [submitAllErrors, setSubmitAllErrors] = useState(false);
	const [saving, setSaving] = useState(false);
	const [formResetKey, setFormResetKey] = useState(0);
	const [failedEntries, setFailedEntries] = useState<ClassFailureEntry[]>([]);
	const [syncPendingNotice, setSyncPendingNotice] = useState(false);
	const pendingSyncMetaRef = useRef<{
		count: number;
		dueDisplay: string;
	} | null>(null);

	const errSummaryRef = useRef<HTMLDivElement>(null);
	const classListRef = useRef<HTMLFieldSetElement>(null);
	const dueDateRef = useRef<HTMLInputElement>(null);
	const dueTimeRef = useRef<HTMLInputElement>(null);

	const wasOpenRef = useRef(false);
	useEffect(() => {
		if (open && !wasOpenRef.current) {
			const freshNowMs = Date.now();
			const freshTodayVN = vietnamTodayISO(new Date(freshNowMs));
			setValidationNowMs(freshNowMs);
			setSelectedClassIds([]);
			setDue(addDaysISO(freshTodayVN, 7));
			setDueTime("21:00");
			setDueDateInvalid(false);
			setDueTimeInvalid(false);
			setTouched({ class: false, date: false, time: false });
			setSubmitAllErrors(false);
			setSaving(false);
			setFailedEntries([]);
			setSyncPendingNotice(false);
			pendingSyncMetaRef.current = null;
			setFormResetKey((k) => k + 1);
		}
		wasOpenRef.current = open;
	}, [open]);

	const assignedByClassId = useMemo(() => {
		const map = new Map<string, ClassAssignment>();
		if (!prompt) return map;
		for (const ca of classAssignments) {
			if (ca.promptId !== prompt.id) continue;
			const prev = map.get(ca.classId);
			if (!prev || ca.createdAt > prev.createdAt) {
				map.set(ca.classId, ca);
			}
		}
		return map;
	}, [classAssignments, prompt]);

	const classRows = useMemo(() => {
		return classes.map((cls) => {
			const existing = assignedByClassId.get(cls.id);
			const isPaused = cls.status === "paused";
			const activeCount = cls.studentIds.length;
			const invitedCount = cls.invitedStudentIds.length;
			let disabledReason: string | null = null;
			if (existing) {
				disabledReason = `Đã giao · hạn ${fmtDayMonth(existing.due)}`;
			} else if (isPaused) {
				disabledReason = "Lớp đang tạm dừng";
			} else if (activeCount === 0) {
				disabledReason =
					invitedCount > 0
						? `Chưa có học viên hoạt động (${invitedCount} chờ tham gia)`
						: "Chưa có học viên trong lớp";
			}
			return {
				cls,
				disabled: Boolean(disabledReason),
				subtitle:
					disabledReason ??
					(activeCount > MAX_STUDENTS_PER_ASSIGN
						? `${activeCount} học viên · giao ${MAX_STUDENTS_PER_ASSIGN} HV đầu`
						: `${activeCount} học viên`),
			};
		});
	}, [classes, assignedByClassId]);

	const enabledClassIdSet = useMemo(
		() => new Set(classRows.filter((r) => !r.disabled).map((r) => r.cls.id)),
		[classRows],
	);

	const validSelectedIds = useMemo(
		() => selectedClassIds.filter((id) => enabledClassIdSet.has(id)),
		[selectedClassIds, enabledClassIdSet],
	);

	const dueValidDate =
		!dueDateInvalid && Boolean(due && parseStartDateStrict(due) !== null);
	const dueTimeValid =
		!dueTimeInvalid && Boolean(dueTime && parseTimeHHMM(dueTime) !== null);
	const dueAtMs =
		dueValidDate && dueTimeValid ? vietnamDateTimeMs(due, dueTime) : Number.NaN;
	const dueAtIso = Number.isFinite(dueAtMs)
		? new Date(dueAtMs).toISOString()
		: null;
	const dueDateNotPast = dueValidDate && due >= todayVN;
	const dueTimeNotPast =
		dueDateNotPast &&
		(due > todayVN ||
			dueTime === "23:59" ||
			(Number.isFinite(dueAtMs) && dueAtMs > effectiveNowMs));

	const errors = useMemo(() => {
		const e: { class?: string; date?: string; time?: string } = {};
		if (validSelectedIds.length === 0) {
			e.class = "Chọn ít nhất một lớp để giao đề.";
		}
		if (dueDateInvalid || !due) {
			e.date = "Nhập ngày theo dạng dd/mm/yyyy, ví dụ 05/12/2026.";
		} else if (!dueDateNotPast) {
			e.date = "Hạn nộp phải từ hôm nay trở đi.";
		}
		if (dueTimeInvalid || !dueTime) {
			e.time = "Nhập giờ dạng 24h HH:mm, ví dụ 21:00.";
		} else if (dueDateNotPast && !dueTimeNotPast) {
			e.time = "Giờ hạn nộp phải sau thời điểm hiện tại.";
		}
		return e;
	}, [
		validSelectedIds.length,
		dueDateInvalid,
		due,
		dueDateNotPast,
		dueTimeInvalid,
		dueTime,
		dueTimeNotPast,
	]);

	const showClassErr = Boolean(
		errors.class && (submitAllErrors || touched.class),
	);
	const showDateErr = Boolean(errors.date && (submitAllErrors || touched.date));
	const showTimeErr = Boolean(errors.time && (submitAllErrors || touched.time));

	const errorEntries: Array<{
		key: "class" | "date" | "time";
		message: string;
	}> = [];
	if (submitAllErrors && errors.class) {
		errorEntries.push({ key: "class", message: errors.class });
	}
	if (submitAllErrors && errors.date) {
		errorEntries.push({ key: "date", message: errors.date });
	}
	if (submitAllErrors && errors.time) {
		errorEntries.push({ key: "time", message: errors.time });
	}

	function focusField(key: "class" | "date" | "time") {
		if (key === "class") {
			const firstEnabled =
				classListRef.current?.querySelector<HTMLInputElement>(
					'input[type="checkbox"]:not(:disabled)',
				);
			firstEnabled?.focus();
		} else if (key === "date") {
			dueDateRef.current?.focus();
		} else {
			dueTimeRef.current?.focus();
		}
	}

	function handleRequestClose() {
		if (saving) return;
		onClose();
	}

	function handleToggleClass(classId: string, checked: boolean) {
		setTouched((t) => ({ ...t, class: true }));
		setFailedEntries((prev) => prev.filter((item) => item.classId !== classId));
		setSelectedClassIds((prev) => {
			if (checked) {
				return prev.includes(classId) ? prev : [...prev, classId];
			}
			return prev.filter((id) => id !== classId);
		});
	}

	function applyQuickDate(daysOffset: number) {
		const freshNowMs = Date.now();
		const freshTodayVN = vietnamTodayISO(new Date(freshNowMs));
		setValidationNowMs(freshNowMs);
		setDue(addDaysISO(freshTodayVN, daysOffset));
		setDueDateInvalid(false);
		setTouched((t) => ({ ...t, date: true }));
	}

	async function handleRetrySync() {
		if (saving) return;
		setSaving(true);
		try {
			const ok = await refresh();
			if (!ok) {
				toast.error(
					"Chưa tải lại được dữ liệu — vui lòng kiểm tra kết nối rồi thử lại.",
				);
				return;
			}
			setSyncPendingNotice(false);
			const meta = pendingSyncMetaRef.current;
			pendingSyncMetaRef.current = null;
			if (failedEntries.length === 0 && meta) {
				toast.success(
					`Đã giao “${prompt?.title ?? ""}” cho ${meta.count} lớp · hạn ${meta.dueDisplay}`,
				);
				onAssigned(meta.count, meta.dueDisplay);
				onClose();
			} else {
				toast.info("Đã đồng bộ danh sách lớp đã giao.");
			}
		} finally {
			setSaving(false);
		}
	}

	async function handleSubmit() {
		if (!prompt || saving || syncPendingNotice) return;
		const clickNowMs = Date.now();
		setValidationNowMs(clickNowMs);
		setTouched({ class: true, date: true, time: true });
		setSubmitAllErrors(true);

		const clickTodayVN = vietnamTodayISO(new Date(clickNowMs));
		const clickDateValid =
			!dueDateInvalid && Boolean(due && parseStartDateStrict(due) !== null);
		const clickTimeValid =
			!dueTimeInvalid && Boolean(dueTime && parseTimeHHMM(dueTime) !== null);
		const clickDueAtMs =
			clickDateValid && clickTimeValid
				? vietnamDateTimeMs(due, dueTime)
				: Number.NaN;
		const clickDateNotPast = clickDateValid && due >= clickTodayVN;
		const clickTimeNotPast =
			clickDateNotPast &&
			clickTimeValid &&
			(due > clickTodayVN ||
				dueTime === "23:59" ||
				(Number.isFinite(clickDueAtMs) && clickDueAtMs > clickNowMs));

		if (
			validSelectedIds.length === 0 ||
			!clickDateNotPast ||
			!clickTimeNotPast
		) {
			const keys: Array<"class" | "date" | "time"> = [];
			if (validSelectedIds.length === 0) keys.push("class");
			if (!clickDateNotPast) keys.push("date");
			if (!clickTimeNotPast) keys.push("time");
			if (keys.length > 1) {
				requestAnimationFrame(() => errSummaryRef.current?.focus());
			} else if (keys[0]) {
				focusField(keys[0]);
			}
			return;
		}

		const targetClasses = classRows
			.filter((r) => !r.disabled && validSelectedIds.includes(r.cls.id))
			.map((r) => r.cls);

		setSaving(true);
		setFailedEntries([]);
		setSyncPendingNotice(false);

		const succeededIds: string[] = [];
		const failures: ClassFailureEntry[] = [];

		try {
			for (const cls of targetClasses) {
				const studentIds = cls.studentIds.slice(0, MAX_STUDENTS_PER_ASSIGN);
				const targetScope =
					cls.studentIds.length <= MAX_STUDENTS_PER_ASSIGN
						? "class"
						: "selected";
				const res = await dispatch(
					{
						type: "assign-class-prompt",
						payload: {
							classId: cls.id,
							promptId: prompt.id,
							due,
							dueTime,
							note: "",
							studentIds,
							targetScope,
						},
					},
					{ skipRefresh: true },
				);

				if (res.kind === "committed" || res.kind === "refreshed") {
					succeededIds.push(cls.id);
					setSelectedClassIds((prev) => prev.filter((id) => id !== cls.id));
				} else if (res.kind === "definite-failure") {
					failures.push({
						classId: cls.id,
						className: cls.name,
						message:
							res.reason ||
							"Không giao được — dữ liệu chưa được ghi lên máy chủ.",
					});
				} else {
					failures.push({
						classId: cls.id,
						className: cls.name,
						outcomeUnknown: true,
						message:
							"Không xác định được kết quả — có thể đã giao trên máy chủ. Hãy tải lại dữ liệu trước khi thử lại.",
					});
				}
			}

			const dueDisplay = fmtDueDisplay(due, dueAtIso);
			const hasUnknownOutcome = failures.some((f) => f.outcomeUnknown === true);
			let refreshOk = true;
			if (succeededIds.length > 0 || hasUnknownOutcome) {
				refreshOk = await refresh();
			}

			if (failures.length === 0 && refreshOk) {
				toast.success(
					`Đã giao “${prompt.title}” cho ${succeededIds.length} lớp · hạn ${dueDisplay}`,
				);
				onAssigned(succeededIds.length, dueDisplay);
				onClose();
				return;
			}

			setFailedEntries(failures);
			if ((succeededIds.length > 0 || hasUnknownOutcome) && !refreshOk) {
				pendingSyncMetaRef.current =
					succeededIds.length > 0
						? {
								count: succeededIds.length,
								dueDisplay,
							}
						: null;
				setSyncPendingNotice(true);
			} else if (succeededIds.length > 0) {
				toast.info(
					`Đã giao cho ${succeededIds.length} lớp; ${failures.length} lớp chưa hoàn tất.`,
				);
			}
		} finally {
			setSaving(false);
		}
	}

	if (!prompt) return null;

	return (
		<Modal
			open={open}
			onClose={handleRequestClose}
			title="Giao đề cho lớp"
			description={prompt.title}
			scrollableBody
			footer={
				<div className="flex w-full items-center justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleRequestClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={saving || syncPendingNotice}
					>
						{saving ? "Đang giao…" : "Giao đề"}
					</Button>
				</div>
			}
		>
			{errorEntries.length > 1 && (
				<div
					ref={errSummaryRef}
					role="alert"
					tabIndex={-1}
					className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<p className="font-medium">
						Cần sửa {errorEntries.length} mục trước khi giao:
					</p>
					<ul className="mt-1 list-disc pl-5 text-xs">
						{errorEntries.map((entry) => (
							<li key={entry.key}>
								<button
									type="button"
									onClick={() => focusField(entry.key)}
									className="underline underline-offset-2"
								>
									{entry.message}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}

			{syncPendingNotice && (
				<div
					role="alert"
					className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn bg-warn/10 p-3 text-foreground text-xs"
				>
					<span>
						Kết quả gửi chưa được đồng bộ với danh sách mới nhất. Hãy tải lại dữ
						liệu trước khi thao tác tiếp để tránh giao trùng.
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleRetrySync}
						disabled={saving}
					>
						Tải lại dữ liệu
					</Button>
				</div>
			)}

			{failedEntries.length > 0 && (
				<div
					role="alert"
					className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-xs"
				>
					<p className="font-semibold">
						Có {failedEntries.length} lớp chưa giao được:
					</p>
					<ul className="mt-1 list-disc space-y-0.5 pl-4">
						{failedEntries.map((entry) => (
							<li key={entry.classId}>
								<strong>{entry.className}:</strong> {entry.message}
							</li>
						))}
					</ul>
				</div>
			)}

			<fieldset ref={classListRef} className="min-w-0 border-0 p-0">
				<legend className="mb-2 block font-semibold text-foreground text-sm">
					Lớp nhận đề <span className="text-destructive">*</span>
				</legend>
				{classRows.length === 0 ? (
					<p className="rounded-md border border-border border-dashed p-4 text-center text-muted-foreground text-sm">
						Chưa có lớp học nào.
					</p>
				) : (
					<div className="grid gap-2">
						{classRows.map(({ cls, disabled, subtitle }) => {
							const checked = validSelectedIds.includes(cls.id);
							return (
								<label
									key={cls.id}
									className={cn(
										"flex min-h-14 cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
										disabled
											? "cursor-not-allowed border-border bg-muted text-muted-foreground"
											: checked
												? "border-primary bg-muted ring-1 ring-primary"
												: "border-border bg-card hover:border-input",
									)}
								>
									<input
										type="checkbox"
										checked={checked}
										disabled={disabled || saving}
										onChange={(e) =>
											handleToggleClass(cls.id, e.target.checked)
										}
										className="size-4 shrink-0 accent-primary"
									/>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium text-sm">
											{cls.name}
										</span>
										<span className="block text-muted-foreground text-xs">
											{subtitle}
										</span>
									</span>
								</label>
							);
						})}
					</div>
				)}
				{showClassErr && (
					<p role="alert" className="mt-1.5 text-destructive text-xs">
						{errors.class}
					</p>
				)}
			</fieldset>

			<div className="grid gap-2">
				<span className="font-semibold text-foreground text-sm">
					Hạn nộp <span className="text-destructive">*</span>
				</span>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_132px]">
					<div>
						<label htmlFor="assign-bank-due-date" className="sr-only">
							Ngày hạn nộp
						</label>
						<DatePickerInput
							key={`due-date-${formResetKey}`}
							ref={dueDateRef}
							id="assign-bank-due-date"
							value={due}
							minDateISO={todayVN}
							todayISO={todayVN}
							disabled={saving}
							aria-invalid={showDateErr}
							onChange={(nextIso) => {
								setValidationNowMs(Date.now());
								setDue(nextIso);
								setTouched((t) => ({ ...t, date: true }));
							}}
							onInvalidChange={setDueDateInvalid}
							onBlur={() => setTouched((t) => ({ ...t, date: true }))}
						/>
						{showDateErr && (
							<p role="alert" className="mt-1 text-destructive text-xs">
								{errors.date}
							</p>
						)}
					</div>
					<div>
						<label htmlFor="assign-bank-due-time" className="sr-only">
							Giờ hạn nộp
						</label>
						<TimeInput24h
							key={`due-time-${formResetKey}`}
							ref={dueTimeRef}
							id="assign-bank-due-time"
							value={dueTime}
							minTimeHHMM={
								due === todayVN
									? formatVietnamTimeHHMM(effectiveNowMs)
									: undefined
							}
							disabled={saving}
							aria-invalid={showTimeErr}
							onChange={(nextTime) => {
								setValidationNowMs(Date.now());
								setDueTime(nextTime);
								setTouched((t) => ({ ...t, time: true }));
							}}
							onInvalidChange={setDueTimeInvalid}
							onBlur={() => setTouched((t) => ({ ...t, time: true }))}
						/>
						{showTimeErr && (
							<p role="alert" className="mt-1 text-destructive text-xs">
								{errors.time}
							</p>
						)}
					</div>
				</div>
				<p className="text-muted-foreground text-xs">
					Ngày theo dd/mm/yyyy, giờ 24h (múi giờ Việt Nam).
				</p>
				<fieldset
					aria-label="Chọn nhanh hạn nộp"
					className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
				>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={saving}
						onClick={() => applyQuickDate(0)}
					>
						Hôm nay
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={saving}
						onClick={() => applyQuickDate(2)}
					>
						2 ngày nữa
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={saving}
						onClick={() => applyQuickDate(7)}
					>
						1 tuần
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={saving}
						onClick={() => applyQuickDate(14)}
					>
						2 tuần
					</Button>
				</fieldset>
			</div>
		</Modal>
	);
}
