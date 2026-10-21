import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import Loader from "@/components/loader";
import { ClassCard } from "@/components/overview/class-card";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { isHttpError } from "@/lib/query-client";
import {
	useAcceptClassEnrollment,
	useStudentOverview,
} from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/classes/")({
	component: StudentClassesPage,
});

function StudentClassesPage() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const overviewQuery = useStudentOverview();
	const acceptEnrollmentMutation = useAcceptClassEnrollment();

	const handleAcceptEnrollment = (enrollmentId: string) => {
		acceptEnrollmentMutation.mutate(enrollmentId, {
			onSuccess: () => {
				toast.success("Đã tham gia lớp học thành công!");
			},
			onError: (err) => {
				toast.error(err.message || "Không thể tham gia lớp học");
			},
		});
	};

	return (
		<StudentPageGate sessionEmail={sessionEmail}>
			{(me) => {
				if (overviewQuery.isLoading) {
					return <Loader />;
				}

				if (overviewQuery.error) {
					const err = overviewQuery.error;
					const code = isHttpError(err) ? err.code : undefined;
					return (
						<StudentErrorView
							code={code}
							userEmail={sessionEmail ?? me.user.email}
						/>
					);
				}

				const overview = overviewQuery.data;
				if (!overview) {
					return <Loader />;
				}

				return (
					<div data-testid="student-classes-page" className="space-y-6">
						<header>
							<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
								Lớp học · {overview.classes.length} lớp
							</p>
							<h1 className="mt-2 font-extrabold text-3xl text-foreground leading-[0.95] tracking-[-0.045em]">
								Lớp học của tôi
							</h1>
						</header>

						{overview.classes.length === 0 ? (
							<OverviewEmptyState
								icon="calendar"
								title="Bạn chưa tham gia lớp học nào"
								description="Khi giáo viên ghi danh bạn vào lớp, thông tin khóa học và buổi học tiếp theo sẽ hiển thị tại đây."
							/>
						) : (
							<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
								{overview.classes.map((cls) => (
									<ClassCard
										key={cls.id}
										cls={cls}
										onAccept={handleAcceptEnrollment}
										accepting={
											acceptEnrollmentMutation.isPending &&
											acceptEnrollmentMutation.variables === cls.enrollmentId
										}
										assignments={overview.assignments.filter(
											(a) => a.classId === cls.id,
										)}
									/>
								))}
							</div>
						)}
					</div>
				);
			}}
		</StudentPageGate>
	);
}
