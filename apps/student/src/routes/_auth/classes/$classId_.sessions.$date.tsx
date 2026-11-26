import { createFileRoute, Navigate } from "@tanstack/react-router";
import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	SessionDetailView,
	SessionNotFound,
} from "@/components/class/session-detail-view";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { isHttpError } from "@/lib/query-client";
import { useStudentMe, useStudentSessionDetail } from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/classes/$classId_/sessions/$date")(
	{
		component: StudentSessionDetailPage,
	},
);

function StudentSessionDetailPage() {
	const { classId, date } = Route.useParams();
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const meQuery = useStudentMe();
	const detailQuery = useStudentSessionDetail(classId, date);

	if (meQuery.isLoading || detailQuery.isLoading) {
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

	const me = meQuery.data;
	const userEmail = sessionEmail ?? me.user.email;

	if (detailQuery.error) {
		const err = detailQuery.error;
		if (isHttpError(err) && err.status === 404) {
			return (
				<StudentShell userName={me.student.name} userEmail={userEmail}>
					<SessionNotFound classId={classId} />
				</StudentShell>
			);
		}
		const code = isHttpError(err) ? err.code : undefined;
		if (code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL) {
			return <Loader />;
		}
		return (
			<StudentShell userName={me.student.name} userEmail={userEmail}>
				<StudentErrorView code={code} userEmail={userEmail} />
			</StudentShell>
		);
	}

	if (!detailQuery.data) {
		return <Loader />;
	}

	const now = new Date();

	return (
		<StudentShell userName={me.student.name} userEmail={userEmail}>
			<SessionDetailView
				detail={detailQuery.data}
				todayISO={vietnamTodayISO(now)}
				now={now}
			/>
		</StudentShell>
	);
}
