import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import Loader from "@/components/loader";
import { StudentErrorView } from "@/components/overview/student-error-view";
import {
	type ScheduleTab,
	StudentScheduleView,
} from "@/components/schedule/student-schedule-view";
import { isHttpError } from "@/lib/query-client";
import { useStudentSchedule } from "@/lib/repos/student";

export interface ScheduleSearch {
	tab?: ScheduleTab;
	classId?: string;
}

export const Route = createFileRoute("/_auth/schedule")({
	validateSearch: (search: Record<string, unknown>): ScheduleSearch => {
		const tab =
			search.tab === "upcoming" ||
			search.tab === "completed" ||
			search.tab === "all"
				? search.tab
				: undefined;
		const classId =
			typeof search.classId === "string" && search.classId.length > 0
				? search.classId
				: undefined;
		return { tab, classId };
	},
	component: StudentSchedulePage,
});

function StudentSchedulePage() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;
	const { tab, classId } = Route.useSearch();
	const navigate = useNavigate();

	const scheduleQuery = useStudentSchedule({
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
	});

	const handleTabChange = (newTab: ScheduleTab) => {
		void navigate({
			to: "/schedule",
			search: {
				tab: newTab === "upcoming" ? undefined : newTab,
				classId,
			},
			replace: true,
		});
	};

	const handleClassChange = (newClassId: string) => {
		void navigate({
			to: "/schedule",
			search: {
				tab,
				classId: newClassId === "all" ? undefined : newClassId,
			},
			replace: true,
		});
	};

	return (
		<StudentPageGate sessionEmail={sessionEmail}>
			{(me) => {
				if (scheduleQuery.isLoading) {
					return <Loader />;
				}

				if (scheduleQuery.error) {
					const err = scheduleQuery.error;
					const code = isHttpError(err) ? err.code : undefined;
					return (
						<StudentErrorView
							code={code}
							userEmail={sessionEmail ?? me.user.email}
						/>
					);
				}

				const data = scheduleQuery.data;
				if (!data) {
					return <Loader />;
				}

				return (
					<StudentScheduleView
						classes={data.classes}
						lessons={data.lessons}
						selectedTab={tab ?? "upcoming"}
						onTabChange={handleTabChange}
						selectedClassId={classId ?? "all"}
						onClassChange={handleClassChange}
					/>
				);
			}}
		</StudentPageGate>
	);
}
