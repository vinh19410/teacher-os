import { StudentSpot } from "@teacher-os/ui/components/illustrations";
import { getActiveStudentOrgId, useStudentOrgs } from "@/lib/repos/student";
import { formatVietnamToday } from "@/lib/vietnam-display-date";

export function GreetingHeader({
	studentName,
	dueSoonCount,
}: {
	studentName: string;
	dueSoonCount: number;
}) {
	const todayVN = formatVietnamToday();
	const { data: orgs } = useStudentOrgs();

	// Extract first name (last word in VN name convention, or first word)
	const nameParts = studentName.trim().split(/\s+/);
	const displayName = nameParts[nameParts.length - 1] || studentName;

	const summaryText =
		dueSoonCount > 0
			? `${dueSoonCount} bài tập sắp đến hạn cần nộp.`
			: "Bạn không có bài tập nào cần nộp gấp.";

	// Kicker = tên org đang hoạt động (cùng rule với OrgSwitcher).
	const activeOrgId = getActiveStudentOrgId();
	const currentOrg =
		orgs?.find((o) => o.id === activeOrgId) ??
		orgs?.find((o) => o.isCurrent) ??
		orgs?.[0];

	return (
		<section className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-6 pb-2">
			<div className="min-w-0">
				{currentOrg?.name && (
					<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
						{currentOrg.name}
					</p>
				)}
				<h1 className="mt-1 font-extrabold text-[clamp(40px,6vw,72px)] leading-[0.95] tracking-[-0.045em]">
					Chào {displayName}
				</h1>
				<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
					{todayVN} · {summaryText}
				</p>
			</div>
			{/* Minh họa trang trí thuần — ẩn dưới md như design Home. */}
			<StudentSpot decorative className="-mb-4 hidden w-40 md:block" />
		</section>
	);
}
