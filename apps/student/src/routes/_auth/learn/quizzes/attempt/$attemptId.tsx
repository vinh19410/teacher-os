import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useChildMatches,
} from "@tanstack/react-router";
import type { QuizAttemptSummary } from "@teacher-os/api/contracts";
import {
	formatMediaSize,
	isVideoMediaType,
} from "@teacher-os/api/lib/quiz-media";
import { countWords } from "@teacher-os/api/lib/word-count";
import {
	Attachment,
	AttachmentContent,
	AttachmentDescription,
	AttachmentMedia,
	AttachmentTitle,
} from "@teacher-os/ui/components/attachment";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { AttemptCompactList } from "@teacher-os/ui/components/quiz/attempt-compact-list";
import { AttemptScoreCard } from "@teacher-os/ui/components/quiz/attempt-score-card";
import { EssayWithHighlights } from "@teacher-os/ui/components/quiz/essay-with-highlights";
import { MusicIcon, VideoIcon } from "lucide-react";
import { useEffect } from "react";
import Loader from "@/components/loader";
import { AttemptGradeCard } from "@/components/quiz/attempt-grade-card";
import { AttemptReviewError } from "@/components/quiz/attempt-review-error";
import { QuizMediaPlayer } from "@/components/quiz/quiz-media-player";
import { QuizRuntimeHeader } from "@/components/quiz/quiz-runtime-header";
import {
	formatAttemptDuration,
	formatVietnamSubmittedAt,
} from "@/lib/attempt-format";
import { cn } from "@/lib/cn";
import { isHttpError, studentQueryClient } from "@/lib/query-client";
import {
	attemptSummaryQueryOptions,
	useAttemptSummary,
} from "@/lib/repos/quiz";

export const Route = createFileRoute("/_auth/learn/quizzes/attempt/$attemptId")(
	{
		loader: async ({ params: { attemptId } }) => {
			try {
				await studentQueryClient.ensureQueryData(
					attemptSummaryQueryOptions(attemptId),
				);
			} catch (error) {
				// 409 = attempt còn in_progress (RT#6) — không render partial. Body
				// 409 không mang assignmentId nên không dựng được URL take screen;
				// overview là điểm hạ cánh an toàn (row bài tập dẫn về take).
				if (isHttpError(error) && error.status === 409) {
					throw redirect({ to: "/" });
				}
				throw error;
			}
		},
		component: AttemptRouteView,
		errorComponent: AttemptReviewError,
	},
);

/**
 * Route cha của .../detail — URL summary vẽ màn kết quả, URL .../detail nhả
 * Outlet cho route con (màn soi chi tiết) tự vẽ.
 */
function AttemptRouteView() {
	const hasChildMatch = useChildMatches().length > 0;
	if (hasChildMatch) return <Outlet />;
	return <AttemptSummaryPage />;
}

/**
 * Writing đã chấm → chia 2 khung (bài viết | kết quả chấm) ở ≥ 921px (#336).
 * Nguồn sự thật duy nhất cho quyết định chia khung — `AttemptSummaryBody` và
 * `AttemptSummaryPage` đều gọi hàm này; thêm skill/nhánh mới thì cập nhật ở
 * đây. Điều kiện khớp thứ tự nhánh render: Speaking rơi vào nhánh riêng,
 * Writing cần `essay != null`, khung phải cần `grade != null`.
 */
export function isSplitWritingResult(summary: QuizAttemptSummary): boolean {
	return (
		summary.skill !== "speaking" &&
		(summary.essay ?? null) !== null &&
		(summary.grade ?? null) !== null
	);
}

/**
 * Body màn kết quả — export để unit test các nhánh (#304, red-team I):
 * Speaking (`skill === "speaking"`, #305) hiện bài nói đã nộp + nghe lại;
 * Writing (`essay !== null`) hiện bài đã nộp thay score card 0/0; đề tự chấm
 * giữ nguyên score card + bảng đáp án. Writing/Speaking đã chấm
 * (`summary.grade`) hiện band + tiêu chí + nhận xét thay dòng chờ chấm.
 * Writing đã chấm (#336) chia 2 khung ≥ 921px, ghi chú giáo viên hiện inline
 * ngay sau highlight.
 */
export function AttemptSummaryBody({
	summary,
	attemptId,
}: {
	summary: QuizAttemptSummary;
	attemptId: string;
}) {
	const duration = formatAttemptDuration(
		summary.startedAt,
		summary.submittedAt,
	);
	const essay = summary.essay ?? null;
	const grade = summary.grade ?? null;
	const part = summary.part ?? "";
	const submittedLine = (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground text-sm">
				Bạn đã nộp bài lúc{" "}
				<span className="font-medium text-foreground">
					{formatVietnamSubmittedAt(summary.submittedAt)}
				</span>
				{duration && (
					<>
						{" · hoàn thành trong "}
						<span className="font-medium text-foreground">{duration}</span>
					</>
				)}
				.
			</p>
			{/* TOS-30 #478: chưa có điểm cuối → chỉ nhãn chờ chấm, KHÔNG lộ
				trạng thái/diểm chấm nháp AI (BR-001). */}
			{grade === null && (
				<p
					className="font-medium text-foreground text-sm"
					data-testid="awaiting-grade"
				>
					Đã nộp — Đang chờ giáo viên chấm
				</p>
			)}
		</div>
	);

	// Field `skill` optional (server cũ vắng mặt) → rơi về nhánh khác.
	if (summary.skill === "speaking") {
		const media = summary.media ?? null;
		return (
			<>
				{submittedLine}
				<h2 className="mt-6 mb-2 font-semibold text-foreground">
					Bài nói của bạn
				</h2>
				{media ? (
					<div className="flex flex-col gap-3">
						<Attachment
							state="done"
							className="w-full rounded-md bg-background"
						>
							<AttachmentMedia>
								{isVideoMediaType(media.type) ? (
									<VideoIcon aria-hidden />
								) : (
									<MusicIcon aria-hidden />
								)}
							</AttachmentMedia>
							<AttachmentContent>
								<AttachmentTitle data-testid="speaking-media-name">
									{media.name}
								</AttachmentTitle>
								<AttachmentDescription>
									{formatMediaSize(media.size)}
								</AttachmentDescription>
							</AttachmentContent>
						</Attachment>
						<QuizMediaPlayer media={media} attemptId={attemptId} />
					</div>
				) : (
					<p className="text-muted-foreground text-sm">
						Bài này được nộp khi chưa có file bài nói.
					</p>
				)}
				{grade ? (
					<AttemptGradeCard grade={grade} skill="speaking" part={part} />
				) : (
					<p className="mt-3 text-muted-foreground text-sm">
						Giáo viên sẽ chấm bài nói của bạn.
					</p>
				)}
			</>
		);
	}

	if (essay !== null) {
		const wordCount = countWords(essay);
		// Ghi chú giáo viên hiện inline ngay sau highlight (#336): server CHỈ
		// gửi `annotations` khi bài đã chấm — client chỉ đọc `?? []`.
		const annotations = summary.annotations ?? [];
		const emptyEssay = essay.trim() === "";
		const split = isSplitWritingResult(summary);
		const essayFrame = (
			<section
				aria-labelledby="essay-heading"
				className="min-w-0"
				data-testid="essay-frame"
			>
				<h2
					className="mt-6 mb-1 font-extrabold text-foreground"
					id="essay-heading"
				>
					Bài viết của bạn
				</h2>
				<p
					className="font-mono text-muted-foreground text-sm"
					data-testid="essay-summary-count"
				>
					{wordCount} từ
				</p>
				{/* Khối bài viết kiểu design `Results`: cột trái có border-l,
				 * chữ lớn giãn dòng, không card. */}
				<div className="mt-2 whitespace-pre-wrap border-border border-l-2 pl-5 text-lg leading-[1.9]">
					{emptyEssay ? (
						<span className="text-muted-foreground">Bạn đã nộp bài trống.</span>
					) : (
						<EssayWithHighlights
							essay={essay}
							annotations={annotations}
							inlineNotes
						/>
					)}
				</div>
			</section>
		);
		// split ≡ grade != null trong nhánh này (Speaking đã early-return,
		// essay != null) — guard `grade` để TS thu hẹp kiểu.
		if (split && grade) {
			return (
				<>
					{submittedLine}
					<div
						className="app:grid app:grid-cols-[1.3fr_1fr] app:items-start app:gap-8"
						data-testid="writing-result-split"
					>
						{essayFrame}
						<AttemptGradeCard
							grade={grade}
							part={part}
							scrollable
							skill="writing"
							className="app:sticky app:top-20 min-w-0"
						/>
					</div>
				</>
			);
		}
		return (
			<>
				{submittedLine}
				{essayFrame}
				{grade ? (
					<AttemptGradeCard grade={grade} skill="writing" part={part} />
				) : (
					<p className="mt-3 text-muted-foreground text-sm">
						Giáo viên sẽ chấm bài viết của bạn.
					</p>
				)}
			</>
		);
	}

	return (
		<>
			{submittedLine}
			<div className="mt-4">
				<AttemptScoreCard
					correctCount={summary.correctCount}
					wrongCount={summary.wrongCount}
					skippedCount={summary.skippedCount}
					totalCount={summary.totalCount}
					action={
						<Link
							to="/learn/quizzes/attempt/$attemptId/detail"
							params={{ attemptId }}
							className={cn(buttonVariants(), "mt-5")}
						>
							Xem giải thích chi tiết
						</Link>
					}
				/>
			</div>
			<h2 className="mt-6 mb-2 font-extrabold text-foreground tracking-[-0.02em]">
				Bảng đáp án
			</h2>
			<AttemptCompactList items={summary.items} />
		</>
	);
}

function AttemptSummaryPage() {
	const { attemptId } = Route.useParams();
	const summaryQuery = useAttemptSummary(attemptId);
	const summary = summaryQuery.data;

	// Phòng hờ: refetch trả 409 (domain không cho submitted quay lại
	// in_progress, nhưng không render partial theo RT#6).
	useEffect(() => {
		if (isHttpError(summaryQuery.error) && summaryQuery.error.status === 409) {
			window.location.assign("/");
		}
	}, [summaryQuery.error]);

	if (summaryQuery.isPending || !summary) {
		return <Loader />;
	}

	return (
		<div className="flex min-h-svh flex-col bg-muted/30">
			<QuizRuntimeHeader
				title={summary.title}
				saveState={null}
				onSubmitClick={null}
			/>
			<main
				className={cn(
					"mx-auto w-full flex-1 px-4 py-6",
					isSplitWritingResult(summary) ? "max-w-[1120px]" : "max-w-[720px]",
				)}
			>
				<AttemptSummaryBody summary={summary} attemptId={attemptId} />
			</main>
		</div>
	);
}
