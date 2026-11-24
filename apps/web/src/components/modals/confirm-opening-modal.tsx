import { renderClassOpeningEmail } from "@teacher-os/api/class-opening-email";
import {
	CLASS_ERROR_CODES,
	CLASS_OPENING_NOTE_MAX_LENGTH,
	type ClassConfirmOpeningResponse,
	type ClassOpeningSendMode,
} from "@teacher-os/api/contracts";
import {
	formatViDateDisplay,
	formatViWeekdayDate,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import {
	AlertTriangle,
	Calendar,
	Check,
	ChevronDown,
	Mail,
	Send,
} from "lucide-react";
import {
	type FormEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { formatSchedule } from "@/lib/format-schedule";
import type { ClassGroup, Student } from "@/lib/mock-data";
import {
	ClassOpeningApiError,
	confirmClassOpening,
} from "@/lib/repos/class-opening";
import { isValidIsoCalendarDate } from "./class-form-helpers";

export interface OpeningRosterEntry {
	student: Student;
	isInvited: boolean;
}

export interface ConfirmOpeningModalProps {
	open: boolean;
	onClose: () => void;
	cls: ClassGroup;
	hasRealSessions: boolean;
	roster: OpeningRosterEntry[];
	orgName?: string;
	onConfirmed: () => Promise<void>;
}

const MAX_LISTED_MISSING_EMAIL = 5;

const REFRESH_REQUIRED_ERROR_CODES = new Set<string>([
	CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT,
	CLASS_ERROR_CODES.CLASS_PAUSED,
	CLASS_ERROR_CODES.SCHEDULE_LOCKED,
]);

function formatConfirmedTimestamp(iso: string): string {
	const trimmed = iso.trim();
	if (!trimmed) return "";
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		return trimmed;
	}
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Ho_Chi_Minh",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(parsed);
	const get = (type: string) =>
		parts.find((part) => part.type === type)?.value ?? "00";
	return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export interface OpeningToastOutcome {
	kind: "success" | "warning";
	message: string;
}

export function buildSuccessToast(
	mode: ClassOpeningSendMode,
	res: ClassConfirmOpeningResponse,
	targetCount: number,
): OpeningToastOutcome {
	if (res.queuedEmailCount > 0) {
		const lead =
			mode === "initial"
				? `Đã chốt khai giảng và đưa ${res.queuedEmailCount} email vào hàng đợi gửi.`
				: `Đã đưa ${res.queuedEmailCount} email thông báo khai giảng vào hàng đợi gửi.`;
		if (res.inAppOnlyCount > 0) {
			return {
				kind: "success",
				message: `${lead} ${res.inAppOnlyCount} học viên chưa có email chỉ nhận thông báo trong cổng học viên.`,
			};
		}
		return { kind: "success", message: lead };
	}
	if (res.inAppOnlyCount > 0) {
		return {
			kind: "success",
			message:
				mode === "initial"
					? `Đã chốt khai giảng. ${res.inAppOnlyCount} học viên chưa có email chỉ nhận thông báo trong cổng học viên.`
					: `Đã gửi thông báo trong cổng học viên cho ${res.inAppOnlyCount} học viên chưa có email.`,
		};
	}
	if (targetCount > 0) {
		return {
			kind: "warning",
			message:
				mode === "initial"
					? "Đã chốt khai giảng, nhưng chưa thể xếp hàng thông báo cho học viên. Vui lòng kiểm tra Nhật ký thông báo."
					: "Chưa có thông báo mới nào được xếp hàng gửi.",
		};
	}
	return {
		kind: "success",
		message:
			mode === "initial"
				? "Đã chốt khai giảng."
				: "Đã cập nhật thông báo khai giảng.",
	};
}

function resolveDefaultSendMode(
	isAlreadyConfirmed: boolean,
	newStudentCount: number,
): ClassOpeningSendMode {
	if (!isAlreadyConfirmed) return "initial";
	return newStudentCount > 0 ? "new_only" : "all";
}

export function ConfirmOpeningModal({
	open,
	onClose,
	cls,
	hasRealSessions,
	roster,
	orgName,
	onConfirmed,
}: ConfirmOpeningModalProps) {
	const formId = useId();
	const noteId = useId();
	const previewPanelId = useId();

	const openingVersion = cls.openingAnnouncementVersion ?? 0;
	const isAlreadyConfirmed =
		openingVersion > 0 || Boolean(cls.openingConfirmedAt);

	const notifiedSet = useMemo(
		() => new Set(cls.openingNotifiedStudentIds ?? []),
		[cls.openingNotifiedStudentIds],
	);

	const newStudents = useMemo(
		() => roster.filter((entry) => !notifiedSet.has(entry.student.id)),
		[roster, notifiedSet],
	);

	const [startDate, setStartDate] = useState<string>(cls.startDate);
	const [startDateInvalid, setStartDateInvalid] = useState(false);
	const [note, setNote] = useState<string>(cls.openingNote ?? "");
	const [sendMode, setSendMode] = useState<ClassOpeningSendMode>(() =>
		resolveDefaultSendMode(isAlreadyConfirmed, newStudents.length),
	);
	const [previewOpen, setPreviewOpen] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const wasOpenRef = useRef(false);
	const prevClassIdRef = useRef(cls.id);
	const prevOpeningVersionRef = useRef(openingVersion);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		const classChanged = prevClassIdRef.current !== cls.id;
		const versionChanged = prevOpeningVersionRef.current !== openingVersion;
		if (classChanged) {
			prevClassIdRef.current = cls.id;
		}
		if (versionChanged) {
			prevOpeningVersionRef.current = openingVersion;
		}
		if ((open && !wasOpenRef.current) || classChanged) {
			setStartDate(cls.startDate);
			setStartDateInvalid(false);
			setNote(cls.openingNote ?? "");
			setSendMode(
				resolveDefaultSendMode(isAlreadyConfirmed, newStudents.length),
			);
			setPreviewOpen(true);
			setError(null);
			setSaving(false);
		} else if (open && versionChanged) {
			setStartDate(cls.startDate);
			setStartDateInvalid(false);
			setNote(cls.openingNote ?? "");
			setSendMode(
				resolveDefaultSendMode(isAlreadyConfirmed, newStudents.length),
			);
		}
		wasOpenRef.current = open;
	}, [open, cls, openingVersion, isAlreadyConfirmed, newStudents.length]);

	const effectiveSendMode: ClassOpeningSendMode = !isAlreadyConfirmed
		? "initial"
		: sendMode === "initial"
			? newStudents.length > 0
				? "new_only"
				: "all"
			: sendMode;

	const startDateReadOnly =
		hasRealSessions || (isAlreadyConfirmed && effectiveSendMode === "new_only");

	const todayVN = vietnamTodayISO();
	const trimmedStartDate = startDate.trim();
	const startDateInputValue = isValidIsoCalendarDate(trimmedStartDate)
		? trimmedStartDate
		: "";
	const isLegacyStartDate =
		cls.startDate.trim() !== "" &&
		!isValidIsoCalendarDate(cls.startDate.trim()) &&
		trimmedStartDate === cls.startDate.trim();

	const effectiveStartDate = startDateReadOnly
		? cls.startDate.trim()
		: trimmedStartDate;

	const targetRoster = effectiveSendMode === "new_only" ? newStudents : roster;

	const withEmail = useMemo(
		() => targetRoster.filter((entry) => entry.student.email.trim().length > 0),
		[targetRoster],
	);
	const withoutEmail = useMemo(
		() =>
			targetRoster.filter((entry) => entry.student.email.trim().length === 0),
		[targetRoster],
	);

	const activeWithEmailCount = useMemo(
		() => withEmail.filter((entry) => !entry.isInvited).length,
		[withEmail],
	);
	const invitedWithEmailCount = withEmail.length - activeWithEmailCount;

	const missingEmailSummary = useMemo(() => {
		if (withoutEmail.length === 0) return "";
		const listed = withoutEmail
			.slice(0, MAX_LISTED_MISSING_EMAIL)
			.map((entry) => entry.student.name)
			.join(", ");
		const extra = withoutEmail.length - MAX_LISTED_MISSING_EMAIL;
		return extra > 0 ? `${listed} và ${extra} học viên khác` : listed;
	}, [withoutEmail]);

	const previewStudentName =
		withEmail[0]?.student.name ||
		targetRoster[0]?.student.name ||
		"Nguyễn Minh";

	const preview = useMemo(
		() =>
			renderClassOpeningEmail({
				className: cls.name,
				startDate: effectiveStartDate,
				scheduleRaw: cls.schedule,
				mode: cls.mode,
				sessionsTotal: cls.sessionsTotal > 0 ? cls.sessionsTotal : undefined,
				level: cls.level || undefined,
				studentName: previewStudentName,
				orgName,
				teacherNote: note,
				isUpdate: effectiveSendMode === "all",
				portalUrl: "/classes",
			}),
		[
			cls.name,
			effectiveStartDate,
			cls.schedule,
			cls.mode,
			cls.sessionsTotal,
			cls.level,
			previewStudentName,
			orgName,
			note,
			effectiveSendMode,
		],
	);

	const scheduleDisplay = formatSchedule(cls.schedule) || "Chưa thiết lập";
	const readonlyDateDisplay =
		formatViWeekdayDate(cls.startDate) ||
		formatViDateDisplay(cls.startDate) ||
		cls.startDate ||
		"Chưa thiết lập";
	const confirmedAtDisplay = cls.openingConfirmedAt
		? formatConfirmedTimestamp(cls.openingConfirmedAt)
		: "";

	const isSubmitDisabled =
		saving ||
		(effectiveSendMode === "new_only" && newStudents.length === 0) ||
		!effectiveStartDate;

	const submitLabel = saving
		? "Đang gửi…"
		: effectiveSendMode === "initial"
			? withEmail.length > 0
				? `Chốt & gửi ${withEmail.length} email`
				: "Chốt khai giảng"
			: effectiveSendMode === "new_only"
				? `Gửi bổ sung (${withEmail.length} email)`
				: `Gửi cập nhật (${withEmail.length} email)`;

	function handleClose() {
		if (saving) return;
		setError(null);
		onClose();
	}

	async function handleSubmit() {
		if (saving) return;
		setError(null);

		if (effectiveSendMode === "new_only" && newStudents.length === 0) {
			setError("Tất cả học viên hiện tại đã nhận thông báo khai giảng.");
			return;
		}

		if (!startDateReadOnly) {
			if (startDateInvalid) {
				setError("Ngày khai giảng không hợp lệ (dd/mm/yyyy).");
				return;
			}
			if (!trimmedStartDate || !isValidIsoCalendarDate(trimmedStartDate)) {
				setError("Vui lòng chọn ngày khai giảng hợp lệ (dd/mm/yyyy).");
				return;
			}
			const startDateChanged = trimmedStartDate !== cls.startDate.trim();
			if (startDateChanged && trimmedStartDate < todayVN) {
				setError("Ngày khai giảng mới phải từ hôm nay trở đi.");
				return;
			}
		} else if (!cls.startDate.trim()) {
			setError("Lớp chưa có ngày khai giảng để gửi thông báo.");
			return;
		}

		const startDateChanged = trimmedStartDate !== cls.startDate.trim();
		const canSendStartDate =
			!startDateReadOnly &&
			effectiveSendMode !== "new_only" &&
			isValidIsoCalendarDate(trimmedStartDate) &&
			(startDateChanged || trimmedStartDate >= todayVN);
		const targetCount = targetRoster.length;

		setSaving(true);
		try {
			const res = await confirmClassOpening(cls.id, {
				mode: effectiveSendMode,
				...(canSendStartDate ? { startDate: trimmedStartDate } : {}),
				note: note.trim(),
				expectedVersion: openingVersion,
			});

			try {
				await onConfirmed();
				const outcome = buildSuccessToast(effectiveSendMode, res, targetCount);
				if (outcome.kind === "warning") {
					toast.warning(outcome.message);
				} else {
					toast.success(outcome.message);
				}
			} catch {
				toast.warning(
					"Đã chốt khai giảng nhưng chưa tải lại được dữ liệu mới nhất. Vui lòng tải lại trang.",
				);
			}
			if (mountedRef.current) {
				onClose();
			}
		} catch (err) {
			if (err instanceof ClassOpeningApiError) {
				if (mountedRef.current) {
					setError(err.message);
				}
				if (err.code && REFRESH_REQUIRED_ERROR_CODES.has(err.code)) {
					void onConfirmed().catch(() => undefined);
				}
			} else if (mountedRef.current) {
				setError("Không thể kết nối máy chủ. Vui lòng thử lại.");
			}
		} finally {
			if (mountedRef.current) {
				setSaving(false);
			}
		}
	}

	function onFormSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void handleSubmit();
	}

	return (
		<Modal
			open={open}
			onClose={handleClose}
			title={
				isAlreadyConfirmed
					? `Thông báo khai giảng — ${cls.name}`
					: `Chốt khai giảng — ${cls.name}`
			}
			description={
				isAlreadyConfirmed
					? "Gửi thông báo bổ sung cho học viên mới hoặc gửi bản cập nhật lịch khai giảng cho cả lớp."
					: "Xác nhận ngày khai giảng và gửi email thông báo lịch học đến học viên trong lớp."
			}
			size="xl"
			scrollableBody
			footer={
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button
						type="submit"
						form={formId}
						variant="default"
						size="sm"
						disabled={isSubmitDisabled}
					>
						<Send aria-hidden="true" className="size-3.5" />
						{submitLabel}
					</Button>
				</div>
			}
		>
			<form
				id={formId}
				onSubmit={onFormSubmit}
				className="flex min-w-0 flex-col gap-5"
			>
				{/* Section 1: Thông tin khai giảng */}
				<section className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h4 className="font-medium text-muted-foreground text-xs">
							Thông tin khai giảng
						</h4>
						{isAlreadyConfirmed && confirmedAtDisplay && (
							<span className="text-muted-foreground text-xs tabular-nums">
								Đã chốt lần gần nhất: {confirmedAtDisplay}
							</span>
						)}
					</div>

					{!startDateReadOnly ? (
						<Field
							label="Ngày khai giảng *"
							help={
								isLegacyStartDate
									? `Ngày hiện tại (${cls.startDate}) chưa theo định dạng dd/mm/yyyy — vui lòng chọn lại ngày khai giảng.`
									: undefined
							}
						>
							<DatePickerInput
								value={startDateInputValue}
								minDateISO={todayVN}
								todayISO={todayVN}
								onChange={(next) => {
									setStartDate(next);
									setError(null);
								}}
								onInvalidChange={setStartDateInvalid}
								disabled={saving}
							/>
						</Field>
					) : (
						<div className="flex flex-col gap-2">
							<span className="font-medium text-foreground text-sm leading-none">
								Ngày khai giảng
							</span>
							<div
								data-testid="opening-date-readonly"
								className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 font-medium text-foreground text-sm"
							>
								<Calendar
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground"
								/>
								<span>{readonlyDateDisplay}</span>
							</div>
							<p
								data-testid="opening-date-locked-note"
								className="rounded-md border border-border bg-muted/50 px-3 py-2 text-muted-foreground text-xs"
							>
								{hasRealSessions
									? "Lớp đã có buổi học thực tế nên ngày khai giảng được giữ cố định theo lịch học."
									: 'Chọn "Gửi thông báo cập nhật cho cả lớp" nếu cần thay đổi ngày khai giảng.'}
							</p>
						</div>
					)}

					<dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs sm:grid-cols-3">
						<div className="min-w-0">
							<dt className="text-muted-foreground">Lịch học</dt>
							<dd className="mt-0.5 break-words font-medium text-foreground">
								{scheduleDisplay}
							</dd>
						</div>
						<div className="min-w-0">
							<dt className="text-muted-foreground">Hình thức</dt>
							<dd className="mt-0.5 break-words font-medium text-foreground">
								{cls.mode || "—"}
							</dd>
						</div>
						{cls.sessionsTotal > 0 && (
							<div className="min-w-0">
								<dt className="text-muted-foreground">Tổng số buổi</dt>
								<dd className="mt-0.5 font-medium text-foreground tabular-nums">
									{cls.sessionsTotal} buổi
								</dd>
							</div>
						)}
					</dl>
				</section>

				{/* Section 2: Phạm vi gửi (chỉ hiển thị khi đã chốt trước đó) */}
				{isAlreadyConfirmed && (
					<div className="border-border border-t pt-4">
						<fieldset className="flex flex-col gap-2.5 border-0 p-0">
							<legend className="mb-1 font-medium text-muted-foreground text-xs">
								Phạm vi gửi
							</legend>
							<div
								role="radiogroup"
								aria-label="Phạm vi gửi thông báo khai giảng"
								className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
							>
								<label
									className={cn(
										"relative flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:shadow-[var(--focus-ring)]",
										effectiveSendMode === "new_only"
											? "border-primary bg-muted text-foreground ring-1 ring-primary"
											: "border-input bg-card text-foreground hover:bg-accent/50",
										saving && "pointer-events-none opacity-60",
									)}
								>
									<input
										type="radio"
										name="opening-send-mode"
										value="new_only"
										checked={effectiveSendMode === "new_only"}
										disabled={saving}
										onChange={() => {
											setSendMode("new_only");
											setStartDate(cls.startDate);
											setStartDateInvalid(false);
											setError(null);
										}}
										className="sr-only"
									/>
									<span className="min-w-0 flex-1">
										<span className="block font-medium text-sm">
											{`Chỉ gửi cho học viên mới chưa nhận (${newStudents.length})`}
										</span>
										<span className="mt-1 block text-muted-foreground text-xs">
											{newStudents.length === 0
												? "Tất cả học viên hiện tại đã nhận thông báo khai giảng."
												: "Học viên đã nhận trước đó sẽ không bị gửi trùng."}
										</span>
									</span>
									{effectiveSendMode === "new_only" && (
										<Check
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0 text-primary"
										/>
									)}
								</label>

								<label
									className={cn(
										"relative flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:shadow-[var(--focus-ring)]",
										effectiveSendMode === "all"
											? "border-primary bg-muted text-foreground ring-1 ring-primary"
											: "border-input bg-card text-foreground hover:bg-accent/50",
										saving && "pointer-events-none opacity-60",
									)}
								>
									<input
										type="radio"
										name="opening-send-mode"
										value="all"
										checked={effectiveSendMode === "all"}
										disabled={saving}
										onChange={() => {
											setSendMode("all");
											setError(null);
										}}
										className="sr-only"
									/>
									<span className="min-w-0 flex-1">
										<span className="block font-medium text-sm">
											{`Gửi thông báo cập nhật cho cả lớp (${roster.length})`}
										</span>
										<span className="mt-1 block text-muted-foreground text-xs">
											Gửi email với tiêu đề cập nhật lịch khai giảng cho toàn bộ
											danh sách lớp.
										</span>
									</span>
									{effectiveSendMode === "all" && (
										<Check
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0 text-primary"
										/>
									)}
								</label>
							</div>

							{effectiveSendMode === "all" && (
								<p
									role="note"
									className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-foreground text-xs"
								>
									<AlertTriangle
										aria-hidden="true"
										className="mt-0.5 size-3.5 shrink-0 text-warn"
									/>
									<span>
										Học viên đã nhận trước đó sẽ nhận thêm một email cập nhật
										lịch khai giảng.
									</span>
								</p>
							)}
						</fieldset>
					</div>
				)}

				{/* Section 3: Người nhận email */}
				<section
					aria-live="polite"
					className="flex flex-col gap-2.5 border-border border-t pt-4"
				>
					<h4 className="font-medium text-muted-foreground text-xs">
						Người nhận email
					</h4>
					<div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
						<Mail
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0 text-muted-foreground"
						/>
						<p className="min-w-0 break-words text-foreground tabular-nums">
							{withEmail.length > 0
								? `Sẽ gửi email đến ${withEmail.length} học viên (${activeWithEmailCount} Đang học · ${invitedWithEmailCount} Đã mời)`
								: "Chưa có học viên nào có email trong phạm vi gửi này."}
						</p>
					</div>

					{withoutEmail.length > 0 && (
						<div
							data-testid="opening-missing-email-warning"
							className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-foreground text-xs"
						>
							<AlertTriangle
								aria-hidden="true"
								className="mt-0.5 size-3.5 shrink-0 text-warn"
							/>
							<p className="min-w-0 break-words">
								{`${withoutEmail.length} học viên chưa có email sẽ không nhận được email (vẫn nhận thông báo trong cổng học viên): ${missingEmailSummary}`}
							</p>
						</div>
					)}
				</section>

				{/* Section 4: Lời nhắn cho học viên */}
				<section className="flex flex-col gap-2 border-border border-t pt-4">
					<div className="flex items-center justify-between gap-2">
						<label
							htmlFor={noteId}
							className="font-medium text-foreground text-sm leading-none"
						>
							Lời nhắn cho học viên (tùy chọn)
						</label>
						<span className="text-muted-foreground text-xs tabular-nums">
							{note.length}/{CLASS_OPENING_NOTE_MAX_LENGTH}
						</span>
					</div>
					<Textarea
						id={noteId}
						value={note}
						onChange={(event) => setNote(event.target.value)}
						maxLength={CLASS_OPENING_NOTE_MAX_LENGTH}
						rows={3}
						disabled={saving}
						placeholder="VD: Link nhóm Zalo lớp, địa chỉ phòng học, lưu ý chuẩn bị trước buổi đầu…"
					/>
				</section>

				{/* Section 5: Xem trước Email HTML */}
				<section className="flex flex-col gap-2.5 border-border border-t pt-4">
					<button
						type="button"
						aria-expanded={previewOpen}
						aria-controls={previewPanelId}
						onClick={() => setPreviewOpen((prev) => !prev)}
						className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left font-medium text-foreground text-sm transition-colors hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none dark:bg-input/30 dark:hover:bg-input/50"
					>
						<span>Xem trước Email HTML</span>
						<ChevronDown
							aria-hidden="true"
							className={cn(
								"size-4 shrink-0 text-muted-foreground transition-transform duration-150",
								previewOpen && "rotate-180",
							)}
						/>
					</button>

					{previewOpen && (
						<div id={previewPanelId} className="flex flex-col gap-2">
							<p className="break-words rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
								Tiêu đề:{" "}
								<span className="font-medium text-foreground">
									{preview.subject}
								</span>
							</p>
							<iframe
								title="Xem trước email thông báo khai giảng"
								sandbox=""
								srcDoc={preview.html}
								className="h-72 w-full rounded-md border border-border sm:h-80"
							/>
						</div>
					)}
				</section>

				{error && (
					<p
						role="alert"
						className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-destructive text-xs"
					>
						{error}
					</p>
				)}
			</form>
		</Modal>
	);
}
