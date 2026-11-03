import type {
	ClassStudyPackView,
	StudyPackSummaryView,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { Plus } from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { skillOf } from "@/components/assignments/assignment-presets";
import { fmtDue } from "@/components/assignments/assignment-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
	assignStudyPackToClass,
	cancelClassStudyPack,
	fetchClassStudyPacks,
	fetchStudyPacks,
} from "@/lib/repos/study-pack";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SchedulePreviewDay {
	dayIndex: number;
	date: string;
}

export interface SchedulePreviewResult {
	days: SchedulePreviewDay[];
	skippedHolidays: { date: string; name: string }[];
}

export function buildStudyPackSchedulePreview(
	startDate: string,
	dayCount: number,
	holidays: { date: string; name: string }[],
): SchedulePreviewResult {
	if (!ISO_DATE_RE.test(startDate) || dayCount <= 0) {
		return { days: [], skippedHolidays: [] };
	}
	const holidayMap = new Map<string, string>();
	for (const h of holidays) {
		holidayMap.set(h.date, h.name);
	}
	const days: SchedulePreviewDay[] = [];
	const skippedHolidays: { date: string; name: string }[] = [];
	let cursor = startDate;
	let safety = 0;

	for (let dayIndex = 1; dayIndex <= dayCount; dayIndex++) {
		while (holidayMap.has(cursor) && safety < 1000) {
			skippedHolidays.push({
				date: cursor,
				name: holidayMap.get(cursor) ?? "Nghỉ lễ",
			});
			cursor = addDaysISO(cursor, 1);
			safety++;
		}
		days.push({ dayIndex, date: cursor });
		cursor = addDaysISO(cursor, 1);
	}

	return { days, skippedHolidays };
}

function formatSkillName(skill: string): string {
	if (
		skill === "reading" ||
		skill === "listening" ||
		skill === "grammar" ||
		skill === "vocabulary"
	) {
		return skillOf(skill).name;
	}
	return skill;
}

export function ClassStudyPackSection({ classId }: { classId: string }) {
	const [assignedPacks, setAssignedPacks] = useState<ClassStudyPackView[]>([]);
	const [holidays, setHolidays] = useState<{ date: string; name: string }[]>(
		[],
	);
	const [availablePacks, setAvailablePacks] = useState<StudyPackSummaryView[]>(
		[],
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Assign modal state
	const [assignOpen, setAssignOpen] = useState(false);
	const [selectedPackId, setSelectedPackId] = useState("");
	const [startDate, setStartDate] = useState(() => vietnamTodayISO());
	const [releaseTime, setReleaseTime] = useState("06:00");
	const [dueTime, setDueTime] = useState("17:00");
	const [formError, setFormError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [cancellingId, setCancellingId] = useState<string | null>(null);

	const readyPacks = useMemo(
		() => availablePacks.filter((p) => p.status === "ready"),
		[availablePacks],
	);

	const loadData = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [classRes, packsRes] = await Promise.all([
				fetchClassStudyPacks(classId),
				fetchStudyPacks(),
			]);
			setAssignedPacks(classRes.packs);
			setHolidays(classRes.holidays);
			setAvailablePacks(packsRes.packs);
		} catch {
			setError("Không tải được dữ liệu bộ đề của lớp. Vui lòng thử lại.");
		} finally {
			setLoading(false);
		}
	}, [classId]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	useEffect(() => {
		if (!selectedPackId && readyPacks.length > 0) {
			setSelectedPackId(readyPacks[0].id);
		}
	}, [readyPacks, selectedPackId]);

	const selectedPack = useMemo(
		() => readyPacks.find((p) => p.id === selectedPackId) ?? null,
		[readyPacks, selectedPackId],
	);

	const schedulePreview = useMemo(() => {
		if (!selectedPack) return { days: [], skippedHolidays: [] };
		return buildStudyPackSchedulePreview(
			startDate,
			Math.max(1, selectedPack.dayCount),
			holidays,
		);
	}, [selectedPack, startDate, holidays]);

	function openAssignModal() {
		setSelectedPackId(readyPacks[0]?.id ?? "");
		setStartDate(vietnamTodayISO());
		setReleaseTime("06:00");
		setDueTime("17:00");
		setFormError(null);
		setAssignOpen(true);
	}

	async function handleAssignSubmit(event: FormEvent) {
		event.preventDefault();
		setFormError(null);
		if (!selectedPackId) {
			setFormError("Vui lòng chọn một bộ đề sẵn sàng.");
			return;
		}
		if (!ISO_DATE_RE.test(startDate)) {
			setFormError("Ngày bắt đầu không hợp lệ.");
			return;
		}
		if (dueTime <= releaseTime) {
			setFormError("Giờ hạn nộp phải sau giờ mở bài.");
			return;
		}
		setSubmitting(true);
		try {
			const res = await assignStudyPackToClass(classId, {
				packId: selectedPackId,
				startDate,
				releaseTime,
				dueTime,
			});
			setAssignedPacks(res.packs);
			setHolidays(res.holidays);
			setAssignOpen(false);
			toast.success("Đã gán bộ đề tự học cho lớp.");
		} catch (err) {
			const status =
				err && typeof err === "object" && "status" in err ? err.status : null;
			if (status === 409) {
				setFormError("Bộ đề này đang chạy trên lớp với lịch khác.");
			} else {
				setFormError("Không thể gán bộ đề. Vui lòng kiểm tra lại.");
			}
			toast.error("Không thể gán bộ đề.");
		} finally {
			setSubmitting(false);
		}
	}

	async function handleCancelPack(classPackId: string) {
		setCancellingId(classPackId);
		try {
			const res = await cancelClassStudyPack(classId, classPackId);
			setAssignedPacks(res.packs);
			setHolidays(res.holidays);
			toast.success("Đã huỷ bộ đề tự học.");
		} catch {
			toast.error("Không thể huỷ bộ đề. Vui lòng thử lại.");
		} finally {
			setCancellingId(null);
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-semibold text-base text-foreground">
						Bộ đề tự học theo lịch
					</h2>
					<p className="text-muted-foreground text-sm">
						Các bài tập tự động mở cho học viên theo khung giờ đã hẹn (tự động
						bỏ qua ngày nghỉ của lớp).
					</p>
				</div>
				<Button size="sm" onClick={openAssignModal}>
					<Plus className="size-4" />
					Gán bộ đề
				</Button>
			</div>

			{loading && (
				<Card variant="white" className="p-6">
					<p className="text-muted-foreground text-sm">
						Đang tải danh sách bộ đề tự học…
					</p>
				</Card>
			)}

			{!loading && error && (
				<Card className="border-destructive/40 bg-destructive/5 p-4">
					<p className="text-destructive text-sm">{error}</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-2"
						onClick={() => void loadData()}
					>
						Thử lại
					</Button>
				</Card>
			)}

			{!loading && !error && assignedPacks.length === 0 && (
				<Card variant="white" className="p-8 text-center">
					<h3 className="font-semibold text-base text-foreground">
						Chưa gán bộ đề tự học nào cho lớp này
					</h3>
					<p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
						Chọn một bộ đề từ trung tâm hoặc thư viện hệ thống để lên lịch mở
						bài tự động cho học viên mỗi ngày.
					</p>
					<div className="mt-4 flex justify-center">
						<Button size="sm" onClick={openAssignModal}>
							Gán bộ đề đầu tiên
						</Button>
					</div>
				</Card>
			)}

			{!loading &&
				!error &&
				assignedPacks.map((pack) => (
					<Card key={pack.id} variant="white" className="space-y-4 p-5">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="space-y-1">
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="font-semibold text-base text-foreground">
										{pack.title}
									</h3>
									<Badge
										variant={pack.status === "active" ? "success" : "secondary"}
										dot
									>
										{pack.status === "active" ? "Đang chạy" : "Đã huỷ"}
									</Badge>
								</div>
								<p className="text-muted-foreground text-xs tabular-nums">
									Bắt đầu: {fmtDue(pack.startDate)} · Khung giờ:{" "}
									{pack.releaseTime} – {pack.dueTime}
								</p>
							</div>
							{pack.status === "active" && (
								<Button
									variant="danger"
									size="sm"
									disabled={cancellingId === pack.id}
									onClick={() => void handleCancelPack(pack.id)}
								>
									{cancellingId === pack.id ? "Đang huỷ…" : "Huỷ bộ đề"}
								</Button>
							)}
						</div>

						{pack.assignments.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Không còn bài tập nào trong bộ đề này.
							</p>
						) : (
							<div className="overflow-x-auto rounded-md border bg-card">
								<table className="w-full text-left text-sm">
									<thead className="bg-muted/40 text-muted-foreground text-xs">
										<tr>
											<th className="px-3 py-2 font-medium">Ngày học</th>
											<th className="px-3 py-2 font-medium">Bài tập</th>
											<th className="px-3 py-2 font-medium">Kỹ năng</th>
											<th className="px-3 py-2 font-medium">Trạng thái</th>
											<th className="px-3 py-2 font-medium">Tiến độ nộp</th>
										</tr>
									</thead>
									<tbody>
										{pack.assignments.map((item) => (
											<tr
												key={item.assignmentId}
												className="border-border border-t"
											>
												<td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums">
													Ngày {item.dayIndex} — {fmtDue(item.date)}
												</td>
												<td className="px-3 py-2.5 text-foreground">
													{item.title}
												</td>
												<td className="px-3 py-2.5 text-muted-foreground">
													{formatSkillName(item.skill)}
												</td>
												<td className="px-3 py-2.5">
													<Badge
														variant={item.isReleased ? "success" : "warn"}
														dot
													>
														{item.isReleased ? "Đã mở" : "Chưa đến giờ"}
													</Badge>
												</td>
												<td className="px-3 py-2.5 tabular-nums">
													<span>
														{item.submittedCount}/{item.targetsTotal} đã nộp
													</span>
													{item.submittedLateCount > 0 && (
														<span className="ml-2 text-destructive text-xs">
															({item.submittedLateCount} nộp trễ)
														</span>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</Card>
				))}

			<Modal
				open={assignOpen}
				onClose={() => setAssignOpen(false)}
				title="Gán bộ đề tự học"
			>
				<form onSubmit={(e) => void handleAssignSubmit(e)}>
					<Field label="Chọn bộ đề" required htmlFor="assign-pack-id">
						<Select
							id="assign-pack-id"
							value={selectedPackId}
							onChange={(e) => setSelectedPackId(e.target.value)}
						>
							{readyPacks.length === 0 ? (
								<option value="">Chưa có bộ đề Sẵn sàng</option>
							) : (
								readyPacks.map((p) => (
									<option key={p.id} value={p.id}>
										{p.title} ({p.dayCount} ngày · {p.itemCount} bài ·{" "}
										{p.scope === "system" ? "Hệ thống" : "Trung tâm"})
									</option>
								))
							)}
						</Select>
					</Field>

					<Field label="Ngày bắt đầu" required htmlFor="assign-start-date">
						<Input
							id="assign-start-date"
							type="date"
							value={startDate}
							onChange={(e) => setStartDate(e.target.value)}
						/>
					</Field>

					<div className="grid grid-cols-2 gap-3">
						<Field label="Giờ mở bài" required htmlFor="assign-release-time">
							<Input
								id="assign-release-time"
								type="time"
								value={releaseTime}
								onChange={(e) => setReleaseTime(e.target.value)}
							/>
						</Field>
						<Field label="Giờ hạn nộp" required htmlFor="assign-due-time">
							<Input
								id="assign-due-time"
								type="time"
								value={dueTime}
								onChange={(e) => setDueTime(e.target.value)}
							/>
						</Field>
					</div>

					{selectedPack && schedulePreview.days.length > 0 && (
						<div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
							<p className="font-medium text-foreground text-xs">
								Xem trước lịch mở bài ({schedulePreview.days.length} ngày học)
							</p>
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
						<Button
							type="button"
							variant="outline"
							onClick={() => setAssignOpen(false)}
						>
							Huỷ
						</Button>
						<Button
							type="submit"
							disabled={submitting || readyPacks.length === 0}
						>
							{submitting ? "Đang gán…" : "Xác nhận gán bộ đề"}
						</Button>
					</div>
				</form>
			</Modal>
		</div>
	);
}
