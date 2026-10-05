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
			className="rounded-[var(--radius-sm)] text-[13px] text-muted-fg transition-colors hover:text-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
		>
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
			<BackHomeLink>← Trang chủ</BackHomeLink>

			<header className="mt-4">
				<ClassBadges cls={cls} />
				<h1 className="mt-3 font-[620] font-display text-[28px] text-fg leading-tight tracking-tight">
					{cls.name}
				</h1>
				<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-fg">
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
					<section className="rounded-[var(--radius-lg)] border border-line bg-surface/50 p-5">
						<h2 className="font-[620] font-display text-[16px] text-fg tracking-tight">
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
									<p className="truncate font-[590] text-[15px] text-fg">
										{teacher.name}
									</p>
									<a
										href={`mailto:${teacher.email}`}
										className="block truncate rounded-[var(--radius-sm)] text-[13px] text-accent-blue hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
									>
										{teacher.email}
									</a>
								</div>
							</div>
						) : (
							<p className="mt-3 text-[13px] text-muted-fg">
								Chưa có thông tin giáo viên.
							</p>
						)}
					</section>
				</aside>

				<div className="min-w-0 lg:order-1">
					<section>
						<h2 className="mb-4 font-[620] font-display text-[20px] text-fg tracking-tight">
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
		<div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-line-soft bg-surface/20 px-6 py-14 text-center">
			<h1 className="font-[620] font-display text-[22px] text-fg">
				Không tìm thấy lớp
			</h1>
			<p className="mt-2 max-w-[44ch] text-[14px] text-muted-fg">
				Lớp này không tồn tại, bạn chưa tham gia, hoặc thuộc tổ chức khác.
			</p>
			<div className="mt-5">
				<BackHomeLink>Về trang chủ</BackHomeLink>
			</div>
		</div>
	);
}
