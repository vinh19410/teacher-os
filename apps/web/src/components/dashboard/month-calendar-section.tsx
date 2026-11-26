import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
	buildDashboardCalendarIndex,
	formatAgendaDateLabel,
	formatMonthHeading,
	MAX_CALENDAR_YM,
	MIN_CALENDAR_YM,
	monthCalendarGrid,
	sessionsForDashboardDate,
	shiftCalendarMonth,
} from "@/lib/dashboard-calendar";
import { type ClassGroup, dayNames, type Lesson } from "@/lib/mock-data";
import { formatDayMonth } from "@/lib/week-grid";

const LEADING_BLANK_KEYS = ["b0", "b1", "b2", "b3", "b4", "b5"] as const;

/**
 * Widget "Lịch tháng" chỉ xem (read-only) ở đầu cột phải `/teacher/dashboard`:
 * - Hiển thị lưới ngày Thứ Hai → Chủ Nhật cho duy nhất tháng đang xem (`1..daysInMonth`).
 * - Chỉ hiển thị buổi dạy thật từ các lớp `active` (allowlist fail-closed).
 * - Tự rollover qua nửa đêm giờ Việt Nam khi người dùng chưa chọn tay ngày khác.
 * - Dùng duy nhất 1 vùng `aria-live="polite"` (`sr-only`) cho thao tác người dùng.
 */
export function MonthCalendarSection({
	lessons,
	classes,
	classById,
	todayIso,
}: {
	lessons: readonly Lesson[];
	classes: readonly ClassGroup[];
	classById: (id: string) => ClassGroup | undefined;
	todayIso: string;
}) {
	const todayYm = todayIso.slice(0, 7);
	const calendarIndex = useMemo(
		() => buildDashboardCalendarIndex(lessons, classes),
		[lessons, classes],
	);

	const [calState, setCalState] = useState(() => ({
		viewYm: todayYm,
		selectedIso: todayIso,
	}));
	const [liveAnnouncement, setLiveAnnouncement] = useState("");
	const prevTodayIsoRef = useRef(todayIso);
	const todayBtnRef = useRef<HTMLButtonElement | null>(null);
	const pendingFocusTodayRef = useRef(false);

	// Qua nửa đêm giờ Việt Nam: chỉ tự dịch selectedIso/viewYm nếu người dùng
	// đang đứng ở ngày hiện tại cũ — tuyệt đối không cướp ngày/tháng đã chọn tay.
	useEffect(() => {
		const prevToday = prevTodayIsoRef.current;
		if (prevToday === todayIso) return;
		prevTodayIsoRef.current = todayIso;
		const prevTodayYm = prevToday.slice(0, 7);
		const nextTodayYm = todayIso.slice(0, 7);
		setCalState((cur) => {
			if (cur.selectedIso !== prevToday) return cur;
			return {
				selectedIso: todayIso,
				viewYm: cur.viewYm === prevTodayYm ? nextTodayYm : cur.viewYm,
			};
		});
	}, [todayIso]);

	// Khi bấm "Hôm nay", nút đó tự ẩn khỏi DOM nên trả focus có kiểm soát về
	// nút ngày hôm nay qua ref trực tiếp (tránh rơi focus về document.body).
	useEffect(() => {
		if (
			pendingFocusTodayRef.current &&
			calState.viewYm === todayYm &&
			calState.selectedIso === todayIso
		) {
			pendingFocusTodayRef.current = false;
			todayBtnRef.current?.focus();
		}
	}, [calState.viewYm, calState.selectedIso, todayIso, todayYm]);

	const grid = useMemo(
		() => monthCalendarGrid(calState.viewYm),
		[calState.viewYm],
	);
	const monthHeading = formatMonthHeading(calState.viewYm);
	const isCurrentMonth = calState.viewYm === todayYm;
	const selectedSessions = sessionsForDashboardDate(
		calendarIndex,
		calState.selectedIso,
	);
	const agendaDateLabel = formatAgendaDateLabel(calState.selectedIso, todayIso);
	const agendaDayMonth = formatDayMonth(calState.selectedIso);

	const handleShiftMonth = (delta: -1 | 1) => {
		const nextYm = shiftCalendarMonth(calState.viewYm, delta);
		if (nextYm === calState.viewYm) return;
		setCalState((cur) => ({ ...cur, viewYm: nextYm }));
		setLiveAnnouncement(`Đang xem ${formatMonthHeading(nextYm)}`);
	};

	const handleJumpToday = () => {
		pendingFocusTodayRef.current = true;
		setCalState({ viewYm: todayYm, selectedIso: todayIso });
		const count = sessionsForDashboardDate(calendarIndex, todayIso).length;
		const dm = formatDayMonth(todayIso);
		setLiveAnnouncement(
			count > 0
				? `Đã quay về hôm nay ${dm}, ${count} buổi dạy`
				: `Đã quay về hôm nay ${dm}, chưa có buổi dạy`,
		);
	};

	const handleSelectDay = (iso: string, count: number) => {
		setCalState((cur) => ({ ...cur, selectedIso: iso }));
		const label = formatAgendaDateLabel(iso, todayIso);
		const dm = formatDayMonth(iso);
		setLiveAnnouncement(
			count > 0
				? `Đã chọn ${label} ${dm}, ${count} buổi dạy`
				: `Đã chọn ${label} ${dm}, chưa có buổi dạy`,
		);
	};

	return (
		<section aria-labelledby="dashboard-calendar-title" className="min-w-0">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2
					id="dashboard-calendar-title"
					className="font-semibold text-lg tracking-tight"
				>
					Lịch tháng
				</h2>
			</div>
			<Card
				data-testid="dashboard-month-calendar"
				className="grid min-w-0 gap-3 p-4"
			>
				<p
					role="status"
					aria-live="polite"
					data-testid="dashboard-calendar-live"
					className="sr-only"
				>
					{liveAnnouncement}
				</p>
				<div className="flex flex-wrap items-center justify-between gap-1">
					<span
						data-testid="dashboard-calendar-month"
						className="min-w-0 grow basis-auto whitespace-nowrap font-semibold text-sm"
					>
						{monthHeading}
					</span>
					<div className="flex shrink-0 items-center gap-1">
						{!isCurrentMonth && (
							<Button
								variant="ghost"
								size="sm"
								onClick={handleJumpToday}
								className="h-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11 px-2 text-xs focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0"
							>
								Hôm nay
							</Button>
						)}
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => handleShiftMonth(-1)}
							disabled={calState.viewYm <= MIN_CALENDAR_YM}
							aria-label="Tháng trước"
							className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0"
						>
							<ArrowLeft className="size-4" aria-hidden="true" />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => handleShiftMonth(1)}
							disabled={calState.viewYm >= MAX_CALENDAR_YM}
							aria-label="Tháng sau"
							className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0"
						>
							<ArrowRight className="size-4" aria-hidden="true" />
						</Button>
					</div>
				</div>

				{/* biome-ignore lint/a11y/useSemanticElements: nhóm các nút ngày chọn lịch dùng role="group" + aria-label theo quy ước DESIGN.md */}
				<div
					role="group"
					aria-label="Chọn ngày để xem buổi dạy"
					className="grid grid-cols-7 gap-0.5 text-center"
				>
					{dayNames.map((wd) => (
						<span
							key={wd}
							aria-hidden="true"
							className="pb-1 font-medium text-muted-foreground text-xs"
						>
							{wd}
						</span>
					))}
					{LEADING_BLANK_KEYS.slice(0, grid.leadingBlanks).map((blankKey) => (
						<span key={blankKey} aria-hidden="true" />
					))}
					{grid.days.map((cell) => {
						const daySessions = sessionsForDashboardDate(
							calendarIndex,
							cell.iso,
						);
						const isSelected = cell.iso === calState.selectedIso;
						const isToday = cell.iso === todayIso;
						const ariaLabel = `Ngày ${cell.day}${isToday ? ", hôm nay" : ""}${daySessions.length > 0 ? `, ${daySessions.length} buổi dạy` : ""}`;

						return (
							<button
								key={cell.iso}
								ref={isToday ? todayBtnRef : undefined}
								type="button"
								data-cal-day={cell.iso}
								aria-pressed={isSelected}
								aria-current={isToday ? "date" : undefined}
								data-today={isToday ? "true" : "false"}
								data-weekend={cell.isWeekend ? "true" : "false"}
								aria-label={ariaLabel}
								onClick={() => handleSelectDay(cell.iso, daySessions.length)}
								className={cn(
									"relative grid h-9 pointer-coarse:h-11 w-full min-w-0 place-items-center rounded-md font-mono text-sm tabular-nums transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
									!isSelected && "hover:bg-muted",
									!isSelected && cell.isWeekend && "text-muted-foreground",
									!isSelected &&
										isToday &&
										"font-bold text-foreground shadow-[inset_0_0_0_1px_var(--input)]",
									isSelected &&
										"bg-primary text-primary-foreground shadow-none",
								)}
							>
								{cell.day}
								{daySessions.length > 0 && (
									<span
										aria-hidden="true"
										className="pointer-events-none absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
									/>
								)}
							</button>
						);
					})}
				</div>

				<div
					data-testid="dashboard-calendar-agenda"
					className="grid gap-2 border-border border-t pt-3"
				>
					<p className="font-semibold text-muted-foreground text-xs">
						{agendaDateLabel}
						{" · "}
						<span className="font-mono tabular-nums">{agendaDayMonth}</span>
						{selectedSessions.length > 0
							? ` · ${selectedSessions.length} buổi dạy`
							: ""}
					</p>
					{selectedSessions.length > 0 ? (
						<ul className="grid gap-2">
							{selectedSessions.map((session) => (
								<li
									key={`${session.classId}|${session.time}`}
									className="flex min-w-0 gap-3 text-sm"
								>
									<span className="shrink-0 font-mono text-muted-foreground tabular-nums">
										{session.time}
									</span>
									<span className="min-w-0 truncate">
										{classById(session.classId)?.name ?? "Lớp"}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">Không có buổi dạy.</p>
					)}
				</div>
			</Card>
		</section>
	);
}
