import { useNavigate } from "@tanstack/react-router";
import type {
	HistoryEntry,
	HistoryListResponse,
	HistorySkill,
} from "@teacher-os/api/contracts";
import { HISTORY_SKILLS } from "@teacher-os/api/contracts";
import { Button } from "@teacher-os/ui/components/button";
import { Fragment, useState } from "react";
import { HISTORY_SKILL_LABELS } from "@/components/history/history-skill-labels";
import { WritingReview } from "@/components/history/writing-review";
import { cn } from "@/lib/cn";

/** Nhãn chip trạng thái theo design-v2 `DetailHistory` (Tag hot = chờ chấm). */
const STATUS_LABELS: Record<HistoryEntry["status"], string> = {
	auto: "Tự chấm",
	graded: "Đã chấm",
	awaiting: "Chờ chấm",
};

function StatusTag({ entry }: { entry: HistoryEntry }) {
	const isAwaiting = entry.status === "awaiting";
	// Practice Writing/Speaking beta chưa có hàng chờ chấm giáo viên
	// (kongming post-impl: follow-up riêng) — nhãn không hứa "Chờ chấm".
	const isPracticeAwaiting = isAwaiting && entry.kind === "practice";
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md px-2 py-0.5 font-medium text-xs",
				isAwaiting && !isPracticeAwaiting
					? "bg-primary text-primary-foreground"
					: "bg-secondary text-secondary-foreground",
			)}
		>
			{entry.kind === "vocab"
				? "Đã ôn"
				: isPracticeAwaiting
					? "Đã nộp — tự luyện"
					: STATUS_LABELS[entry.status]}
		</span>
	);
}

/** Dòng Writing đã chấm mới mở được xem lại — chi tiết band + highlight. */
function canReview(entry: HistoryEntry): boolean {
	return (
		entry.status === "graded" &&
		entry.skill === "writing" &&
		entry.attemptId !== null
	);
}

/**
 * Danh sách chi tiết (design-v2 `DetailHistory`): tab kỹ năng sống trong URL
 * (`?skill=`, "Tất cả" bỏ param), phân trang do caller quản (`?page=`), dòng
 * Writing đã chấm mở `WritingReview` ngay dưới hàng. Empty state có CTA
 * "Bắt đầu luyện tập" dẫn /practice.
 */
export function HistoryList({
	skill,
	page,
	data,
	onSkillChange,
	onPageChange,
}: {
	/** Kỹ năng đang lọc — "" = tất cả. */
	skill: HistorySkill | "";
	page: number;
	data: HistoryListResponse;
	onSkillChange: (skill: string) => void;
	onPageChange: (page: number) => void;
}) {
	const [reviewingId, setReviewingId] = useState<string | null>(null);
	const navigate = useNavigate();
	const tabs: Array<{ value: HistorySkill | ""; label: string }> = [
		{ value: "", label: "Tất cả" },
		...[...HISTORY_SKILLS].map((s) => ({
			value: s,
			label: HISTORY_SKILL_LABELS[s],
		})),
	];

	return (
		<section
			data-testid="history-list"
			className="min-w-0 rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
		>
			<h2 className="font-semibold leading-none">Lịch sử chi tiết</h2>
			<div
				role="tablist"
				className="no-scrollbar mt-4 flex gap-1 overflow-x-auto border-b"
			>
				{tabs.map((tab) => (
					<button
						key={tab.value || "all"}
						type="button"
						role="tab"
						aria-selected={skill === tab.value}
						onClick={() => {
							setReviewingId(null);
							onSkillChange(tab.value);
						}}
						className={cn(
							"-mb-px whitespace-nowrap border-b-2 px-3 pt-1 pb-2.5 font-medium text-sm transition-colors",
							skill === tab.value
								? "border-foreground text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<p className="mt-4 text-muted-foreground text-sm tabular-nums">
				{data.total} hoạt động — trang {data.page} / {data.pages}
			</p>

			{data.entries.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
					<p className="text-muted-foreground text-sm">
						{skill === ""
							? "Bạn chưa có hoạt động nào."
							: `Chưa có hoạt động ${HISTORY_SKILL_LABELS[skill]} nào.`}
					</p>
					<Button onClick={() => void navigate({ to: "/practice" })}>
						Bắt đầu luyện tập
					</Button>
				</div>
			) : (
				<div className="mt-2 w-full overflow-x-auto">
					<table className="w-full text-sm">
						<thead className="border-b">
							<tr>
								{["Ngày", "Bài", "Điểm", "Thời gian", "Trạng thái", ""].map(
									(header, index) => (
										<th
											key={index}
											className="h-10 px-3 text-left font-medium text-muted-foreground first:pl-0"
										>
											{header}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody className="[&>tr:last-child]:border-0 [&>tr]:border-b">
							{data.entries.map((entry) => {
								const [, mm, dd] = entry.date.split("-");
								return (
									<Fragment key={entry.id}>
										<tr
											data-testid="history-entry-row"
											className="transition-colors hover:bg-muted/50"
										>
											<td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground tabular-nums">
												{dd}/{mm}
											</td>
											<td className="px-3 font-medium">{entry.title}</td>
											<td className="px-3 font-medium tabular-nums">
												{entry.score ?? "—"}
											</td>
											<td className="px-3 text-muted-foreground tabular-nums">
												{entry.minutes}m
											</td>
											<td className="px-3">
												<StatusTag entry={entry} />
											</td>
											<td className="pl-3 text-right">
												{canReview(entry) && (
													<Button
														variant="outline"
														size="sm"
														onClick={() =>
															setReviewingId(
																reviewingId === entry.id ? null : entry.id,
															)
														}
													>
														{reviewingId === entry.id
															? "Ẩn nhận xét"
															: "Xem nhận xét"}
													</Button>
												)}
											</td>
										</tr>
										{reviewingId === entry.id && entry.attemptId && (
											<tr>
												<td colSpan={6} className="pb-4">
													<WritingReview attemptId={entry.attemptId} />
												</td>
											</tr>
										)}
									</Fragment>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{data.pages > 1 && (
				<nav
					aria-label="Phân trang lịch sử"
					className="mt-6 flex items-center justify-center gap-3 text-sm"
				>
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => onPageChange(page - 1)}
					>
						Trước
					</Button>
					<span className="text-muted-foreground tabular-nums">
						Trang {page} / {data.pages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= data.pages}
						onClick={() => onPageChange(page + 1)}
					>
						Sau
					</Button>
				</nav>
			)}
		</section>
	);
}
