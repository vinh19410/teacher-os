import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
	ASSIGNMENT_TEST_PRESETS,
	QUIZ_ESSAY_MAX,
	WRITING_MIN_WORDS,
} from "@teacher-os/api/contracts";
import {
	buildQuizParts,
	isAnsweredValue,
} from "@teacher-os/api/lib/quiz-parts";
import { countWords } from "@teacher-os/api/lib/word-count";
import { QuizEssayFooter } from "@teacher-os/ui/components/quiz/quiz-essay-footer";
import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import { scrollToQuestion } from "@teacher-os/ui/components/quiz/quiz-question-item";
import { QuizSpeakingFooter } from "@teacher-os/ui/components/quiz/quiz-speaking-footer";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Loader from "@/components/loader";
import {
	QuizResumeDialog,
	QuizStartDialog,
	QuizSubmitGuardDialog,
} from "@/components/quiz/quiz-lifecycle-dialogs";
import {
	isReadingSplitPane,
	QuizReadingSplitLayout,
} from "@/components/quiz/quiz-reading-layout";
import { QuizRuntimeHeader } from "@/components/quiz/quiz-runtime-header";
import {
	SpeakingGuideCard,
	SpeakingSubmissionPanel,
} from "@/components/quiz/speaking-submission-panel";
import { isHttpError, reauth, studentQueryClient } from "@/lib/query-client";
import {
	quizAttemptMirrorKey,
	useQuizAttemptSnapshot,
	useQuizAttemptStore,
} from "@/lib/quiz-attempt-store";
import {
	patchQuizAnswer,
	patchQuizEssay,
	quizDetailQueryOptions,
	submitQuizAttempt,
	useStartQuizAttempt,
	useStudentQuizDetail,
} from "@/lib/repos/quiz";

/** Drain halt (401/409 đã tự xử lý reauth/redirect) — bỏ qua POST submit. */
class QuizSubmitSkippedError extends Error {
	constructor() {
		super("quiz autosave halted before submit");
	}
}

/** URL summary của attempt (route Phase 4) — redirect cứng full-document. */
const attemptSummaryHref = (attemptId: string): string =>
	`/learn/quizzes/attempt/${attemptId}`;

export const Route = createFileRoute("/_auth/learn/quizzes/$assignmentId")({
	loader: async ({ params: { assignmentId } }) => {
		const detail = await studentQueryClient.ensureQueryData(
			quizDetailQueryOptions(assignmentId),
		);
		// Đã nộp (tab khác / lượt vào trước) → thẳng summary, không vào take.
		if (detail.attempt?.status === "submitted") {
			// Mirror của attempt đã đóng là rác — xoá ngay kẻo tích tụ
			// (code-review F6: orphan key sau cross-tab submit).
			try {
				localStorage.removeItem(quizAttemptMirrorKey(detail.attempt.id));
			} catch {
				// Storage hỏng/blocked — redirect vẫn ưu tiên.
			}
			throw redirect({ href: attemptSummaryHref(detail.attempt.id) });
		}
		// Snapshot answers lúc LOAD — baseline cho resume reconciliation;
		// refetch sau đó không dùng lại (đè answers cục bộ mới hơn của học viên).
		// Đề Writing (#304) autosave vào cột `essay` riêng, không vào map
		// `answers` — resume baseline lấy từ đó với key `0`.
		return {
			serverAnswers:
				detail.skill === "writing"
					? detail.attempt?.essay
						? { "0": detail.attempt.essay }
						: {}
					: (detail.attempt?.answers ?? {}),
		};
	},
	component: QuizTakePage,
	errorComponent: QuizTakeError,
});

function QuizTakeError({ error }: { error: unknown }) {
	const notFound = isHttpError(error) && error.status === 404;
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
			<h1 className="font-display font-semibold">
				{notFound ? "Không tìm thấy bài tập" : "Không tải được bài tập"}
			</h1>
			<p className="max-w-sm text-muted-fg text-sm">
				{notFound
					? "Bài tập này không còn giao cho bạn hoặc đã bị gỡ."
					: "Đã có lỗi khi tải đề. Vui lòng thử lại."}
			</p>
			<a
				href="/"
				className="text-accent-blue text-sm underline-offset-4 hover:underline"
			>
				Về trang chủ
			</a>
		</div>
	);
}

function QuizTakePage() {
	const { assignmentId } = Route.useParams();
	const { serverAnswers } = Route.useLoaderData();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const quizQuery = useStudentQuizDetail(assignmentId);
	const detail = quizQuery.data ?? null;
	const attempt = detail?.attempt ?? null;
	const attemptId = attempt?.id ?? null;

	const [resumeConfirmed, setResumeConfirmed] = useState(false);
	const [guardOpen, setGuardOpen] = useState(false);
	const [currentQuestion, setCurrentQuestion] = useState<number | null>(null);
	const [authBanner, setAuthBanner] = useState(false);
	// Speaking (#305): đang upload/xử lý file → chặn nộp.
	const [mediaUploading, setMediaUploading] = useState(false);

	const startMutation = useStartQuizAttempt(assignmentId);
	const serverHasAnswers = Object.keys(serverAnswers).length > 0;
	// Dialog resume chỉ khi vào lại attempt đang làm ĐÃ có answers trên server
	// (Selfomy parity); start mới thì vào thẳng paper.
	const needsResumeDialog =
		attempt !== null &&
		attempt.status === "in_progress" &&
		serverHasAnswers &&
		!resumeConfirmed;
	// Store chỉ tạo khi attempt đang chạy — attempt derive từ `detail` nên
	// store luôn được tạo SAU khi biết skill (isWriting) — không có cửa sổ
	// store giữ sai sender/clamp (red-team K).
	const storeActive =
		attempt !== null && attempt.status === "in_progress" && !needsResumeDialog;
	const isWriting = detail?.skill === "writing";
	const isSpeaking = detail?.skill === "speaking";
	// File bài nói đọc thẳng từ cache take payload — panel ghi cache khi
	// upload/xoá, không giữ bản sao state dễ lệch server (#305).
	const media = attempt?.media ?? null;
	const speakingPartLabel = isSpeaking
		? (ASSIGNMENT_TEST_PRESETS.speaking?.slots.find(
				(slot) => slot.part === detail?.part,
			)?.label ?? null)
		: null;

	const store = useQuizAttemptStore({
		attemptId: storeActive ? attemptId : null,
		serverAnswers,
		send: isWriting
			? (_q, value, opts) => patchQuizEssay(attemptId ?? "", value, opts)
			: (q, value, opts) => patchQuizAnswer(attemptId ?? "", q, value, opts),
		valueMax: isWriting ? QUIZ_ESSAY_MAX : undefined,
		onAuthError: () => {
			setAuthBanner(true);
			// reauth() giữ URL hiện tại làm returnUrl — quay lại đúng take screen.
			reauth();
		},
		onAlreadySubmitted: () => {
			if (attemptId) window.location.assign(attemptSummaryHref(attemptId));
		},
	});
	const snapshot = useQuizAttemptSnapshot(store);
	const storeRef = useRef(store);
	storeRef.current = store;

	const parts = useMemo(
		() =>
			buildQuizParts(
				detail?.questions ?? [],
				detail?.type ?? "",
				detail?.intro ?? "",
			),
		[detail?.questions, detail?.type, detail?.intro],
	);
	const allQuestions = useMemo(
		() => parts.flatMap((part) => part.questions),
		[parts],
	);
	// Trước khi store tồn tại (resume chưa confirm), UI đọc server answers —
	// string index vẫn tra cứu được theo key số ở runtime.
	const answers = store ? snapshot.answers : serverAnswers;
	const unansweredCount = allQuestions.filter(
		({ q }) => !isAnsweredValue(answers[q]),
	).length;
	// Đếm từ Writing (#304): essay đi qua store với key `0` như mọi answers.
	const essayText = answers[0] ?? "";
	const wordCount = countWords(essayText);
	const minWords = isWriting
		? (WRITING_MIN_WORDS[detail?.part ?? ""] ?? null)
		: null;
	// Guard nộp Writing: bài trống hoặc thiếu từ chỉ CẢNH BÁO qua dialog,
	// học viên vẫn xác nhận nộp được (user chốt) — khác logic unansweredCount.
	const essayEmpty = essayText.trim() === "";
	const essayGuardOpen =
		isWriting && (essayEmpty || (minWords !== null && wordCount < minWords));

	const submitMutation = useMutation({
		// Drain-before-submit (RT#7): cancel debounce + flush pending + await
		// mọi PATCH in-flight TRƯỚC khi POST submit.
		mutationFn: async (): Promise<{ attemptId: string }> => {
			const current = storeRef.current;
			if (current === null) throw new Error("No active attempt to submit");
			await current.drain();
			// Autosave đã halt (401 đang reauth / 409 đang redirect) — POST
			// submit lúc này chỉ đua với redirect (code-review F5).
			if (current.getHalted() !== null) {
				throw new QuizSubmitSkippedError();
			}
			await submitQuizAttempt(current.attemptId);
			return { attemptId: current.attemptId };
		},
		onSuccess: ({ attemptId: submittedId }) => {
			storeRef.current?.finalize();
			void queryClient.invalidateQueries({ queryKey: ["student"] });
			window.location.assign(attemptSummaryHref(submittedId));
		},
		onError: (error) => {
			if (error instanceof QuizSubmitSkippedError) return;
			// Speaking (#305): server chặn nộp khi chưa có file / file vừa đổi
			// ở tab khác — refetch để panel hiện đúng file trên server.
			if (
				isHttpError(error) &&
				(error.code === "MEDIA_REQUIRED" || error.code === "MEDIA_CONFLICT")
			) {
				void queryClient.invalidateQueries({
					queryKey: ["student", "quiz", assignmentId],
				});
				toast.error(
					error.code === "MEDIA_REQUIRED"
						? "Bạn cần tải file bài nói lên trước khi nộp"
						: "File bài nói vừa thay đổi — hãy thử nộp lại",
				);
				return;
			}
			toast.error("Không nộp được bài", {
				description:
					isHttpError(error) && error.status === 401
						? "Phiên đăng nhập đã hết hạn."
						: "Vui lòng kiểm tra kết nối rồi thử lại.",
			});
		},
	});

	const handleAnswer = (q: number, value: string) => {
		store?.setAnswer(q, value);
	};
	const handleSelectQuestion = (q: number) => {
		setCurrentQuestion(q);
		scrollToQuestion(q);
	};
	const handleSubmitClick = () => {
		if (essayGuardOpen || unansweredCount > 0) {
			setGuardOpen(true);
			return;
		}
		submitMutation.mutate();
	};

	// RT red-team G: sau khi rời take screen (store dispose flush PATCH cuối),
	// đánh dấu query detail stale để lần vào lại bằng SPA nav trong cửa sổ
	// staleTime 60s loader đọc `attempt.essay`/answers MỚI từ server — nếu
	// không, cache cũ hiện textarea trống dù server còn bài (writing khuếch
	// đại vì bài dài). Inactive query chỉ đánh dấu stale; refetch xảy ra ở
	// mount kế tiếp sau khi PATCH đã kịp lên server.
	useEffect(() => {
		return () => {
			void queryClient.invalidateQueries({
				queryKey: ["student", "quiz", assignmentId],
			});
		};
	}, [assignmentId, queryClient]);

	useEffect(() => {
		if (store === null) return;
		const flushKeepalive = () => store.flush({ keepalive: true });
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") flushKeepalive();
		};
		window.addEventListener("pagehide", flushKeepalive);
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			window.removeEventListener("pagehide", flushKeepalive);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [store]);

	// beforeunload guard khi còn thay đổi chưa flush (RT#14).
	useEffect(() => {
		if (store === null) return;
		const handler = (event: BeforeUnloadEvent) => {
			if (store.isDirty()) {
				event.preventDefault();
				event.returnValue = "";
			}
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [store]);

	// Attempt đã submitted (refetch phát hiện tab khác nộp) → summary.
	useEffect(() => {
		if (attempt?.status === "submitted" && attemptId) {
			window.location.assign(attemptSummaryHref(attemptId));
		}
	}, [attempt?.status, attemptId]);

	if (quizQuery.isPending || detail === null) {
		return <Loader />;
	}

	// Chưa start: gate card + dialog xác nhận.
	if (attempt === null) {
		return (
			<div className="flex min-h-svh flex-col bg-surface/30">
				<QuizRuntimeHeader
					title={detail.title}
					saveState={null}
					onSubmitClick={null}
				/>
				<main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center px-4 py-8">
					<div className="rounded-[var(--radius-lg)] border border-line bg-bg p-6">
						<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
							Bài kiểm tra
						</p>
						<h2 className="mt-1 font-display font-semibold text-fg">
							{detail.title}
						</h2>
						<p className="mt-2 text-muted-fg text-sm">
							{isSpeaking ? (
								<>
									Bài nói
									{speakingPartLabel && ` · ${speakingPartLabel}`} · nộp 1 file
									audio/video (tối đa 50 MB) · Band {detail.band}
								</>
							) : isWriting ? (
								<>
									Bài viết
									{minWords !== null && ` · tối thiểu ${minWords} từ`} · Band{" "}
									{detail.band}
								</>
							) : (
								<>
									{allQuestions.length} câu hỏi · Band {detail.band}
								</>
							)}
						</p>
						<p className="mt-1 text-muted-fg text-sm">
							Bài làm được lưu tự động trong khi bạn làm.
						</p>
					</div>
				</main>
				<QuizStartDialog
					open
					starting={startMutation.isPending}
					onStart={() =>
						startMutation.mutate(undefined, {
							onError: (error) => {
								if (isHttpError(error) && error.status === 409) {
									void queryClient.invalidateQueries({
										queryKey: ["student", "quiz", assignmentId],
									});
									return;
								}
								toast.error("Không bắt đầu được bài làm", {
									description: "Vui lòng kiểm tra kết nối rồi thử lại.",
								});
							},
						})
					}
					onCancel={() => {
						void navigate({ to: "/" });
					}}
				/>
			</div>
		);
	}

	const submitDisabled =
		submitMutation.isPending ||
		snapshot.halted !== null ||
		!storeActive ||
		(isSpeaking && (media === null || mediaUploading));
	// Writing thay navigator số câu bằng footer đếm từ (#304) — giữ testid
	// navigator-progress nên helper e2e openPaper dùng chung được.
	const navigator = isSpeaking ? (
		<QuizSpeakingFooter hasMedia={media !== null} />
	) : isWriting ? (
		<QuizEssayFooter text={essayText} minWords={minWords} />
	) : (
		<QuizNavigator
			parts={parts}
			answers={answers}
			current={currentQuestion}
			onSelect={handleSelectQuestion}
		/>
	);
	// Reading có passage → split-pane: bài đọc trái, bài làm phải, cuộn độc
	// lập; skill khác / passage rỗng giữ 1 cột như cũ.
	const splitPane = isReadingSplitPane(detail.skill, detail.passage);

	return (
		<div className="flex min-h-svh flex-col bg-surface/30">
			<QuizRuntimeHeader
				title={detail.title}
				// Speaking không autosave gì — file lưu ngay khi tải lên.
				saveState={store && !isSpeaking ? snapshot.saveState : null}
				onSubmitClick={handleSubmitClick}
				submitDisabled={submitDisabled}
			/>
			{authBanner && (
				<div
					role="alert"
					data-testid="auth-error-banner"
					className="border-danger/30 border-b bg-danger-soft px-4 py-2 text-danger text-sm"
				>
					Phiên đăng nhập đã hết hạn — bài làm của bạn được giữ lại. Đang chuyển
					đến trang đăng nhập…
				</div>
			)}
			{splitPane ? (
				<QuizReadingSplitLayout passage={detail.passage} navigator={navigator}>
					<div className="mx-auto w-full max-w-[720px]">
						<QuizPaper
							detail={detail}
							parts={parts}
							answers={answers}
							onAnswer={handleAnswer}
							currentQuestion={currentQuestion}
							hidePassage
						/>
					</div>
				</QuizReadingSplitLayout>
			) : (
				<>
					<main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6">
						<QuizPaper
							detail={detail}
							parts={parts}
							answers={answers}
							onAnswer={handleAnswer}
							currentQuestion={currentQuestion}
						/>
						{isSpeaking && attemptId && (
							<div className="mt-6 flex flex-col gap-4">
								<SpeakingGuideCard part={detail.part} />
								<SpeakingSubmissionPanel
									assignmentId={assignmentId}
									attemptId={attemptId}
									media={media}
									disabled={
										submitMutation.isPending ||
										snapshot.halted !== null ||
										!storeActive
									}
									onUploadingChange={setMediaUploading}
									onAlreadySubmitted={() =>
										window.location.assign(attemptSummaryHref(attemptId))
									}
									onAuthError={() => {
										setAuthBanner(true);
										reauth();
									}}
								/>
								{media === null && (
									<p className="text-muted-fg text-sm">
										Tải file bài nói lên để nộp bài.
									</p>
								)}
							</div>
						)}
					</main>
					{navigator}
				</>
			)}
			{needsResumeDialog && (
				<QuizResumeDialog
					open
					onResume={() => setResumeConfirmed(true)}
					onCancel={() => {
						void navigate({ to: "/" });
					}}
				/>
			)}
			<QuizSubmitGuardDialog
				open={guardOpen}
				unansweredCount={unansweredCount}
				// Copy riêng cho Writing (#304): nộp trống / thiếu từ là cảnh báo,
				// học viên vẫn xác nhận nộp được.
				title={
					isWriting
						? essayEmpty
							? "Bạn chưa viết bài"
							: "Bài viết chưa đủ số từ"
						: undefined
				}
				description={
					isWriting
						? essayEmpty
							? "Bài viết đang trống. Bạn có muốn nộp bài không? Sau khi nộp, bạn không thể sửa bài viết."
							: `Bài viết có ${wordCount}/${minWords ?? 0} từ. Bài thi IELTS thiếu từ sẽ bị trừ điểm. Bạn có muốn nộp bài không? Sau khi nộp, bạn không thể sửa bài viết.`
						: undefined
				}
				onConfirm={() => {
					setGuardOpen(false);
					submitMutation.mutate();
				}}
				onCancel={() => setGuardOpen(false)}
			/>
		</div>
	);
}
