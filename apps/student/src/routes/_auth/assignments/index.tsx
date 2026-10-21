import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import Loader from "@/components/loader";
import {
	ASSIGNMENT_FILTER_TABS,
	AssignmentList,
	type FilterTab,
} from "@/components/overview/assignment-list";
import { StudentErrorView } from "@/components/overview/student-error-view";
import { isHttpError } from "@/lib/query-client";
import { useStudentOverview } from "@/lib/repos/student";

function isFilterTab(value: unknown): value is FilterTab {
	return (
		typeof value === "string" &&
		(ASSIGNMENT_FILTER_TABS as readonly string[]).includes(value)
	);
}

export const Route = createFileRoute("/_auth/assignments/")({
	validateSearch: (search: Record<string, unknown>): { status?: FilterTab } => {
		const raw = search.status;
		if (isFilterTab(raw) && raw !== "all") {
			return { status: raw };
		}
		return {};
	},
	component: StudentAssignmentsPage,
});

function StudentAssignmentsPage() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const { status } = Route.useSearch();
	const navigate = useNavigate();
	const overviewQuery = useStudentOverview();
	const activeTab: FilterTab = status ?? "all";

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
					<div data-testid="student-assignments-page" className="space-y-6">
						<header>
							<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
								Bài tập · {overview.assignments.length} bài
							</p>
							<h1 className="mt-2 font-extrabold text-3xl text-foreground leading-[0.95] tracking-[-0.045em]">
								Bài tập của tôi
							</h1>
						</header>

						<AssignmentList
							assignments={overview.assignments}
							activeTab={activeTab}
							onTabChange={(next) => {
								void navigate({
									to: "/assignments",
									search: next === "all" ? {} : { status: next },
									replace: true,
								});
							}}
							hideHeading
							className="mt-6"
						/>
					</div>
				);
			}}
		</StudentPageGate>
	);
}
