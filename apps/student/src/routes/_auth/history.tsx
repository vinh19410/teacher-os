import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { HistoryDay, HistorySkill } from "@teacher-os/api/contracts";
import { HISTORY_SKILLS } from "@teacher-os/api/contracts";
import {
	addDaysISO,
	addMonthsISO,
	mondayOfISO,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import { Button } from "@teacher-os/ui/components/button";
import { CalendarCheck, Clock, Flame } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { HistoryList } from "@/components/history/history-list";
import { MonthHeatmap } from "@/components/history/month-heatmap";
import { WeekTable } from "@/components/history/week-table";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import Loader from "@/components/loader";
import {
	useHistoryList,
	useHistoryMonth,
	useHistoryWeek,
} from "@/lib/repos/student";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type HistorySearch = { week?: string; skill?: string; page?: number };

export const Route = createFileRoute("/_auth/history")({
	validateSearch: (search: Record<string, unknown>): HistorySearch => {
		const week =
			typeof search.week === "string" && ISO_DATE_PATTERN.test(search.week)
				? search.week
				: undefined;
		const skill =
			typeof search.skill === "string" &&
			(HISTORY_SKILLS as readonly string[]).includes(search.skill)
				? search.skill
				: undefined;
		const pageRaw = Number.parseInt(String(search.page ?? "1"), 10);
		const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : undefined;
		return { week, skill, page };
	},
	component: HistoryPage,
});

/** Panel dùng chung bố cục design-v2 (Activity / Weekly breakdown). */
function Panel({
	title,
	description,
	children,
	className,
}: {
	title: string;
	description?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={`min-w-0 rounded-xl border bg-card p-6 text-card-foreground shadow-sm ${className ?? ""}`}
		>
			<h2 className="font-semibold leading-none">{title}</h2>
			{description && (
				<p className="mt-1.5 text-muted-foreground text-sm">{description}</p>
			)}
			<div className="mt-5">{children}</div>
		</section>
	);
}

function HistoryPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();

	// Ngày/tuần theo giờ Việt Nam (vietnam-date) — khớp nguồn group của server.
	const todayKey = vietnamTodayISO();
	const thisYm = todayKey.slice(0, 7);
	const prevYm = addMonthsISO(thisYm, -1);
	const monthNowQuery = useHistoryMonth(thisYm);
	const monthPrevQuery = useHistoryMonth(prevYm);
	const selectedWeek = search.week ?? mondayOfISO(todayKey);
	const weekQuery = useHistoryWeek(selectedWeek);
	const listQuery = useHistoryList({
		skill: search.skill as HistorySkill | undefined,
		page: search.page ?? 1,
	});

	// Search luôn truyền TRỌN (không merge với prev): caller chịu trách nhiệm
	// giữ lại param muốn giữ — tránh nuốt thay đổi khi đặt param về undefined.
	const updateSearch = (next: HistorySearch) => {
		void navigate({ to: "/history", search: next });
	};

	// Stat đầu trang từ dữ liệu tháng: chuỗi ngày liên tiếp (qua cả tháng
	// trước), tổng phút và số ngày học của tháng hiện tại.
	const stats = useMemo(() => {
		const dayMap = new Map<string, HistoryDay>();
		for (const day of [
			...(monthPrevQuery.data?.days ?? []),
			...(monthNowQuery.data?.days ?? []),
		]) {
			dayMap.set(day.date, day);
		}
		let streak = 0;
		for (
			let day = todayKey;
			(dayMap.get(day)?.count ?? 0) > 0;
			day = addDaysISO(day, -1)
		) {
			streak += 1;
		}
		const monthDays = monthNowQuery.data?.days ?? [];
		return {
			streak,
			minutes: monthDays.reduce((sum, day) => sum + day.minutes, 0),
			activeDays: monthDays.length,
		};
	}, [monthNowQuery.data, monthPrevQuery.data, todayKey]);

	if (
		monthNowQuery.isLoading ||
		monthPrevQuery.isLoading ||
		weekQuery.isLoading ||
		listQuery.isLoading
	) {
		return <Loader />;
	}
	if (monthNowQuery.isError || weekQuery.isError || listQuery.isError) {
		return (
			<StudentPageGate>
				{() => (
					<div
						data-testid="student-history-page"
						className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm"
					>
						Không tải được lịch sử. Vui lòng thử lại.
					</div>
				)}
			</StudentPageGate>
		);
	}

	const monthNow = monthNowQuery.data?.days ?? [];
	const monthPrev = monthPrevQuery.data?.days ?? [];
	const weekData = weekQuery.data;
	const listData = listQuery.data;
	const hasNoActivity =
		monthNow.length === 0 &&
		monthPrev.length === 0 &&
		(listData?.total ?? 0) === 0;

	return (
		<StudentPageGate>
			{() => (
				<div data-testid="student-history-page" className="space-y-6">
					<header>
						<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
							Mọi bài đã hoàn thành, theo ngày và theo kỹ năng
						</p>
						<h1 className="mt-2 font-extrabold text-3xl text-foreground leading-[0.95] tracking-[-0.045em]">
							Lịch sử luyện tập
						</h1>
					</header>

					{hasNoActivity ? (
						<section className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card py-20 text-center text-card-foreground shadow-sm">
							<span className="grid size-12 place-items-center rounded-full bg-orange-500/10 text-orange-500">
								<Flame className="size-6" />
							</span>
							<h2 className="font-semibold text-lg">Chưa có hoạt động nào</h2>
							<p className="max-w-md text-muted-foreground text-sm">
								Bài tập lớp, bài tự luyện và thẻ từ vựng đã ôn sẽ xuất hiện ở
								đây sau khi bạn bắt đầu học.
							</p>
							<Button onClick={() => void navigate({ to: "/practice" })}>
								Bắt đầu luyện tập
							</Button>
						</section>
					) : (
						<>
							<div className="grid gap-4 md:grid-cols-3">
								<div className="flex items-center gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
									<span className="grid size-12 shrink-0 place-items-center rounded-full bg-orange-500/10 text-orange-500">
										<Flame className="size-6" />
									</span>
									<div>
										<div className="font-semibold text-lg tabular-nums tracking-tight">
											{stats.streak} ngày liên tiếp
										</div>
										<div className="text-muted-foreground text-sm">
											{stats.streak > 0
												? "Giữ nhịp học mỗi ngày nhé!"
												: "Học hôm nay để bắt đầu chuỗi ngày."}
										</div>
									</div>
								</div>
								<div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
									<div className="flex items-center justify-between text-muted-foreground text-sm">
										Thời gian học
										<Clock className="size-4" />
									</div>
									<div className="mt-1.5 font-semibold text-2xl tabular-nums">
										{stats.minutes} phút
									</div>
									<div className="text-muted-foreground text-xs">
										trong tháng này
									</div>
								</div>
								<div className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
									<div className="flex items-center justify-between text-muted-foreground text-sm">
										Ngày có học
										<CalendarCheck className="size-4" />
									</div>
									<div className="mt-1.5 font-semibold text-2xl tabular-nums">
										{stats.activeDays}
									</div>
									<div className="text-muted-foreground text-xs">
										trong tháng này
									</div>
								</div>
							</div>

							<div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
								<Panel
									title="Hoạt động"
									description="Bấm một ngày để xem tuần đó bên phải"
								>
									<div className="grid gap-6">
										<MonthHeatmap
											ym={thisYm}
											days={monthNow}
											week={selectedWeek}
											onWeek={(monday) =>
												updateSearch({
													week: monday,
													skill: search.skill,
													page: search.page,
												})
											}
											todayKey={todayKey}
										/>
										<MonthHeatmap
											ym={prevYm}
											days={monthPrev}
											week={selectedWeek}
											onWeek={(monday) =>
												updateSearch({
													week: monday,
													skill: search.skill,
													page: search.page,
												})
											}
											todayKey={todayKey}
										/>
									</div>
								</Panel>
								<Panel
									title="Tuần theo kỹ năng"
									description={
										selectedWeek === mondayOfISO(todayKey)
											? "Tuần này"
											: `Tuần từ ${selectedWeek.split("-").reverse().slice(0, 2).join("/")}`
									}
									className="self-start"
								>
									{weekData && (
										<WeekTable week={weekData} todayKey={todayKey} />
									)}
								</Panel>
							</div>

							{listData && (
								<HistoryList
									skill={(search.skill as HistorySkill | undefined) ?? ""}
									page={search.page ?? 1}
									data={listData}
									onSkillChange={(skill) =>
										updateSearch({
											week: search.week,
											skill: skill || undefined,
											page: undefined,
										})
									}
									onPageChange={(page) =>
										updateSearch({
											week: search.week,
											skill: search.skill,
											page,
										})
									}
								/>
							)}
						</>
					)}
				</div>
			)}
		</StudentPageGate>
	);
}
