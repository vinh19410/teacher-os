import { classBlockClass } from "@/components/schedule/class-block";
import type { ClassSessionModalRef } from "@/components/schedule/class-session-modal";
import { OrgEventChip } from "@/components/schedule/org-event-chip";
import { classColorIndex } from "@/lib/class-color";
import { dayNames } from "@/lib/mock-data";
import type { KernelSlice } from "@/lib/repos/kernel";
import {
	distinctStudentsBySid,
	type WeekModel,
} from "@/lib/schedule-week";
import { formatDayMonth, todayISOVietnam } from "@/lib/week-grid";

/**
 * Lưới tuần (tách từ route /schedule giữ nguyên hành vi, TOS-14): block ca học
 * đổi sang màu THEO LỚP (`classBlockClass`, D2), loại buổi thành badge nhỏ.
 * Buổi dự chiếu (lớp chưa có dòng) vẫn non-interactive. Sự kiện vận hành và
 * (sau #445) thẻ kỳ nghỉ render trong cột ngày tương ứng. View-model tính sẵn
 * từ `buildWeekModel` — view thuần render.
 */
export function ScheduleWeekView({
	data,
	dates,
	model,
	onOpenSession,
}: {
	data: KernelSlice;
	dates: string[];
	model: WeekModel;
	onOpenSession: (session: ClassSessionModalRef) => void;
}) {
	const todayIso = todayISOVietnam();
	const { columns, projected, slotCount } = model;
	const eventsByDate = new Map<string, KernelSlice["events"]>();
	for (const event of data.events) {
		const bucket = eventsByDate.get(event.date);
		if (bucket) bucket.push(event);
		else eventsByDate.set(event.date, [event]);
	}

	return (
		<>
			{slotCount === 0 && (
				<div className="mb-4 rounded-md border border-border bg-muted px-4 py-3 text-center text-muted-foreground text-sm">
					Không có buổi học nào trong tuần này.
				</div>
			)}
			<div className="week-cal grid grid-cols-7 gap-2 max-app:grid-cols-1 max-app:gap-3">
				{dayNames.map((dn, i) => {
					const sessions = columns[i];
					// Real sessions and projected blocks interleave chronologically;
					// projected entries render as non-interactive divs — never a
					// button, never a ClassSessionModal write target (AC3).
					const blocks = projected
						.filter((b) => b.day === i + 1)
						.map((b) => ({
							key: `proj:${b.classId}:${b.dateISO}`,
							time: b.time,
							block: b,
						}));
					const entries = [
						...sessions.map((s) => ({
							key: s.key,
							time: s.time,
							session: s,
							block: null,
						})),
						...blocks.map((b) => ({
							key: b.key,
							time: b.time,
							session: null,
							block: b.block,
						})),
					].sort((a, b) => a.time.localeCompare(b.time));
					const isToday = dates[i] === todayIso;
					const dayEvents = eventsByDate.get(dates[i]) ?? [];
					return (
						<div
							key={dn}
							className={`day-col flex min-h-[220px] flex-col rounded-xl border bg-card p-3 shadow-sm ${
								isToday ? "border-ring ring-[3px] ring-ring/20" : ""
							}`}
							data-date={dates[i]}
						>
							<div className="flex items-center justify-between pb-3">
								<div
									className={`font-medium text-sm ${
										isToday ? "" : "text-muted-foreground"
									}`}
								>
									{dn} {formatDayMonth(dates[i])}
								</div>
								{isToday && (
									<span className="rounded-md bg-primary px-1.5 py-0.5 font-medium text-[10px] text-primary-foreground">
										Hôm nay
									</span>
								)}
							</div>
							<div className="min-w-0 flex-1">
								{entries.length === 0 && dayEvents.length === 0 && (
									<div className="text-muted-foreground text-xs">—</div>
								)}
								{entries.map((entry) =>
									entry.block ? (
										<div
											key={entry.key}
											className={`lesson-block mt-2 rounded-lg border border-border border-l-3 border-l-solid px-2.5 py-2 text-left opacity-75 ${classBlockClass(entry.block.classId)}`}
											title="Buổi dự kiến từ lịch lớp — chưa có học viên"
											data-class-color={classColorIndex(entry.block.classId)}
										>
											<div className="text-[11px] text-muted-foreground tabular-nums">
												{entry.block.time}
											</div>
											<div className="font-semibold text-sm">
												{entry.block.className}
											</div>
											<div className="mt-px text-[11px] text-muted-foreground">
												Dự kiến · chưa có học viên
											</div>
										</div>
									) : (
										(() => {
											const s = entry.session;
											if (!s) return null;
											const cls = data.classes.find((c) => c.id === s.classId);
											const className = cls?.name ?? "Lớp học";
											return (
												<button
													type="button"
													key={s.key}
													onClick={() =>
														onOpenSession({
															classId: s.classId,
															dateISO: s.dateISO,
															day: s.day,
															time: s.time,
															columnDateISO: dates[i],
														})
													}
													className={`lesson-block mt-2 cursor-pointer rounded-lg border border-border border-l-3 border-l-solid px-2.5 py-2 text-left transition-colors hover:bg-muted/50 ${classBlockClass(s.classId)} ${
														s.status === "completed"
															? "opacity-60"
															: s.status === "cancelled"
																? "opacity-35"
																: ""
													}`}
													data-class-color={classColorIndex(s.classId)}
												>
													<div className="text-[11px] text-muted-foreground tabular-nums">
														{s.time}
													</div>
													<div
														className={
															s.status === "completed" ||
															s.status === "cancelled"
																? "font-semibold text-sm line-through decoration-muted-foreground"
																: "font-semibold text-sm"
														}
													>
														{className}
														{(() => {
															// #204: legacy undated entries bundle whole-course rows; the chip
															// must count students, not rows.
															const students = distinctStudentsBySid(
																s.rows,
															).length;
															return students > 1 ? (
																<span className="ml-1 font-normal text-[11px] text-muted-foreground">
																	({students} HV)
																</span>
															) : null;
														})()}
													</div>
													<div className="mt-px text-[11px] text-muted-foreground">
														{s.topic.substring(0, 30)}
													</div>
													<div className="mt-1">
														<span className="rounded border border-border bg-background px-1 py-px text-[10px] text-muted-foreground">
															{s.type}
														</span>
													</div>
												</button>
											);
										})()
									),
								)}
								{dayEvents.map((event) => (
									<OrgEventChip key={event.id} event={event} />
								))}
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
}
