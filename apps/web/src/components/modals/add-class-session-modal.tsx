import type { SyllabusBankMaterialRef } from "@teacher-os/api/material-contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MaterialPicker } from "@/components/materials/material-picker";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { parseSchedule } from "@/lib/format-schedule";
import type { ClassGroup } from "@/lib/mock-data";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { todayISOVietnam } from "@/lib/week-grid";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export interface AddClassSessionModalProps {
	open: boolean;
	onClose: () => void;
	cls: ClassGroup;
	existingDateISOs?: string[];
}

export function suggestNextSessionDate(
	scheduleStr: string,
	startDateStr: string,
	existingDateISOs: string[] = [],
): { date: string; time: string; dur: number } {
	const parsed = parseSchedule(scheduleStr);
	const defaultTime = parsed?.start ?? "19:00";
	const defaultEnd = parsed?.end ?? "20:30";
	const [h1, m1] = defaultTime.split(":").map(Number);
	const [h2, m2] = defaultEnd.split(":").map(Number);
	const defaultDur = (h2 * 60 + m2 - (h1 * 60 + m1) + 1440) % 1440 || 90;

	const todayVN = todayISOVietnam();
	if (!parsed || parsed.days.length === 0) {
		const [y, m, dayNum] = todayVN.split("-").map(Number);
		const tomorrow = new Date(Date.UTC(y, m - 1, dayNum + 1));
		return {
			date: tomorrow.toISOString().slice(0, 10),
			time: defaultTime,
			dur: defaultDur,
		};
	}

	const existingSet = new Set(existingDateISOs);
	let startAnchor =
		startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)
			? new Date(`${startDateStr}T00:00:00Z`)
			: new Date(`${todayVN}T00:00:00Z`);

	if (existingDateISOs.length > 0) {
		const sorted = [...existingDateISOs].sort();
		const latest = sorted[sorted.length - 1];
		if (latest) {
			const latestDate = new Date(`${latest}T00:00:00Z`);
			latestDate.setUTCDate(latestDate.getUTCDate() + 1);
			startAnchor = latestDate;
		}
	}

	for (let offset = 0; offset < 365; offset++) {
		const d = new Date(startAnchor.getTime() + offset * 86400000);
		// getUTCDay(): 0=Sun, 1=Mon... -> Monday-first (0=Mon...6=Sun)
		const day0 = (d.getUTCDay() + 6) % 7;
		const iso = d.toISOString().slice(0, 10);
		if (parsed.days.includes(day0) && !existingSet.has(iso)) {
			return {
				date: iso,
				time: defaultTime,
				dur: defaultDur,
			};
		}
	}

	const [y, m, dayNum] = todayVN.split("-").map(Number);
	const fallback = new Date(Date.UTC(y, m - 1, dayNum + 1));
	return {
		date: fallback.toISOString().slice(0, 10),
		time: defaultTime,
		dur: defaultDur,
	};
}

export function AddClassSessionModal({
	open,
	onClose,
	cls,
	existingDateISOs = [],
}: AddClassSessionModalProps) {
	const [date, setDate] = useState("");
	const [time, setTime] = useState("19:00");
	const [dur, setDur] = useState("90");
	const [topic, setTopic] = useState("");
	const [zoom, setZoom] = useState("");
	// Tài liệu ngân hàng chọn cho buổi mới (#655) — projection an toàn, chỉ
	// materialIds đi lên payload.
	const [bankMaterials, setBankMaterials] = useState<SyllabusBankMaterialRef[]>(
		[],
	);
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	const wasOpenRef = useRef(false);
	useEffect(() => {
		if (open && !wasOpenRef.current) {
			const suggestion = suggestNextSessionDate(
				cls.schedule,
				cls.startDate,
				existingDateISOs,
			);
			setDate(suggestion.date);
			setTime(suggestion.time);
			setDur(String(suggestion.dur));
			setTopic("");
			setZoom("");
			setBankMaterials([]);
			setError(undefined);
		}
		wasOpenRef.current = open;
	}, [open, cls.schedule, cls.startDate, existingDateISOs, setError]);

	function resetForm() {
		setTopic("");
		setZoom("");
		setBankMaterials([]);
		setError(undefined);
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;

		if (!date.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
			setError("Vui lòng chọn ngày học hợp lệ (YYYY-MM-DD).");
			return;
		}
		if (!time.trim() || !/^\d{2}:\d{2}$/.test(time.trim())) {
			setError("Vui lòng chọn giờ học hợp lệ (HH:mm).");
			return;
		}
		const durNum = Number.parseInt(dur, 10);
		if (!Number.isInteger(durNum) || durNum < 15 || durNum > 360) {
			setError("Thời lượng buổi học phải từ 15 đến 360 phút.");
			return;
		}
		if (!topic.trim()) {
			setError("Vui lòng nhập tên hoặc chủ đề buổi học.");
			return;
		}

		if (existingDateISOs.includes(date.trim())) {
			setError("Lớp đã có buổi học vào ngày này.");
			return;
		}

		const result = await run({
			type: "add-manual-session",
			classId: cls.id,
			payload: {
				date: date.trim(),
				time: time.trim(),
				dur: durNum,
				topic: topic.trim(),
				zoom: zoom.trim(),
				// Chỉ gửi khi có chọn — thiếu key, server default [] (#655).
				...(bankMaterials.length > 0
					? { materialIds: bankMaterials.map((m) => m.id) }
					: {}),
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
			title="Thêm buổi học thủ công"
		>
			<form noValidate onSubmit={submit} className="flex flex-col gap-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label="Ngày học *" error={error}>
						<Input
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							disabled={saving}
							required
						/>
					</Field>
					<div className="grid grid-cols-2 gap-2">
						<Field label="Giờ học *">
							<Input
								type="time"
								value={time}
								onChange={(e) => setTime(e.target.value)}
								disabled={saving}
								required
							/>
						</Field>
						<Field label="Thời lượng (phút)">
							<Input
								type="number"
								min={15}
								max={360}
								step={15}
								value={dur}
								onChange={(e) => setDur(e.target.value)}
								disabled={saving}
							/>
						</Field>
					</div>
				</div>

				<Field label="Chủ đề buổi học *">
					<Input
						value={topic}
						onChange={(e) => setTopic(e.target.value)}
						placeholder="VD: Writing Task 1: Line Chart"
						disabled={saving}
						required
					/>
				</Field>

				<Field label="Link Zoom / Học online (tùy chọn)">
					<Input
						value={zoom}
						onChange={(e) => setZoom(e.target.value)}
						placeholder="https://zoom.us/j/..."
						disabled={saving}
					/>
				</Field>

				{/* biome-ignore lint/a11y/useSemanticElements: role="group" + aria-label đặt tên nhóm tài liệu theo pattern ChipFilter cho SR/e2e */}
				<div
					role="group"
					aria-label="Tài liệu ngân hàng"
					className="grid gap-2"
				>
					<p className="font-medium text-sm leading-none">Tài liệu</p>
					<MaterialPicker
						selected={bankMaterials}
						onPick={(ref) =>
							setBankMaterials((prev) =>
								prev.some((m) => m.id === ref.id) ? prev : [...prev, ref],
							)
						}
						onRemove={(id) =>
							setBankMaterials((prev) => prev.filter((m) => m.id !== id))
						}
						disabled={saving}
					/>
				</div>

				{notice && (
					<KernelSubmitNotice
						notice={notice}
						onReconcile={reconcileAndFinish}
						disabled={saving}
					/>
				)}

				<div className="flex justify-end gap-2 border-border border-t pt-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving || submitBlocked}>
						{saving ? "Đang lưu…" : "Thêm buổi học"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
