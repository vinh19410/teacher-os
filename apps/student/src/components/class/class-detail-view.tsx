import { Link } from "@tanstack/react-router";
import type {
	StudentAssignment,
	StudentClassDetail,
} from "@teacher-os/api/contracts";
import { buttonVariants } from "@teacher-os/ui/components/button";
import {
	ArrowLeft,
	ArrowRight,
	BookOpen,
	Check,
	CircleCheck,
	CircleDashed,
	ClipboardCheck,
	MessageSquare,
	Pin,
	Target,
} from "lucide-react";
import { useState } from "react";
import { ClassAssignmentTable } from "@/components/class/class-assignment-table";
import { ClassInfoCard } from "@/components/class/class-info-card";
import { ClassLessonList } from "@/components/class/class-lesson-list";
import { ClassmatesTab } from "@/components/class/classmates-tab";
import { RingStat } from "@/components/class/ring-stat";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import {
	calculateIeltsBand,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";
import { cn } from "@/lib/cn";

function BackHomeLink({ children }: { children: string }) {
	return (
		<Link
			to="/"
			className={cn(
				buttonVariants({ variant: "ghost", size: "sm" }),
				"mb-2 -ml-3 text-muted-foreground",
			)}
		>
			{/* Icon trang trí: accessible name giữ đúng "Trang chủ" (e2e bấm
			 * link exact name này để về overview). */}
			<ArrowLeft aria-hidden="true" className="size-4" />
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

const CLASS_STATUS_LABEL: Record<string, string> = {
	active: "Đang học",
	completed: "Đã kết thúc",
	archived: "Đã lưu trữ",
	paused: "Tạm dừng",
};

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
	const gradedBands = detail.assignments
		.map((a) => calculateIeltsBand(a.scores))
		.filter((b): b is number => b != null);
	const averageBand =
		gradedBands.length > 0
			? gradedBands.reduce((sum, b) => sum + b, 0) / gradedBands.length
			: null;
	return {
		held: heldLessons.length,
		totalSessions: detail.lessons.length,
		attended,
		assignmentsDone: submitted.length,
		assignmentsTotal: detail.assignments.length,
		averageBand,
		gradedCount: gradedBands.length,
	};
}

function TodoBanner({
	className,
	assignments,
	todayISO,
}: {
	className: string;
	assignments: StudentAssignment[];
	todayISO: string;
}) {
	const todo = assignments
		.filter(
			(a) =>
				a.source === "class_assignment" &&
				a.submittedAt == null &&
				a.scores == null,
		)
		.sort(
			(a, b) =>
				deriveAssignmentStatus(a, todayISO).sortOrder -
				deriveAssignmentStatus(b, todayISO).sortOrder,
		);
	const first = todo[0];
	if (!first) return null;

	return (
		<section
			aria-label="Việc cần làm"
			className="mb-6 flex flex-wrap items-center gap-4 rounded-xl bg-primary px-5 py-4 text-primary-foreground shadow-sm"
		>
			<span
				aria-hidden="true"
				className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-foreground/10"
			>
				<Pin className="size-5" />
			</span>
			<div className="min-w-0 flex-1">
				<div className="font-semibold">
					Bạn còn {todo.length} bài chưa làm trong {className}
				</div>
				<div className="text-sm opacity-80">
					Giáo viên đang chờ bài của bạn. Cùng hoàn thành nhé.
				</div>
			</div>
			<Link
				to="/learn/quizzes/$assignmentId"
				params={{ assignmentId: first.id }}
				className="inline-flex h-9 items-center gap-2 rounded-md bg-primary-foreground px-4 font-medium text-primary text-sm shadow-xs outline-none transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4"
			>
				Làm ngay
				<ArrowRight aria-hidden="true" />
			</Link>
		</section>
	);
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
		<div className="rounded-xl border bg-card text-card-foreground shadow-sm">
			<ul className="divide-y">
				{[...topics.entries()].map(([topic, progress]) => {
					const done = progress.completed >= progress.total;
					return (
						<li
							key={topic}
							className="flex items-center gap-3 px-5 py-3 text-sm"
						>
							{done ? (
								<span
									aria-hidden="true"
									className="grid size-5 flex-none place-items-center rounded-full bg-primary text-primary-foreground"
								>
									<Check className="size-3" />
								</span>
							) : (
								<CircleDashed
									aria-hidden="true"
									className="size-5 flex-none text-muted-foreground"
								/>
							)}
							<span
								className={cn(
									"min-w-0 flex-1 truncate",
									!done && "text-muted-foreground",
								)}
							>
								{topic}
							</span>
							<span className="text-muted-foreground text-sm tabular-nums">
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
	const teacherEmail = teacher?.email.trim() ?? "";
	const [tab, setTab] = useState<ClassTabId>("journey");
	const stats = computeRingStats(detail);
	const statusLabel = CLASS_STATUS_LABEL[cls.status] ?? cls.status;

	return (
		<>
			<BackHomeLink>Trang chủ</BackHomeLink>

			<TodoBanner
				className={cls.name}
				assignments={detail.assignments}
				todayISO={todayISO}
			/>

			<header className="mb-4 flex flex-wrap items-end justify-between gap-4">
				<div className="space-y-2">
					<h1 className="font-semibold text-2xl text-foreground tracking-tight md:text-3xl">
						{cls.name}
					</h1>
					<Badge variant="outline">
						<span
							aria-hidden="true"
							className={cn(
								"size-1.5 rounded-full",
								cls.status === "active" ? "bg-success" : "bg-muted-foreground",
							)}
						/>
						{statusLabel}
					</Badge>
				</div>
				{teacherEmail !== "" && (
					<a
						href={`mailto:${teacherEmail}`}
						className={buttonVariants({ variant: "outline" })}
					>
						<MessageSquare aria-hidden="true" className="size-4" />
						Nhắn giáo viên
					</a>
				)}
			</header>

			<ClassInfoCard
				detail={detail}
				todayISO={todayISO}
				held={stats.held}
				totalSessions={stats.totalSessions}
			/>

			{/* Dải Ring số liệu (design StudentClassDetail): tiến độ vòng tròn
			 * cho buổi học, chuyên cần, bài tập, band trung bình. */}
			<div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
				<RingStat
					icon={BookOpen}
					value={stats.held}
					max={stats.totalSessions}
					display={`${stats.held}/${stats.totalSessions}`}
					label="Buổi học"
					sub="Buổi đã diễn ra"
				/>
				<RingStat
					icon={CircleCheck}
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

			<Tabs
				tabs={CLASS_TABS}
				active={tab}
				onChange={(id) => setTab(id as ClassTabId)}
				ariaLabel="Mục của lớp học"
				testIdPrefix="class-tab"
			/>

			<div>
				{tab === "journey" && (
					<section>
						<h2 className="sr-only">Buổi học</h2>
						<ClassLessonList lessons={detail.lessons} todayISO={todayISO} />
					</section>
				)}
				{tab === "assignments" && (
					<ClassAssignmentTable
						assignments={detail.assignments}
						todayISO={todayISO}
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
		<div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-14 text-center shadow-sm">
			<h1 className="font-semibold text-foreground text-xl tracking-tight">
				Không tìm thấy lớp
			</h1>
			<p className="mt-2 max-w-[44ch] text-muted-foreground text-sm">
				Lớp này không tồn tại, bạn chưa tham gia, hoặc thuộc tổ chức khác.
			</p>
			<div className="mt-5">
				<BackHomeLink>Về trang chủ</BackHomeLink>
			</div>
		</div>
	);
}
