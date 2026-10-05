import {
	CLASS_TYPES,
	type ClassType,
	IELTS_SKILLS,
} from "@teacher-os/api/contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipMulti } from "@/components/ui/chip-multi";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tag } from "@/components/ui/tag";
import {
	getTomorrowDateInputValue,
	isFutureDateInputValue,
} from "@/lib/date-input";
import { parseVndAmount } from "@/lib/format-currency";
import { addMinutes } from "@/lib/format-schedule";
import { CLASS_TYPE_LABELS, dayNames, type Syllabus } from "@/lib/mock-data";
import { useClasses } from "@/lib/repos/use-classes";
import { useSyllabus } from "@/lib/repos/use-syllabus";
import { findScheduleConflicts } from "@/lib/schedule-conflicts";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const CLASS_TYPE_OPTIONS = CLASS_TYPES.map((value) => ({
	value,
	label: CLASS_TYPE_LABELS[value],
}));

const SKILL_OPTIONS = IELTS_SKILLS.map((value) => ({ value, label: value }));

/** Kỹ năng lớp lấy từ syllabus: thứ tự canonical theo IELTS_SKILLS,
 * tự dedupe và lọc giá trị ngoài enum (phòng thủ dữ liệu cũ). */
export function skillsFromTemplate(
	templateSkills: readonly string[],
): string[] {
	return IELTS_SKILLS.filter((skill) => templateSkills.includes(skill));
}

/** Tổng số buổi lấy từ syllabus: đếm mọi buổi qua mọi module,
 * gồm cả buổi thi (midterm/final). Đếm từ cây modules thay vì
 * totalLessons vì totalLessons có thể stale (chỉ sync khi replace). */
export function sessionsFromTemplate(
	templateModules: Syllabus["modules"] | undefined | null,
): number {
	return (templateModules ?? []).reduce(
		(sum, module) => sum + (module?.lessons?.length ?? 0),
		0,
	);
}

const DAY_OPTIONS = dayNames.map((label, value) => ({ value, label }));

const SESSION_MINUTES = 90;
const DEFAULT_START = "19:00";
const DEFAULT_END = addMinutes(DEFAULT_START, SESSION_MINUTES);

export function ClassTemplatePicker({
	templates,
	templateId,
	onTemplateId,
}: {
	templates: ReadonlyArray<{
		id: string;
		name: string;
		skills: readonly string[];
	}>;
	templateId: string;
	onTemplateId: (value: string) => void;
}) {
	const selectedTemplate = templates.find((item) => item.id === templateId);
	return (
		<>
			<Field label="Template giáo trình">
				<Select
					value={templateId}
					onChange={(event) => onTemplateId(event.target.value)}
				>
					<option value="">— Lớp trống —</option>
					{templates.map((item) => (
						<option key={item.id} value={item.id}>
							{item.name} · {item.skills.length} kỹ năng
						</option>
					))}
				</Select>
			</Field>
			{selectedTemplate ? (
				selectedTemplate.skills.length > 0 ? (
					<div className="flex flex-wrap items-center gap-1">
						<span className="text-muted-fg text-sm">Kỹ năng giáo trình</span>
						{selectedTemplate.skills.map((skill) => (
							<Tag key={skill}>{skill}</Tag>
						))}
					</div>
				) : (
					<p className="text-muted-fg text-sm">
						Syllabus chưa khai báo kỹ năng
					</p>
				)
			) : null}
		</>
	);
}

export function AddClassModal({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { templates } = useSyllabus();
	const [name, setName] = useState("");
	const [level, setLevel] = useState("Band 7.0");
	const [classType, setClassType] = useState<ClassType>("ielts");
	const [skills, setSkills] = useState<string[]>([]);
	const [mode, setMode] = useState("Online");
	const [templateId, setTemplateId] = useState("");
	const [days, setDays] = useState<number[]>([]);
	const [startTime, setStartTime] = useState(DEFAULT_START);
	const [endTime, setEndTime] = useState(DEFAULT_END);
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
	const parsedDraftTotal = Number.parseInt(total, 10);
	const draftTotal =
		Number.isInteger(parsedDraftTotal) &&
		parsedDraftTotal >= 1 &&
		parsedDraftTotal <= 52
			? parsedDraftTotal
			: 0;
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
							<option>Band 5.5</option>
							<option>Band 6.0</option>
							<option>Band 6.5</option>
							<option>Band 7.0</option>
							<option>Band 7.5+</option>
						</Select>
					</Field>
					<Field label="Hình thức">
						<Select value={mode} onChange={(e) => setMode(e.target.value)}>
							<option>Online</option>
							<option>Offline</option>
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
				<ClassTemplatePicker
					templates={templates}
					templateId={templateId}
					onTemplateId={changeTemplateId}
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
					<div
						role="status"
						data-testid="schedule-conflict-warning"
						className="rounded-sm border border-warn border-solid bg-warn-soft p-3 text-warn text-xs"
					>
						<p className="font-medium">Lịch bị trùng với lớp đang học</p>
						<ul className="mt-1 space-y-0.5">
							{scheduleConflicts
								.slice(0, 3)
								.map(({ cls, sharedDays, schedule }) => (
									// JSX text children — React escape tên lớp tự do;
									// không bao giờ HTML inner.
									<li key={cls.id} className="break-words">
										{cls.name} ·{" "}
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
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
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
				<div className="flex flex-col gap-2">
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
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
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
