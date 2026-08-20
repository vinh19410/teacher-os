import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export function AddClassModal({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const { data } = useData();
	const [name, setName] = useState("");
	const [level, setLevel] = useState("Band 7.0");
	const [skill, setSkill] = useState("Writing");
	const [mode, setMode] = useState("Online");
	const [syllabusId, setSyllabusId] = useState("");
	const [schedule, setSchedule] = useState("");
	const [total, setTotal] = useState("12");
	const [startDate, setStartDate] = useState("19/08");
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!name.trim()) {
			setError("Vui lòng nhập tên lớp.");
			return;
		}
		const result = await run({
			type: "add-class",
			payload: {
				name: name.trim(),
				level,
				skill,
				mode,
				syllabusId,
				schedule: schedule.trim(),
				sessionsTotal: Number.parseInt(total, 10) || 12,
				startDate: startDate.trim(),
			},
		});
		if (result?.kind === "refreshed") {
			setName("");
			setSchedule("");
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			setName("");
			setSchedule("");
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Tạo lớp mới"
		>
			<form onSubmit={submit}>
				<Field label="Tên lớp *" error={error}>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="VD: IELTS Writing 7.0 — Nhóm tối"
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
					<Field label="Kỹ năng">
						<Select value={skill} onChange={(e) => setSkill(e.target.value)}>
							<option>Writing</option>
							<option>Speaking</option>
							<option>Reading</option>
							<option>Listening</option>
							<option>Giao tiếp</option>
						</Select>
					</Field>
				</div>
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Field label="Hình thức">
						<Select value={mode} onChange={(e) => setMode(e.target.value)}>
							<option>Online</option>
							<option>Offline</option>
						</Select>
					</Field>
					<Field label="Syllabus">
						<Select
							value={syllabusId}
							onChange={(e) => setSyllabusId(e.target.value)}
						>
							<option value="">— Chưa gán —</option>
							{data.syllabi.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</Select>
					</Field>
				</div>
				<Field label="Lịch học">
					<Input
						value={schedule}
						onChange={(e) => setSchedule(e.target.value)}
						placeholder="VD: T3 & T5 · 19:00–20:30"
					/>
				</Field>
				<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
					<Field label="Tổng số buổi">
						<Input
							type="number"
							value={total}
							onChange={(e) => setTotal(e.target.value)}
						/>
					</Field>
					<Field label="Ngày bắt đầu">
						<Input
							value={startDate}
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
