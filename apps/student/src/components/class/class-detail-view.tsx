import { Link } from "@tanstack/react-router";
import type { StudentClassDetail } from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import { BookOpen, ClipboardCheck, Target, UserRound } from "lucide-react";
import { useState } from "react";
import { ClassLessonList } from "@/components/class/class-lesson-list";
import { ClassmatesTab } from "@/components/class/classmates-tab";
import { RingStat } from "@/components/class/ring-stat";
import { TeacherAvatar } from "@/components/class/teacher-avatar";
import { AssignmentList } from "@/components/overview/assignment-list";
import { ClassBadges, ClassProgress } from "@/components/overview/class-card";
import { cn } from "@/lib/cn";
import { formatVietnamFullDate } from "@/lib/vietnam-display-date";

function BackHomeLink({ children }: { children: string }) {
	return (
		<Link
			to="/"
			className="rounded-sm text-[13px] text-muted-foreground transition-colors hover:text-primary focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
		>
			{/* Mũi tên trang trí: accessible name giữ đúng "Trang chủ" (e2e bấm
			 * link exact name này để về overview). */}
			<span aria-hidden="true">← </span>
			{children}
		</Link>
	);
}

const CLASS_TABS = [
	{ id: "journey", label: "Hành trình học" },
	{ id: "assignments", label: "Bài tập" },
	{ id: "syllabus", label: "Giáo trình" },
	{ id: "classmates", label: "Bạn cùng lớp" },
] as const;

type ClassTabId = (typeof CLASS_TABS)[number]["id"];

/** Số liệu Ring tính từ dữ liệu thật của trang chi tiết lớp (#378). */
interface ClassRingStats {
	held: number;
	totalSessions: number;
	attended: number;
	assignmentsDone: number;
	assignmentsTotal: number;
	/** Band trung bình các bài đã chấm (thang 9); null khi chưa có bài chấm. */
	averageBand: number | null;
	gradedCount: number;
}

function computeRingStats(detail: StudentClassDetail): ClassRingStats {
	const heldLessons = detail.lessons.filter(
		(l) => l.status === "completed" || l.status === "absent",
	);
	const attended = heldLessons.filter((l) => l.status === "completed").length;
	const submitted = detail.assignments.filter(
		(a) => a.submittedAt != null || a.scores != null,
	);
	const graded = detail.assignments.filter((a) => a.scores != null);
	const averageBand =
		graded.length > 0
			? graded.reduce(
					(sum, a) =>
						sum +
						(a.scores!.task +
							a.scores!.coherence +
							a.scores!.lexical +
							a.scores!.grammar) /
							4,
					0,
				) / graded.length
			: null;
	return {
		held: heldLessons.length,
		totalSessions: detail.lessons.length,
		attended,
		assignmentsDone: submitted.length,
		assignmentsTotal: detail.assignments.length,
		averageBand,
		gradedCount: graded.length,
	};
}

/** Tab "Giáo trình": các chủ đề của lớp theo thứ tự buổi học, tick chủ đề đã
 * hoàn thành (mọi buổi của chủ đề đều `completed`). */
function SyllabusTab({ detail }: { detail: StudentClassDetail }) {
	const topics = new Map<string, { total: number; completed: number }>();
	for (const lesson of detail.lessons) {
		const topic = lesson.topic || "Chưa có chủ đề";
		const entry = topics.get(topic) ?? { total: 0, completed: 0 };
		entry.total += 1;
		if (lesson.status === "completed") entry.completed += 1;
		topics.set(topic, entry);
	}

	if (topics.size === 0) {
		return (
			<div className="rounded-xl border bg-card p-6 shadow-sm">
				<p className="text-muted-foreground text-sm">
					Giáo trình sẽ hiển thị theo chủ đề từng buổi học.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-xl border bg-card shadow-sm">
			<ul className="divide-y">
				{[...topics.entries()].map(([topic, progress], i) => {
					const done = progress.completed >= progress.total;
					return (
						<li
							key={topic}
							className="flex items-center gap-3 px-5 py-3 text-sm"
						>
							<span
								aria-hidden="true"
								className={cn(
									"flex size-5 flex-none items-center justify-center font-mono text-[10px]",
									done
										? "rounded-full bg-primary text-primary-foreground"
										: "rounded-md bg-muted text-muted-foreground",
								)}
							>
								{i + 1}
							</span>
							<span
								className={cn(
									"min-w-0 flex-1 truncate",
									!done && "text-muted-foreground",
								)}
							>
								{topic}
							</span>
							<span className="font-mono text-[12px] text-muted-foreground tabular-nums">
								{progress.completed}/{progress.total} buổi
							</span>
						</li>
					);
				})}
			</ul>
		</div>
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
	const [tab, setTab] = useState<ClassTabId>("journey");
	const stats = computeRingStats(detail);

	return (
		<>
			<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
				Lớp học
			</p>
			<BackHomeLink>Trang chủ</BackHomeLink>

			<header className="mt-4">
				<ClassBadges cls={cls} />
				<h1 className="mt-3 font-extrabold text-[clamp(32px,4.5vw,56px)] text-foreground leading-[0.95] tracking-[-0.045em]">
					{cls.name}
				</h1>
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-foreground text-xs">
					{cls.schedule && <span>{formatSchedule(cls.schedule)}</span>}
					{cls.startDate && (
						<span>Khai giảng: {formatVietnamFullDate(cls.startDate)}</span>
					)}
				</div>
				<div className="mt-4 max-w-[420px]">
					<ClassProgress cls={cls} />
				</div>
			</header>

			{/* Dải Ring số liệu (design StudentClassDetail): tiến độ vòng tròn
			 * cho buổi học, chuyên cần, bài tập, band trung bình. */}
			<div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
				<RingStat
					icon={BookOpen}
					value={stats.held}
					max={stats.totalSessions}
					display={`${stats.held}/${stats.totalSessions}`}
					label="Buổi học"
					sub="Buổi đã diễn ra"
				/>
				<RingStat
					icon={UserRound}
					value={stats.attended}
					max={stats.held}
					display={`${stats.held > 0 ? Math.round((stats.attended / stats.held) * 100) : 0}%`}
					label="Chuyên cần"
					sub={`${stats.attended}/${stats.held} buổi đã học`}
				/>
				<RingStat
					icon={ClipboardCheck}
					value={stats.assignmentsDone}
					max={stats.assignmentsTotal}
					display={`${stats.assignmentsDone}/${stats.assignmentsTotal}`}
					label="Bài tập"
					sub="Đã hoàn thành"
				/>
				<RingStat
					icon={Target}
					value={stats.averageBand ?? 0}
					max={9}
					display={
						stats.averageBand != null ? stats.averageBand.toFixed(1) : "—"
					}
					label="Band trung bình"
					sub={`Trên ${stats.gradedCount} bài đã chấm`}
				/>
			</div>

			{/* Giáo viên — luôn hiển thị phía trên tab (e2e bấm mailto từ màn
			 * mặc định). */}
			<section className="mt-8 flex items-center gap-3 rounded-xl border bg-card p-5 shadow-sm">
				<UserRound
					aria-hidden="true"
					className="size-4 flex-none text-muted-foreground"
				/>
				<h2 className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
					Giáo viên
				</h2>
				{teacher ? (
					<div className="ml-auto flex min-w-0 items-center gap-3">
						<TeacherAvatar key={teacher.image} teacher={teacher} size="md" />
						<div className="min-w-0 leading-[1.35]">
							<p className="truncate font-medium text-[15px] text-foreground">
								{teacher.name}
							</p>
							<a
								href={`mailto:${teacher.email}`}
								className="block truncate rounded-sm text-[13px] text-primary hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
							>
								{teacher.email}
							</a>
						</div>
					</div>
				) : (
					<p className="ml-auto text-[13px] text-muted-foreground">
						Chưa có thông tin giáo viên.
					</p>
				)}
			</section>

			{/* Tabs segmented theo design: nền chìm, tab chọn nổi + chữ cam. */}
			<div
				role="tablist"
				aria-label="Mục của lớp học"
				className="mt-8 inline-flex flex-wrap items-center gap-1 rounded-lg rounded-md bg-muted p-1.5 text-[13px]"
			>
				{CLASS_TABS.map((t) => {
					const isSelected = tab === t.id;
					return (
						<button
							key={t.id}
							type="button"
							role="tab"
							aria-selected={isSelected}
							data-testid={`class-tab-${t.id}`}
							onClick={() => setTab(t.id)}
							className={cn(
								"rounded-md px-3 py-1.5 transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								isSelected
									? "rounded-md border border-input bg-transparent font-medium text-primary"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{t.label}
						</button>
					);
				})}
			</div>

			<div className="mt-6">
				{tab === "journey" && (
					<section>
						<h2 className="mb-4 font-extrabold text-[20px] text-foreground tracking-[-0.02em]">
							Buổi học
						</h2>
						<ClassLessonList lessons={detail.lessons} todayISO={todayISO} />
					</section>
				)}
				{tab === "assignments" && (
					<AssignmentList
						assignments={detail.assignments}
						showClassName={false}
						hideHeading={false}
						className=""
					/>
				)}
				{tab === "syllabus" && <SyllabusTab detail={detail} />}
				{tab === "classmates" && <ClassmatesTab classId={cls.id} />}
			</div>
		</>
	);
}

export function ClassNotFound() {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg rounded-xl border bg-card px-6 py-14 text-center shadow-sm">
			<h1 className="font-extrabold text-[22px] text-foreground tracking-[-0.02em]">
				Không tìm thấy lớp
			</h1>
			<p className="mt-2 max-w-[44ch] text-[14px] text-muted-foreground">
				Lớp này không tồn tại, bạn chưa tham gia, hoặc thuộc tổ chức khác.
			</p>
			<div className="mt-5">
				<BackHomeLink>Về trang chủ</BackHomeLink>
			</div>
		</div>
	);
}
