import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, MapPin, Monitor, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
	type DashboardClassSession,
	type DashboardFocusState,
	formatDurationVi,
	formatEndTime,
	formatWeekdayLong,
} from "@/lib/dashboard-from-kernel";
import type { ClassGroup } from "@/lib/mock-data";
import { formatDayMonth } from "@/lib/week-grid";

function SessionMetaRow({
	session,
	cls,
}: {
	session: DashboardClassSession;
	cls: ClassGroup | undefined;
}) {
	const endTime = formatEndTime(session.time, session.dur);
	const timeRange = endTime ? `${session.time} – ${endTime}` : session.time;
	const mode = cls?.mode?.trim() || "";
	const isOnline = mode.toLowerCase().includes("online");

	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
			<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
				<Clock className="size-4 shrink-0" aria-hidden="true" />
				<span className="font-mono tabular-nums">{timeRange}</span>
			</span>
			{mode && (
				<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
					{isOnline ? (
						<Monitor className="size-4 shrink-0" aria-hidden="true" />
					) : (
						<MapPin className="size-4 shrink-0" aria-hidden="true" />
					)}
					<span>{mode}</span>
				</span>
			)}
			<span className="inline-flex items-center gap-1.5 whitespace-nowrap">
				<Users className="size-4 shrink-0" aria-hidden="true" />
				<span className="tabular-nums">{`${session.lessons.length} học viên`}</span>
			</span>
		</div>
	);
}

function ScheduleWeekLink() {
	return (
		<Link
			to="/schedule"
			className="inline-flex min-h-8 items-center gap-1 rounded-md font-medium text-foreground text-sm underline-offset-4 hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
		>
			Xem tuần
			<ArrowRight className="size-4" aria-hidden="true" />
		</Link>
	);
}

/**
 * Thẻ trọng tâm trên Hero (cột phải lg+): hiển thị ca đang dạy (kèm tiến độ),
 * ca tiếp theo hôm nay, ca sắp tới trong tuần, hoặc trạng thái trống trung thực.
 */
export function FocusSessionCard({
	focus,
	classById,
}: {
	focus: DashboardFocusState;
	classById: (id: string) => ClassGroup | undefined;
}) {
	if (focus.kind === "live") {
		const cls = classById(focus.session.classId);
		const className = cls?.name ?? "Lớp";
		const percent = Math.round(focus.progress * 100);
		return (
			<Card
				data-testid="dashboard-focus-card"
				data-state="live"
				className="flex min-w-0 flex-col gap-3 p-5"
			>
				<section
					aria-labelledby="dashboard-focus-title"
					className="flex min-w-0 flex-col gap-3"
				>
					<span className="inline-flex items-center gap-2 font-semibold text-success text-xs uppercase tracking-wider">
						<span
							aria-hidden="true"
							className="size-2 shrink-0 rounded-full bg-success"
						/>
						Đang dạy
					</span>
					<h2
						id="dashboard-focus-title"
						className="truncate font-semibold text-lg tracking-tight"
					>
						{className}
					</h2>
					<SessionMetaRow session={focus.session} cls={cls} />
					<div
						role="progressbar"
						aria-label="Tiến độ ca dạy"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={percent}
						className="h-1 overflow-hidden rounded-full bg-muted"
					>
						<div
							className="h-full origin-left bg-success transition-transform duration-300 motion-reduce:transition-none"
							style={{ transform: `scaleX(${focus.progress})` }}
						/>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="font-medium text-sm">
							{`Còn ${formatDurationVi(focus.minutesLeft)}`}
						</span>
						<ScheduleWeekLink />
					</div>
				</section>
			</Card>
		);
	}

	if (focus.kind === "next") {
		const cls = classById(focus.session.classId);
		const className = cls?.name ?? "Lớp";
		return (
			<Card
				data-testid="dashboard-focus-card"
				data-state="next"
				className="flex min-w-0 flex-col gap-3 p-5"
			>
				<section
					aria-labelledby="dashboard-focus-title"
					className="flex min-w-0 flex-col gap-3"
				>
					<span className="inline-flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
						Ca dạy tiếp theo
					</span>
					<h2
						id="dashboard-focus-title"
						className="truncate font-semibold text-lg tracking-tight"
					>
						{className}
					</h2>
					<SessionMetaRow session={focus.session} cls={cls} />
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="font-medium text-sm">
							{`Bắt đầu sau ${formatDurationVi(focus.minutesUntil)}`}
						</span>
						<ScheduleWeekLink />
					</div>
				</section>
			</Card>
		);
	}

	if (
		focus.kind === "done-today-with-upcoming" ||
		focus.kind === "no-today-with-upcoming"
	) {
		const cls = classById(focus.session.classId);
		const className = cls?.name ?? "Lớp";
		const dayLabel = focus.dateIso
			? `${formatWeekdayLong(focus.day)}, ${formatDayMonth(focus.dateIso)}`
			: formatWeekdayLong(focus.day);
		const label =
			focus.kind === "done-today-with-upcoming"
				? "Đã xong ca dạy hôm nay"
				: "Ca dạy tiếp theo";
		const title =
			focus.kind === "done-today-with-upcoming"
				? focus.isTomorrow
					? `Ca đầu ngày mai: ${className}`
					: `Ca tiếp theo: ${className}`
				: className;

		return (
			<Card
				data-testid="dashboard-focus-card"
				data-state={focus.kind}
				className="flex min-w-0 flex-col gap-3 p-5"
			>
				<section
					aria-labelledby="dashboard-focus-title"
					className="flex min-w-0 flex-col gap-3"
				>
					<span className="inline-flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
						{label}
					</span>
					<h2
						id="dashboard-focus-title"
						className="truncate font-semibold text-lg tracking-tight"
					>
						{title}
					</h2>
					<SessionMetaRow session={focus.session} cls={cls} />
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="font-medium text-sm">{dayLabel}</span>
						<ScheduleWeekLink />
					</div>
				</section>
			</Card>
		);
	}

	const isDoneToday = focus.kind === "done-today-no-upcoming";
	return (
		<Card
			data-testid="dashboard-focus-card"
			data-state={focus.kind}
			className="flex min-w-0 flex-col gap-3 p-5"
		>
			<section
				aria-labelledby="dashboard-focus-title"
				className="flex min-w-0 flex-col gap-3"
			>
				<span className="inline-flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					{isDoneToday ? "Đã xong ca dạy hôm nay" : "Lịch dạy tuần này"}
				</span>
				<h2
					id="dashboard-focus-title"
					className="font-semibold text-lg tracking-tight"
				>
					{isDoneToday ? "Hết lịch dạy trong tuần" : "Chưa có ca dạy sắp tới"}
				</h2>
				<p className="text-muted-foreground text-sm">
					Lịch tuần luôn sẵn sàng ở mục Lịch dạy.
				</p>
				<div className="flex flex-wrap items-center justify-end gap-3">
					<ScheduleWeekLink />
				</div>
			</section>
		</Card>
	);
}
