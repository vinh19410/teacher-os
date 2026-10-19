import { Navigate } from "@tanstack/react-router";
import { STUDENT_ERROR_CODES, type StudentMe } from "@teacher-os/api/contracts";
import type { ReactNode } from "react";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { isHttpError } from "@/lib/query-client";
import { useStudentMe } from "@/lib/repos/student";

interface StudentPageGateProps {
	sessionEmail?: string;
	children: (me: StudentMe) => ReactNode;
}

/**
 * Chuẩn hóa kiểm tra trạng thái tài khoản học viên (`NOT_LINKED`, lỗi HTTP,
 * chưa hoàn tất onboarding) trước khi render trang bên trong `StudentShell`.
 */
export function StudentPageGate({
	sessionEmail,
	children,
}: StudentPageGateProps) {
	const meQuery = useStudentMe();

	if (meQuery.isLoading) {
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
	if (!me) {
		return <Loader />;
	}

	return (
		<StudentShell
			userName={me.student.name}
			userEmail={sessionEmail ?? me.user.email}
		>
			{children(me)}
		</StudentShell>
	);
}
