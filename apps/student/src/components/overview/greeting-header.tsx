import { formatVietnamToday } from "@/lib/vietnam-display-date";

export function GreetingHeader({
	studentName,
	dueSoonCount,
}: {
	studentName: string;
	dueSoonCount: number;
}) {
	const todayVN = formatVietnamToday();

	// Extract first name (last word in VN name convention, or first word)
	const nameParts = studentName.trim().split(/\s+/);
	const displayName = nameParts[nameParts.length - 1] || studentName;

	const summaryText =
		dueSoonCount > 0
			? `${dueSoonCount} bài tập sắp đến hạn cần nộp.`
			: "Bạn không có bài tập nào cần nộp gấp.";

	return (
		<section className="mb-8">
			<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
				<h1 className="font-[620] font-display text-[26px] tracking-tight sm:text-[30px]">
					Chào {displayName}
				</h1>
				<span className="font-[510] text-[14px] text-muted-fg">{todayVN}</span>
			</div>
			<p className="mt-1 text-[15px] text-muted-fg leading-relaxed">
				{summaryText}
			</p>
		</section>
	);
}
