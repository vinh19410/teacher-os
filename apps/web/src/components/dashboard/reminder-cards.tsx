import { Link } from "@tanstack/react-router";
import type { DashboardReminders } from "@teacher-os/api/contracts";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { fmtVND } from "@/lib/mock-data";

const DONE_TODAY_LABEL = "Đã hoàn tất hôm nay";

/** `HH:mm` + số phút → `HH:mm` (cùng ngày; ca hiện tại không vượt nửa đêm). */
function addMinutes(time: string, minutes: number): string {
	const [h, m] = time.split(":").map(Number);
	if (
		h === undefined ||
		m === undefined ||
		Number.isNaN(h) ||
		Number.isNaN(m)
	) {
		return time;
	}
	const total = h * 60 + m + minutes;
	return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

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
 * chỉ nhận data, không tự fetch. Thẻ học phí chỉ render khi viewer có quyền
 * tài chính và response có block `tuition`.
 */
export function ReminderCards({
	data,
	canAccessFinance = true,
}: {
	data: DashboardReminders;
	canAccessFinance?: boolean;
}) {
	const showTuition = canAccessFinance && Boolean(data.tuition);
	return (
		<div
			className={
				showTuition
					? "grid grid-cols-1 gap-4 lg:grid-cols-3"
					: "grid grid-cols-1 gap-4 lg:grid-cols-2"
			}
		>
			<ReminderCard
				testId="reminder-card-attendance"
				step={1}
				label="Điểm danh"
				title="Ca dạy hôm nay chưa điểm danh"
				done={data.attendance.pending === 0}
				headline={`${data.attendance.pending} ca dạy`}
				lines={data.attendance.items.map(
					(item) =>
						`${item.className} (${item.time} – ${addMinutes(item.time, item.dur)})`,
				)}
				cta="Điểm danh →"
				to="/attendance"
				search={{ date: data.date, status: "pending" }}
			/>
			<ReminderCard
				testId="reminder-card-grading"
				step={2}
				label="Chấm bài"
				title="Bài tập quá hạn chấm > 24h"
				done={data.overdueGrading.count === 0}
				headline={`${data.overdueGrading.count} bài`}
				lines={[
					`${data.overdueGrading.writing} Writing · ${data.overdueGrading.speaking} Speaking`,
				]}
				cta="Chấm bài →"
				to="/grading"
				search={{ status: "awaiting" }}
			/>
			{showTuition && data.tuition && (
				<ReminderCard
					testId="reminder-card-tuition"
					step={3}
					label="Học phí"
					title="Học phí đến hạn"
					done={data.tuition.students === 0}
					headline={`${data.tuition.students} học viên`}
					lines={[fmtVND(data.tuition.outstanding)]}
					cta="Xem học phí →"
					to="/tuition"
				/>
			)}
		</div>
	);
}

/**
 * Một thẻ nhắc việc: toàn thẻ là vùng bấm qua Link phủ inset-0 trên chính
 * Card (không lồng div thừa gây double-padding hay thụt focus ring).
 */
function ReminderCard(props: {
	testId: string;
	step: 1 | 2 | 3;
	label: string;
	title: string;
	done: boolean;
	headline: string;
	lines: string[];
	cta: string;
	to: string;
	search?: Record<string, unknown>;
}) {
	const previewLines = props.done ? [] : props.lines.slice(0, 3);
	return (
		<Card
			data-testid={props.testId}
			className={cn(
				"relative flex min-w-0 flex-col gap-2 p-5",
				props.done && "bg-muted/40",
			)}
		>
			<Link
				to={props.to}
				search={props.search}
				className="absolute inset-0 rounded-xl outline-none focus-visible:shadow-[var(--focus-ring)]"
				aria-label={`${props.step}. ${props.label} — ${props.title}`}
			/>
			<div className="flex items-center gap-2">
				<span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground text-xs tabular-nums">
					{props.step}
				</span>
				<span className="font-medium text-muted-foreground text-xs">
					{props.label}
				</span>
			</div>
			<h3 className="font-medium text-sm">{props.title}</h3>
			{props.done ? (
				<p className="font-semibold text-base">{DONE_TODAY_LABEL}</p>
			) : (
				<p className="font-semibold text-3xl tabular-nums">{props.headline}</p>
			)}
			{previewLines.length > 0 && (
				<ul className="space-y-1 text-muted-foreground text-sm">
					{previewLines.map((line, index) => (
						// Danh sách preview tĩnh (đã sort theo time) — index key ổn.
						<li key={`${index}-${line}`} className="break-words">
							{line}
						</li>
					))}
				</ul>
			)}
			<p className="mt-auto pt-1 font-medium text-primary text-sm">
				{props.cta}
			</p>
		</Card>
	);
}
