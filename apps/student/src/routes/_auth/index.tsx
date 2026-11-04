import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { STUDENT_ERROR_CODES } from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { toast } from "sonner";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { AssignmentList } from "@/components/overview/assignment-list";
import { ClassCard } from "@/components/overview/class-card";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { StatCard } from "@/components/overview/stat-card";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { TuitionList } from "@/components/overview/tuition-list";
import { UpcomingSessions } from "@/components/overview/upcoming-sessions";
import { deriveAssignmentStatus } from "@/lib/assignment-status";
import { isHttpError } from "@/lib/query-client";
import {
	useAcceptClassEnrollment,
	useStudentInvoices,
	useStudentMe,
	useStudentOverview,
} from "@/lib/repos/student";
import { useVocabOverview } from "@/lib/repos/vocab";

export const Route = createFileRoute("/_auth/")({
	component: StudentOverviewPage,
});

function StudentOverviewPage() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const meQuery = useStudentMe();
	const overviewQuery = useStudentOverview();
	const acceptEnrollmentMutation = useAcceptClassEnrollment();
	const isLoading = meQuery.isLoading || overviewQuery.isLoading;

	const handleAcceptEnrollment = (enrollmentId: string) => {
		acceptEnrollmentMutation.mutate(enrollmentId, {
			onSuccess: () => {
				toast.success("Đã xác nhận tham gia lớp thành công!");
			},
			onError: () => {
				toast.error("Không thể xác nhận tham gia lớp. Vui lòng thử lại.");
			},
		});
	};

	const nowMs = Date.now();
	const todayISO = vietnamTodayISO(new Date(nowMs));
	const dueSoonCount = overviewQuery.data?.assignments
		? overviewQuery.data.assignments.filter(
				(a) => deriveAssignmentStatus(a, todayISO, nowMs).status === "due-soon",
			).length
		: 0;

	if (isLoading) {
		return <Loader />;
	}

	if (meQuery.error) {
		const err = meQuery.error;
		const code = isHttpError(err) ? err.code : undefined;
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
		<StudentShell userName={me.student.name} userEmail={me.user.email}>
			<GreetingHeader
				studentName={me.student.name}
				dueSoonCount={dueSoonCount}
			/>

			{/* Dải stat 4 cột (design-v2 Dashboard): chỉ hiển thị số liệu CÓ dữ
			 * liệu thật — band mục tiêu từ onboarding, việc cần làm, số lớp đang
			 * học. Band hiện tại / chuyên cần chưa có nguồn → ẨN thay vì bịa. */}
			<div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
				{me.student.targetScore ? (
					<StatCard
						label="Band mục tiêu"
						value={me.student.targetScore}
						sub={
							me.student.examInterest === "toeic"
								? "Điểm TOEIC mục tiêu"
								: "Band IELTS mục tiêu"
						}
					/>
				) : null}
				<StatCard
					label="Việc cần làm"
					value={String(dueSoonCount)}
					sub={
						dueSoonCount > 0
							? "Bài tập sắp đến hạn"
							: "Không có bài quá hạn gần"
					}
				/>
				<StatCard
					label="Lớp đang học"
					value={String(
						overview.classes.filter((c) => c.enrollmentStatus === "active")
							.length,
					)}
					sub="Lớp đã kích hoạt"
				/>
			</div>

			{/* Lưới design Home: lớp học chiếm cột trái rộng, học phí cột phải. */}
			<div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-start">
				<section className="min-w-0 space-y-10">
					<UpcomingSessions classes={overview.classes} />

					<section>
						<h2 className="mb-4 font-extrabold text-[20px] text-foreground tracking-[-0.02em]">
							Lớp học của tôi
						</h2>

						{overview.classes.length === 0 ? (
							<OverviewEmptyState
								icon="calendar"
								title="Bạn chưa tham gia lớp học nào"
								description="Khi giáo viên ghi danh bạn vào lớp, thông tin khóa học và buổi học tiếp theo sẽ hiển thị tại đây."
							/>
						) : (
							<div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
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
				</section>

				{/* Học phí (#320) — ẩn khi không có hóa đơn nào. */}
				<StudentTuitionSection />
			</div>

			{/* Bài tập */}
			<StudentVocabEntrySection />

			<AssignmentList
				assignments={overview.assignments}
				todayISO={todayISO}
				nowMs={nowMs}
			/>
		</StudentShell>
	);
}

/**
 * Học phí (#320): danh sách hóa đơn của học viên — khoản đã thanh toán hiện
 * gọn với badge, ẩn khi rỗng. Tách component để chỉ fetch khi overview đã
 * load xong (cùng org header).
 */
function StudentTuitionSection() {
	const invoices = useStudentInvoices();
	if (invoices.isError || !invoices.data) return null;
	return <TuitionList invoices={invoices.data} />;
}

function StudentVocabEntrySection() {
	const vocab = useVocabOverview();
	const dueCount = vocab.data?.dueCount ?? 0;
	const deckCount = vocab.data?.decks.length ?? 0;

	return (
		<section className="mt-10">
			<div className="flex flex-wrap items-center justify-between gap-4 rounded-md rounded-xl border bg-card p-5 shadow-sm">
				<div>
					<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
						Spaced Repetition
					</p>
					<h2 className="mt-1 font-extrabold text-[20px] text-foreground tracking-[-0.02em]">
						Từ vựng của tôi
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						{deckCount > 0
							? `${deckCount} bộ từ đang học · 20 khóa học từ vựng có sẵn`
							: "Khám phá 20 khóa học từ vựng theo 5 cấp độ trí nhớ"}
					</p>
				</div>
				<div className="flex items-center gap-3">
					{dueCount > 0 ? (
						<span
							data-testid="vocab-home-due-badge"
							aria-hidden="true"
							className="rounded-full bg-primary px-2.5 py-0.5 font-mono text-primary-foreground text-xs"
						>
							{dueCount} đến hạn
						</span>
					) : null}
					<Link
						to="/practice/vocabulary"
						data-testid="vocab-home-entry"
						className="rounded-md rounded-md border border-input bg-transparent px-4 py-2 font-medium text-foreground text-sm transition-colors duration-150 hover:border-primary hover:text-primary"
					>
						Vào học từ vựng →
					</Link>
				</div>
			</div>
		</section>
	);
}
