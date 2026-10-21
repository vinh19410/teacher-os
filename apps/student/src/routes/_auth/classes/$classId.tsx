import { createFileRoute, Navigate } from "@tanstack/react-router";
import { STUDENT_ERROR_CODES } from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	ClassDetailView,
	ClassNotFound,
} from "@/components/class/class-detail-view";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { isHttpError } from "@/lib/query-client";
import { useStudentClassDetail, useStudentMe } from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/classes/$classId")({
	component: StudentClassDetailPage,
});

function StudentClassDetailPage() {
	const { classId } = Route.useParams();
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const meQuery = useStudentMe();
	const detailQuery = useStudentClassDetail(classId);

	if (meQuery.isLoading || detailQuery.isLoading) {
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

	const me = meQuery.data;
	const userEmail = sessionEmail ?? me.user.email;

	if (detailQuery.error) {
		const err = detailQuery.error;
		// Đổi org khi đang ở trang lớp cũng rơi vào đây: lớp không thuộc org
		// mới → server 404.
		if (isHttpError(err) && err.status === 404) {
			return (
				<StudentShell userName={me.student.name} userEmail={userEmail}>
					<ClassNotFound />
				</StudentShell>
			);
		}
		const code = isHttpError(err) ? err.code : undefined;
		return (
			<StudentShell userName={me.student.name} userEmail={userEmail}>
				<StudentErrorView code={code} userEmail={userEmail} />
			</StudentShell>
		);
	}

	if (!detailQuery.data) {
		return <Loader />;
	}

	// Một nguồn `now` duy nhất: todayISO suy ra từ chính now (#393).
	const now = new Date();

	return (
		<StudentShell userName={me.student.name} userEmail={me.user.email}>
			<ClassDetailView
				detail={detailQuery.data}
				todayISO={vietnamTodayISO(now)}
				now={now}
			/>
		</StudentShell>
	);
}
