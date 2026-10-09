import { Link } from "@tanstack/react-router";
import type { StudentClassDetail } from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import { ClassLessonList } from "@/components/class/class-lesson-list";
import { TeacherAvatar } from "@/components/class/teacher-avatar";
import { AssignmentList } from "@/components/overview/assignment-list";
import { ClassBadges, ClassProgress } from "@/components/overview/class-card";
import { formatVietnamFullDate } from "@/lib/vietnam-display-date";

function BackHomeLink({ children }: { children: string }) {
	return (
		<Link
			to="/"
			className="rounded-sm text-[13px] text-meta transition-colors hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
		>
			{/* Mũi tên trang trí: accessible name giữ đúng "Trang chủ" (e2e bấm
			 * link exact name này để về overview). */}
			<span aria-hidden="true">← </span>
			{children}
		</Link>
	);
}

export function ClassDetailView({
	detail,
	todayISO,
}: {
	detail: StudentClassDetail;
	todayISO: string;
}) {
	const cls = detail.class;
	const teacher = cls.teacher;

	return (
		<>
			<p className="font-mono text-[11px] text-meta uppercase tracking-[0.2em]">
				Lớp học
			</p>
			<BackHomeLink>Trang chủ</BackHomeLink>

			<header className="mt-4">
				<ClassBadges cls={cls} />
				<h1 className="mt-3 font-display font-extrabold text-[clamp(32px,4.5vw,56px)] text-fg leading-[0.95] tracking-[-0.045em]">
					{cls.name}
				</h1>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-fg-2 text-xs">
					{cls.schedule && <span>{formatSchedule(cls.schedule)}</span>}
					{cls.startDate && (
						<span>Khai giảng: {formatVietnamFullDate(cls.startDate)}</span>
					)}
				</div>
				<div className="mt-4 max-w-[420px]">
					<ClassProgress cls={cls} />
				</div>
			</header>

			<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
				<aside className="lg:order-2">
					<section className="neu rounded-lg p-5">
						<h2 className="font-mono text-[11px] text-meta uppercase tracking-[0.2em]">
							Giáo viên
						</h2>
						{teacher ? (
							<div className="mt-4 flex min-w-0 items-center gap-3">
								<TeacherAvatar
									key={teacher.image}
									teacher={teacher}
									size="md"
								/>
								<div className="min-w-0 leading-[1.35]">
									<p className="truncate font-medium text-[15px] text-fg">
										{teacher.name}
									</p>
									<a
										href={`mailto:${teacher.email}`}
										className="block truncate rounded-sm text-[13px] text-hot hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
									>
										{teacher.email}
									</a>
								</div>
							</div>
						) : (
							<p className="mt-3 text-[13px] text-meta">
								Chưa có thông tin giáo viên.
							</p>
						)}
					</section>
				</aside>

				<div className="min-w-0 lg:order-1">
					<section>
						<h2 className="mb-4 font-display font-extrabold text-[20px] text-fg tracking-[-0.02em]">
							Buổi học
						</h2>
						<ClassLessonList lessons={detail.lessons} todayISO={todayISO} />
					</section>

					<AssignmentList
						assignments={detail.assignments}
						showClassName={false}
					/>
				</div>
			</div>
		</>
	);
}

export function ClassNotFound() {
	return (
		<div className="neu flex flex-col items-center justify-center rounded-lg px-6 py-14 text-center">
			<h1 className="font-display font-extrabold text-[22px] text-fg tracking-[-0.02em]">
				Không tìm thấy lớp
			</h1>
			<p className="mt-2 max-w-[44ch] text-[14px] text-meta">
				Lớp này không tồn tại, bạn chưa tham gia, hoặc thuộc tổ chức khác.
			</p>
			<div className="mt-5">
				<BackHomeLink>Về trang chủ</BackHomeLink>
			</div>
		</div>
	);
}
