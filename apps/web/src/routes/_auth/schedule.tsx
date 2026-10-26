import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	ClassSessionModal,
	type ClassSessionModalRef,
} from "@/components/schedule/class-session-modal";
import { OrgEventModal } from "@/components/schedule/org-event-modal";
import { ScheduleDayView } from "@/components/schedule/schedule-day-view";
import { ScheduleMonthView } from "@/components/schedule/schedule-month-view";
import { ScheduleWeekView } from "@/components/schedule/schedule-week-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/page-head";
import { Tabs } from "@/components/ui/tabs";
import { useData } from "@/lib/data-store";
import {
	parseScheduleSearch,
	type ScheduleView,
	shiftAnchor,
} from "@/lib/schedule-view";
import { buildWeekModel } from "@/lib/schedule-week";
import {
	formatDayLabel,
	formatMonthLabel,
	formatWeekRange,
	resolveWeek,
	startOfWeekMonday,
	todayISOVietnam,
} from "@/lib/week-grid";

export const Route = createFileRoute("/_auth/schedule")({
	// Raw passthrough: the component parses via parseScheduleSearch (TOS-14
	// D1 — ?view=&date=, legacy ?week= still readable) and cleans garbage
	// params off the URL, so validateSearch itself never throws or redirects.
	validateSearch: (
		search: Record<string, unknown>,
	): { view?: string; date?: string; week?: string } => ({
		view: typeof search.view === "string" ? search.view : undefined,
		date: typeof search.date === "string" ? search.date : undefined,
		week: typeof search.week === "string" ? search.week : undefined,
	}),
	component: ScheduleRoute,
});

const VIEW_LABELS: Record<ScheduleView, string> = {
	month: "Tháng",
	week: "Tuần",
	day: "Ngày",
};

const VIEW_ORDER: ScheduleView[] = ["month", "week", "day"];

export function ScheduleRoute() {
	const { data } = useData();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const { view, date, scrub } = parseScheduleSearch(search);
	const todayIso = todayISOVietnam();
	const [openSession, setOpenSession] = useState<ClassSessionModalRef | null>(
		null,
	);
	const [eventModalOpen, setEventModalOpen] = useState(false);

	// A garbage ?view/?date (or a legacy ?week link) scrubs the URL to the
	// canonical ?view=&date= form so reloads stay deterministic. `replace`
	// avoids a history entry; a clean default load rewrites nothing.
	useEffect(() => {
		if (!scrub) return;
		navigate({
			to: "/schedule",
			search: { view, date },
			replace: true,
		});
	}, [scrub, view, date, navigate]);

	const week = useMemo(
		() => resolveWeek(view === "week" ? date : undefined),
		[view, date],
	);
	const weekModel = useMemo(
		() => (view === "week" ? buildWeekModel(data, week.dates) : null),
		[view, data, week.dates],
	);

	const go = (nextView: ScheduleView, nextDate: string) => {
		navigate({ to: "/schedule", search: { view: nextView, date: nextDate } });
	};
	const step = (delta: number) => {
		const next = shiftAnchor(view, date, delta);
		// Week anchor luôn chuẩn về thứ Hai trong URL (như link ?week= cũ).
		go(view, view === "week" ? startOfWeekMonday(next) : next);
	};
	const atEarliest = shiftAnchor(view, date, -1) === date;
	const isCurrent = date === todayIso;

	const kicker =
		view === "month"
			? formatMonthLabel(date)
			: view === "day"
				? formatDayLabel(date)
				: `Tuần ${formatWeekRange(week.weekStart)} · ${weekModel?.slotCount ?? 0} buổi`;

	const onSwitchView = (next: ScheduleView) => {
		if (next === view) return;
		if (next === "week") {
			// Nhảy tuần chứa ngày đang xem, giữ ngữ cảnh thời gian.
			go("week", startOfWeekMonday(date));
			return;
		}
		go(next, date);
	};

	return (
		<div>
			<PageHead
				kicker={kicker}
				title="Lịch dạy"
				action={
					<div className="flex flex-wrap items-center gap-2">
						<div data-testid="schedule-view-switch">
							{/* Segmented control dùng chung (design `Tabs`) — pattern
						    tablist/tab của repo, thay cho radiogroup tự chế. */}
							<Tabs
								tabs={VIEW_ORDER.map((v) => ({ id: v, label: VIEW_LABELS[v] }))}
								active={view}
								onChange={(v) => onSwitchView(v as ScheduleView)}
								className="mb-0"
							/>
						</div>
						<Button
							variant="outline"
							onClick={() => setEventModalOpen(true)}
							data-testid="schedule-add-event"
						>
							<CalendarPlus aria-hidden className="size-4" />
							Sự kiện
						</Button>
					</div>
				}
			/>
			<div className="mb-4 flex items-center justify-between gap-2">
				<Button
					variant="outline"
					onClick={() => step(-1)}
					disabled={atEarliest}
				>
					←{" "}
					{view === "month"
						? "Tháng trước"
						: view === "day"
							? "Ngày trước"
							: "Tuần trước"}
				</Button>
				<Button
					variant="ghost"
					onClick={() => go(view, todayIso)}
					disabled={isCurrent}
					className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
				>
					Hôm nay
				</Button>
				<Button variant="outline" onClick={() => step(1)}>
					{view === "month"
						? "Tháng sau"
						: view === "day"
							? "Ngày sau"
							: "Tuần sau"}{" "}
					→
				</Button>
			</div>
			{data.classes.length === 0 ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="schedule-empty-state"
				>
					<h2 className="font-semibold text-lg">Chưa có lịch dạy nào</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
						Lịch dạy được tự động sắp xếp dựa trên các lớp học đang hoạt động.
						Hãy tạo lớp học để bắt đầu theo dõi lịch dạy.
					</p>
					<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
						<Button onClick={() => navigate({ to: "/classes" })}>
							Quản lý lớp học
						</Button>
					</div>
				</Card>
			) : view === "month" ? (
				<ScheduleMonthView
					data={data}
					anchor={date}
					onOpenDay={(d) => go("day", d)}
				/>
			) : view === "day" ? (
				<ScheduleDayView
					data={data}
					dateISO={date}
					onOpenSession={setOpenSession}
				/>
			) : (
				weekModel && (
					<ScheduleWeekView
						data={data}
						dates={week.dates}
						model={weekModel}
						onOpenSession={setOpenSession}
					/>
				)
			)}
			<ClassSessionModal
				sessionRef={openSession}
				onClose={() => setOpenSession(null)}
			/>
			<OrgEventModal
				open={eventModalOpen}
				defaultDate={date}
				onClose={() => setEventModalOpen(false)}
			/>
		</div>
	);
}
