import { createFileRoute } from "@tanstack/react-router";
import { PageHead } from "@/components/ui/page-head";
import { isValidISODate, todayISOVietnam } from "@/lib/week-grid";

const STATUS_VALUES = ["all", "pending", "completed"] as const;
type AttendanceStatus = (typeof STATUS_VALUES)[number];

export interface AttendanceSearch {
	date: string;
	status: AttendanceStatus;
}

/** Hợp đồng URL `?date=YYYY-MM-DD&status=all|pending|completed` (TOS-6,
 * issue #439) — chốt cho TOS-7 dựng nội dung. Parse non-throw như
 * tuition/index.tsx: giá trị lệch hợp đồng rơi về mặc định, không
 * throw, không redirect. `isValidISODate` chặn cả tháng/ngày vô lý. */
export function validateAttendanceSearch(
	search: Record<string, unknown>,
): AttendanceSearch {
	const rawDate = typeof search.date === "string" ? search.date : "";
	return {
		date: isValidISODate(rawDate) ? rawDate : todayISOVietnam(),
		status: STATUS_VALUES.find((value) => value === search.status) ?? "all",
	};
}

export const Route = createFileRoute("/_auth/attendance")({
	validateSearch: validateAttendanceSearch,
	component: AttendanceRoute,
});

export function AttendanceRoute() {
	const search = Route.useSearch();
	return (
		<div className="mx-auto w-full max-w-6xl space-y-6 p-6">
			<PageHead
				kicker={`${formatVNDate(search.date)} · ${STATUS_LABEL[search.status]}`}
				title="Điểm danh tổng theo ngày"
			/>
			<section className="rounded-lg border border-dashed border-border p-10 text-center">
				<p className="text-muted-foreground text-sm">
					Danh sách ca học trong ngày sẽ hiển thị tại đây.
				</p>
			</section>
		</div>
	);
}

/** `26/10/2026` straight from the ISO string — cùng quy ước formatDayMonth. */
function formatVNDate(iso: string): string {
	return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
	all: "Tất cả ca",
	pending: "Chưa điểm danh",
	completed: "Đã điểm danh",
};
