import { createFileRoute } from "@tanstack/react-router";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import Loader from "@/components/loader";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { TuitionList } from "@/components/overview/tuition-list";
import { isHttpError } from "@/lib/query-client";
import { useStudentInvoices } from "@/lib/repos/student";

export const Route = createFileRoute("/_auth/tuition/")({
	component: StudentTuitionPage,
});

function StudentTuitionPage() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const invoicesQuery = useStudentInvoices();

	return (
		<StudentPageGate sessionEmail={sessionEmail}>
			{(me) => {
				if (invoicesQuery.isLoading) {
					return <Loader />;
				}

				if (invoicesQuery.error) {
					const err = invoicesQuery.error;
					const code = isHttpError(err) ? err.code : undefined;
					return (
						<StudentErrorView
							code={code}
							userEmail={sessionEmail ?? me.user.email}
						/>
					);
				}

				const invoices = invoicesQuery.data ?? [];

				return (
					<div data-testid="student-tuition-page" className="space-y-6">
						<header>
							<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
								Học phí
							</p>
							<h1 className="mt-2 font-display font-extrabold text-3xl text-fg leading-[0.95] tracking-[-0.045em]">
								Học phí của tôi
							</h1>
						</header>

						{invoices.length === 0 ? (
							<OverviewEmptyState
								icon="calendar"
								title="Chưa có hóa đơn học phí"
								description="Khi giáo viên tạo phiếu thu học phí cho lớp của bạn, thông tin thanh toán và mã QR sẽ hiển thị tại đây."
							/>
						) : (
							<div className="mt-6 max-w-2xl">
								<TuitionList invoices={invoices} />
							</div>
						)}
					</div>
				);
			}}
		</StudentPageGate>
	);
}
