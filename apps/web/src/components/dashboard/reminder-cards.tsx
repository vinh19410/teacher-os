import { Link } from "@tanstack/react-router";
import type { DashboardReminders } from "@teacher-os/api/contracts";
import { Card } from "@/components/ui/card";
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
 * Khu vực 3 thẻ nhắc việc — chỉ nhận data, không tự fetch (dashboard route
 * gắn query). Thẻ học phí chỉ render khi response có block `tuition`.
 */
export function ReminderCards({ data }: { data: DashboardReminders }) {
	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
			<ReminderCard
				title="Ca học hôm nay chưa điểm danh"
				done={data.attendance.pending === 0}
				headline={`${data.attendance.pending} ca`}
				lines={data.attendance.items.map(
					(item) =>
						`${item.className} (${item.time} – ${addMinutes(item.time, item.dur)})`,
				)}
				cta="Mở Điểm danh ngày →"
				to="/attendance"
				search={{ date: data.date, status: "pending" }}
			/>
			<ReminderCard
				title="Bài tập quá hạn chấm > 24h"
				done={data.overdueGrading.count === 0}
				headline={`${data.overdueGrading.count} bài`}
				lines={[
					`${data.overdueGrading.writing} Writing · ${data.overdueGrading.speaking} Speaking`,
				]}
				cta="Mở Không gian chấm →"
				to="/grading"
				search={{ status: "awaiting" }}
			/>
			{data.tuition && (
				<ReminderCard
					title="Học phí đến hạn / quá hạn thu"
					done={data.tuition.students === 0}
					headline={`${data.tuition.students} học viên`}
					lines={[fmtVND(data.tuition.outstanding)]}
					cta="Mở Sổ học phí →"
					to="/tuition"
				/>
			)}
		</div>
	);
}

/**
 * Một thẻ nhắc việc: toàn thẻ là vùng bấm qua Link phủ inset-0 — đúng 1
 * điểm focus mỗi thẻ (AC-001: bấm 1 lần là sang màn đã lọc). Đếm 0 → tông
 * trung tính + nhãn zero inbox, CTA vẫn dẫn đúng đích.
 */
function ReminderCard(props: {
	title: string;
	done: boolean;
	headline: string;
	lines: string[];
	cta: string;
	to: string;
	search?: Record<string, unknown>;
}) {
	return (
		<Card className={props.done ? "bg-muted/40" : ""}>
			<div className="relative space-y-2 p-5">
				<Link
					to={props.to}
					search={props.search}
					className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={`${props.title} — ${props.cta.replace(" →", "")}`}
				/>
				<h3 className="font-medium text-sm">{props.title}</h3>
				{props.done ? (
					<p className="font-semibold text-base">{DONE_TODAY_LABEL}</p>
				) : (
					<p className="font-semibold text-3xl tabular-nums">
						{props.headline}
					</p>
				)}
				<ul className="space-y-1 text-muted-foreground text-sm">
					{props.lines.slice(0, 3).map((line, index) => (
						// Danh sách preview tĩnh (đã sort theo time) — index key ổn.
						<li key={`${index}-${line}`}>{line}</li>
					))}
				</ul>
				<p className="font-medium text-primary text-sm">{props.cta}</p>
			</div>
		</Card>
	);
}
