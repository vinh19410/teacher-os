import {
	CLASS_TYPES,
	type ClassType,
	IELTS_SKILLS,
} from "@teacher-os/api/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipMulti } from "@/components/ui/chip-multi";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
	getTomorrowDateInputValue,
	isFutureDateInputValue,
} from "@/lib/date-input";
import { addMinutes } from "@/lib/format-schedule";
import { CLASS_TYPE_LABELS, dayNames } from "@/lib/mock-data";
import { useSyllabus } from "@/lib/repos/use-syllabus";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const CLASS_TYPE_OPTIONS = CLASS_TYPES.map((value) => ({
	value,
	label: CLASS_TYPE_LABELS[value],
}));

const SKILL_OPTIONS = IELTS_SKILLS.map((value) => ({ value, label: value }));

const DAY_OPTIONS = dayNames.map((label, value) => ({ value, label }));

const SESSION_MINUTES = 90;
const DEFAULT_START = "19:00";
const DEFAULT_END = addMinutes(DEFAULT_START, SESSION_MINUTES);

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

	function resetForm() {
		setName("");
		setSkills([]);
		setDays([]);
		setStartTime(DEFAULT_START);
		setEndTime(DEFAULT_END);
		setEndTouched(false);
		setStartDate(getTomorrowDateInputValue());
	}

	function changeStart(next: string) {
		setStartTime(next);
		if (!endTouched && next) setEndTime(addMinutes(next, SESSION_MINUTES));
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
		if (startTime === endTime) {
			setError("Giờ kết thúc phải khác giờ bắt đầu.");
			return;
		}
		if (!isFutureDateInputValue(startDate)) {
			setError("Vui lòng chọn ngày bắt đầu sau hôm nay.");
			return;
		}
		// Mirror of the server cap (classCreateSchema sessionsTotal ≤ 52):
		// exceeding it would only surface as a generic server error banner.
		const parsedTotal = Number.parseInt(total, 10) || 12;
		if (parsedTotal > 52) {
			setError("Tổng số buổi tối đa là 52.");
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
				<Field label="Tên lớp *" error={error}>
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
						/>
					</Field>
				)}
				<Field label="Template giáo trình">
					<Select
						value={templateId}
						onChange={(e) => setTemplateId(e.target.value)}
					>
						<option value="">— Lớp trống —</option>
						{templates.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</Select>
				</Field>
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
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Field label="Tổng số buổi">
						<Input
							type="number"
							min={0}
							max={52}
							value={total}
							onChange={(e) => setTotal(e.target.value)}
						/>
					</Field>
					<Field label="Ngày bắt đầu">
						<Input
							type="date"
							value={startDate}
							min={minimumStartDate}
							onChange={(e) => setStartDate(e.target.value)}
						/>
					</Field>
				</div>
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
