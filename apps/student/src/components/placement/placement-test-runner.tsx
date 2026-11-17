import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	countPlacementWords,
	PLACEMENT_WRITING_TEXT_MAX,
	type PlacementSnapshot,
	type StudentPlacementSubmissionView,
	stripInlineCefrLabel,
} from "@teacher-os/api/placement-test-contracts";
import { Button } from "@teacher-os/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@teacher-os/ui/components/card";
import { Textarea } from "@teacher-os/ui/components/textarea";
import { ArrowLeft, ArrowRight, Clock, Mic, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlacementListeningStep } from "@/components/placement/placement-listening-step";
import { PlacementMcqQuestionCard } from "@/components/placement/placement-question-card";
import { PlacementReadingStep } from "@/components/placement/placement-reading-step";
import {
	PlacementSpeakingStep,
	type RecordedSpeakingAudio,
} from "@/components/placement/placement-speaking-step";
import { cn } from "@/lib/cn";
import {
	buildQuestionNumberMap,
	clearPlacementDraft,
	countObjectiveProgress,
	formatPlacementClock,
	loadPlacementDraft,
	PLACEMENT_RECOMMENDED_TIMER_SECONDS,
	PLACEMENT_SKILL_STEPS,
	PLACEMENT_SPEAKING_MAX_BYTES,
	PLACEMENT_TIMED_STEPS,
	type PlacementDraftState,
	type PlacementRunnerStep,
	sanitizeSubmissionAnswers,
	savePlacementDraft,
} from "@/lib/placement-test-helpers";
import {
	studentPlacementStatusQueryKey,
	studentPlacementViewQueryKey,
	uploadStudentPlacementSpeaking,
	useSubmitStudentPlacement,
} from "@/lib/repos/placement-test";

export interface PendingSpeakingRetry {
	submissionId: string;
	uploadToken: string;
	blob: Blob;
	mimeType: string;
	durationSec: number;
	errorMessage: string;
}

export function PlacementTestRunner({
	studentId,
	snapshot,
	onSubmitted,
}: {
	studentId: string;
	snapshot: PlacementSnapshot;
	onSubmitted: (
		submission: StudentPlacementSubmissionView,
		pendingSpeakingRetry: PendingSpeakingRetry | null,
	) => void;
}) {
	const queryClient = useQueryClient();
	const submitMutation = useSubmitStudentPlacement();

	const [draft, setDraft] = useState<PlacementDraftState>(() =>
		loadPlacementDraft(studentId, snapshot.version),
	);
	const [recordedAudio, setRecordedAudio] =
		useState<RecordedSpeakingAudio | null>(null);
	const [isSpeakingBusy, setIsSpeakingBusy] = useState(false);
	const [submitError, setSubmitError] = useState("");
	const [stepSwitchError, setStepSwitchError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [confirmUnanswered, setConfirmUnanswered] = useState<{
		unansweredObjective: number;
		writingEmpty: boolean;
		speakingUnrecorded: boolean;
		resolvedSpeakingMode: "upload" | "skipped" | "none";
	} | null>(null);
	const [nowMs, setNowMs] = useState(() => Date.now());

	const recordedUrlRef = useRef<string | null>(null);
	useEffect(() => {
		const prev = recordedUrlRef.current;
		const next = recordedAudio?.url ?? null;
		if (prev && prev !== next) {
			try {
				URL.revokeObjectURL(prev);
			} catch {
				// Ignore revoke errors
			}
		}
		recordedUrlRef.current = next;
	}, [recordedAudio]);

	useEffect(() => {
		return () => {
			if (recordedUrlRef.current) {
				try {
					URL.revokeObjectURL(recordedUrlRef.current);
				} catch {
					// Ignore unmount revoke errors
				}
			}
		};
	}, []);

	// Sync draft to localStorage whenever draft changes
	useEffect(() => {
		savePlacementDraft(studentId, snapshot.version, draft);
	}, [studentId, snapshot.version, draft]);

	// Countdown interval when in timed steps
	useEffect(() => {
		if (!PLACEMENT_TIMED_STEPS.has(draft.step) || !draft.timerStartedAt) {
			return;
		}
		setNowMs(Date.now());
		const id = setInterval(() => {
			setNowMs(Date.now());
		}, 1000);
		return () => clearInterval(id);
	}, [draft.step, draft.timerStartedAt]);

	const questionNumbers = useMemo(
		() => buildQuestionNumberMap(snapshot),
		[snapshot],
	);
	const progress = useMemo(
		() => countObjectiveProgress(snapshot, draft.answers),
		[snapshot, draft.answers],
	);

	const listeningPart = snapshot.parts[0];
	const vgPart = snapshot.parts[1];
	const readingPart = snapshot.parts[2];
	const writingPart = snapshot.parts[3];
	const speakingPart = snapshot.parts[4];

	const remainingTimerSeconds = useMemo(() => {
		if (!draft.timerStartedAt) return PLACEMENT_RECOMMENDED_TIMER_SECONDS;
		const elapsedSec = Math.floor((nowMs - draft.timerStartedAt) / 1000);
		return Math.max(0, PLACEMENT_RECOMMENDED_TIMER_SECONDS - elapsedSec);
	}, [draft.timerStartedAt, nowMs]);

	const goToStep = useCallback(
		(nextStep: PlacementRunnerStep) => {
			if (isSpeakingBusy) {
				setStepSwitchError(
					"Vui lòng hoàn thành hoặc bấm Kết thúc sớm phần ghi âm trước khi chuyển phần khác.",
				);
				return;
			}
			setStepSwitchError("");
			setSubmitError("");
			setConfirmUnanswered(null);
			setDraft((prev) => ({
				...prev,
				step: nextStep,
				timerStartedAt:
					PLACEMENT_TIMED_STEPS.has(nextStep) && !prev.timerStartedAt
						? Date.now()
						: prev.timerStartedAt,
			}));
			if (
				typeof window !== "undefined" &&
				typeof window.scrollTo === "function"
			) {
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
		},
		[isSpeakingBusy],
	);

	const executeSubmission = async (
		finalSpeakingMode: "upload" | "skipped" | "none",
	) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setSubmitError("");

		try {
			const cleanAnswers = sanitizeSubmissionAnswers(snapshot, draft.answers);
			const cleanWriting = draft.writingText.slice(
				0,
				PLACEMENT_WRITING_TEXT_MAX,
			);
			const durationSec =
				finalSpeakingMode === "upload" && recordedAudio
					? Math.min(3600, Math.max(0, Math.round(recordedAudio.durationSec)))
					: null;

			const res = await submitMutation.mutateAsync({
				answers: cleanAnswers,
				writingText: cleanWriting,
				speakingMode: finalSpeakingMode,
				speakingDurationSec: durationSec,
			});

			let speakingStatus: StudentPlacementSubmissionView["speakingStatus"] =
				finalSpeakingMode === "upload"
					? "pending_upload"
					: finalSpeakingMode === "skipped"
						? "skipped"
						: "none";
			let pendingRetry: PendingSpeakingRetry | null = null;

			if (
				finalSpeakingMode === "upload" &&
				recordedAudio &&
				res.uploadToken &&
				res.submissionId
			) {
				try {
					await uploadStudentPlacementSpeaking(
						res.submissionId,
						res.uploadToken,
						recordedAudio.blob,
						recordedAudio.mimeType,
						recordedAudio.durationSec,
					);
					speakingStatus = "uploaded";
				} catch (uploadErr) {
					speakingStatus = "pending_upload";
					pendingRetry = {
						submissionId: res.submissionId,
						uploadToken: res.uploadToken,
						blob: recordedAudio.blob,
						mimeType: recordedAudio.mimeType,
						durationSec: recordedAudio.durationSec,
						errorMessage:
							uploadErr instanceof Error
								? uploadErr.message
								: "Không thể tải file Speaking lên máy chủ.",
					};
				}
			}

			clearPlacementDraft(studentId, snapshot.version);
			void queryClient.invalidateQueries({
				queryKey: studentPlacementStatusQueryKey,
			});
			void queryClient.invalidateQueries({
				queryKey: studentPlacementViewQueryKey,
			});

			const optimisticView: StudentPlacementSubmissionView = {
				id: res.submissionId,
				testVersion: snapshot.version,
				status: "pending_grading",
				submittedAt: new Date().toISOString(),
				gradedAt: null,
				objective: res.objective,
				writingText: cleanWriting,
				writingWordCount: countPlacementWords(cleanWriting),
				writingRubric: null,
				writingScore: null,
				writingErrors: [],
				speakingStatus,
				speakingTranscript: "",
				speakingRubric: null,
				speakingScore: null,
				speakingErrors: [],
				finalBandLevel: null,
				finalDisplayCourse: null,
				finalScorePct: null,
				finalNote: "",
				bandAdvice: "",
				teacherFeedback: "",
			};

			onSubmitted(optimisticView, pendingRetry);
		} catch (err) {
			setSubmitError(
				err instanceof Error && err.message
					? err.message
					: "Không thể nộp bài kiểm tra. Vui lòng kiểm tra kết nối và thử lại.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleRequestSubmit = () => {
		if (isSpeakingBusy) {
			setSubmitError(
				"Vui lòng hoàn thành hoặc bấm Kết thúc sớm phần ghi âm trước khi nộp bài.",
			);
			return;
		}
		if (
			recordedAudio &&
			recordedAudio.blob.size > PLACEMENT_SPEAKING_MAX_BYTES
		) {
			setSubmitError(
				"File Speaking vượt quá giới hạn 50 MB. Vui lòng ghi lại ngắn hơn hoặc chọn Bỏ qua phần Speaking.",
			);
			return;
		}

		const hasSpeakingTasks = speakingPart.tasks.length > 0;
		const hasValidBlob = Boolean(
			recordedAudio &&
				recordedAudio.blob.size > 0 &&
				recordedAudio.blob.size <= PLACEMENT_SPEAKING_MAX_BYTES,
		);
		const resolvedSpeakingMode: "upload" | "skipped" | "none" =
			!hasSpeakingTasks ? "none" : hasValidBlob ? "upload" : "skipped";
		const needsSpeakingDecision =
			hasSpeakingTasks && !hasValidBlob && draft.speakingMode !== "skipped";

		const wordCount = countPlacementWords(draft.writingText);
		if (progress.unanswered > 0 || wordCount === 0 || needsSpeakingDecision) {
			setConfirmUnanswered({
				unansweredObjective: progress.unanswered,
				writingEmpty: wordCount === 0,
				speakingUnrecorded: needsSpeakingDecision,
				resolvedSpeakingMode,
			});
			return;
		}

		void executeSubmission(resolvedSpeakingMode);
	};

	// --- Intro card ---
	if (draft.step === "intro") {
		const minWords = writingPart.minWords || 50;
		const maxWords = Math.max(minWords, writingPart.maxWords || 80);
		const speakingCount = speakingPart.tasks.length;

		return (
			<Card data-testid="placement-intro-card" className="mx-auto max-w-3xl">
				<CardHeader>
					<div className="mb-1 flex flex-wrap items-center gap-2">
						<span className="inline-flex items-center rounded-full bg-muted px-3 py-0.5 font-medium text-foreground text-xs">
							Đánh giá năng lực 5 kỹ năng · Miễn phí
						</span>
					</div>
					<CardTitle className="text-2xl tracking-tight">
						Bài kiểm tra đầu vào tiếng Anh (5 kỹ năng)
					</CardTitle>
					<CardDescription className="leading-relaxed">
						Bài kiểm tra đánh giá toàn diện theo khung CEFR để giáo viên xếp
						đúng lớp và cá nhân hóa lộ trình học sát năng lực thực tế của bạn.
					</CardDescription>
				</CardHeader>

				<CardContent className="space-y-5">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="rounded-lg border bg-muted/30 p-4">
							<div className="font-semibold text-foreground text-sm">
								{progress.total} câu khách quan
							</div>
							<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
								Listening (có giới hạn lượt nghe), Grammar &amp; Vocabulary, và
								Reading.
							</p>
						</div>

						<div className="rounded-lg border bg-muted/30 p-4">
							<div className="font-semibold text-foreground text-sm">
								{speakingCount > 0
									? "Writing & Speaking thực tế"
									: "Writing thực tế"}
							</div>
							<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
								{speakingCount > 0
									? `1 bài viết (${minWords}–${maxWords} từ) và ${speakingCount} câu hỏi Speaking ghi âm qua micro (có thể bỏ qua nếu thiếu mic).`
									: `1 bài viết (${minWords}–${maxWords} từ).`}
							</p>
						</div>

						<div className="rounded-lg border bg-muted/30 p-4">
							<div className="font-semibold text-foreground text-sm">
								Đồng hồ gợi ý 40 phút
							</div>
							<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
								Áp dụng nhẹ nhàng cho 4 phần đầu; hết giờ hệ thống chỉ nhắc nhẹ,
								không làm mất bài.
							</p>
						</div>
					</div>

					<div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3.5 text-muted-foreground text-xs leading-relaxed">
						<Mic
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0 text-foreground"
						/>
						<span>
							Phần Speaking sử dụng micro (audio-only, không cần camera). Nếu
							thiết bị hiện chưa có micro, bạn vẫn có thể chọn bỏ qua phần
							Speaking và nộp 4 kỹ năng còn lại.
						</span>
					</div>

					<div className="flex flex-wrap items-center gap-3 pt-1">
						<Button
							type="button"
							size="lg"
							data-testid="start-placement-test-btn"
							onClick={() => goToStep("listening")}
						>
							<span>Bắt đầu làm bài</span>
							<ArrowRight aria-hidden="true" className="size-4" />
						</Button>
						<Link
							to="/"
							className="inline-flex h-10 items-center gap-1.5 rounded-md border border-input bg-background px-4 font-medium text-foreground text-sm shadow-xs transition-colors hover:bg-accent"
						>
							<ArrowLeft aria-hidden="true" className="size-4" />
							<span>Về trang chủ</span>
						</Link>
					</div>
				</CardContent>
			</Card>
		);
	}

	const isTimedStep = PLACEMENT_TIMED_STEPS.has(draft.step);
	const minWords = writingPart.minWords || 50;
	const maxWords = Math.max(minWords, writingPart.maxWords || 80);
	const writingWordCount = countPlacementWords(draft.writingText);
	const writingLines = writingPart.promptBody
		.split("\n")
		.filter((l) => l.trim().length > 0);
	const effectiveWritingLines =
		writingLines.length > 0
			? writingLines
			: [
					"Hãy viết một đoạn văn ngắn bằng tiếng Anh để giới thiệu bản thân, công việc hoặc sở thích của bạn trong đời sống hằng ngày.",
				];

	const effectiveSpeakingMode: "none" | "skipped" | "upload" = recordedAudio
		? "upload"
		: draft.speakingMode;

	return (
		<div data-testid="placement-runner" className="mx-auto max-w-4xl space-y-6">
			{/* Header bar: progress + timer + step tabs */}
			<header className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<span
						data-testid="placement-progress-counter"
						className="font-medium text-foreground text-sm tabular-nums"
					>
						Đã trả lời {progress.answered}/{progress.total} câu khách quan
					</span>

					<span
						data-testid="placement-timer-badge"
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium font-mono text-xs tabular-nums",
							!isTimedStep
								? "border-border bg-muted text-muted-foreground"
								: remainingTimerSeconds === 0
									? "border-destructive/40 bg-destructive-soft text-destructive"
									: remainingTimerSeconds <= 300
										? "border-warn/40 bg-warn-soft text-warn"
										: "border-border bg-muted/50 text-foreground",
						)}
					>
						<Clock aria-hidden="true" className="size-3.5" />
						{!isTimedStep
							? "Speaking · Không tính vào 40 phút"
							: remainingTimerSeconds > 0
								? `Gợi ý: ${formatPlacementClock(remainingTimerSeconds)}`
								: "Đã hết 40:00 gợi ý"}
					</span>
				</div>

				<div
					role="tablist"
					aria-label="5 phần bài kiểm tra đầu vào"
					className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground"
				>
					{PLACEMENT_SKILL_STEPS.map((skill) => {
						const isActive = draft.step === skill.id;
						return (
							<button
								key={skill.id}
								type="button"
								role="tab"
								aria-selected={isActive}
								data-testid={`placement-tab-${skill.id}`}
								onClick={() => {
									if (skill.id !== draft.step) goToStep(skill.id);
								}}
								className={cn(
									"inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 font-medium text-xs transition-[color,box-shadow] sm:text-sm",
									isActive
										? "bg-background text-foreground shadow-xs"
										: "hover:text-foreground",
								)}
							>
								{skill.shortLabel}
							</button>
						);
					})}
				</div>

				{isTimedStep && remainingTimerSeconds === 0 ? (
					<p
						role="status"
						className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-foreground text-xs"
					>
						Đã hết 40 phút gợi ý cho 4 phần đầu — bạn vẫn có thể hoàn thành câu
						trả lời và nộp bài bình thường.
					</p>
				) : null}

				{stepSwitchError ? (
					<p
						role="alert"
						className="rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-destructive text-xs"
					>
						{stepSwitchError}
					</p>
				) : null}
			</header>

			{/* Active step body */}
			{draft.step === "listening" ? (
				<>
					<PlacementListeningStep
						title={listeningPart.title}
						clips={listeningPart.clips}
						plays={draft.plays}
						onRecordPlay={(clipId) =>
							setDraft((prev) => ({
								...prev,
								plays: {
									...prev.plays,
									[clipId]: (prev.plays[clipId] ?? 0) + 1,
								},
							}))
						}
						onRefundPlay={(clipId) =>
							setDraft((prev) => ({
								...prev,
								plays: {
									...prev.plays,
									[clipId]: Math.max(0, (prev.plays[clipId] ?? 0) - 1),
								},
							}))
						}
						questionNumbers={questionNumbers}
						answers={draft.answers.listening}
						onAnswerChange={(qId, val) =>
							setDraft((prev) => ({
								...prev,
								answers: {
									...prev.answers,
									listening: { ...prev.answers.listening, [qId]: val },
								},
							}))
						}
					/>
					<div className="flex items-center justify-end gap-3">
						<Button type="button" onClick={() => goToStep("vocab-grammar")}>
							<span>Tiếp tục: Grammar &amp; Vocabulary</span>
							<ArrowRight aria-hidden="true" className="size-4" />
						</Button>
					</div>
				</>
			) : null}

			{draft.step === "vocab-grammar" ? (
				<>
					<div className="space-y-6" data-testid="placement-step-vg">
						<Card>
							<CardHeader>
								<CardDescription className="font-mono text-[11px] uppercase tracking-[0.16em]">
									Phần 2 / 5 · Ngữ pháp &amp; Từ vựng
								</CardDescription>
								<CardTitle className="text-xl">
									{stripInlineCefrLabel(vgPart.title) || "Grammar & Vocabulary"}
								</CardTitle>
								<CardDescription>
									Chọn một đáp án đúng nhất để hoàn thành câu hoặc chọn
									nghĩa/cách dùng phù hợp.
								</CardDescription>
							</CardHeader>
						</Card>

						<div className="space-y-4">
							{vgPart.questions.map((q) => (
								<PlacementMcqQuestionCard
									key={q.id}
									questionId={q.id}
									questionNumber={questionNumbers.get(q.id) ?? 1}
									prompt={q.prompt}
									options={q.options}
									value={draft.answers.vocabGrammar[q.id] ?? null}
									kindBadge={q.kind === "vocab" ? "Từ vựng" : "Ngữ pháp"}
									onChange={(optIdx) =>
										setDraft((prev) => ({
											...prev,
											answers: {
												...prev.answers,
												vocabGrammar: {
													...prev.answers.vocabGrammar,
													[q.id]: optIdx,
												},
											},
										}))
									}
								/>
							))}
						</div>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => goToStep("listening")}
						>
							<ArrowLeft aria-hidden="true" className="size-4" />
							<span>Quay lại Listening</span>
						</Button>
						<Button type="button" onClick={() => goToStep("reading")}>
							<span>Tiếp tục: Reading</span>
							<ArrowRight aria-hidden="true" className="size-4" />
						</Button>
					</div>
				</>
			) : null}

			{draft.step === "reading" ? (
				<>
					<PlacementReadingStep
						title={readingPart.title}
						passages={readingPart.passages}
						questionNumbers={questionNumbers}
						answers={draft.answers.reading}
						onAnswerChange={(qId, optIdx) =>
							setDraft((prev) => ({
								...prev,
								answers: {
									...prev.answers,
									reading: { ...prev.answers.reading, [qId]: optIdx },
								},
							}))
						}
					/>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => goToStep("vocab-grammar")}
						>
							<ArrowLeft aria-hidden="true" className="size-4" />
							<span>Quay lại Grammar &amp; Vocabulary</span>
						</Button>
						<Button type="button" onClick={() => goToStep("writing")}>
							<span>Tiếp tục: Writing</span>
							<ArrowRight aria-hidden="true" className="size-4" />
						</Button>
					</div>
				</>
			) : null}

			{draft.step === "writing" ? (
				<>
					<Card data-testid="placement-step-writing">
						<CardHeader>
							<CardDescription className="font-mono text-[11px] uppercase tracking-[0.16em]">
								Phần 4 / 5 · Viết (Writing)
							</CardDescription>
							<CardTitle className="text-xl">
								{stripInlineCefrLabel(writingPart.promptTitle) ||
									"Bài viết ngắn"}
							</CardTitle>
						</CardHeader>

						<CardContent className="space-y-5">
							<div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-foreground text-sm leading-relaxed">
								{effectiveWritingLines.map((line, idx) => (
									<p key={`w-line-${idx}`}>{line}</p>
								))}
								<p className="pt-1 text-muted-foreground text-xs">
									Độ dài gợi ý: {minWords}–{maxWords} từ. Giáo viên sẽ chấm trực
									tiếp bài viết của bạn.
								</p>
							</div>

							<div className="space-y-2">
								<label
									htmlFor="placementWritingTextarea"
									className="font-medium text-foreground text-sm"
								>
									Bài viết của bạn
								</label>
								<Textarea
									id="placementWritingTextarea"
									data-testid="placement-writing-textarea"
									rows={9}
									maxLength={PLACEMENT_WRITING_TEXT_MAX}
									placeholder="Viết câu trả lời tiếng Anh của bạn tại đây..."
									value={draft.writingText}
									onChange={(e) =>
										setDraft((prev) => ({
											...prev,
											writingText: e.target.value,
										}))
									}
									className="min-h-44"
								/>

								<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
									<span
										data-testid="placement-writing-word-count"
										className={cn(
											"inline-flex items-center rounded-full px-2.5 py-0.5 font-medium tabular-nums",
											writingWordCount === 0
												? "bg-muted text-muted-foreground"
												: writingWordCount < minWords
													? "bg-warn-soft text-warn"
													: "bg-success-soft text-success",
										)}
									>
										{writingWordCount} / {minWords}–{maxWords} từ
									</span>
									<span className="text-muted-foreground">
										{writingWordCount === 0
											? "Bạn chưa nhập nội dung."
											: writingWordCount < minWords
												? `Cần thêm khoảng ${minWords - writingWordCount} từ để đạt mốc gợi ý.`
												: writingWordCount > maxWords
													? "Bài hơi dài hơn gợi ý, vẫn hợp lệ để nộp."
													: "Đạt độ dài gợi ý."}
									</span>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => goToStep("reading")}
						>
							<ArrowLeft aria-hidden="true" className="size-4" />
							<span>Quay lại Reading</span>
						</Button>
						<Button type="button" onClick={() => goToStep("speaking")}>
							<span>Tiếp tục: Speaking &amp; Nộp bài</span>
							<ArrowRight aria-hidden="true" className="size-4" />
						</Button>
					</div>
				</>
			) : null}

			{draft.step === "speaking" ? (
				<>
					<PlacementSpeakingStep
						tasks={speakingPart.tasks}
						speakingMode={effectiveSpeakingMode}
						recordedAudio={recordedAudio}
						onRecordedAudioChange={(next) => {
							setRecordedAudio(next);
							if (next) {
								setDraft((prev) => ({ ...prev, speakingMode: "none" }));
							}
						}}
						onSkipSpeaking={() => {
							setRecordedAudio(null);
							setConfirmUnanswered(null);
							setDraft((prev) => ({ ...prev, speakingMode: "skipped" }));
						}}
						onBusyChange={setIsSpeakingBusy}
					/>

					{submitError ? (
						<div
							role="alert"
							className="rounded-lg border border-destructive/40 bg-destructive-soft p-3.5 text-destructive text-sm"
						>
							{submitError}
						</div>
					) : null}

					{confirmUnanswered ? (
						<div
							role="alertdialog"
							aria-labelledby="placement-confirm-title"
							data-testid="placement-unanswered-confirm"
							className="space-y-3 rounded-xl border border-warn/40 bg-warn-soft p-4"
						>
							<p
								id="placement-confirm-title"
								className="font-semibold text-foreground text-sm"
							>
								Một số phần vẫn đang bỏ trống
							</p>
							<p className="text-muted-foreground text-sm leading-relaxed">
								Hiện tại bài làm của bạn{" "}
								{[
									confirmUnanswered.unansweredObjective > 0
										? `còn ${confirmUnanswered.unansweredObjective} câu khách quan chưa trả lời`
										: null,
									confirmUnanswered.writingEmpty
										? "phần Writing đang để trống"
										: null,
									confirmUnanswered.speakingUnrecorded
										? "phần Speaking chưa ghi âm"
										: null,
								]
									.filter(Boolean)
									.join(", ")}
								. Bạn vẫn muốn nộp bài ngay chứ?
							</p>
							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setConfirmUnanswered(null)}
								>
									Quay lại kiểm tra
								</Button>
								<Button
									type="button"
									size="sm"
									disabled={isSubmitting}
									onClick={() =>
										void executeSubmission(
											confirmUnanswered.resolvedSpeakingMode,
										)
									}
								>
									{isSubmitting ? "Đang nộp bài..." : "Vẫn nộp bài ngay"}
								</Button>
							</div>
						</div>
					) : null}

					<div className="flex flex-wrap items-center justify-between gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => goToStep("writing")}
						>
							<ArrowLeft aria-hidden="true" className="size-4" />
							<span>Quay lại Writing</span>
						</Button>

						<Button
							type="button"
							size="lg"
							data-testid="submit-placement-test-btn"
							disabled={isSubmitting || isSpeakingBusy}
							onClick={handleRequestSubmit}
						>
							<Send aria-hidden="true" className="size-4" />
							<span>
								{isSubmitting
									? "Đang nộp bài..."
									: "Hoàn thành & Nộp bài 5 kỹ năng"}
							</span>
						</Button>
					</div>
				</>
			) : null}
		</div>
	);
}
