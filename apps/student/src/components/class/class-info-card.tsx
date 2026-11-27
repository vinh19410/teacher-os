import type { StudentClassDetail } from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import {
	BookOpen,
	CalendarDays,
	ClipboardCheck,
	GraduationCap,
	type LucideIcon,
	MapPin,
	UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatVietnamFullDate } from "@/lib/vietnam-display-date";

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
 * Thẻ thông tin lớp theo design v2 (`StudentClass.tsx`): lưới `<dl>` 2→4 cột.
 * Chỉ hiển thị các trường có dữ liệu thật từ server; riêng ô Giáo viên luôn
 * hiện để báo trạng thái khi lớp chưa gán giáo viên.
 */
export function ClassInfoCard({
	detail,
	held,
	totalSessions,
}: {
	detail: StudentClassDetail;
	held: number;
	totalSessions: number;
}) {
	const cls = detail.class;
	const teacher = cls.teacher;
	const teacherEmail = teacher?.email.trim() ?? "";

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
		</section>
	);
}
