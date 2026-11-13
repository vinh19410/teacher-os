import { type ClassType, TIME_REGEX } from "@teacher-os/api/contracts";
import { parseSchedule } from "@teacher-os/api/format-schedule";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipMulti } from "@/components/ui/chip-multi";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { KernelAction } from "@/lib/data-actions";
import { parseVndAmount } from "@/lib/format-currency";
import { addMinutes } from "@/lib/format-schedule";
import { type ClassGroup, dayNames } from "@/lib/mock-data";
import { useClassCurriculum } from "@/lib/repos/use-syllabus";
import { findScheduleConflicts } from "@/lib/schedule-conflicts";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import {
	CLASS_TYPE_OPTIONS,
	DAY_OPTIONS,
	isValidIsoCalendarDate,
	LEVEL_OPTIONS,
	MODE_OPTIONS,
	normalizeScheduleInput,
	parseValidSessionsTotal,
	SESSION_PRESETS,
	SKILL_OPTIONS,
	sessionsFromTemplate,
	skillsFromTemplate,
} from "./class-form-helpers";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export interface EditClassModalProps {
	open: boolean;
	onClose: () => void;
	cls: ClassGroup;
	hasRealSessions: boolean;
	existingClasses: ClassGroup[];
}

function buildInitialState(
	cls: ClassGroup,
	curriculumLessonCount: number,
	sessionsLockedByCurriculum: boolean,
) {
	const parsed = parseSchedule(cls.schedule);
	const initialTotal = sessionsLockedByCurriculum
		? String(cls.sessionsTotal > 0 ? cls.sessionsTotal : curriculumLessonCount)
		: cls.sessionsTotal > 0
			? String(cls.sessionsTotal)
			: "";

	return {
		name: cls.name,
		classType: cls.type,
		level: cls.level,
		skills: cls.type === "ielts" ? skillsFromTemplate(cls.skills) : [],
		mode: cls.mode,
		fee:
			cls.tuitionFee !== null && cls.tuitionFee !== undefined
				? String(cls.tuitionFee)
				: "",
		days: parsed ? parsed.days : [],
		startTime: parsed ? parsed.start : "",
		endTime: parsed ? parsed.end : "",
		startDate: cls.startDate,
		total: initialTotal,
	};
}

export function EditClassModal({
	open,
	onClose,
	cls,
	hasRealSessions,
	existingClasses,
}: EditClassModalProps) {
	const curriculum = useClassCurriculum(cls.id);
	const curriculumLessonCount = curriculum
		? sessionsFromTemplate(curriculum.modules)
		: 0;
	const sessionsLockedByCurriculum = Boolean(
		curriculum && curriculumLessonCount > 0,
	);
	const parsedInitialSchedule = useMemo(
		() => parseSchedule(cls.schedule),
		[cls.schedule],
	);

	const initial = buildInitialState(
		cls,
		curriculumLessonCount,
		sessionsLockedByCurriculum,
	);

	const [name, setName] = useState(initial.name);
	const [classType, setClassType] = useState<ClassType>(initial.classType);
	const [level, setLevel] = useState(initial.level);
	const [skills, setSkills] = useState<string[]>(initial.skills);
	const [mode, setMode] = useState(initial.mode);
	const [fee, setFee] = useState(initial.fee);
	const [days, setDays] = useState<number[]>(initial.days);
	const [startTime, setStartTime] = useState(initial.startTime);
	const [endTime, setEndTime] = useState(initial.endTime);
	const [timesTouched, setTimesTouched] = useState(false);
	const [endTouched, setEndTouched] = useState(parsedInitialSchedule !== null);
	const [startDate, setStartDate] = useState(initial.startDate);
	const [total, setTotal] = useState(initial.total);

	const {
		saving,
		error,
		setError,
		notice,
		submitBlocked,
		run,
		reconcile,
		reset,
	} = useKernelFormSubmit();

	const wasOpenRef = useRef(false);
	const prevClassIdRef = useRef(cls.id);
	useEffect(() => {
		const classChanged = prevClassIdRef.current !== cls.id;
		if (classChanged) {
			prevClassIdRef.current = cls.id;
			reset();
		}
		if ((open && !wasOpenRef.current) || classChanged) {
			const next = buildInitialState(
				cls,
				curriculumLessonCount,
				sessionsLockedByCurriculum,
			);
			setName(next.name);
			setClassType(next.classType);
			setLevel(next.level);
			setSkills(next.skills);
			setMode(next.mode);
			setFee(next.fee);
			setDays(next.days);
			setStartTime(next.startTime);
			setEndTime(next.endTime);
			setTimesTouched(false);
			setEndTouched(parseSchedule(cls.schedule) !== null);
			setStartDate(next.startDate);
			setTotal(next.total);
			setError(undefined);
		}
		wasOpenRef.current = open;
	}, [
		open,
		cls,
		curriculumLessonCount,
		sessionsLockedByCurriculum,
		setError,
		reset,
	]);

	const levelOptions = useMemo(() => {
		const opts: string[] = [...LEVEL_OPTIONS];
		if (cls.level && !opts.includes(cls.level)) {
			opts.unshift(cls.level);
		}
		return opts;
	}, [cls.level]);

	const modeOptions = useMemo(() => {
		const opts: string[] = [...MODE_OPTIONS];
		if (cls.mode && !opts.includes(cls.mode)) {
			opts.unshift(cls.mode);
		}
		return opts;
	}, [cls.mode]);

	const todayVN = vietnamTodayISO();
	const trimmedStartDate = startDate.trim();
	const startDateInputValue = isValidIsoCalendarDate(trimmedStartDate)
		? trimmedStartDate
		: "";
	const isLegacyStartDate =
		cls.startDate.trim() !== "" &&
		!isValidIsoCalendarDate(cls.startDate.trim()) &&
		trimmedStartDate === cls.startDate.trim();

	const draftTotal = parseValidSessionsTotal(total) ?? 0;
	const scheduleConflicts = useMemo(
		() =>
			hasRealSessions
				? []
				: findScheduleConflicts(
						{
							days,
							start: startTime,
							end: endTime,
							startDate: startDateInputValue,
							sessionsTotal: draftTotal,
							excludeClassId: cls.id,
						},
						existingClasses,
					),
		[
			hasRealSessions,
			days,
			startTime,
			endTime,
			startDateInputValue,
			draftTotal,
			cls.id,
			existingClasses,
		],
	);
	const showScheduleConflicts =
		!hasRealSessions && !saving && !notice && scheduleConflicts.length > 0;

	function handleDaysChange(nextDays: number[]) {
		setDays(nextDays);
		if (!parsedInitialSchedule) {
			if (nextDays.length > 0 && startTime === "" && endTime === "") {
				setStartTime(SESSION_PRESETS.defaultStart);
				setEndTime(SESSION_PRESETS.defaultEnd);
			} else if (nextDays.length === 0 && !timesTouched) {
				setStartTime("");
				setEndTime("");
			}
		}
	}

	function handleStartTimeChange(next: string) {
		setTimesTouched(true);
		setStartTime(next);
		if (!endTouched && next) {
			setEndTime(addMinutes(next, SESSION_PRESETS.durationMinutes));
		}
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;

		const trimmedName = name.trim();
		if (!trimmedName) {
			setError("Vui lòng nhập tên lớp.");
			return;
		}
		if (trimmedName.length > 120) {
			setError("Tên lớp tối đa 120 ký tự.");
			return;
		}
		if (classType === "ielts" && skills.length === 0) {
			setError("Chọn ít nhất một kỹ năng.");
			return;
		}
		const trimmedMode = mode.trim();
		if (!trimmedMode) {
			setError("Vui lòng chọn hình thức.");
			return;
		}
		const parsedFee = parseVndAmount(fee);
		if (fee.trim() !== "" && (parsedFee === null || parsedFee < 1)) {
			setError("Học phí phải là số nguyên dương.");
			return;
		}

		const payload: Extract<KernelAction, { type: "update-class" }>["payload"] =
			{
				name: trimmedName,
				type: classType,
				level: level.trim(),
				skills: classType === "ielts" ? skills : [],
				mode: trimmedMode,
				tuitionFee: fee.trim() === "" ? null : parsedFee,
			};

		if (!hasRealSessions) {
			const shouldSendSchedule =
				parsedInitialSchedule !== null ||
				days.length > 0 ||
				startTime !== "" ||
				endTime !== "";

			if (shouldSendSchedule) {
				if (days.length === 0) {
					setError("Chọn ít nhất một ngày học.");
					return;
				}
				if (!startTime || !endTime) {
					setError("Nhập giờ bắt đầu và giờ kết thúc.");
					return;
				}
				if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
					setError("Giờ học phải đúng định dạng HH:mm.");
					return;
				}
				if (endTime <= startTime) {
					setError("Giờ kết thúc phải sau giờ bắt đầu.");
					return;
				}
				payload.schedule = normalizeScheduleInput({
					days,
					start: startTime,
					end: endTime,
				});
			}

			const startDateChanged = trimmedStartDate !== cls.startDate.trim();
			if (startDateChanged) {
				if (trimmedStartDate !== "") {
					if (!isValidIsoCalendarDate(trimmedStartDate)) {
						setError("Ngày khai giảng không hợp lệ.");
						return;
					}
					if (trimmedStartDate < todayVN) {
						setError("Ngày khai giảng mới phải từ hôm nay trở đi.");
						return;
					}
				}
				payload.startDate = trimmedStartDate;
			}

			if (!sessionsLockedByCurriculum) {
				const trimmedTotal = total.trim();
				const isUnchangedZero = cls.sessionsTotal === 0 && trimmedTotal === "";
				const isUnchangedLegacyOverCap =
					cls.sessionsTotal > SESSION_PRESETS.maxSessions &&
					trimmedTotal === String(cls.sessionsTotal);

				if (!isUnchangedZero && !isUnchangedLegacyOverCap) {
					const parsedTotal = parseValidSessionsTotal(trimmedTotal);
					if (parsedTotal === null) {
						setError("Tổng số buổi phải từ 1 đến 52.");
						return;
					}
					payload.sessionsTotal = parsedTotal;
				}
			}
		}

		const result = await run({
			type: "update-class",
			classId: cls.id,
			payload,
		});
		if (result?.kind === "refreshed") {
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Chỉnh sửa lớp học"
		>
			<form noValidate onSubmit={submit}>
				<div className="flex flex-col gap-4">
					<p className="font-medium text-muted-foreground text-xs">
						Thông tin chung
					</p>
					<Field label="Tên lớp *">
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="VD: IELTS Writing 7.0 — Nhóm tối"
							disabled={saving}
						/>
					</Field>
					<Field label="Loại lớp">
						{/* biome-ignore lint/a11y/useSemanticElements: nhóm chip loại lớp gắn role="group" + aria-label theo DESIGN.md */}
						<div role="group" aria-label="Loại lớp">
							<ChipMulti
								options={CLASS_TYPE_OPTIONS}
								value={[classType]}
								disabled={saving}
								onChange={(next) => {
									const other = next.find((v) => v !== classType);
									if (other) {
										setClassType(other);
										if (other === "communication") {
											setSkills([]);
										}
									}
								}}
							/>
						</div>
					</Field>
					<div className="grid grid-cols-2 gap-4 max-app:grid-cols-1">
						<Field label="Trình độ">
							<Select
								value={level}
								onChange={(e) => setLevel(e.target.value)}
								disabled={saving}
							>
								<option value="">Chưa chọn</option>
								{levelOptions.map((opt) => (
									<option key={opt} value={opt}>
										{opt}
									</option>
								))}
							</Select>
						</Field>
						<Field label="Hình thức">
							<Select
								value={mode}
								onChange={(e) => setMode(e.target.value)}
								disabled={saving}
							>
								{modeOptions.map((opt) => (
									<option key={opt} value={opt}>
										{opt}
									</option>
								))}
							</Select>
						</Field>
					</div>
					<Field
						label={classType === "ielts" ? "Kỹ năng *" : "Kỹ năng"}
						help={
							classType === "communication"
								? "Lớp Giao tiếp không chọn kỹ năng IELTS."
								: undefined
						}
					>
						{/* biome-ignore lint/a11y/useSemanticElements: nhóm chip kỹ năng gắn role="group" + aria-label theo DESIGN.md */}
						<div role="group" aria-label="Kỹ năng">
							<ChipMulti
								options={SKILL_OPTIONS}
								value={classType === "communication" ? [] : skills}
								onChange={setSkills}
								disabled={classType === "communication" || saving}
							/>
						</div>
					</Field>
					<Field
						label="Học phí / học viên (VND)"
						help="Để trống nếu chưa thiết lập học phí"
					>
						<CurrencyInput
							placeholder="Không bắt buộc"
							value={fee}
							onChange={setFee}
							disabled={saving}
						/>
					</Field>
				</div>

				<div className="flex flex-col gap-4 border-border border-t pt-4">
					<p className="font-medium text-muted-foreground text-xs">
						Lịch học &amp; Thời lượng
					</p>
					{hasRealSessions && (
						<p
							data-testid="schedule-locked-note"
							className="rounded-md border border-border bg-muted px-3 py-2 text-muted-foreground text-xs"
						>
							Lớp đã có buổi học thực tế nên lịch học, ngày khai giảng và tổng
							số buổi được khóa. Bạn vẫn có thể chỉnh sửa thông tin chung của
							lớp.
						</p>
					)}
					{!hasRealSessions &&
						!parsedInitialSchedule &&
						cls.schedule.trim() !== "" && (
							<p className="rounded-md border border-border bg-muted px-3 py-2 text-muted-foreground text-xs">
								Lịch hiện tại (định dạng cũ): {cls.schedule}. Để trống nếu muốn
								giữ nguyên, hoặc chọn ngày &amp; giờ mới bên dưới.
							</p>
						)}
					<Field label="Ngày học">
						{/* biome-ignore lint/a11y/useSemanticElements: nhóm chip ngày học gắn role="group" + aria-label theo DESIGN.md */}
						<div role="group" aria-label="Ngày học">
							<ChipMulti
								options={DAY_OPTIONS}
								value={days}
								onChange={handleDaysChange}
								disabled={hasRealSessions || saving}
							/>
						</div>
					</Field>
					<div className="grid grid-cols-2 gap-4 max-app:grid-cols-1">
						<Field label="Giờ bắt đầu">
							<Input
								type="time"
								value={startTime}
								onChange={(e) => handleStartTimeChange(e.target.value)}
								disabled={hasRealSessions || saving}
							/>
						</Field>
						<Field label="Giờ kết thúc">
							<Input
								type="time"
								value={endTime}
								onChange={(e) => {
									setTimesTouched(true);
									setEndTouched(true);
									setEndTime(e.target.value);
								}}
								disabled={hasRealSessions || saving}
							/>
						</Field>
					</div>
					{showScheduleConflicts && (
						<div
							role="status"
							data-testid="schedule-conflict-warning"
							className="rounded-md bg-warn-soft p-3 text-warn text-xs"
						>
							<p className="font-medium">
								<span className="mr-2 inline-flex rounded-md bg-destructive px-2 py-0.5 font-medium text-white text-xs">
									Trùng lịch
								</span>
								Lịch bị trùng với lớp đang học
							</p>
							<ul className="mt-1 space-y-0.5">
								{scheduleConflicts
									.slice(0, 3)
									.map(({ cls: other, sharedDays, schedule }) => (
										<li key={other.id} className="break-words">
											{other.name} ·{" "}
											{sharedDays.map((d) => dayNames[d]).join(" & ")} ·{" "}
											{schedule.start}–{schedule.end}
										</li>
									))}
								{scheduleConflicts.length > 3 && (
									<li>+{scheduleConflicts.length - 3} lớp khác</li>
								)}
							</ul>
						</div>
					)}
					<div className="grid grid-cols-2 gap-4 max-app:grid-cols-1">
						<Field
							label="Tổng số buổi"
							help={
								sessionsLockedByCurriculum && !hasRealSessions
									? "Đang đồng bộ theo giáo trình của lớp"
									: undefined
							}
						>
							<Input
								type="number"
								min={SESSION_PRESETS.minSessions}
								max={SESSION_PRESETS.maxSessions}
								placeholder={cls.sessionsTotal === 0 ? "Thủ công" : undefined}
								value={total}
								onChange={(e) => setTotal(e.target.value)}
								disabled={
									hasRealSessions || sessionsLockedByCurriculum || saving
								}
							/>
						</Field>
						<Field
							label="Ngày khai giảng"
							help={
								isLegacyStartDate
									? `Ngày hiện tại: ${cls.startDate} (giữ nguyên nếu không chọn ngày mới)`
									: undefined
							}
						>
							<Input
								type="date"
								value={startDateInputValue}
								min={todayVN}
								onChange={(e) => setStartDate(e.target.value)}
								disabled={hasRealSessions || saving}
							/>
						</Field>
					</div>
				</div>

				<div className="flex flex-col gap-2 empty:hidden">
					{error && (
						<p role="alert" className="text-danger text-xs">
							{error}
						</p>
					)}
					{notice && (
						<KernelSubmitNotice
							notice={notice}
							onReconcile={reconcileAndFinish}
							disabled={saving}
						/>
					)}
				</div>
				<div className="flex justify-end gap-2 border-border border-t border-solid pt-4">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving || submitBlocked}>
						Lưu thay đổi
					</Button>
				</div>
			</form>
		</Modal>
	);
}
