import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { AssignmentList } from "@/components/overview/assignment-list";
import { ClassCard } from "@/components/overview/class-card";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { deriveAssignmentStatus } from "@/lib/assignment-status";
import { isHttpError } from "@/lib/query-client";
import { useStudentMe, useStudentOverview } from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/")({
	component: StudentOverviewPage,
});

function StudentOverviewPage() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const meQuery = useStudentMe();
	const overviewQuery = useStudentOverview();
	const isLoading = meQuery.isLoading || overviewQuery.isLoading;

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
		return <StudentErrorView code={code} userEmail={sessionEmail} />;
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

			{/* Lớp học của tôi */}
			<section>
				<h2 className="mb-4 font-[620] font-display text-[20px] text-fg tracking-tight">
					Lớp học của tôi
				</h2>

				{overview.classes.length === 0 ? (
					<OverviewEmptyState
						icon="calendar"
						title="Bạn chưa tham gia lớp học nào"
						description="Khi giáo viên ghi danh bạn vào lớp, thông tin khóa học và buổi học tiếp theo sẽ hiển thị tại đây."
					/>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{overview.classes.map((cls) => (
							<ClassCard key={cls.id} cls={cls} />
						))}
					</div>
				)}
			</section>

			{/* Bài tập */}
			<AssignmentList assignments={overview.assignments} />
		</StudentShell>
	);
}
