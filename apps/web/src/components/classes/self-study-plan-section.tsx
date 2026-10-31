import type {
	SelfStudyPlanDayInput,
	SelfStudyPlanDayView,
	SelfStudyPlanDetailResponse,
} from "@teacher-os/api/contracts";
import {
	addDaysISO,
	daysBetweenInclusiveISO,
} from "@teacher-os/api/vietnam-date";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtDate } from "@/components/assignments/assignment-status";
import { StatusTag } from "@/components/assignments/status-tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { useData } from "@/lib/data-store";
import {
	cancelSelfStudyPlan,
	fetchSelfStudyPlan,
	publishSelfStudyPlan,
	releaseMissedSelfStudyDay,
	saveSelfStudyPlanDraft,
	updateSelfStudyPlanDay,
	updateSelfStudyPlanHours,
} from "@/lib/repos/self-study-plan";
import { todayISOVietnam } from "@/lib/week-grid";

const PLAN_STATUS_LABELS: Record<
	"draft" | "published" | "completed" | "cancelled",
	{ label: string; tone: "draft" | "ok" | "neutral" | "warn" }
> = {
	draft: { label: "Bản nháp", tone: "draft" },
	published: { label: "Đang chạy", tone: "ok" },
	completed: { label: "Đã hoàn thành", tone: "neutral" },
	cancelled: { label: "Đã huỷ", tone: "warn" },
};

const DAY_STATUS_LABELS: Record<
	SelfStudyPlanDayView["status"],
	{ label: string; tone: "neutral" | "ok" | "warn" | "danger" }
> = {
	pending: { label: "Chờ giao", tone: "neutral" },
	released: { label: "Đã giao", tone: "ok" },
	skipped: { label: "Bỏ qua", tone: "neutral" },
	missed: { label: "Lỡ giờ giao", tone: "danger" },
};

export function SelfStudyPlanSection({ classId }: { classId: string }) {
	const { data } = useData();
	const todayVN = useMemo(() => todayISOVietnam(), []);
	const [detail, setDetail] = useState<SelfStudyPlanDetailResponse | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [creating, setCreating] = useState(false);

	// Draft form state
	const [title, setTitle] = useState("Kế hoạch tự học");
	const [startDate, setStartDate] = useState(todayVN);
	const [endDate, setEndDate] = useState(addDaysISO(todayVN, 6));
	const [releaseTime, setReleaseTime] = useState("06:00");
	const [dueTime, setDueTime] = useState("17:00");
	const [draftPromptsByDate, setDraftPromptsByDate] = useState<
		Record<string, string[]>
	>({});

	// Edit hours state on active plan
	const [editingHours, setEditingHours] = useState(false);
	const [nextReleaseTime, setNextReleaseTime] = useState("06:00");
	const [nextDueTime, setNextDueTime] = useState("17:00");

	// Edit future day state
	const [editingDayDate, setEditingDayDate] = useState<string | null>(null);
	const [editingDayPrompts, setEditingDayPrompts] = useState<string[]>([]);
	const [expandedDayDate, setExpandedDayDate] = useState<string | null>(null);

	const readyPrompts = useMemo(
		() => (data.assignmentPrompts ?? []).filter((p) => p.status === "ready"),
		[data.assignmentPrompts],
	);

	const loadPlan = useCallback(
		async (opts?: { planId?: string; from?: string; to?: string }) => {
			setLoading(true);
			try {
				const res = await fetchSelfStudyPlan(classId, opts);
				setDetail(res);
				if (res.plan) {
					setNextReleaseTime(res.plan.releaseTime);
					setNextDueTime(res.plan.dueTime);
				}
			} catch (err) {
				toast.error(
					err instanceof Error
						? err.message
						: "Không tải được kế hoạch tự học.",
				);
			} finally {
				setLoading(false);
			}
		},
		[classId],
	);

	useEffect(() => {
		void loadPlan();
	}, [loadPlan]);

	const draftDates = useMemo(() => {
		const count = daysBetweenInclusiveISO(startDate, endDate);
		if (count < 1 || count > 366) return [];
		const list: string[] = [];
		for (let i = 0; i < count; i++) {
			list.push(addDaysISO(startDate, i));
		}
		return list;
	}, [startDate, endDate]);

	const toggleDraftPrompt = (date: string, promptId: string) => {
		setDraftPromptsByDate((prev) => {
			const current = prev[date] ?? [];
			const next = current.includes(promptId)
				? current.filter((id) => id !== promptId)
				: [...current, promptId];
			return { ...prev, [date]: next };
		});
	};

	const handleCreateAndPublish = async (publishImmediately: boolean) => {
		setSubmitting(true);
		try {
			const days: SelfStudyPlanDayInput[] = draftDates.map((date) => ({
				date,
				holidayOverride: false,
				items: (draftPromptsByDate[date] ?? []).map((promptId) => ({
					promptId,
					note: "",
				})),
			}));

			const saved = await saveSelfStudyPlanDraft(classId, {
				title: title.trim() || "Kế hoạch tự học",
				startDate,
				endDate,
				releaseTime,
				dueTime,
				days,
			});

			if (publishImmediately && saved.plan) {
				const published = await publishSelfStudyPlan(classId, saved.plan.id);
				setDetail(published);
				toast.success("Đã công bố kế hoạch tự học.");
			} else {
				setDetail(saved);
				toast.success("Đã lưu nháp kế hoạch tự học.");
			}
			setCreating(false);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không thể lưu kế hoạch tự học.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handlePublishExistingDraft = async () => {
		if (!detail?.plan) return;
		setSubmitting(true);
		try {
			const published = await publishSelfStudyPlan(classId, detail.plan.id);
			setDetail(published);
			toast.success("Đã công bố kế hoạch tự học.");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không thể công bố kế hoạch.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleUpdateHours = async () => {
		if (!detail?.plan) return;
		setSubmitting(true);
		try {
			const updated = await updateSelfStudyPlanHours(classId, detail.plan.id, {
				releaseTime: nextReleaseTime,
				dueTime: nextDueTime,
			});
			setDetail(updated);
			setEditingHours(false);
			toast.success("Đã cập nhật khung giờ cho các ngày chưa tới.");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không thể cập nhật khung giờ.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleToggleHolidayOverride = async (day: SelfStudyPlanDayView) => {
		if (!detail?.plan) return;
		setSubmitting(true);
		try {
			const updated = await updateSelfStudyPlanDay(
				classId,
				detail.plan.id,
				day.date,
				{
					holidayOverride: !day.holidayOverride,
					items: day.items.map((it) => ({
						promptId: it.promptId,
						note: it.note,
					})),
				},
			);
			setDetail(updated);
			toast.success(
				!day.holidayOverride
					? `Đã bật vẫn giao bài vào ngày nghỉ ${fmtDate(day.date)}.`
					: `Đã tắt giao bài vào ngày nghỉ ${fmtDate(day.date)}.`,
			);
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Không thể cập nhật tuỳ chọn ngày nghỉ.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleSaveDayItems = async (day: SelfStudyPlanDayView) => {
		if (!detail?.plan) return;
		setSubmitting(true);
		try {
			const updated = await updateSelfStudyPlanDay(
				classId,
				detail.plan.id,
				day.date,
				{
					holidayOverride: day.holidayOverride,
					items: editingDayPrompts.map((promptId) => ({
						promptId,
						note: "",
					})),
				},
			);
			setDetail(updated);
			setEditingDayDate(null);
			toast.success(`Đã cập nhật đề ngày ${fmtDate(day.date)}.`);
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Không thể cập nhật đề trong ngày.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleReleaseMissed = async (date: string) => {
		if (!detail?.plan) return;
		setSubmitting(true);
		try {
			const updated = await releaseMissedSelfStudyDay(
				classId,
				detail.plan.id,
				date,
			);
			setDetail(updated);
			toast.success(`Đã giao lại bài ngày ${fmtDate(date)}.`);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không thể giao lại bài.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleCancelPlan = async () => {
		if (!detail?.plan) return;
		setSubmitting(true);
		try {
			const updated = await cancelSelfStudyPlan(classId, detail.plan.id);
			setDetail(updated);
			toast.success("Đã huỷ kế hoạch tự học.");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Không thể huỷ kế hoạch.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	if (loading && !detail) {
		return (
			<Section title="Kế hoạch tự học">
				<Card variant="white">
					<p className="text-muted-foreground text-sm">
						Đang tải kế hoạch tự học…
					</p>
				</Card>
			</Section>
		);
	}

	const activePlan = detail?.plan ?? null;
	const showCreateForm =
		creating ||
		!activePlan ||
		activePlan.status === "cancelled" ||
		activePlan.status === "completed";

	return (
		<Section
			title="Kế hoạch tự học"
			action={
				activePlan && !creating ? (
					<div className="flex flex-wrap items-center gap-2">
						{activePlan.status === "draft" && (
							<Button
								size="sm"
								disabled={submitting}
								onClick={() => void handlePublishExistingDraft()}
							>
								Công bố kế hoạch
							</Button>
						)}
						{(activePlan.status === "draft" ||
							activePlan.status === "published") && (
							<>
								<Button
									variant="outline"
									size="sm"
									disabled={submitting}
									onClick={() => setEditingHours((v) => !v)}
								>
									Đổi giờ giao
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={submitting}
									onClick={() => void handleCancelPlan()}
								>
									Huỷ kế hoạch
								</Button>
							</>
						)}
						{(activePlan.status === "completed" ||
							activePlan.status === "cancelled") && (
							<Button
								size="sm"
								onClick={() => {
									setDraftPromptsByDate({});
									setCreating(true);
								}}
							>
								Tạo kế hoạch tự học
							</Button>
						)}
					</div>
				) : undefined
			}
		>
			{!activePlan && !creating && (
				<Card variant="white" data-testid="self-study-empty">
					<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
						<div>
							<p className="font-medium text-foreground text-sm">
								Lớp chưa có kế hoạch tự học đang chạy
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								Lập lịch giao đề ngân hàng tự động từ thứ 2 đến chủ nhật (mặc
								định 06:00 – 17:00 giờ Việt Nam).
							</p>
						</div>
						<Button
							size="sm"
							data-testid="self-study-create-open"
							onClick={() => setCreating(true)}
						>
							Tạo kế hoạch tự học
						</Button>
					</div>
				</Card>
			)}

			{creating && (
				<Card variant="white" data-testid="self-study-create-form">
					<div className="space-y-4">
						<div>
							<label
								htmlFor="ssp-title-input"
								className="mb-1.5 block font-medium text-foreground text-xs"
							>
								Tên kế hoạch
							</label>
							<Input
								id="ssp-title-input"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Kế hoạch tự học"
							/>
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<div>
								<label
									htmlFor="ssp-start-date"
									className="mb-1.5 block font-medium text-foreground text-xs"
								>
									Ngày bắt đầu
								</label>
								<Input
									id="ssp-start-date"
									type="date"
									value={startDate}
									onChange={(e) => setStartDate(e.target.value)}
									className="tabular-nums"
								/>
							</div>
							<div>
								<label
									htmlFor="ssp-end-date"
									className="mb-1.5 block font-medium text-foreground text-xs"
								>
									Ngày kết thúc
								</label>
								<Input
									id="ssp-end-date"
									type="date"
									value={endDate}
									min={startDate}
									onChange={(e) => setEndDate(e.target.value)}
									className="tabular-nums"
								/>
							</div>
							<div>
								<label
									htmlFor="ssp-release-time"
									className="mb-1.5 block font-medium text-foreground text-xs"
								>
									Giờ giao bài
								</label>
								<Input
									id="ssp-release-time"
									aria-label="Giờ giao bài"
									type="time"
									value={releaseTime}
									onChange={(e) => setReleaseTime(e.target.value)}
									className="tabular-nums"
								/>
							</div>
							<div>
								<label
									htmlFor="ssp-due-time"
									className="mb-1.5 block font-medium text-foreground text-xs"
								>
									Giờ hạn nộp
								</label>
								<Input
									id="ssp-due-time"
									aria-label="Giờ hạn nộp"
									type="time"
									value={dueTime}
									onChange={(e) => setDueTime(e.target.value)}
									className="tabular-nums"
								/>
							</div>
						</div>

						<div className="space-y-2">
							<p className="font-medium text-foreground text-xs">
								Chọn đề ngân hàng sẵn sàng cho từng ngày (tối đa 14 ngày đầu
								hiển thị nhanh, các ngày khác sửa được sau khi tạo)
							</p>
							{readyPrompts.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									Chưa có đề ngân hàng nào ở trạng thái sẵn sàng.
								</p>
							) : (
								<div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border p-3">
									{draftDates.slice(0, 14).map((d) => {
										const selectedIds = draftPromptsByDate[d] ?? [];
										return (
											<div
												key={d}
												className="flex flex-col gap-2 border-border border-b pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
											>
												<span className="font-medium text-foreground text-xs tabular-nums">
													{fmtDate(d)} ({d})
												</span>
												<fieldset
													className="flex flex-wrap gap-1.5"
													aria-label={`Chọn đề ngày ${d}`}
												>
													{readyPrompts.map((p) => {
														const active = selectedIds.includes(p.id);
														return (
															<button
																key={p.id}
																type="button"
																aria-pressed={active}
																onClick={() => toggleDraftPrompt(d, p.id)}
																className={`rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
																	active
																		? "border-foreground bg-muted font-medium text-foreground"
																		: "border-input bg-background text-muted-foreground hover:text-foreground"
																}`}
															>
																{p.title}
															</button>
														);
													})}
												</fieldset>
											</div>
										);
									})}
								</div>
							)}
						</div>

						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={submitting}
								onClick={() => setCreating(false)}
							>
								Đóng
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={submitting}
								onClick={() => void handleCreateAndPublish(false)}
							>
								Lưu nháp
							</Button>
							<Button
								size="sm"
								disabled={submitting}
								data-testid="self-study-publish-submit"
								onClick={() => void handleCreateAndPublish(true)}
							>
								Công bố kế hoạch
							</Button>
						</div>
					</div>
				</Card>
			)}

			{activePlan && (!creating || !showCreateForm) && (
				<div className="space-y-4" data-testid="self-study-plan-detail">
					<Card variant="white">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="font-semibold text-base text-foreground">
										{activePlan.title}
									</h3>
									<StatusTag tone={PLAN_STATUS_LABELS[activePlan.status].tone}>
										{PLAN_STATUS_LABELS[activePlan.status].label}
									</StatusTag>
								</div>
								<p className="mt-1 text-muted-foreground text-xs tabular-nums">
									Từ {fmtDate(activePlan.startDate)} đến{" "}
									{fmtDate(activePlan.endDate)} · Giao lúc{" "}
									{activePlan.releaseTime} · Hạn nộp {activePlan.dueTime} (giờ
									Việt Nam)
								</p>
							</div>

							{detail && (
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										disabled={!detail.page.prevFrom || loading}
										onClick={() =>
											detail.page.prevFrom &&
											detail.page.prevTo &&
											void loadPlan({
												planId: activePlan.id,
												from: detail.page.prevFrom,
												to: detail.page.prevTo,
											})
										}
									>
										← Trước
									</Button>
									<span className="text-muted-foreground text-xs tabular-nums">
										{fmtDate(detail.page.from)} – {fmtDate(detail.page.to)}
									</span>
									<Button
										variant="outline"
										size="sm"
										disabled={!detail.page.nextFrom || loading}
										onClick={() =>
											detail.page.nextFrom &&
											detail.page.nextTo &&
											void loadPlan({
												planId: activePlan.id,
												from: detail.page.nextFrom,
												to: detail.page.nextTo,
											})
										}
									>
										Sau →
									</Button>
								</div>
							)}
						</div>

						{editingHours && (
							<div className="mt-4 flex flex-wrap items-end gap-3 border-border border-t pt-4">
								<div>
									<label
										htmlFor="ssp-edit-release-time"
										className="mb-1 block font-medium text-foreground text-xs"
									>
										Giờ giao mới
									</label>
									<Input
										id="ssp-edit-release-time"
										type="time"
										value={nextReleaseTime}
										onChange={(e) => setNextReleaseTime(e.target.value)}
										className="tabular-nums"
									/>
								</div>
								<div>
									<label
										htmlFor="ssp-edit-due-time"
										className="mb-1 block font-medium text-foreground text-xs"
									>
										Giờ hạn mới
									</label>
									<Input
										id="ssp-edit-due-time"
										type="time"
										value={nextDueTime}
										onChange={(e) => setNextDueTime(e.target.value)}
										className="tabular-nums"
									/>
								</div>
								<Button
									size="sm"
									disabled={submitting}
									onClick={() => void handleUpdateHours()}
								>
									Lưu khung giờ
								</Button>
							</div>
						)}
					</Card>

					<div className="space-y-2.5">
						{detail?.days.map((day) => {
							const dayTone = DAY_STATUS_LABELS[day.status];
							const isEditingThisDay = editingDayDate === day.date;
							const isExpanded = expandedDayDate === day.date;

							return (
								<article
									key={day.date}
									data-testid={`ssp-day-${day.date}`}
									className="rounded-lg border border-border bg-card p-4"
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="space-y-1">
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-semibold text-foreground text-sm tabular-nums">
													{fmtDate(day.date)} ({day.date})
												</span>
												<StatusTag tone={dayTone.tone}>
													{dayTone.label}
												</StatusTag>
												{day.isHoliday && (
													<StatusTag tone={day.holidayOverride ? "ok" : "warn"}>
														{`${day.holidayName ? `Nghỉ lễ: ${day.holidayName}` : "Nghỉ lễ"}${day.holidayOverride ? " · Vẫn giao" : ""}`}
													</StatusTag>
												)}
											</div>
											{day.warning && (
												<p className="text-warn text-xs">{day.warning}</p>
											)}
										</div>

										<div className="flex flex-wrap items-center gap-2">
											{day.isHoliday && day.editable && (
												<Button
													variant="outline"
													size="sm"
													disabled={submitting}
													aria-label={
														day.holidayOverride
															? `Bỏ qua ngày nghỉ ${day.date}`
															: `Vẫn giao ngày nghỉ ${day.date}`
													}
													onClick={() => void handleToggleHolidayOverride(day)}
												>
													{day.holidayOverride
														? "Bỏ qua ngày nghỉ"
														: "Vẫn giao ngày nghỉ"}
												</Button>
											)}
											{day.status === "missed" && (
												<Button
													size="sm"
													disabled={submitting}
													aria-label={`Giao lại ngày ${day.date}`}
													onClick={() => void handleReleaseMissed(day.date)}
												>
													Giao lại
												</Button>
											)}
											{day.editable && (
												<Button
													variant="outline"
													size="sm"
													disabled={submitting}
													onClick={() => {
														if (isEditingThisDay) {
															setEditingDayDate(null);
														} else {
															setEditingDayDate(day.date);
															setEditingDayPrompts(
																day.items.map((it) => it.promptId),
															);
														}
													}}
												>
													{isEditingThisDay ? "Đóng sửa" : "Sửa đề"}
												</Button>
											)}
										</div>
									</div>

									{isEditingThisDay && (
										<div className="mt-3 space-y-2 border-border border-t pt-3">
											<fieldset
												className="flex flex-wrap gap-1.5"
												aria-label={`Sửa đề ngày ${day.date}`}
											>
												{readyPrompts.map((p) => {
													const active = editingDayPrompts.includes(p.id);
													return (
														<button
															key={p.id}
															type="button"
															aria-pressed={active}
															onClick={() =>
																setEditingDayPrompts((prev) =>
																	prev.includes(p.id)
																		? prev.filter((id) => id !== p.id)
																		: [...prev, p.id],
																)
															}
															className={`rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
																active
																	? "border-foreground bg-muted font-medium text-foreground"
																	: "border-input bg-background text-muted-foreground hover:text-foreground"
															}`}
														>
															{p.title}
														</button>
													);
												})}
											</fieldset>
											<div className="flex justify-end">
												<Button
													size="sm"
													disabled={submitting}
													onClick={() => void handleSaveDayItems(day)}
												>
													Lưu đề ngày {fmtDate(day.date)}
												</Button>
											</div>
										</div>
									)}

									{day.items.length === 0 ? (
										<p className="mt-2 text-muted-foreground text-xs">
											Không có đề trong ngày này.
										</p>
									) : (
										<div className="mt-3 space-y-2">
											{day.items.map((item) => {
												const submittedTotal =
													item.submittedOnTimeCount + item.submittedLateCount;
												return (
													<div
														key={item.id}
														className="rounded-md border border-border bg-muted/30 p-3"
													>
														<div className="flex flex-wrap items-center justify-between gap-2">
															<div>
																<p className="font-medium text-foreground text-sm">
																	{item.promptTitle}
																</p>
																{item.note && (
																	<p className="text-muted-foreground text-xs">
																		{item.note}
																	</p>
																)}
															</div>
															<div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
																{item.targetsTotal > 0 && (
																	<>
																		<span className="text-muted-foreground">
																			{submittedTotal}/{item.targetsTotal} đã
																			nộp
																		</span>
																		{item.submittedLateCount > 0 && (
																			<StatusTag tone="warn">
																				{`${item.submittedLateCount} nộp trễ`}
																			</StatusTag>
																		)}
																		{item.overdueCount > 0 && (
																			<StatusTag tone="danger">
																				{`${item.overdueCount} quá hạn`}
																			</StatusTag>
																		)}
																		<button
																			type="button"
																			onClick={() =>
																				setExpandedDayDate(
																					isExpanded ? null : day.date,
																				)
																			}
																			className="font-medium text-primary text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
																		>
																			{isExpanded
																				? "Ẩn học viên"
																				: "Chi tiết học viên"}
																		</button>
																	</>
																)}
															</div>
														</div>

														{isExpanded && item.students.length > 0 && (
															<ul className="mt-2.5 divide-y divide-border border-border border-t pt-2 text-xs">
																{item.students.map((st) => (
																	<li
																		key={st.studentId}
																		className="flex items-center justify-between py-1.5"
																	>
																		<span className="text-foreground">
																			{st.studentName}
																		</span>
																		<StatusTag
																			tone={
																				st.status === "submitted_on_time"
																					? "ok"
																					: st.status === "submitted_late"
																						? "warn"
																						: st.status === "overdue"
																							? "danger"
																							: "neutral"
																			}
																		>
																			{st.status === "submitted_on_time"
																				? "Đã nộp đúng hạn"
																				: st.status === "submitted_late"
																					? "Đã nộp · Trễ hạn"
																					: st.status === "overdue"
																						? "Chưa nộp · Quá hạn"
																						: "Chưa nộp"}
																		</StatusTag>
																	</li>
																))}
															</ul>
														)}
													</div>
												);
											})}
										</div>
									)}
								</article>
							);
						})}
					</div>
				</div>
			)}
		</Section>
	);
}
