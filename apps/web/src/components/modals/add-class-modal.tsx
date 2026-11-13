import type { ClassType } from "@teacher-os/api/contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { TemplatePicker } from "@/components/syllabus/template-picker";
import { Button } from "@/components/ui/button";
import { ChipMulti } from "@/components/ui/chip-multi";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
	getTomorrowDateInputValue,
	isFutureDateInputValue,
} from "@/lib/date-input";
import { parseVndAmount } from "@/lib/format-currency";
import { addMinutes } from "@/lib/format-schedule";
import { useClasses } from "@/lib/repos/use-classes";
import { useTemplates } from "@/lib/repos/use-syllabus";
import { findScheduleConflicts } from "@/lib/schedule-conflicts";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import {
	CLASS_TYPE_OPTIONS,
	DAY_OPTIONS,
	LEVEL_OPTIONS,
	MODE_OPTIONS,
	parseValidSessionsTotal,
	SESSION_PRESETS,
	SKILL_OPTIONS,
	sessionsFromTemplate,
	skillsFromTemplate,
} from "./class-form-helpers";
import { KernelSubmitNotice } from "./kernel-submit-notice";
import { ScheduleConflictBanner } from "./schedule-conflict-banner";

export { sessionsFromTemplate, skillsFromTemplate };

const SESSION_MINUTES = SESSION_PRESETS.durationMinutes;
const DEFAULT_START = SESSION_PRESETS.defaultStart;
const DEFAULT_END = SESSION_PRESETS.defaultEnd;

export function AddClassModal({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const templates = useTemplates();
	const [name, setName] = useState("");
	const [level, setLevel] = useState("Band 7.0");
	const [classType, setClassType] = useState<ClassType>("ielts");
	const [skills, setSkills] = useState<string[]>([]);
	const [mode, setMode] = useState("Online");
	const [templateId, setTemplateId] = useState("");
	const [days, setDays] = useState<number[]>([]);
	const [startTime, setStartTime] = useState<string>(DEFAULT_START);
	const [endTime, setEndTime] = useState<string>(DEFAULT_END);
	const [endTouched, setEndTouched] = useState(false);
	const [total, setTotal] = useState("12");
	const [fee, setFee] = useState("");
	const [startDate, setStartDate] = useState(getTomorrowDateInputValue);
	const minimumStartDate = getTomorrowDateInputValue();
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	useEffect(() => {
		if (!open) return;
		setStartDate((current) =>
			isFutureDateInputValue(current) ? current : minimumStartDate,
		);
	}, [minimumStartDate, open]);

	// #315: cảnh báo realtime khi lịch chọn trùng lớp đang chạy — không chặn
	// submit (giáo viên có thể cố ý dạy song song). Ẩn khi saving/notice để
	// khỏi tự cảnh báo chính lớp vừa tạo trong optimistic store.
	const { classes } = useClasses();
	// Parse như path submit (issue #105): draft sai schema không đóng góp run
	// window và không đưa vào skeletonOf một total không chặn (trục draft;
	// trục stored class đã clamp trong helper theo precedent class-sessions).
	const draftTotal = parseValidSessionsTotal(total) ?? 0;
	const scheduleConflicts = useMemo(
		() =>
			findScheduleConflicts(
				{
					days,
					start: startTime,
					end: endTime,
					startDate,
					sessionsTotal: draftTotal,
				},
				classes,
			),
		[days, startTime, endTime, startDate, draftTotal, classes],
	);
	const showScheduleConflicts =
		!saving && !notice && scheduleConflicts.length > 0;

	// Mục đã base theo syllabus thì view-only: điều kiện khóa trùng
	// điều kiện auto-fill trong changeTemplateId — khóa đúng khi giá trị
	// đang do syllabus quyết định.
	const selectedTemplate = templates.find((item) => item.id === templateId);
	const skillsLocked = Boolean(
		selectedTemplate && selectedTemplate.skills.length > 0,
	);
	const sessionsLocked = Boolean(
		selectedTemplate && sessionsFromTemplate(selectedTemplate.modules) > 0,
	);

	function resetForm() {
		setName("");
		setLevel("Band 7.0");
		setClassType("ielts");
		setSkills([]);
		setMode("Online");
		setTemplateId("");
		setDays([]);
		setStartTime(DEFAULT_START);
		setEndTime(DEFAULT_END);
		setEndTouched(false);
		setTotal("12");
		setStartDate(getTomorrowDateInputValue());
		setFee("");
	}

	function changeStart(next: string) {
		setStartTime(next);
		if (!endTouched && next) setEndTime(addMinutes(next, SESSION_MINUTES));
	}

	function changeTemplateId(next: string) {
		setTemplateId(next);
		const template = templates.find((item) => item.id === next);
		// Template rỗng hoặc syllabus chưa khai báo kỹ năng: giữ selection tay.
		if (template && template.skills.length > 0) {
			setSkills(skillsFromTemplate(template.skills));
		}
		// Syllabus chưa có buổi nào: giữ số buổi nhập tay.
		const sessions = template ? sessionsFromTemplate(template.modules) : 0;
		if (sessions > 0) {
			setTotal(String(sessions));
		}
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!name.trim()) {
			setError("Vui lòng nhập tên lớp.");
			return;
		}
		if (classType === "ielts" && skills.length === 0) {
			setError("Chọn ít nhất một kỹ năng.");
			return;
		}
		if (days.length === 0) {
			setError("Chọn ít nhất một ngày học.");
			return;
		}
		if (!startTime || !endTime) {
			setError("Nhập giờ bắt đầu và giờ kết thúc.");
			return;
		}
		if (endTime <= startTime) {
			setError("Giờ kết thúc phải sau giờ bắt đầu.");
			return;
		}
		if (!isFutureDateInputValue(startDate)) {
			setError("Vui lòng chọn ngày bắt đầu sau hôm nay.");
			return;
		}
		// Mirror of the server cap (classCreateSchema sessionsTotal 1..52).
		// Issue #105: `parseInt || 12` silently coerced 0 → 12 — a strict
		// parse now errors instead, matching the server's min(1).
		const parsedTotal = Number.parseInt(total, 10);
		if (!Number.isInteger(parsedTotal) || parsedTotal < 1) {
			setError("Tổng số buổi phải từ 1 đến 52.");
			return;
		}
		if (parsedTotal > 52) {
			setError("Tổng số buổi tối đa là 52.");
			return;
		}
		const parsedFee = parseVndAmount(fee);
		if (fee.trim() !== "" && (parsedFee === null || parsedFee < 1)) {
			setError("Học phí phải là số nguyên dương.");
			return;
		}
		const result = await run({
			type: "add-class",
			payload: {
				name: name.trim(),
				type: classType,
				level,
				skills: classType === "ielts" ? skills : [],
				mode,
				templateId,
				schedulingMode: templateId.trim() !== "" ? "auto" : "manual",
				schedule: { days, start: startTime, end: endTime },
				sessionsTotal: parsedTotal,
				startDate: startDate.trim(),
				tuitionFee: fee.trim() === "" ? null : parsedFee,
			},
		});
		if (result?.kind === "refreshed") {
			resetForm();
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			resetForm();
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Tạo lớp mới"
		>
			<form noValidate onSubmit={submit}>
				<Field label="Tên lớp *">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="VD: IELTS Writing 7.0 — Nhóm tối"
					/>
				</Field>
				<Field label="Loại lớp">
					<ChipMulti
						options={CLASS_TYPE_OPTIONS}
						value={[classType]}
						onChange={(next) => {
							const other = next.find((v) => v !== classType);
							if (other) setClassType(other);
						}}
					/>
				</Field>
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Field label="Trình độ">
						<Select value={level} onChange={(e) => setLevel(e.target.value)}>
							{LEVEL_OPTIONS.map((opt) => (
								<option key={opt} value={opt}>
									{opt}
								</option>
							))}
						</Select>
					</Field>
					<Field label="Hình thức">
						<Select value={mode} onChange={(e) => setMode(e.target.value)}>
							{MODE_OPTIONS.map((opt) => (
								<option key={opt} value={opt}>
									{opt}
								</option>
							))}
						</Select>
					</Field>
				</div>
				{classType === "ielts" && (
					<Field label="Kỹ năng *">
						<ChipMulti
							options={SKILL_OPTIONS}
							value={skills}
							onChange={setSkills}
							disabled={skillsLocked}
						/>
					</Field>
				)}
				{/* TemplatePicker dùng chung (issue #394) — allowEmpty cho lớp trống. */}
				<TemplatePicker
					allowEmpty
					templates={templates}
					value={templateId}
					onChange={changeTemplateId}
				/>
				<Field label="Ngày học *">
					<ChipMulti options={DAY_OPTIONS} value={days} onChange={setDays} />
				</Field>
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Field label="Giờ bắt đầu">
						<Input
							type="time"
							value={startTime}
							onChange={(e) => changeStart(e.target.value)}
						/>
					</Field>
					<Field label="Giờ kết thúc">
						<Input
							type="time"
							value={endTime}
							onChange={(e) => {
								setEndTouched(true);
								setEndTime(e.target.value);
							}}
						/>
					</Field>
				</div>
				{showScheduleConflicts && (
					<ScheduleConflictBanner conflicts={scheduleConflicts} />
				)}
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					{templateId.trim() !== "" ? (
						<Field label="Tổng số buổi">
							<Input
								type="number"
								min={1}
								max={52}
								value={total}
								onChange={(e) => setTotal(e.target.value)}
								disabled={sessionsLocked}
							/>
						</Field>
					) : (
						<p className="self-center rounded-md bg-muted p-3 text-muted-foreground text-xs">
							Lớp sẽ bắt đầu với 0 buổi — thêm buổi học thủ công ở tab "Buổi học
							&amp; luyện tập" sau khi tạo lớp.
						</p>
					)}
					<Field label="Học phí / học viên (VND)">
						<CurrencyInput
							placeholder="Không bắt buộc"
							value={fee}
							onChange={setFee}
						/>
					</Field>
				</div>
				<Field label="Ngày bắt đầu">
					<Input
						type="date"
						value={startDate}
						min={minimumStartDate}
						onChange={(e) => setStartDate(e.target.value)}
					/>
				</Field>
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
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving || submitBlocked}>
						Tạo lớp
					</Button>
				</div>
			</form>
		</Modal>
	);
}
