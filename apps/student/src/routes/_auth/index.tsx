import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { STUDENT_ERROR_CODES } from "@teacher-os/api/contracts";
import { useMemo } from "react";
import { toast } from "sonner";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { AssignmentList } from "@/components/overview/assignment-list";
import { ClassCard } from "@/components/overview/class-card";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { TuitionList } from "@/components/overview/tuition-list";
import { deriveAssignmentStatus } from "@/lib/assignment-status";
import { isHttpError } from "@/lib/query-client";
import {
	fetchStudentInvoices,
	useAcceptClassEnrollment,
	useStudentMe,
	useStudentOverview,
} from "@/lib/repos/student";

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

	const dueSoonCount = useMemo(() => {
		if (!overviewQuery.data?.assignments) return 0;
		return overviewQuery.data.assignments.filter(
			(a) => deriveAssignmentStatus(a).status === "due-soon",
		).length;
	}, [overviewQuery.data?.assignments]);

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

			{/* Lưới design Home: lớp học chiếm cột trái rộng, học phí cột phải. */}
			<div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-start">
				<section className="min-w-0">
					<h2 className="mb-4 font-display font-extrabold text-[20px] text-fg tracking-[-0.02em]">
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
								/>
							))}
						</div>
					)}
				</section>

				{/* Học phí (#320) — ẩn khi không có hóa đơn nào. */}
				<StudentTuitionSection />
			</div>

			{/* Bài tập */}
			<AssignmentList assignments={overview.assignments} />
		</StudentShell>
	);
}

/**
 * Học phí (#320): danh sách hóa đơn của học viên — khoản đã thanh toán hiện
 * gọn với badge, ẩn khi rỗng. Tách component để chỉ fetch khi overview đã
 * load xong (cùng org header).
 */
function StudentTuitionSection() {
	const invoices = useQuery({
		queryKey: ["student-invoices"],
		queryFn: fetchStudentInvoices,
		staleTime: 30_000,
	});
	if (invoices.isError || !invoices.data) return null;
	return <TuitionList invoices={invoices.data} />;
}
