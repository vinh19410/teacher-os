import type {
	StudentClassDetail,
	StudentClassLesson,
} from "@teacher-os/api/contracts";
import { formatSchedule, parseSchedule } from "@teacher-os/api/format-schedule";
import {
	BookOpen,
	CalendarClock,
	CalendarDays,
	ClipboardCheck,
	Clock,
	GraduationCap,
	Hourglass,
	type LucideIcon,
	MapPin,
	UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import {
	findNextLessonId,
	lessonDayLabel,
} from "@/components/class/class-lesson-list";
import { formatVietnamFullDate } from "@/lib/vietnam-display-date";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseISODateUTC(iso: string): number | null {
	if (!ISO_DATE_RE.test(iso)) return null;
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return null;
	return Date.UTC(y, m - 1, d);
}

/**
 * Tính thời lượng khoá học theo tháng từ `startDate` tới buổi học có `date`
 * muộn nhất. Trả `null` khi thiếu ngày hợp lệ (lớp legacy `date: null` hoặc
 * chưa có `startDate`) — không bao giờ sinh `NaN`.
 */
export function computeCourseMonths(
	startDate: string,
	lessons: StudentClassLesson[],
): number | null {
	const startMs = parseISODateUTC(startDate.trim());
	if (startMs == null) return null;

	let maxEndMs: number | null = null;
	for (const lesson of lessons) {
		if (!lesson.date) continue;
		const ms = parseISODateUTC(lesson.date);
		if (ms != null && (maxEndMs == null || ms > maxEndMs)) {
			maxEndMs = ms;
		}
	}
	if (maxEndMs == null || maxEndMs < startMs) return null;
	return Math.max(1, Math.round((maxEndMs - startMs) / (30.4 * 86_400_000)));
}

function InfoItem({
	icon: Icon,
	label,
	children,
}: {
	icon: LucideIcon;
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="min-w-0">
			<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<Icon aria-hidden="true" className="size-3.5 shrink-0" />
				{label}
			</dt>
			<dd className="mt-1 truncate font-medium text-foreground">{children}</dd>
		</div>
	);
}

/**
 * Thẻ thông tin lớp theo design v2 (`StudentClass.tsx`): lưới `<dl>` 2→4 cột
 * và thanh footer tổng hợp. Chỉ hiển thị các trường có dữ liệu thật từ server;
 * riêng ô Giáo viên luôn hiện để báo trạng thái khi lớp chưa gán giáo viên.
 */
export function ClassInfoCard({
	detail,
	todayISO,
	now,
	held,
	totalSessions,
}: {
	detail: StudentClassDetail;
	todayISO: string;
	now: Date;
	held: number;
	totalSessions: number;
}) {
	const cls = detail.class;
	const teacher = cls.teacher;
	const teacherEmail = teacher?.email.trim() ?? "";

	const isPaused = cls.status === "paused";
	const nextId = isPaused
		? null
		: findNextLessonId(detail.lessons, todayISO, now);
	const nextLesson = nextId
		? (detail.lessons.find((l) => l.id === nextId) ?? null)
		: null;

	const months = computeCourseMonths(cls.startDate, detail.lessons);
	const parsedSchedule = parseSchedule(cls.schedule);
	const scheduleTimeMatch = cls.schedule.match(
		/\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/,
	);
	const timeRange = parsedSchedule
		? `${parsedSchedule.start}–${parsedSchedule.end}`
		: (scheduleTimeMatch?.[0] ?? nextLesson?.time ?? null);

	const hasFooter = months != null || Boolean(timeRange) || nextLesson != null;

	return (
		<section
			aria-label="Thông tin lớp học"
			className="mb-6 rounded-xl border bg-card text-card-foreground shadow-sm"
		>
			<dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-6 md:grid-cols-4">
				{cls.level.trim() !== "" && (
					<InfoItem icon={BookOpen} label="Khoá">
						{cls.level}
					</InfoItem>
				)}
				{cls.schedule.trim() !== "" && (
					<InfoItem icon={CalendarDays} label="Lịch">
						{formatSchedule(cls.schedule)}
					</InfoItem>
				)}
				{cls.mode.trim() !== "" && (
					<InfoItem icon={MapPin} label="Hình thức">
						{cls.mode}
					</InfoItem>
				)}
				<InfoItem icon={UserRound} label="Giáo viên">
					{teacher ? (
						<div className="min-w-0">
							<span className="block truncate">{teacher.name}</span>
							{teacherEmail !== "" && (
								<a
									href={`mailto:${teacherEmail}`}
									className="block truncate rounded-sm font-normal text-primary text-xs hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								>
									{teacherEmail}
								</a>
							)}
						</div>
					) : (
						<span className="font-normal text-muted-foreground text-sm">
							Chưa có thông tin giáo viên.
						</span>
					)}
				</InfoItem>
				<InfoItem icon={ClipboardCheck} label="Số buổi đã học">
					{held}/{totalSessions} buổi
				</InfoItem>
				{cls.startDate.trim() !== "" && (
					<InfoItem icon={GraduationCap} label="Khai giảng">
						{formatVietnamFullDate(cls.startDate)}
					</InfoItem>
				)}
			</dl>

			{hasFooter && (
				<div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t px-6 py-3.5 text-muted-foreground text-sm">
					{months != null && (
						<span className="inline-flex items-center gap-1.5">
							<Hourglass aria-hidden="true" className="size-3.5 shrink-0" />
							{months} tháng
						</span>
					)}
					{timeRange && (
						<span className="inline-flex items-center gap-1.5">
							<Clock aria-hidden="true" className="size-3.5 shrink-0" />
							{timeRange}
						</span>
					)}
					{nextLesson && (
						<span className="inline-flex items-center gap-1.5">
							<CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
							Buổi tới: {lessonDayLabel(nextLesson)}
							{nextLesson.topic ? ` — ${nextLesson.topic}` : ""}
						</span>
					)}
				</div>
			)}
		</section>
	);
}
