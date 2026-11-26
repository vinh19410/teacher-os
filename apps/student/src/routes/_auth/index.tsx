import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Navigate,
	useNavigate,
} from "@tanstack/react-router";
import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
	type StudentMe,
	type StudentOverview,
} from "@teacher-os/api/contracts";
import type { StudentPlacementStatusResponse } from "@teacher-os/api/placement-test-contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { AssignmentList } from "@/components/overview/assignment-list";
import { ClassCard } from "@/components/overview/class-card";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { GoalProgressCard } from "@/components/overview/goal-progress-card";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { NextTaskHero } from "@/components/overview/next-task-hero";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { TodayScheduleCard } from "@/components/overview/today-schedule-card";
import { TuitionSummaryCard } from "@/components/overview/tuition-summary-card";
import { PlacementHighlightBanner } from "@/components/placement/placement-highlight-banner";
import { PlacementPromptModal } from "@/components/placement/placement-prompt-modal";
import {
	deriveVocabLibrarySummary,
	type VocabLibrarySummary,
} from "@/components/vocab/vocab-courses-cta";
import { cn } from "@/lib/cn";
import { isHttpError } from "@/lib/query-client";
import {
	useDismissPlacementPrompt,
	useStudentPlacementStatus,
} from "@/lib/repos/placement-test";
import {
	countActiveEnrolledClasses,
	resolveAcceptEnrollmentErrorMessage,
	useAcceptClassEnrollment,
	useStudentInvoices,
	useStudentMe,
	useStudentOverview,
	useStudentSchedule,
} from "@/lib/repos/student";
import { useVocabLibraryCourses, useVocabOverview } from "@/lib/repos/vocab";
import {
	getActiveStudentOrgId,
	subscribeActiveStudentOrg,
} from "@/lib/student-org-storage";
import {
	deriveStudentGoalSummary,
	selectNextTaskHero,
	selectStudentTuitionSummary,
	selectTodaySchedule,
} from "@/lib/student-overview-selectors";

export const Route = createFileRoute("/_auth/")({
	component: StudentOverviewPage,
});

export function StudentOverviewPage() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const meQuery = useStudentMe();
	const overviewQuery = useStudentOverview();
	const isOverviewWrongRole =
		isHttpError(overviewQuery.error) &&
		overviewQuery.error.code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL;
	const canFetchPlacement =
		!meQuery.error &&
		meQuery.data?.student.onboardingCompletedAt != null &&
		!isOverviewWrongRole;
	const placementStatusQuery = useStudentPlacementStatus(canFetchPlacement);
	const isLoading = meQuery.isLoading || overviewQuery.isLoading;

	if (isLoading) {
		return <Loader />;
	}

	if (meQuery.error) {
		const err = meQuery.error;
		const code = isHttpError(err) ? err.code : undefined;
		if (code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL) {
			return <Loader />;
		}
		if (code === STUDENT_ERROR_CODES.NOT_LINKED) {
			return (
				<StudentShell userEmail={sessionEmail}>
					<StudentErrorView code={code} userEmail={sessionEmail} />
				</StudentShell>
			);
		}
		return <StudentErrorView code={code} userEmail={sessionEmail} />;
	}

	if (meQuery.data?.student.onboardingCompletedAt == null) {
		return <Navigate to="/onboarding" />;
	}

	if (overviewQuery.error) {
		const err = overviewQuery.error;
		const code = isHttpError(err) ? err.code : undefined;
		if (code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL) {
			return <Loader />;
		}
		return (
			<StudentShell
				userName={meQuery.data?.student.name}
				userEmail={sessionEmail ?? meQuery.data?.user.email}
			>
				<StudentErrorView
					code={code}
					userEmail={sessionEmail ?? meQuery.data?.user.email}
				/>
			</StudentShell>
		);
	}

	const me = meQuery.data;
	const overview = overviewQuery.data;

	if (!me || !overview) {
		return <Loader />;
	}

	return (
		<StudentOverviewContent
			me={me}
			overview={overview}
			placementStatus={
				placementStatusQuery.isError ? undefined : placementStatusQuery.data
			}
		/>
	);
}

function StudentOverviewContent({
	me,
	overview,
	placementStatus,
}: {
	me: StudentMe;
	overview: StudentOverview;
	placementStatus: StudentPlacementStatusResponse | undefined;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const acceptEnrollmentMutation = useAcceptClassEnrollment();
	const dismissPromptMutation = useDismissPlacementPrompt();
	const [promptDismissedLocally, setPromptDismissedLocally] = useState(false);

	// Đồng hồ cục bộ cập nhật mỗi phút + khi tab quay lại foreground để mốc
	// "Bây giờ HH:mm", cửa sổ Zoom và hạn nộp bài luôn khớp thời gian thực.
	const [nowMs, setNowMs] = useState(() => Date.now());
	const todayISO = vietnamTodayISO(new Date(nowMs));
	const prevTodayIsoRef = useRef(todayISO);

	useEffect(() => {
		const tick = () => setNowMs(Date.now());
		const timerId = window.setInterval(tick, 60_000);
		const handleVisibilityChange = () => {
			if (!document.hidden) {
				tick();
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			window.clearInterval(timerId);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	// Khi bước sang ngày mới theo giờ Việt Nam, làm mới overview và lịch học.
	useEffect(() => {
		if (prevTodayIsoRef.current !== todayISO) {
			prevTodayIsoRef.current = todayISO;
			void queryClient.invalidateQueries({ queryKey: ["student", "overview"] });
			void queryClient.invalidateQueries({ queryKey: ["student", "schedule"] });
		}
	}, [queryClient, todayISO]);

	const activeOrgId = useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	const isOrgAligned = !activeOrgId || me.student.orgId === activeOrgId;
	const effectiveOrgId = activeOrgId ?? me.student.orgId;

	const scheduleQuery = useStudentSchedule({
		enabled: isOrgAligned,
		orgIdOverride: effectiveOrgId,
	});
	const vocabQuery = useVocabOverview();
	const invoicesQuery = useStudentInvoices();

	if (
		scheduleQuery.error &&
		isHttpError(scheduleQuery.error) &&
		scheduleQuery.error.code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL
	) {
		return <Loader />;
	}

	const handleAcceptEnrollment = (enrollmentId: string) => {
		acceptEnrollmentMutation.mutate(enrollmentId, {
			onSuccess: () => {
				toast.success("Đã xác nhận tham gia lớp thành công!");
			},
			onError: (err) => {
				toast.error(resolveAcceptEnrollmentErrorMessage(err));
			},
		});
	};

	const nextTask = selectNextTaskHero(overview.assignments, todayISO, nowMs);
	const todaySchedule = selectTodaySchedule({
		classes: scheduleQuery.isSuccess
			? scheduleQuery.data.classes
			: overview.classes,
		lessons: scheduleQuery.isSuccess
			? scheduleQuery.data.lessons
			: scheduleQuery.isError
				? null
				: [],
		nowMs,
	});
	const goalSummary = deriveStudentGoalSummary({
		student: me.student,
		activeClassCount: countActiveEnrolledClasses(overview.classes),
	});
	const tuitionSummary =
		isOrgAligned && !invoicesQuery.isError && invoicesQuery.data
			? selectStudentTuitionSummary(invoicesQuery.data)
			: null;

	const showPlacementHighlight = Boolean(
		placementStatus?.status === "not_started" && placementStatus.testAvailable,
	);
	const showPlacementModal =
		showPlacementHighlight &&
		placementStatus?.promptDismissedAt === null &&
		!promptDismissedLocally;

	const handleDismissPlacementPrompt = () => {
		setPromptDismissedLocally(true);
		dismissPromptMutation.mutate(undefined, {
			onError: () => {
				// Modal đóng cục bộ để không chặn thao tác; server đồng bộ lại ở lần tải sau.
			},
		});
	};

	const handleStartPlacementTest = () => {
		setPromptDismissedLocally(true);
		void navigate({ to: "/placement-test" });
	};

	return (
		<StudentShell userName={me.student.name} userEmail={me.user.email}>
			<GreetingHeader
				studentName={me.student.name}
				dueSoonCount={nextTask.dueSoonCount}
				overdueCount={nextTask.overdueCount}
				remainingSessionsToday={
					isOrgAligned && scheduleQuery.isSuccess
						? todaySchedule.remainingCount
						: undefined
				}
				totalSessionsToday={
					isOrgAligned && scheduleQuery.isSuccess
						? todaySchedule.todayItems.length
						: undefined
				}
				nowMs={nowMs}
			/>

			{showPlacementHighlight && !goalSummary.hasGoalData ? (
				<PlacementHighlightBanner />
			) : null}

			<PlacementPromptModal
				open={showPlacementModal}
				isDismissing={dismissPromptMutation.isPending}
				onStart={handleStartPlacementTest}
				onDismiss={handleDismissPlacementPrompt}
			/>

			<div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
				<NextTaskHero
					data={nextTask}
					vocabDueCount={vocabQuery.data?.dueCount ?? 0}
				/>
				<TodayScheduleCard
					data={todaySchedule}
					isLoading={!isOrgAligned || scheduleQuery.isPending}
					nowMs={nowMs}
				/>
			</div>

			<GoalProgressCard
				summary={goalSummary}
				showPlacementHighlight={showPlacementHighlight}
				className="mb-10"
			/>

			<AssignmentList
				id="assignments"
				assignments={overview.assignments}
				todayISO={todayISO}
				nowMs={nowMs}
				className="mb-10 scroll-mt-20"
			/>

			<section
				id="classes"
				aria-labelledby="classes-heading"
				className="mb-10 scroll-mt-20"
			>
				<h2
					id="classes-heading"
					className="mb-4 font-semibold text-foreground text-lg tracking-tight"
				>
					Lớp học của tôi
				</h2>

				{overview.classes.length === 0 ? (
					<OverviewEmptyState
						icon="calendar"
						title="Bạn chưa tham gia lớp học nào"
						description="Khi giáo viên ghi danh bạn vào lớp, thông tin khóa học và buổi học tiếp theo sẽ hiển thị tại đây."
					/>
				) : (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
						{overview.classes.map((cls) => (
							<ClassCard
								key={cls.id}
								cls={cls}
								onAccept={handleAcceptEnrollment}
								accepting={
									acceptEnrollmentMutation.isPending &&
									acceptEnrollmentMutation.variables === cls.enrollmentId
								}
								todayISO={todayISO}
								nowMs={nowMs}
							/>
						))}
					</div>
				)}
			</section>

			<div
				className={cn(
					"grid grid-cols-1 gap-4",
					tuitionSummary && "sm:grid-cols-2",
				)}
			>
				<StudentVocabEntrySection className="mt-0" />
				<TuitionSummaryCard summary={tuitionSummary} />
			</div>
		</StudentShell>
	);
}

export function deriveStudentHomeVocabSubtitle(
	deckCount: number,
	summary: VocabLibrarySummary | null,
): string {
	if (summary) {
		return deckCount > 0
			? `${deckCount} bộ từ đang học · ${summary.courseCount} khóa học từ vựng có sẵn`
			: `Khám phá ${summary.courseCount} khóa học từ vựng theo 5 cấp độ trí nhớ`;
	}
	return deckCount > 0
		? `${deckCount} bộ từ đang học`
		: "Ôn tập từ vựng theo 5 cấp độ trí nhớ";
}

export function StudentVocabEntrySection({
	className = "mt-10",
}: {
	className?: string;
} = {}) {
	const vocab = useVocabOverview();
	const libraryCourses = useVocabLibraryCourses();
	const dueCount = vocab.data?.dueCount ?? 0;
	const deckCount = vocab.data?.decks.length ?? 0;
	const librarySummary = libraryCourses.isSuccess
		? deriveVocabLibrarySummary(libraryCourses.data.courses)
		: null;

	return (
		<section
			id="vocab"
			aria-labelledby="vocab-heading"
			className={cn(
				"flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 shadow-sm",
				className,
			)}
		>
			<div className="min-w-0 space-y-1">
				<p className="font-medium text-muted-foreground text-xs">
					Từ vựng · ôn ngắt quãng
				</p>
				<h2
					id="vocab-heading"
					className="font-semibold text-base text-foreground tracking-tight"
				>
					Từ vựng của tôi
				</h2>
				<p className="text-muted-foreground text-sm">
					{deriveStudentHomeVocabSubtitle(deckCount, librarySummary)}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-2.5">
				{dueCount > 0 ? (
					<span
						data-testid="vocab-home-due-badge"
						aria-hidden="true"
						className="rounded-full bg-primary px-2.5 py-0.5 font-mono text-primary-foreground text-xs tabular-nums"
					>
						{dueCount} đến hạn
					</span>
				) : null}
				<Link
					to="/practice/vocabulary"
					data-testid="vocab-home-entry"
					className={cn(
						buttonVariants({ variant: "outline", size: "sm" }),
						"focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
					)}
				>
					<span>Vào học từ vựng</span>
					<ArrowRight aria-hidden="true" className="size-3.5" />
				</Link>
			</div>
		</section>
	);
}
