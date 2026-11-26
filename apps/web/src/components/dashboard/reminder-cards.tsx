import { Link } from "@tanstack/react-router";
import type { DashboardReminders } from "@teacher-os/api/contracts";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { OverdueUnsubmittedSummary } from "@/lib/dashboard-from-kernel";
import { fmtVND } from "@/lib/mock-data";

const MAX_ATTENDANCE_PREVIEW = 3;

/** `26/10/2026` straight from the ISO string — cùng quy ước formatDayMonth. */
function formatVNDate(iso: string): string {
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Tiêu đề section: "Việc cần làm hôm nay (Thứ Hai, 26/10/2026)" — weekday
 * suy từ ISO (UTC-anchored, không phụ thuộc múi máy). */
export function remindersSectionTitle(iso: string): string {
	const weekday = new Intl.DateTimeFormat("vi-VN", {
		weekday: "long",
		timeZone: "UTC",
	}).format(new Date(`${iso}T00:00:00Z`));
	return `Việc cần làm hôm nay (${weekday}, ${formatVNDate(iso)})`;
}

/**
 * Khu vực 3 thẻ lối tắt "Việc cần làm hôm nay" theo thứ tự ưu tiên 1, 2, 3 —
 * chỉ nhận data, không tự fetch. Thẻ học phí mặc định fail-closed
 * (`canAccessFinance = false`) và chỉ render khi caller truyền
 * `canAccessFinance={true}` đồng thời response có block `tuition`.
 */
export function ReminderCards({
	data,
	canAccessFinance = false,
	overdueUnsubmitted,
}: {
	data: DashboardReminders;
	canAccessFinance?: boolean;
	overdueUnsubmitted?: OverdueUnsubmittedSummary;
}) {
	const gradingWarningId = useId();
	const showTuition = canAccessFinance && Boolean(data.tuition);
	const attendancePreview = data.attendance.items.slice(
		0,
		MAX_ATTENDANCE_PREVIEW,
	);
	const extraAttendanceCount = Math.max(
		0,
		data.attendance.pending - attendancePreview.length,
	);
	const overdueUnsubmittedTargets = overdueUnsubmitted?.targets ?? 0;
	const overdueUnsubmittedStudents = overdueUnsubmitted?.students ?? 0;
	const hasOverdueUnsubmitted = overdueUnsubmittedTargets > 0;

	return (
		<div
			className={
				showTuition
					? "grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-3"
					: "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2"
			}
		>
			<ReminderCard
				testId="reminder-card-attendance"
				step={1}
				label="Điểm danh"
				title="Ca dạy hôm nay chưa điểm danh"
				done={data.attendance.pending === 0}
				doneLabel="Đã hoàn tất hôm nay"
				count={data.attendance.pending}
				unit="ca dạy"
				cta="Điểm danh"
				to="/attendance"
				search={{ date: data.date, status: "pending" }}
			>
				{attendancePreview.length > 0 && (
					<ul className="grid gap-1 border-border border-t pt-3 text-sm">
						{attendancePreview.map((item) => (
							<li
								key={`${item.classId}-${item.time}`}
								className="flex min-w-0 items-baseline gap-2"
							>
								<span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
									{item.time}
								</span>
								<span className="min-w-0 truncate">{item.className}</span>
							</li>
						))}
						{extraAttendanceCount > 0 && (
							<li className="text-muted-foreground">
								{`+${extraAttendanceCount} ca khác`}
							</li>
						)}
					</ul>
				)}
			</ReminderCard>
			<ReminderCard
				testId="reminder-card-grading"
				step={2}
				label="Chấm bài"
				title="Bài tập quá hạn chấm > 24h"
				done={data.overdueGrading.count === 0}
				doneLabel="Không còn bài quá hạn chấm"
				hasWarning={hasOverdueUnsubmitted}
				warningBannerId={hasOverdueUnsubmitted ? gradingWarningId : undefined}
				warningBanner={
					hasOverdueUnsubmitted ? (
						<div
							id={gradingWarningId}
							data-testid="reminder-card-grading-overdue-unsubmitted"
							className="flex min-w-0 items-start gap-2 border-border border-t pt-3 font-medium text-warn text-xs"
						>
							<AlertTriangle
								className="mt-0.5 size-3.5 shrink-0"
								aria-hidden="true"
							/>
							<span className="min-w-0 break-words">
								{`Còn ${overdueUnsubmittedTargets} bài quá hạn chưa nộp (${overdueUnsubmittedStudents} học viên) — xem ở Cần kiểm tra`}
							</span>
						</div>
					) : undefined
				}
				count={data.overdueGrading.count}
				unit="bài"
				cta="Chấm bài"
				to="/grading"
				search={{ status: "awaiting" }}
			>
				<ul className="grid gap-1 border-border border-t pt-3 text-sm">
					<li className="tabular-nums">
						{`${data.overdueGrading.writing} Writing · ${data.overdueGrading.speaking} Speaking`}
					</li>
				</ul>
			</ReminderCard>
			{showTuition && data.tuition && (
				<ReminderCard
					testId="reminder-card-tuition"
					step={3}
					label="Học phí"
					title="Học phí đến hạn"
					done={data.tuition.students === 0}
					doneLabel="Không có khoản đến hạn"
					count={data.tuition.students}
					unit="học viên"
					cta="Xem học phí"
					to="/tuition"
				>
					<ul className="grid gap-1 border-border border-t pt-3 text-sm">
						<li className="tabular-nums">
							<span className="whitespace-nowrap font-mono">
								{fmtVND(data.tuition.outstanding)}
							</span>{" "}
							cần thu
						</li>
					</ul>
				</ReminderCard>
			)}
		</div>
	);
}

/**
 * Một thẻ nhắc việc: toàn thẻ là vùng bấm qua Link phủ inset-0 trên chính
 * Card (không lồng interactive element, focus ring ôm khít viền thẻ).
 */
function ReminderCard(props: {
	testId: string;
	step: 1 | 2 | 3;
	label: string;
	title: string;
	done: boolean;
	doneLabel: string;
	hasWarning?: boolean;
	warningBanner?: ReactNode;
	warningBannerId?: string;
	count: number;
	unit: string;
	cta: string;
	to: string;
	search?: Record<string, unknown>;
	children?: ReactNode;
}) {
	return (
		<Card
			data-testid={props.testId}
			data-done={props.done ? "true" : "false"}
			className={cn(
				"group relative flex min-w-0 flex-col gap-3 p-5",
				props.done && !props.hasWarning && "bg-muted shadow-none",
			)}
		>
			<Link
				to={props.to}
				search={props.search}
				className="absolute inset-0 rounded-xl outline-none focus-visible:shadow-[var(--focus-ring)]"
				aria-label={`${props.step}. ${props.label} — ${props.title}`}
				aria-describedby={props.hasWarning ? props.warningBannerId : undefined}
			/>
			<div className="flex items-center gap-2">
				<span
					aria-hidden={props.done ? "true" : undefined}
					className={cn(
						"grid size-6 shrink-0 place-items-center rounded-full font-mono font-semibold text-xs tabular-nums",
						props.done
							? "bg-success text-background"
							: "bg-primary text-primary-foreground",
					)}
				>
					{props.done ? (
						<Check className="size-3.5" aria-hidden="true" />
					) : (
						props.step
					)}
				</span>
				<span
					data-testid="reminder-card-label"
					className="font-semibold text-sm"
				>
					{props.label}
				</span>
			</div>
			<h3 className="font-normal text-muted-foreground text-sm">
				{props.title}
			</h3>
			{props.done ? (
				<p className="inline-flex min-h-9 items-center gap-2 font-semibold text-sm text-success">
					<Check className="size-4 shrink-0" aria-hidden="true" />
					{props.doneLabel}
				</p>
			) : (
				<>
					{/* Block <p> với dấu cách thực giữa 2 inline <span> để innerText trình duyệt/Playwright luôn là "{count} {unit}". */}
					<p data-testid="reminder-card-count" className="leading-none">
						<span className="font-mono font-semibold text-[clamp(1.75rem,1.4rem+1vw,2.25rem)] tabular-nums tracking-tight">
							{props.count}
						</span>{" "}
						<span className="ml-1 whitespace-nowrap text-muted-foreground text-sm">
							{props.unit}
						</span>
					</p>
					{props.children}
				</>
			)}
			{props.warningBanner}
			<div className="mt-auto pt-2">
				<span
					aria-hidden="true"
					data-testid="reminder-card-cta"
					className={cn(
						buttonVariants({
							variant: props.done ? "ghost" : "outline",
							size: "default",
						}),
						"pointer-events-none w-full group-hover:bg-accent group-hover:text-accent-foreground",
					)}
				>
					{props.done ? "Xem lại" : props.cta}
					<ArrowRight className="size-4" aria-hidden="true" />
				</span>
			</div>
		</Card>
	);
}
