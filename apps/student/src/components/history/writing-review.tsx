import {
	criterionLabel,
	formatBand,
	type GradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import { EssayWithHighlights } from "@teacher-os/ui/components/quiz/essay-with-highlights";
import Loader from "@/components/loader";
import { useAttemptSummary } from "@/lib/repos/quiz";

/**
 * Xem lại bài Writing đã chấm (design-v2 `WritingReview`, phase 11 #378):
 * trái là bài viết kèm highlight + ghi chú của giáo viên (`EssayWithHighlights`
 * #332/#336), phải là band tổng + điểm từng tiêu chí (nhãn qua
 * `criterionLabel` — Task Achievement/Response theo part). Dữ liệu từ
 * GET /api/student/attempts/:attemptId (summary đã gồm grade + annotations).
 */
export function WritingReview({ attemptId }: { attemptId: string }) {
	const summaryQuery = useAttemptSummary(attemptId);

	if (summaryQuery.isLoading) {
		return <Loader />;
	}
	if (summaryQuery.isError || !summaryQuery.data) {
		return (
			<div className="mt-4 rounded-lg border border-dashed py-8 text-center text-muted-foreground text-sm">
				Không tải được nhận xét của giáo viên. Vui lòng thử lại.
			</div>
		);
	}

	const summary = summaryQuery.data;
	const grade = summary.grade ?? null;
	const annotations = summary.annotations ?? [];

	return (
		<div
			data-testid="writing-review"
			className="mt-4 grid gap-6 lg:grid-cols-[1.3fr_1fr]"
		>
			<div className="rounded-lg border p-5 text-base leading-8">
				<EssayWithHighlights
					essay={summary.essay ?? ""}
					annotations={annotations}
					inlineNotes
				/>
			</div>
			<div className="self-start rounded-lg border p-5">
				<div className="mb-2 text-muted-foreground text-sm">Band tổng</div>
				<div className="font-semibold text-5xl tabular-nums leading-none tracking-tight">
					{grade ? formatBand(grade.band) : "—"}
				</div>
				{grade &&
					Object.entries(grade.scores).map(([key, value]) => (
						<div
							key={key}
							className="flex justify-between border-t py-2.5 text-sm first-of-type:mt-4"
						>
							<span>
								{criterionLabel(
									summary.skill === "speaking" ? "speaking" : "writing",
									key,
									summary.part ?? "task2",
								)}
							</span>
							<span className="font-medium tabular-nums">
								{value.toFixed(1)}
							</span>
						</div>
					))}
				{grade && grade.feedback.trim().length > 0 && (
					<p className="mt-4 border-l-2 pl-3 text-muted-foreground text-sm italic">
						“{grade.feedback}”
					</p>
				)}
				{!grade && (
					<p className="mt-4 border-l-2 pl-3 text-muted-foreground text-sm italic">
						Giáo viên chưa chấm bài này.
					</p>
				)}
			</div>
		</div>
	);
}
