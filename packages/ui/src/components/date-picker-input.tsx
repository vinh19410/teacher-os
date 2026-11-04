import { Popover } from "@base-ui/react/popover";
import {
	addDaysISO,
	addMonthsISO,
	formatViDateDisplay,
	mondayOfISO,
	parseTimeHHMM,
	parseViDateInput,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import { cn } from "@teacher-os/ui/lib/utils";
import {
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
	X,
} from "lucide-react";
import {
	type InputHTMLAttributes,
	type KeyboardEvent,
	type Ref,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { inputCls } from "./web-kit/field";

const WEEKDAY_HEADERS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIME_PRESETS = ["17:00", "21:00", "23:59"] as const;

const focusRingBtnCls =
	"focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

function buildMonthGrid(viewYm: string): string[] {
	const firstOfMonth = `${viewYm}-01`;
	const gridStart = mondayOfISO(firstOfMonth);
	return Array.from({ length: 42 }, (_, idx) => addDaysISO(gridStart, idx));
}

function formatMonthYearHeading(viewYm: string): string {
	const parts = viewYm.split("-");
	const year = parts[0] ?? "";
	const month = Number.parseInt(parts[1] ?? "1", 10);
	return `Tháng ${month}, ${year}`;
}

export interface DatePickerInputProps
	extends Omit<
		InputHTMLAttributes<HTMLInputElement>,
		"type" | "value" | "onChange"
	> {
	/** Giá trị ngày chuẩn ISO `yyyy-mm-dd` hoặc `""` khi trống. */
	value: string;
	/** Phát ISO `yyyy-mm-dd` hợp lệ hoặc `""` khi người dùng xóa trắng ô. */
	onChange: (nextIso: string) => void;
	/** Báo ngay khi chuỗi người dùng đang gõ không hợp lệ / chưa hoàn chỉnh. */
	onInvalidChange?: (invalid: boolean) => void;
	/** Ngày nhỏ nhất được phép chọn trên lịch (`yyyy-mm-dd`). */
	minDateISO?: string;
	/** Ngày lớn nhất được phép chọn trên lịch (`yyyy-mm-dd`). */
	maxDateISO?: string;
	/** Ngày hôm nay (`yyyy-mm-dd` giờ VN) để tô viền; mặc định `vietnamTodayISO()`. */
	todayISO?: string;
	ref?: Ref<HTMLInputElement>;
}

/**
 * Ô nhập ngày cố định `dd/mm/yyyy` kèm popover lịch tháng (`T2..CN`) (#572):
 * - Không dùng `<input type="date">` gốc trình duyệt nên không bị đảo sang
 *   `mm/dd/yyyy` theo locale `en-US` và không tự nhảy ô (segment jump).
 * - Giữ nguyên `draftText` khi đang focus + theo dõi `lastEmittedIsoRef` để
 *   prop `value` dội ngược từ parent không bao giờ ghi đè làm nhảy con trỏ.
 */
export function DatePickerInput({
	value,
	onChange,
	onInvalidChange,
	minDateISO,
	maxDateISO,
	todayISO,
	className,
	disabled,
	id,
	placeholder = "dd/mm/yyyy",
	"aria-invalid": ariaInvalidProp,
	onBlur,
	onFocus,
	onKeyDown,
	ref,
	...rest
}: DatePickerInputProps) {
	const resolvedToday = todayISO ?? vietnamTodayISO();
	const [draftText, setDraftText] = useState<string>(() =>
		value ? formatViDateDisplay(value) : "",
	);
	const [internalInvalid, setInternalInvalid] = useState(false);
	const [open, setOpen] = useState(false);
	const lastEmittedIsoRef = useRef<string>(value);

	const resolveInitialYm = () => {
		if (value && ISO_DATE_RE.test(value)) return value.slice(0, 7);
		if (minDateISO && ISO_DATE_RE.test(minDateISO))
			return minDateISO.slice(0, 7);
		return resolvedToday.slice(0, 7);
	};
	const [viewYm, setViewYm] = useState<string>(resolveInitialYm);

	useEffect(() => {
		if (value !== lastEmittedIsoRef.current) {
			lastEmittedIsoRef.current = value;
			setDraftText(value ? formatViDateDisplay(value) : "");
			setInternalInvalid(false);
		}
	}, [value]);

	const gridDays = useMemo(() => buildMonthGrid(viewYm), [viewYm]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (disabled) return;
		if (nextOpen) {
			const anchor =
				value && ISO_DATE_RE.test(value)
					? value
					: minDateISO && ISO_DATE_RE.test(minDateISO)
						? minDateISO
						: resolvedToday;
			setViewYm(anchor.slice(0, 7));
		}
		setOpen(nextOpen);
	};

	const handleInputChange = (nextRaw: string) => {
		setDraftText(nextRaw);
		if (nextRaw.trim() === "") {
			setInternalInvalid(false);
			onInvalidChange?.(false);
			lastEmittedIsoRef.current = "";
			onChange("");
			return;
		}
		const parsed = parseViDateInput(nextRaw);
		if (parsed !== null) {
			setInternalInvalid(false);
			onInvalidChange?.(false);
			lastEmittedIsoRef.current = parsed;
			onChange(parsed);
		} else {
			setInternalInvalid(true);
			onInvalidChange?.(true);
		}
	};

	const commitDraft = () => {
		const trimmed = draftText.trim();
		if (trimmed === "") {
			setDraftText("");
			setInternalInvalid(false);
			onInvalidChange?.(false);
			if (lastEmittedIsoRef.current !== "") {
				lastEmittedIsoRef.current = "";
				onChange("");
			}
			return;
		}
		const parsed = parseViDateInput(trimmed);
		if (parsed !== null) {
			setDraftText(formatViDateDisplay(parsed));
			setInternalInvalid(false);
			onInvalidChange?.(false);
			if (lastEmittedIsoRef.current !== parsed) {
				lastEmittedIsoRef.current = parsed;
				onChange(parsed);
			}
		} else {
			setInternalInvalid(true);
			onInvalidChange?.(true);
		}
	};

	const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			const trimmed = draftText.trim();
			const parsed = trimmed === "" ? "" : parseViDateInput(trimmed);
			if (parsed === null) {
				event.preventDefault();
				setInternalInvalid(true);
				onInvalidChange?.(true);
			} else if (parsed !== "") {
				setDraftText(formatViDateDisplay(parsed));
			}
		}
		onKeyDown?.(event);
	};

	const handleSelectDay = (dayIso: string) => {
		lastEmittedIsoRef.current = dayIso;
		setDraftText(formatViDateDisplay(dayIso));
		setInternalInvalid(false);
		onInvalidChange?.(false);
		onChange(dayIso);
		setOpen(false);
	};

	const isInvalid =
		ariaInvalidProp === true || ariaInvalidProp === "true" || internalInvalid;

	return (
		<Popover.Root open={open} onOpenChange={handleOpenChange} modal={true}>
			<div className="relative flex w-full items-center">
				<input
					{...rest}
					id={id}
					ref={ref}
					type="text"
					inputMode="numeric"
					autoComplete="off"
					placeholder={placeholder}
					disabled={disabled}
					value={draftText}
					aria-invalid={isInvalid ? true : undefined}
					onChange={(e) => handleInputChange(e.target.value)}
					onFocus={(e) => {
						onFocus?.(e);
					}}
					onBlur={(e) => {
						commitDraft();
						onBlur?.(e);
					}}
					onKeyDown={handleInputKeyDown}
					className={cn(inputCls, "pr-9 tabular-nums", className)}
				/>
				<Popover.Trigger
					type="button"
					disabled={disabled}
					aria-label="Chọn ngày"
					className={cn(
						"absolute right-1 inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
						focusRingBtnCls,
					)}
				>
					<CalendarIcon aria-hidden="true" className="size-4" />
				</Popover.Trigger>
			</div>

			<Popover.Portal>
				<Popover.Positioner
					align="end"
					sideOffset={6}
					collisionPadding={8}
					className="z-[110]"
				>
					<Popover.Popup
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.stopPropagation();
							}
						}}
						className="w-[276px] max-w-[calc(100vw-16px)] rounded-lg border border-border bg-card p-3 text-card-foreground shadow-md outline-none"
					>
						<div className="mb-2 flex items-center justify-between gap-1">
							<button
								type="button"
								aria-label="Tháng trước"
								onClick={() => setViewYm((ym) => addMonthsISO(ym, -1))}
								className={cn(
									"inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
									focusRingBtnCls,
								)}
							>
								<ChevronLeft aria-hidden="true" className="size-4" />
							</button>
							<span className="font-semibold text-foreground text-sm">
								{formatMonthYearHeading(viewYm)}
							</span>
							<div className="flex items-center gap-0.5">
								<button
									type="button"
									aria-label="Tháng sau"
									onClick={() => setViewYm((ym) => addMonthsISO(ym, 1))}
									className={cn(
										"inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
										focusRingBtnCls,
									)}
								>
									<ChevronRight aria-hidden="true" className="size-4" />
								</button>
								<Popover.Close
									type="button"
									aria-label="Đóng lịch"
									className={cn(
										"inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
										focusRingBtnCls,
									)}
								>
									<X aria-hidden="true" className="size-3.5" />
								</Popover.Close>
							</div>
						</div>

						<div className="mb-1 grid grid-cols-7 gap-1 text-center font-medium text-[11px] text-muted-foreground">
							{WEEKDAY_HEADERS.map((wd) => (
								<span key={wd} className="py-1">
									{wd}
								</span>
							))}
						</div>

						<div className="grid grid-cols-7 gap-1">
							{gridDays.map((dayIso) => {
								const inMonth = dayIso.startsWith(viewYm);
								const isBeforeMin =
									Boolean(minDateISO) && dayIso < (minDateISO ?? "");
								const isAfterMax =
									Boolean(maxDateISO) && dayIso > (maxDateISO ?? "");
								const isDayDisabled = isBeforeMin || isAfterMax;
								const isSelected = value === dayIso && !internalInvalid;
								const isToday = dayIso === resolvedToday;
								const dayNum = Number.parseInt(dayIso.slice(8, 10), 10);

								return (
									<button
										key={dayIso}
										type="button"
										disabled={isDayDisabled}
										aria-label={formatViDateDisplay(dayIso)}
										aria-pressed={isSelected}
										onClick={() => handleSelectDay(dayIso)}
										className={cn(
											"inline-flex h-8 w-full items-center justify-center rounded-md text-xs tabular-nums transition-colors",
											focusRingBtnCls,
											isSelected
												? "bg-primary font-semibold text-primary-foreground"
												: inMonth
													? "text-foreground hover:bg-accent"
													: "text-muted-foreground hover:bg-accent",
											!isSelected && isToday && "border border-primary/50",
											isDayDisabled &&
												"cursor-not-allowed opacity-35 hover:bg-transparent",
										)}
									>
										{dayNum}
									</button>
								);
							})}
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}

export interface TimeInput24hProps
	extends Omit<
		InputHTMLAttributes<HTMLInputElement>,
		"type" | "value" | "onChange"
	> {
	/** Giá trị giờ chuẩn 24h `HH:mm` hoặc `""` khi trống. */
	value: string;
	/** Phát giờ `HH:mm` hợp lệ hoặc `""` khi xóa trắng. */
	onChange: (nextTime: string) => void;
	/** Báo ngay khi chuỗi người dùng đang gõ không hợp lệ. */
	onInvalidChange?: (invalid: boolean) => void;
	/** Các mốc giờ gợi ý bấm nhanh (mặc định `["17:00", "21:00", "23:59"]`). */
	presets?: readonly string[];
	/** Mốc giờ tối thiểu trên ngày hôm nay (`HH:mm`); ẩn các chip `<= minTimeHHMM` trừ `"23:59"`. */
	minTimeHHMM?: string;
	ref?: Ref<HTMLInputElement>;
}

/**
 * Ô nhập giờ 24h cố định `HH:mm` kèm nhóm chip gợi ý (#572):
 * Không dùng `<input type="time">` gốc để tránh hiển thị 12h SA/CH hoặc AM/PM
 * theo locale hệ điều hành.
 */
export function TimeInput24h({
	value,
	onChange,
	onInvalidChange,
	presets = DEFAULT_TIME_PRESETS,
	minTimeHHMM,
	className,
	disabled,
	id,
	placeholder = "HH:mm",
	"aria-invalid": ariaInvalidProp,
	onBlur,
	onKeyDown,
	ref,
	...rest
}: TimeInput24hProps) {
	const [draftText, setDraftText] = useState<string>(value);
	const [internalInvalid, setInternalInvalid] = useState(false);
	const lastEmittedTimeRef = useRef<string>(value);

	useEffect(() => {
		if (value !== lastEmittedTimeRef.current) {
			lastEmittedTimeRef.current = value;
			setDraftText(value);
			setInternalInvalid(false);
		}
	}, [value]);

	const visiblePresets = useMemo(
		() =>
			presets.filter(
				(preset) =>
					minTimeHHMM === undefined ||
					preset === "23:59" ||
					preset > minTimeHHMM,
			),
		[presets, minTimeHHMM],
	);

	const handleInputChange = (nextRaw: string) => {
		setDraftText(nextRaw);
		if (nextRaw.trim() === "") {
			setInternalInvalid(false);
			onInvalidChange?.(false);
			lastEmittedTimeRef.current = "";
			onChange("");
			return;
		}
		const parsed = parseTimeHHMM(nextRaw);
		if (parsed !== null) {
			setInternalInvalid(false);
			onInvalidChange?.(false);
			lastEmittedTimeRef.current = parsed;
			onChange(parsed);
		} else {
			setInternalInvalid(true);
			onInvalidChange?.(true);
		}
	};

	const commitDraft = () => {
		const trimmed = draftText.trim();
		if (trimmed === "") {
			setDraftText("");
			setInternalInvalid(false);
			onInvalidChange?.(false);
			if (lastEmittedTimeRef.current !== "") {
				lastEmittedTimeRef.current = "";
				onChange("");
			}
			return;
		}
		const parsed = parseTimeHHMM(trimmed);
		if (parsed !== null) {
			setDraftText(parsed);
			setInternalInvalid(false);
			onInvalidChange?.(false);
			if (lastEmittedTimeRef.current !== parsed) {
				lastEmittedTimeRef.current = parsed;
				onChange(parsed);
			}
		} else {
			setInternalInvalid(true);
			onInvalidChange?.(true);
		}
	};

	const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			const trimmed = draftText.trim();
			const parsed = trimmed === "" ? "" : parseTimeHHMM(trimmed);
			if (parsed === null) {
				event.preventDefault();
				setInternalInvalid(true);
				onInvalidChange?.(true);
			} else if (parsed !== "") {
				setDraftText(parsed);
			}
		}
		onKeyDown?.(event);
	};

	const handleSelectPreset = (preset: string) => {
		lastEmittedTimeRef.current = preset;
		setDraftText(preset);
		setInternalInvalid(false);
		onInvalidChange?.(false);
		onChange(preset);
	};

	const isInvalid =
		ariaInvalidProp === true || ariaInvalidProp === "true" || internalInvalid;

	return (
		<div className="flex flex-col gap-1.5">
			<input
				{...rest}
				id={id}
				ref={ref}
				type="text"
				inputMode="numeric"
				autoComplete="off"
				placeholder={placeholder}
				disabled={disabled}
				value={draftText}
				aria-invalid={isInvalid ? true : undefined}
				onChange={(e) => handleInputChange(e.target.value)}
				onBlur={(e) => {
					commitDraft();
					onBlur?.(e);
				}}
				onKeyDown={handleInputKeyDown}
				className={cn(inputCls, "tabular-nums sm:w-28", className)}
			/>
			{visiblePresets.length > 0 && (
				<fieldset
					aria-label="Mốc giờ gợi ý"
					className="flex flex-wrap gap-1 border-0 p-0"
				>
					{visiblePresets.map((preset) => {
						const isSelected = value === preset && !internalInvalid;
						return (
							<button
								key={preset}
								type="button"
								disabled={disabled}
								aria-pressed={isSelected}
								onClick={() => handleSelectPreset(preset)}
								className={cn(
									"rounded-md border px-2 py-0.5 text-[11px] tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-50",
									focusRingBtnCls,
									isSelected
										? "border-primary bg-primary font-medium text-primary-foreground"
										: "border-input bg-background text-foreground hover:bg-accent dark:bg-input/30",
								)}
							>
								{preset}
							</button>
						);
					})}
				</fieldset>
			)}
		</div>
	);
}
