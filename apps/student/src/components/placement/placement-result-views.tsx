import { Link } from "@tanstack/react-router";
import { formatBand } from "@teacher-os/api/lib/ielts-band";
import {
	isIeltsSpeakingRubric,
	isIeltsWritingRubric,
	matchPlacementBand,
	PLACEMENT_LEGACY_SPEAKING_RUBRIC,
	PLACEMENT_LEGACY_WRITING_RUBRIC,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
	type PlacementErrorSkill,
	type PlacementPublishedBand,
	type PlacementSectionScore,
	type StudentPlacementSubmissionView,
} from "@teacher-os/api/placement-test-contracts";
import { Button } from "@teacher-os/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@teacher-os/ui/components/card";
import {
	ArrowLeft,
	Award,
	BookOpen,
	CheckCircle2,
	Clock,
	FileQuestion,
	Mic,
	PenLine,
	RefreshCw,
} from "lucide-react";
import { PlacementAnnotatedText } from "@/components/placement/placement-error-highlights";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
	DEFAULT_PLACEMENT_BANDS,
	resolvePlacementErrorStyle,
} from "@/lib/placement-test-helpers";

function PendingSkillReportCard({
	label,
	score,
	bands,
	scoreTestId,
	cefrTestId,
	progressTestId,
}: {
	label: string;
	score: PlacementSectionScore;
	bands: readonly PlacementPublishedBand[];
	scoreTestId: string;
	cefrTestId: string;
	progressTestId: string;
}) {
	const hasQuestions = Boolean(score && score.total > 0);
	const exactPct = hasQuestions ? (score.correct / score.total) * 100 : 0;
	const roundedPct = hasQuestions ? Math.round(exactPct) : 0;
	const matchedBand = hasQuestions ? matchPlacementBand(exactPct, bands) : null;
	const cefrLabel = matchedBand?.cefr || "—";
	const detailText = hasQuestions
		? `${score.correct}/${score.total} câu đúng · ${roundedPct}%`
		: "—";
	const clampedPct = Math.max(0, Math.min(100, roundedPct));

	return (
		<div className="rounded-xl border bg-card p-4 shadow-xs">
			<div className="font-medium text-muted-foreground text-xs">{label}</div>
			<div
				data-testid={cefrTestId}
				className="mt-1.5 font-bold text-2xl text-foreground tracking-tight"
			>
				{cefrLabel}
			</div>
			<div
				data-testid={scoreTestId}
				className="mt-1 font-medium text-foreground text-sm tabular-nums"
			>
				{detailText}
			</div>
			<div
				role="progressbar"
				aria-label={`Tỉ lệ đúng phần ${label}`}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={clampedPct}
				data-testid={progressTestId}
				className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-primary transition-[width]"
					style={{ width: `${clampedPct}%` }}
				/>
			</div>
		</div>
	);
}

function formatObjectiveWithPct(score: PlacementSectionScore): string {
	if (!score || score.total <= 0) return "—";
	const pct = score.pct !== null ? ` (${Math.round(score.pct)}%)` : "";
	return `${score.correct}/${score.total}${pct}`;
}

function formatSpeakingStatusLabel(
	status: StudentPlacementSubmissionView["speakingStatus"],
): string {
	switch (status) {
		case "uploaded":
			return "Đã gửi bài nói";
		case "skipped":
			return "Đã bỏ qua";
		case "pending_upload":
			return "Chưa tải lên được bài nói";
		case "none":
			return "Không có phần Speaking";
	}
}

export function PlacementUnavailableCard() {
	return (
		<Card
			data-testid="placement-unavailable-card"
			className="mx-auto max-w-2xl"
		>
			<CardHeader>
				<div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<FileQuestion aria-hidden="true" className="size-5" />
				</div>
				<CardTitle className="text-xl">
					Bài kiểm tra đầu vào chưa khả dụng
				</CardTitle>
				<CardDescription className="leading-relaxed">
					Giáo viên của bạn hiện chưa phát hành bộ đề kiểm tra đầu vào cho tổ
					chức này. Vui lòng quay lại sau hoặc liên hệ giáo viên để được hỗ trợ.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Link
					to="/"
					className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-4 font-medium text-foreground text-sm shadow-xs transition-colors hover:bg-accent"
				>
					<ArrowLeft aria-hidden="true" className="size-4" />
					<span>Về trang chủ</span>
				</Link>
			</CardContent>
		</Card>
	);
}

export function PlacementExemptCard({
	entryScore,
	testAvailable,
	onStartTest,
}: {
	entryScore: string | null;
	testAvailable: boolean;
	onStartTest: () => void;
}) {
	return (
		<Card data-testid="placement-exempt-card" className="mx-auto max-w-2xl">
			<CardHeader>
				<div className="mb-2 flex items-center gap-2">
					<span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 font-medium text-success text-xs">
						<CheckCircle2 aria-hidden="true" className="size-3.5" />
						Đã có điểm đầu vào
					</span>
				</div>
				<CardTitle className="text-xl">
					Bạn không bắt buộc làm bài kiểm tra đầu vào
				</CardTitle>
				<CardDescription className="leading-relaxed">
					Hệ thống đã ghi nhận điểm đầu vào hiện có của bạn. Nếu muốn đánh giá
					lại toàn diện 5 kỹ năng, bạn vẫn có thể chọn làm bài kiểm tra bên
					dưới.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{entryScore ? (
					<div className="rounded-lg border bg-muted/40 p-4">
						<div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
							Điểm đầu vào hiện tại
						</div>
						<div
							data-testid="placement-entry-score"
							className="mt-1 font-bold text-2xl text-foreground tabular-nums"
						>
							{entryScore}
						</div>
					</div>
				) : null}

				<div className="flex flex-wrap items-center gap-3">
					{testAvailable ? (
						<Button type="button" onClick={onStartTest}>
							Làm bài kiểm tra đầu vào
						</Button>
					) : null}
					<Link
						to="/"
						className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-4 font-medium text-foreground text-sm shadow-xs transition-colors hover:bg-accent"
					>
						<ArrowLeft aria-hidden="true" className="size-4" />
						<span>Về trang chủ</span>
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}

export function PlacementPendingResultView({
	submission,
	bands,
	canRetrySpeakingUpload = false,
	isRetryingSpeakingUpload = false,
	speakingUploadError = "",
	onRetrySpeakingUpload,
}: {
	submission: StudentPlacementSubmissionView;
	bands?: readonly PlacementPublishedBand[];
	canRetrySpeakingUpload?: boolean;
	isRetryingSpeakingUpload?: boolean;
	speakingUploadError?: string;
	onRetrySpeakingUpload?: () => void;
}) {
	const effectiveBands =
		bands && bands.length > 0 ? bands : DEFAULT_PLACEMENT_BANDS;

	return (
		<div
			data-testid="placement-pending-view"
			className="mx-auto max-w-3xl space-y-6"
		>
			<Card>
				<CardHeader>
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 font-medium text-warn text-xs">
							<Clock aria-hidden="true" className="size-3.5" />
							Đang chờ giáo viên chấm Writing &amp; Speaking
						</span>
					</div>
					<CardTitle className="text-2xl tracking-tight">
						Đã nộp bài kiểm tra đầu vào
					</CardTitle>
					<CardDescription className="leading-relaxed">
						Dưới đây là kết quả tự động hai phần Listening và Reading. Giáo viên
						sẽ chấm bài viết Writing và bản ghi Speaking rồi gửi kết quả chính
						thức kèm lộ trình học phù hợp cho bạn.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-6">
					<div className="space-y-3">
						<h3 className="font-semibold text-base text-foreground">
							Kết quả Listening &amp; Reading (CEFR)
						</h3>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<PendingSkillReportCard
								label="Listening"
								score={submission.objective.listening}
								bands={effectiveBands}
								scoreTestId="pending-score-listening"
								cefrTestId="pending-cefr-listening"
								progressTestId="pending-progress-listening"
							/>
							<PendingSkillReportCard
								label="Reading"
								score={submission.objective.reading}
								bands={effectiveBands}
								scoreTestId="pending-score-reading"
								cefrTestId="pending-cefr-reading"
								progressTestId="pending-progress-reading"
							/>
						</div>
						<p className="text-muted-foreground text-xs leading-relaxed">
							Đây là kết quả tự động của hai phần nghe và đọc. Cấp độ cuối cùng
							và lớp phù hợp sẽ được giáo viên báo sau khi chấm Writing và
							Speaking.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex items-start gap-3 rounded-lg border p-4">
							<PenLine
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0 text-muted-foreground"
							/>
							<div>
								<div className="font-medium text-foreground text-sm">
									Phần Writing
								</div>
								<p
									data-testid="pending-writing-words"
									className="mt-0.5 text-muted-foreground text-sm tabular-nums"
								>
									{submission.writingWordCount} từ đã nộp
								</p>
							</div>
						</div>

						<div className="flex items-start gap-3 rounded-lg border p-4">
							<Mic
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0 text-muted-foreground"
							/>
							<div>
								<div className="font-medium text-foreground text-sm">
									Phần Speaking
								</div>
								<p
									data-testid="pending-speaking-status"
									className="mt-0.5 text-muted-foreground text-sm"
								>
									{formatSpeakingStatusLabel(submission.speakingStatus)}
								</p>
							</div>
						</div>
					</div>

					{submission.speakingStatus === "pending_upload" ? (
						<div
							role="alert"
							className="space-y-3 rounded-lg border border-warn/40 bg-warn-soft p-4 text-sm"
						>
							<p className="font-medium text-foreground">
								File ghi âm Speaking chưa tải lên hoàn tất
							</p>
							<p className="text-muted-foreground text-xs leading-relaxed">
								{speakingUploadError ||
									"Bài làm 4 kỹ năng còn lại đã được lưu an toàn. Bạn có thể bấm thử tải lại file Speaking nếu bản ghi vẫn còn trong phiên làm việc."}
							</p>
							{canRetrySpeakingUpload && onRetrySpeakingUpload ? (
								<Button
									type="button"
									size="sm"
									onClick={onRetrySpeakingUpload}
									disabled={isRetryingSpeakingUpload}
								>
									<RefreshCw
										aria-hidden="true"
										className={
											isRetryingSpeakingUpload ? "animate-spin" : undefined
										}
									/>
									<span>
										{isRetryingSpeakingUpload
											? "Đang tải lại..."
											: "Thử tải lại file Speaking"}
									</span>
								</Button>
							) : null}
						</div>
					) : null}

					<div className="pt-1">
						<Link
							to="/"
							className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-4 font-medium text-foreground text-sm shadow-xs transition-colors hover:bg-accent"
						>
							<ArrowLeft aria-hidden="true" className="size-4" />
							<span>Về trang chủ</span>
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function PlacementRubricGrid({
	skill,
	isIelts,
	items,
	rubric,
	comments,
	legacyGridCls,
}: {
	skill: PlacementErrorSkill;
	isIelts: boolean;
	items: ReadonlyArray<{ readonly key: string; readonly label: string }>;
	rubric: Record<string, number>;
	comments: Record<string, string> | null;
	legacyGridCls: string;
}) {
	return (
		<div
			className={
				isIelts ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2" : legacyGridCls
			}
		>
			{items.map((item) => {
				const raw = rubric[item.key];
				const display =
					raw !== undefined
						? isIelts
							? `${formatBand(raw)}/9`
							: `${raw}/5`
						: "—";

				if (!isIelts) {
					return (
						<div
							key={item.key}
							className="rounded-lg border bg-muted/30 px-3 py-2.5"
						>
							<div className="text-muted-foreground text-xs">{item.label}</div>
							<div className="mt-0.5 font-semibold text-foreground text-sm tabular-nums">
								{display}
							</div>
						</div>
					);
				}

				const style = resolvePlacementErrorStyle(item.key, skill);
				const rawComment = comments?.[item.key];
				const comment = typeof rawComment === "string" ? rawComment.trim() : "";

				return (
					<div
						key={item.key}
						data-testid={`student-${skill}-criterion-${item.key}`}
						className={cn(
							"rounded-lg border bg-muted/30 px-3 py-2.5",
							style.borderLeftCls,
						)}
					>
						<div className="flex items-start justify-between gap-2">
							<div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground text-xs">
								<span
									aria-hidden="true"
									className={cn(
										"inline-block size-2.5 shrink-0 rounded-full",
										style.dotCls,
									)}
								/>
								<span className="break-words">{item.label}</span>
							</div>
							<div className="shrink-0 font-semibold text-foreground text-sm tabular-nums">
								{display}
							</div>
						</div>
						{comment ? (
							<p
								data-testid={`student-${skill}-${item.key}-comment`}
								className="mt-2 whitespace-pre-wrap break-words border-border/60 border-t pt-2 text-muted-foreground text-xs leading-relaxed"
							>
								{comment}
							</p>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

export function PlacementGradedResultView({
	submission,
}: {
	submission: StudentPlacementSubmissionView;
}) {
	const writingIsIelts = isIeltsWritingRubric(submission.writingRubric);
	const writingRubricItems = writingIsIelts
		? PLACEMENT_WRITING_RUBRIC
		: PLACEMENT_LEGACY_WRITING_RUBRIC;
	const speakingIsIelts = isIeltsSpeakingRubric(submission.speakingRubric);
	const speakingRubricItems = speakingIsIelts
		? PLACEMENT_SPEAKING_RUBRIC
		: PLACEMENT_LEGACY_SPEAKING_RUBRIC;

	return (
		<div
			data-testid="placement-graded-view"
			className="mx-auto max-w-3xl space-y-6"
		>
			<Card>
				<CardHeader>
					<div className="mb-2 flex flex-wrap items-center gap-2">
						<span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 font-medium text-success text-xs">
							<Award aria-hidden="true" className="size-3.5" />
							Kết quả kiểm tra đầu vào chính thức
						</span>
					</div>
					<CardTitle className="text-2xl tracking-tight">
						Đánh giá năng lực 5 kỹ năng
					</CardTitle>
					<CardDescription>
						Kết quả tổng hợp do giáo viên chấm và chốt lộ trình học tập cho bạn.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="rounded-lg border bg-primary p-4 text-primary-foreground">
							<div className="font-mono text-[11px] uppercase tracking-[0.16em] opacity-80">
								Trình độ CEFR
							</div>
							<div
								data-testid="graded-cefr-badge"
								className="mt-1.5 font-extrabold text-2xl tracking-tight"
							>
								{submission.finalBandLevel || "—"}
							</div>
						</div>

						<div className="rounded-lg border bg-muted/40 p-4">
							<div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
								Khóa học đề xuất
							</div>
							<div
								data-testid="graded-display-course"
								className="mt-1.5 font-bold text-foreground text-lg"
							>
								{submission.finalDisplayCourse || "—"}
							</div>
						</div>

						<div className="rounded-lg border bg-muted/40 p-4">
							<div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
								Điểm tổng hợp
							</div>
							<div
								data-testid="graded-score-pct"
								className="mt-1.5 font-extrabold text-2xl text-foreground tabular-nums"
							>
								{submission.finalScorePct !== null
									? `${Math.round(submission.finalScorePct)}%`
									: "—"}
							</div>
						</div>
					</div>

					{submission.finalNote ? (
						<div className="rounded-lg border bg-muted/40 p-3.5 text-foreground text-sm leading-relaxed">
							{submission.finalNote}
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<BookOpen
							aria-hidden="true"
							className="size-4 text-muted-foreground"
						/>
						Điểm các kỹ năng
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="rounded-lg border bg-muted/30 p-3.5">
							<div className="text-muted-foreground text-xs">Listening</div>
							<div className="mt-1 font-bold text-foreground text-lg tabular-nums">
								{formatObjectiveWithPct(submission.objective.listening)}
							</div>
						</div>
						<div className="rounded-lg border bg-muted/30 p-3.5">
							<div className="text-muted-foreground text-xs">
								Grammar &amp; Vocabulary
							</div>
							<div className="mt-1 font-bold text-foreground text-lg tabular-nums">
								{formatObjectiveWithPct(submission.objective.vocabGrammar)}
							</div>
						</div>
						<div className="rounded-lg border bg-muted/30 p-3.5">
							<div className="text-muted-foreground text-xs">Reading</div>
							<div className="mt-1 font-bold text-foreground text-lg tabular-nums">
								{formatObjectiveWithPct(submission.objective.reading)}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card data-testid="graded-writing-section">
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<CardTitle className="flex items-center gap-2 text-base">
							<PenLine
								aria-hidden="true"
								className="size-4 text-muted-foreground"
							/>
							Writing
						</CardTitle>
						{submission.writingScore !== null ? (
							<Badge variant="default" className="tabular-nums">
								{writingIsIelts
									? `Band ${formatBand(submission.writingScore)}/9`
									: `${submission.writingScore}/15 điểm`}
							</Badge>
						) : null}
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{submission.writingRubric ? (
						<PlacementRubricGrid
							skill="writing"
							isIelts={writingIsIelts}
							items={writingRubricItems}
							rubric={submission.writingRubric as Record<string, number>}
							comments={
								submission.writingCriterionComments as Record<
									string,
									string
								> | null
							}
							legacyGridCls="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
						/>
					) : null}

					<div>
						<h3 className="mb-2 font-medium text-foreground text-sm">
							Bài viết của bạn
						</h3>
						<PlacementAnnotatedText
							idPrefix="writing"
							skill="writing"
							text={submission.writingText}
							errors={submission.writingErrors}
							emptyLabel="Bạn không nhập nội dung cho phần Writing."
						/>
					</div>
				</CardContent>
			</Card>

			<Card data-testid="graded-speaking-section">
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<CardTitle className="flex items-center gap-2 text-base">
							<Mic
								aria-hidden="true"
								className="size-4 text-muted-foreground"
							/>
							Speaking
						</CardTitle>
						{submission.speakingScore !== null ? (
							<Badge variant="default" className="tabular-nums">
								{speakingIsIelts
									? `Band ${formatBand(submission.speakingScore)}/9`
									: `${submission.speakingScore}/20 điểm`}
							</Badge>
						) : (
							<Badge variant="outline">
								{formatSpeakingStatusLabel(submission.speakingStatus)}
							</Badge>
						)}
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{submission.speakingRubric ? (
						<PlacementRubricGrid
							skill="speaking"
							isIelts={speakingIsIelts}
							items={speakingRubricItems}
							rubric={submission.speakingRubric as Record<string, number>}
							comments={
								submission.speakingCriterionComments as Record<
									string,
									string
								> | null
							}
							legacyGridCls="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
						/>
					) : null}

					{submission.speakingTranscript ||
					submission.speakingErrors.length > 0 ? (
						<div>
							<h3 className="mb-2 font-medium text-foreground text-sm">
								Transcript bài nói của bạn
							</h3>
							<PlacementAnnotatedText
								idPrefix="speaking"
								skill="speaking"
								text={submission.speakingTranscript}
								errors={submission.speakingErrors}
								emptyLabel="Chưa có transcript cho phần Speaking."
							/>
						</div>
					) : submission.speakingStatus === "skipped" ? (
						<p className="text-muted-foreground text-sm">
							Bạn đã bỏ qua phần Speaking trong lần làm bài này.
						</p>
					) : null}
				</CardContent>
			</Card>

			{submission.bandAdvice || submission.teacherFeedback ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							Nhận xét &amp; Gợi ý lộ trình
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{submission.bandAdvice ? (
							<div>
								<div className="font-medium text-foreground text-sm">
									Gợi ý theo trình độ
								</div>
								<p
									data-testid="graded-band-advice"
									className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed"
								>
									{submission.bandAdvice}
								</p>
							</div>
						) : null}

						{submission.teacherFeedback ? (
							<div>
								<div className="font-medium text-foreground text-sm">
									Nhận xét của giáo viên
								</div>
								<p
									data-testid="graded-teacher-feedback"
									className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed"
								>
									{submission.teacherFeedback}
								</p>
							</div>
						) : null}
					</CardContent>
				</Card>
			) : null}

			<div>
				<Link
					to="/"
					className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-4 font-medium text-foreground text-sm shadow-xs transition-colors hover:bg-accent"
				>
					<ArrowLeft aria-hidden="true" className="size-4" />
					<span>Về trang chủ</span>
				</Link>
			</div>
		</div>
	);
}
