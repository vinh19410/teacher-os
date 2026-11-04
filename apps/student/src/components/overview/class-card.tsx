import { Link } from "@tanstack/react-router";
import type {
	StudentAssignment,
	StudentClass,
} from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { TeacherAvatar } from "@/components/class/teacher-avatar";
import { deriveAssignmentStatus } from "@/lib/assignment-status";
import { cn } from "@/lib/cn";
import { formatVietnamDateFromISO } from "@/lib/vietnam-display-date";

export interface ClassCardProps {
	cls: StudentClass;
	/** Gọi khi học viên bấm "Tham gia lớp" với enrollment đang 'invited'. */
	onAccept?: (enrollmentId: string) => void;
	/** Disable nút xác nhận khi request đang bay. */
	accepting?: boolean;
	/** Bài tập của riêng lớp này (trang Lớp học) — vắng mặt thì ẩn bảng. */
	assignments?: StudentAssignment[];
	todayISO?: string;
	nowMs?: number;
}

export function ClassCard({
	cls,
	onAccept,
	accepting = false,
	assignments,
	todayISO,
	nowMs,
}: ClassCardProps) {
	const isInvited = cls.enrollmentStatus === "invited";

	let nextSessionText = "Chưa có lịch buổi tới";
	if (cls.nextSession?.date) {
		const formattedDate = formatVietnamDateFromISO(cls.nextSession.date);
		const time = cls.nextSession.time ? ` · ${cls.nextSession.time}` : "";
		const topic = cls.nextSession.topic ? ` · ${cls.nextSession.topic}` : "";
		nextSessionText = `Buổi tới: ${formattedDate}${time}${topic}`;
	}

	return (
		<div
			data-testid="class-card"
			className={cn(
				CARD_CLASS,
				!isInvited && "relative focus-within:shadow-[var(--focus-ring)]",
			)}
		>
			<div>
				<ClassBadges cls={cls} />

				<h3 className="mt-3 font-extrabold text-2xl text-foreground leading-tight tracking-[-0.02em]">
					{isInvited ? (
						cls.name
					) : (
						// Stretched link: lớp phủ `after:` làm cả card bấm được, còn
						// accessible name là tên lớp và phần còn lại của card vẫn
						// được trình đọc màn hình đọc như nội dung thường.
						<Link
							to="/classes/$classId"
							params={{ classId: cls.id }}
							className="after:absolute after:inset-0 after:rounded-lg focus-visible:shadow-none focus-visible:outline-none"
						>
							{cls.name}
						</Link>
					)}
				</h3>

				{cls.schedule && (
					<p className="mt-1.5 font-mono text-foreground text-xs">
						{formatSchedule(cls.schedule)}
					</p>
				)}

				{cls.teacher && (
					<div className="mt-3 flex min-w-0 items-center gap-2.5">
						<TeacherAvatar
							key={cls.teacher.image}
							teacher={cls.teacher}
							size="sm"
						/>
						<div className="min-w-0 leading-[1.3]">
							<p className="truncate text-[13px] text-muted-foreground">
								<span>Giáo viên: </span>
								<span className="text-foreground">{cls.teacher.name}</span>
							</p>
							{/* Text thường, không mailto: lớp phủ của link card nằm trên. */}
							<p className="truncate text-[12px] text-muted-foreground">
								{cls.teacher.email}
							</p>
						</div>
					</div>
				)}
			</div>

			<div className="mt-5 border-border border-t pt-4">
				{isInvited ? (
					<>
						<p className="text-[12px] text-muted-foreground leading-normal">
							Giáo viên đã mời bạn vào lớp. Xác nhận tham gia để bắt đầu khóa
							học và nhận lịch buổi học.
						</p>
						<button
							type="button"
							disabled={accepting || !onAccept}
							onClick={() => onAccept?.(cls.enrollmentId)}
							className="mt-3 flex h-10 w-full items-center justify-center rounded-lg bg-primary font-medium text-bg text-sm tracking-[0.02em] transition-colors duration-150 hover:bg-primary hover:text-primary-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
						>
							{accepting ? "Đang xử lý…" : "Tham gia lớp"}
						</button>
					</>
				) : (
					<>
						<ClassProgress cls={cls} />

						<p className="mt-3 truncate font-mono text-[12px] text-foreground">
							{nextSessionText}
						</p>
					</>
				)}
			</div>

			{assignments !== undefined && assignments.length > 0 && (
				<ClassCardAssignments
					assignments={assignments}
					todayISO={todayISO}
					nowMs={nowMs}
				/>
			)}
		</div>
	);
}

/** Bảng bài tập của lớp (design ClassPage): Assignment | Hạn | Trạng thái,
 * hàng dẫn về take/review screen. Chỉ vẽ khi caller truyền dữ liệu. */
function ClassCardAssignments({
	assignments,
	todayISO,
	nowMs,
}: {
	assignments: StudentAssignment[];
	todayISO?: string;
	nowMs?: number;
}) {
	const effectiveNowMs = nowMs ?? Date.now();
	const effectiveTodayISO =
		todayISO ?? vietnamTodayISO(new Date(effectiveNowMs));
	return (
		<div className="mt-4">
			<h4 className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.15em]">
				Bài tập
			</h4>
			<div className="mt-2 overflow-hidden rounded-md rounded-md border border-input bg-transparent">
				{assignments.map((assignment) => {
					const derived = deriveAssignmentStatus(
						assignment,
						effectiveTodayISO,
						effectiveNowMs,
					);
					const row = (
						<div
							key={assignment.id}
							className="flex items-center justify-between gap-3 border-border border-t px-4 py-2.5 first:border-t-0"
						>
							<span className="min-w-0 flex-1 truncate font-medium text-[13px] text-foreground">
								{assignment.title}
							</span>
							<span className="flex-none font-mono text-[11px] text-muted-foreground tabular-nums">
								{derived.dueText}
							</span>
							<span
								className={`flex-none rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${derived.badgeClass}`}
							>
								{derived.statusLabel}
							</span>
						</div>
					);
					if (assignment.source !== "class_assignment") return row;
					return (
						<Link
							key={assignment.id}
							to="/learn/quizzes/$assignmentId"
							params={{ assignmentId: assignment.id }}
							aria-label={
								assignment.submittedAt
									? `Xem lại kết quả: ${assignment.title}`
									: `Làm bài: ${assignment.title}`
							}
							className="block transition-colors hover:text-primary"
						>
							{row}
						</Link>
					);
				})}
			</div>
		</div>
	);
}

const CARD_CLASS =
	"rounded-xl border bg-card shadow-sm flex flex-col justify-between rounded-lg p-6";

/** Chip trạng thái kiểu design `Tag`: mono 10px uppercase, nền sunk; hot =
 * nền cam đặc (chờ kích hoạt cần hành động của học viên). */
export function ClassBadges({ cls }: { cls: StudentClass }) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{cls.level && <Tag>{cls.level}</Tag>}
			{cls.mode && <Tag>{cls.mode}</Tag>}
			{cls.enrollmentStatus === "invited" && <Tag hot>Chờ kích hoạt</Tag>}
		</div>
	);
}

/** Tag theo design `lib/ui.tsx`: pill mono 10px uppercase; hot = nền cam,
 * success = `bg-secondary` (badge "Đã thanh toán" theo DESIGN.md). */
export function Tag({
	children,
	hot = false,
	success = false,
}: {
	children: React.ReactNode;
	hot?: boolean;
	success?: boolean;
}) {
	return (
		<span
			className={cn(
				"inline-block rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]",
				hot
					? "bg-primary font-medium text-primary-foreground"
					: success
						? "bg-secondary text-foreground"
						: "rounded-md bg-muted text-foreground",
			)}
		>
			{children}
		</span>
	);
}

export function ClassProgress({ cls }: { cls: StudentClass }) {
	const progressPercent =
		cls.sessionsTotal > 0
			? Math.min(100, Math.round((cls.sessionsDone / cls.sessionsTotal) * 100))
			: 0;
	return (
		<>
			<div className="flex items-center justify-between text-[12px]">
				<span className="text-muted-foreground">Tiến độ khóa học</span>
				<span className="font-medium font-mono text-foreground">
					Buổi {cls.sessionsDone}/{cls.sessionsTotal}
				</span>
			</div>
			<div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary transition-all duration-300"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>
		</>
	);
}
