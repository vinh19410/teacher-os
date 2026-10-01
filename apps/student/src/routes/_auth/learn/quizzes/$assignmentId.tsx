import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
	buildQuizParts,
	isAnsweredValue,
} from "@teacher-os/api/lib/quiz-parts";
import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import { scrollToQuestion } from "@teacher-os/ui/components/quiz/quiz-question-item";
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
import { isHttpError, reauth, studentQueryClient } from "@/lib/query-client";
import {
	quizAttemptMirrorKey,
	useQuizAttemptSnapshot,
	useQuizAttemptStore,
} from "@/lib/quiz-attempt-store";
import {
	patchQuizAnswer,
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
		return { serverAnswers: detail.attempt?.answers ?? {} };
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

	const startMutation = useStartQuizAttempt(assignmentId);
	const serverHasAnswers = Object.keys(serverAnswers).length > 0;
	// Dialog resume chỉ khi vào lại attempt đang làm ĐÃ có answers trên server
	// (Selfomy parity); start mới thì vào thẳng paper.
	const needsResumeDialog =
		attempt !== null &&
		attempt.status === "in_progress" &&
		serverHasAnswers &&
		!resumeConfirmed;
	const storeActive =
		attempt !== null && attempt.status === "in_progress" && !needsResumeDialog;

	const store = useQuizAttemptStore({
		attemptId: storeActive ? attemptId : null,
		serverAnswers,
		send: (q, value, opts) => patchQuizAnswer(attemptId ?? "", q, value, opts),
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
		if (unansweredCount > 0) {
			setGuardOpen(true);
			return;
		}
		submitMutation.mutate();
	};

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
							{allQuestions.length} câu hỏi · Band {detail.band}
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
		submitMutation.isPending || snapshot.halted !== null || !storeActive;
	const navigator = (
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
				saveState={store ? snapshot.saveState : null}
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
				onConfirm={() => {
					setGuardOpen(false);
					submitMutation.mutate();
				}}
				onCancel={() => setGuardOpen(false)}
			/>
		</div>
	);
}
