import { formatVietnamLongDate } from "@/lib/student-overview-selectors";

export interface GreetingHeaderProps {
	studentName: string;
	dueSoonCount: number;
	overdueCount?: number;
	remainingSessionsToday?: number;
	totalSessionsToday?: number;
	nowMs?: number;
}

export function GreetingHeader({
	studentName,
	dueSoonCount,
	overdueCount = 0,
	remainingSessionsToday,
	totalSessionsToday,
	nowMs,
}: GreetingHeaderProps) {
	const dateLabel = formatVietnamLongDate(nowMs ?? Date.now());

	// Lấy tên gọi (từ cuối trong họ tên tiếng Việt).
	const nameParts = studentName.trim().split(/\s+/);
	const displayName = nameParts[nameParts.length - 1] || studentName;

	const assignmentSummary =
		overdueCount > 0 && dueSoonCount > 0 ? (
			<>
				Bạn có{" "}
				<strong className="font-semibold text-foreground">
					{overdueCount} bài quá hạn
				</strong>{" "}
				và{" "}
				<strong className="font-semibold text-foreground">
					{dueSoonCount} bài sắp đến hạn
				</strong>
			</>
		) : overdueCount > 0 ? (
			<>
				Bạn có{" "}
				<strong className="font-semibold text-foreground">
					{overdueCount} bài quá hạn
				</strong>
			</>
		) : dueSoonCount > 0 ? (
			<>
				Bạn có{" "}
				<strong className="font-semibold text-foreground">
					{dueSoonCount} bài sắp đến hạn
				</strong>
			</>
		) : (
			<>Bạn không còn bài nào sắp đến hạn</>
		);

	let scheduleSummary: React.ReactNode = ".";
	if (remainingSessionsToday !== undefined) {
		if (remainingSessionsToday > 0) {
			scheduleSummary = (
				<>
					; còn{" "}
					<strong className="font-semibold text-foreground">
						{remainingSessionsToday} buổi học
					</strong>{" "}
					hôm nay.
				</>
			);
		} else if (totalSessionsToday === 0) {
			scheduleSummary = "; hôm nay không có buổi học.";
		} else {
			scheduleSummary = "; đã xong lịch học hôm nay.";
		}
	}

	return (
		<header className="mb-8 space-y-2">
			{dateLabel ? (
				<p className="text-muted-foreground text-sm">{dateLabel}</p>
			) : null}
			<h1 className="font-semibold text-2xl text-foreground tracking-tight md:text-3xl">
				Chào {displayName}
			</h1>
			<p
				aria-live="polite"
				className="max-w-[62ch] text-base text-muted-foreground"
			>
				{assignmentSummary}
				{scheduleSummary}
			</p>
		</header>
	);
}
