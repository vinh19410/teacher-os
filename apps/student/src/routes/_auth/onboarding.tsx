import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { Loader } from "@/components/loader";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { isHttpError } from "@/lib/query-client";
import { useStudentMe } from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/onboarding")({
	component: StudentOnboardingPage,
});

function StudentOnboardingPage() {
	const navigate = useNavigate();
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const meQuery = useStudentMe();

	if (meQuery.isLoading) return <Loader />;
	if (meQuery.error) {
		const err = meQuery.error;
		const code = isHttpError(err) ? err.code : undefined;
		// User chưa verify vào thẳng /onboarding vẫn thấy màn chờ xác thực cũ
		return <StudentErrorView code={code} userEmail={sessionEmail} />;
	}
	if (meQuery.data?.student.onboardingCompletedAt != null) {
		return <Navigate to="/" />;
	}
	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
			<OnboardingWizard
				onCompleted={() => void navigate({ to: "/" })}
				initialEntryScore={meQuery.data?.student.entryScore}
				orgId={meQuery.data?.student.orgId}
			/>
		</div>
	);
}
