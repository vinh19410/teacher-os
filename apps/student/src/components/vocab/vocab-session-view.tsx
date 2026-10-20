import type { VocabSessionData } from "@teacher-os/api/contracts";
import { LearnSession } from "@teacher-os/api/srs/learn-session";
import {
	type QuizResponse,
	ReviewSession,
} from "@teacher-os/api/srs/review-session";
import type { RandomSource } from "@teacher-os/api/srs/rng";
import { Button } from "@teacher-os/ui/components/button";
import { useCallback, useEffect, useRef, useState } from "react";
import { isHttpError } from "@/lib/query-client";
import {
	fetchVocabAudioObjectUrl,
	postVocabAnswer,
	postVocabLearnCommit,
} from "@/lib/repos/vocab";
import { PromptListeningChoice } from "./prompt-listening-choice";
import { PromptMeaningChoice } from "./prompt-meaning-choice";
import { PromptSelfCheck } from "./prompt-self-check";
import { PromptTyping } from "./prompt-typing";
import { PromptWordChoice } from "./prompt-word-choice";
import { VocabFeedbackPanel } from "./vocab-feedback-panel";
import { VocabPronunciationButtons } from "./vocab-pronunciation-buttons";
import { VocabSummary } from "./vocab-summary";
import { WrongStreakOverlay } from "./wrong-streak-overlay";

interface EngineHolder {
	key: string;
	mode: "learn" | "review";
	learn: LearnSession | null;
	review: ReviewSession | null;
}

interface PendingPersistTask {
	clientLogId: string;
	cardId: string;
	execute: () => Promise<void>;
}

export function VocabSessionView({
	sessionData,
	sessionNonce = 0,
	mode,
	rng,
	onExit,
}: {
	sessionData: VocabSessionData;
	sessionNonce?: number;
	mode?: "learn" | "review";
	rng?: RandomSource;
	onExit: () => void;
}) {
	const [, setRenderTick] = useState(0);
	const bumpRender = useCallback(() => setRenderTick((n) => n + 1), []);

	const [selectedOption, setSelectedOption] = useState<string | null>(null);
	const [persistStatus, setPersistStatus] = useState<
		"idle" | "saving" | "error"
	>("idle");
	const [deletedDialogOpen, setDeletedDialogOpen] = useState(false);
	const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

	const pendingTasksRef = useRef<PendingPersistTask[]>([]);
	// Phản hồi người dùng bấm trong lúc POST chưa xong KHÔNG bị bỏ im lặng —
	// buffer và replay sau khi persist xong (tránh UI kẹt prompt, F9).
	const pendingRespondRef = useRef<QuizResponse | null>(null);

	const runPendingTasks = useCallback(
		async (holder: EngineHolder) => {
			if (pendingTasksRef.current.length === 0) {
				setPersistStatus("idle");
				return;
			}
			setPersistStatus("saving");
			while (pendingTasksRef.current.length > 0) {
				const task = pendingTasksRef.current[0]!;
				try {
					await task.execute();
					pendingTasksRef.current.shift();
				} catch (err) {
					if (isHttpError(err) && err.status === 404) {
						pendingTasksRef.current.shift();
						holder.learn?.removeCard(task.cardId);
						holder.review?.removeCard(task.cardId);
						setDeletedDialogOpen(true);
						setPersistStatus("idle");
						bumpRender();
						return;
					}
					setPersistStatus("error");
					return;
				}
			}
			setPersistStatus("idle");
		},
		[bumpRender],
	);

	// Engine instance created ONCE per (deck.id, sessionNonce, mode) (red-team F14).
	// mode phải nằm trong key: đổi ?mode=learn ↔ ?mode=review trên cùng mount
	// không remount route — engine cũ phải được tái tạo theo chế độ mới.
	const engineRef = useRef<EngineHolder | null>(null);
	const instanceKey = `${sessionData.deck.id}:${sessionNonce}:${mode ?? "auto"}`;
	if (!engineRef.current || engineRef.current.key !== instanceKey) {
		const hasNewCards = sessionData.cards.some((c) => c.state === "new");
		// mode === "review" → luôn ôn; mode === "learn" mà hết từ mới → fallback
		// review (không chạy engine rỗng); không có mode → hành vi cũ (tự chọn).
		const useLearn = mode === "review" ? false : hasNewCards;
		const holder: EngineHolder = {
			key: instanceKey,
			mode: useLearn ? "learn" : "review",
			learn: null,
			review: null,
		};
		// Engine mới (đổi mode cùng mount) không có ngữ cảnh của phản hồi cũ.
		pendingRespondRef.current = null;

		if (useLearn) {
			holder.learn = new LearnSession({
				cards: sessionData.cards,
				pool: sessionData.pool,
				deckId: sessionData.deck.id,
				lang: sessionData.deck.lang,
				rng,
				onCommit: (ev) => {
					const clientLogId = crypto.randomUUID();
					pendingTasksRef.current.push({
						clientLogId,
						cardId: ev.card.id,
						execute: async () => {
							await postVocabLearnCommit({
								clientLogId,
								cardId: ev.card.id,
								gradeGood: ev.gradeGood,
								durationMs: ev.durationMs,
							});
						},
					});
				},
			});
		} else {
			const reviewCards = ReviewSession.selectReviewCards(
				sessionData.cards,
				Date.now(),
				{ allowAllWhenNoneDue: true },
			);
			holder.review = new ReviewSession({
				cards: reviewCards,
				pool: sessionData.pool,
				deckId: sessionData.deck.id,
				lang: sessionData.deck.lang,
				rng,
				onFirstResult: (ev) => {
					const clientLogId = crypto.randomUUID();
					pendingTasksRef.current.push({
						clientLogId,
						cardId: ev.card.id,
						execute: async () => {
							await postVocabAnswer({
								clientLogId,
								cardId: ev.card.id,
								correct: ev.result === "correct",
								durationMs: ev.durationMs,
							});
						},
					});
				},
			});
		}
		engineRef.current = holder;
	}

	const holder = engineRef.current;
	const isLearn = holder.mode === "learn";
	const learn = holder.learn;
	const review = holder.review;

	const finished = isLearn
		? (learn?.finished ?? true)
		: (review?.finished ?? true);
	const done = isLearn ? (learn?.done ?? 0) : (review?.done ?? 0);
	const total = isLearn ? (learn?.total ?? 0) : (review?.total ?? 0);
	const feedback = isLearn
		? (learn?.feedback ?? null)
		: (review?.feedback ?? null);
	const prompt = isLearn ? (learn?.prompt ?? null) : (review?.prompt ?? null);
	const currentCard = isLearn
		? (learn?.currentCard ?? null)
		: (review?.currentCard ?? null);
	const currentLearnStep = isLearn ? (learn?.currentStep ?? null) : null;
	const showEncouragement = !isLearn && (review?.showEncouragement ?? false);
	const isRevealed = isLearn
		? (learn?.isRevealed ?? false)
		: (review?.isRevealed ?? false);
	const introRevealedOnce = isLearn
		? (learn?.introRevealedOnce ?? false)
		: false;

	const handleRespond = useCallback(
		(response: QuizResponse) => {
			if (persistStatus !== "idle") {
				// Không bỏ im lặng: giữ lại phản hồi mới nhất, replay khi persist xong.
				pendingRespondRef.current = response;
				return;
			}
			if (isLearn && learn) {
				learn.respond(response);
			} else if (review) {
				review.respond(response);
			}
			bumpRender();
			void runPendingTasks(holder).then(() => {
				// Engine đã swap (đổi mode cùng mount) — phản hồi buffer thuộc
				// ngữ cảnh engine cũ, không replay vào engine mới.
				if (engineRef.current !== holder) return;
				const buffered = pendingRespondRef.current;
				if (buffered) {
					pendingRespondRef.current = null;
					handleRespond(buffered);
				}
			});
		},
		[
			bumpRender,
			holder,
			isLearn,
			learn,
			persistStatus,
			review,
			runPendingTasks,
		],
	);

	const handleContinue = useCallback(() => {
		if (persistStatus !== "idle" || showEncouragement) return;
		setSelectedOption(null);
		if (isLearn && learn) {
			if (learn.currentStep?.kind === "intro") {
				learn.continueIntro();
			} else {
				learn.continueAfterFeedback();
			}
		} else if (review) {
			review.continueAfterFeedback();
		}
		bumpRender();
		void runPendingTasks(holder);
	}, [
		bumpRender,
		holder,
		isLearn,
		learn,
		persistStatus,
		review,
		runPendingTasks,
		showEncouragement,
	]);

	const handleSkip = useCallback(() => {
		if (persistStatus !== "idle" || showEncouragement || feedback !== null) {
			return;
		}
		setSelectedOption(null);
		if (isLearn && learn) {
			learn.skipCurrentPrompt();
		} else if (review) {
			review.skipCurrentPrompt();
		}
		bumpRender();
	}, [
		bumpRender,
		feedback,
		isLearn,
		learn,
		persistStatus,
		review,
		showEncouragement,
	]);

	// Spec §3 rule 5: selfCheck skips feedback panel and auto-continues after 240ms once persistence succeeds
	useEffect(() => {
		if (
			!isLearn &&
			prompt?.kind === "selfCheck" &&
			feedback !== null &&
			!showEncouragement &&
			persistStatus === "idle"
		) {
			const timer = window.setTimeout(() => {
				handleContinue();
			}, 240);
			return () => window.clearTimeout(timer);
		}
	}, [
		feedback,
		handleContinue,
		isLearn,
		persistStatus,
		prompt?.kind,
		showEncouragement,
	]);

	// Keyboard shortcuts: Enter advances feedback when unblocked; Escape prompts exit confirm
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (deletedDialogOpen || exitConfirmOpen) return;
			if (e.key === "Escape") {
				if (showEncouragement) return; // overlay chặn mọi input tới khi dismiss
				if (!finished) {
					e.preventDefault();
					setExitConfirmOpen(true);
				}
				return;
			}
			if (
				e.key === "Enter" &&
				feedback !== null &&
				persistStatus === "idle" &&
				!showEncouragement
			) {
				e.preventDefault();
				handleContinue();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		deletedDialogOpen,
		exitConfirmOpen,
		feedback,
		finished,
		handleContinue,
		persistStatus,
		showEncouragement,
	]);

	const inputDisabled =
		feedback !== null || showEncouragement || persistStatus !== "idle";

	if (finished) {
		return (
			<VocabSummary
				mode={holder.mode}
				learnSummary={learn?.summary()}
				reviewSummary={review?.summary()}
				onBack={onExit}
			/>
		);
	}

	const progressPct =
		total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

	return (
		<div
			data-testid="vocab-session-view"
			className="mx-auto max-w-2xl space-y-6"
		>
			{/* Header progress */}
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
						{isLearn ? "Học từ mới" : "Ôn tập SRS"} · {sessionData.deck.title}
					</p>
					<p
						data-testid="vocab-session-progress"
						className="mt-1 font-mono text-meta text-xs"
					>
						Tiến độ: {done}/{total}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="vocab-session-exit-btn"
					onClick={() => setExitConfirmOpen(true)}
				>
					Thoát
				</Button>
			</div>

			<div
				role="progressbar"
				aria-valuenow={done}
				aria-valuemin={0}
				aria-valuemax={total}
				className="neu-in h-2 w-full overflow-hidden rounded-full"
			>
				<div
					className="h-full bg-hot transition-all duration-150"
					style={{ width: `${progressPct}%` }}
				/>
			</div>

			{/* Main step / prompt */}
			{isLearn && currentLearnStep?.kind === "intro" && currentCard ? (
				<LearnIntroCard
					card={currentCard}
					isRevealed={isRevealed}
					introRevealedOnce={introRevealedOnce}
					disabled={persistStatus !== "idle"}
					onReveal={() => {
						learn?.reveal();
						bumpRender();
					}}
					onContinue={handleContinue}
				/>
			) : currentCard && prompt ? (
				<>
					{prompt.kind === "meaningChoice" ? (
						<PromptMeaningChoice
							key={`p-${prompt.cardId}-${currentLearnStep?.kind ?? prompt.kind}-${done}`}
							word={currentCard.word}
							ipa={currentCard.ipa}
							prompt={prompt}
							disabled={inputDisabled}
							selectedOption={selectedOption}
							onSelectOption={(opt) => {
								setSelectedOption(opt);
								handleRespond({ type: "option", text: opt });
							}}
							onForgot={() => handleRespond({ type: "forgot" })}
						/>
					) : prompt.kind === "wordChoice" ? (
						<PromptWordChoice
							key={`p-${prompt.cardId}-${currentLearnStep?.kind ?? prompt.kind}-${done}`}
							translation={currentCard.translation}
							prompt={prompt}
							disabled={inputDisabled}
							selectedOption={selectedOption}
							onSelectOption={(opt) => {
								setSelectedOption(opt);
								handleRespond({ type: "option", text: opt });
							}}
							onForgot={() => handleRespond({ type: "forgot" })}
						/>
					) : prompt.kind === "listeningChoice" ? (
						<PromptListeningChoice
							key={`p-${prompt.cardId}-${currentLearnStep?.kind ?? prompt.kind}-${done}`}
							wordId={currentCard.wordId}
							prompt={prompt}
							disabled={inputDisabled}
							selectedOption={selectedOption}
							onSelectOption={(opt) => {
								setSelectedOption(opt);
								handleRespond({ type: "option", text: opt });
							}}
							onForgot={() => handleRespond({ type: "forgot" })}
							onSkip={handleSkip}
						/>
					) : prompt.kind === "typing" ? (
						<PromptTyping
							key={`p-${prompt.cardId}-${currentLearnStep?.kind ?? prompt.kind}-${done}`}
							translation={currentCard.translation}
							prompt={prompt}
							disabled={inputDisabled}
							onSubmitTyped={(typed) =>
								handleRespond({ type: "typed", text: typed })
							}
							onForgot={() => handleRespond({ type: "forgot" })}
						/>
					) : (
						<PromptSelfCheck
							key={`p-${prompt.cardId}-${currentLearnStep?.kind ?? prompt.kind}-${done}`}
							word={currentCard.word}
							ipa={currentCard.ipa}
							translation={currentCard.translation}
							isRevealed={isRevealed}
							disabled={inputDisabled}
							onReveal={() => {
								review?.reveal();
								bumpRender();
							}}
							onRemembered={() => handleRespond({ type: "remembered" })}
							onForgot={() => handleRespond({ type: "forgot" })}
						/>
					)}

					{feedback !== null && prompt.kind !== "selfCheck" ? (
						<VocabFeedbackPanel
							result={feedback}
							word={currentCard.word}
							ipa={currentCard.ipa}
							translation={currentCard.translation}
							persistStatus={persistStatus}
							onContinue={handleContinue}
							onRetryPersist={() => void runPendingTasks(holder)}
							onDiscardPersist={() => {
								pendingTasksRef.current = [];
								setPersistStatus("idle");
							}}
						/>
					) : null}

					{feedback !== null &&
					prompt.kind === "selfCheck" &&
					persistStatus === "error" ? (
						<VocabFeedbackPanel
							result={feedback}
							word={currentCard.word}
							ipa={currentCard.ipa}
							translation={currentCard.translation}
							persistStatus={persistStatus}
							onContinue={handleContinue}
							onRetryPersist={() => void runPendingTasks(holder)}
							onDiscardPersist={() => {
								pendingTasksRef.current = [];
								setPersistStatus("idle");
							}}
						/>
					) : null}
				</>
			) : null}

			<WrongStreakOverlay
				open={showEncouragement}
				onDismiss={() => {
					review?.dismissEncouragement();
					setSelectedOption(null);
					bumpRender();
				}}
			/>

			{/* 404 mid-session dialog (red-team F14) */}
			{deletedDialogOpen ? (
				<div
					role="dialog"
					aria-modal="true"
					data-testid="vocab-deleted-dialog"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
				>
					<div className="neu w-full max-w-md space-y-4 rounded-md p-6">
						<h2 className="font-display font-extrabold text-fg text-xl">
							Bộ từ đã bị xoá hoặc thay đổi
						</h2>
						<p className="text-meta text-sm">
							Giáo viên vừa xoá từ hoặc bộ từ này. Các từ đã lưu trước đó của
							bạn vẫn được giữ nguyên.
						</p>
						<div className="flex justify-end gap-2">
							<Button
								type="button"
								data-testid="vocab-deleted-exit-btn"
								onClick={onExit}
							>
								Về trang từ vựng
							</Button>
						</div>
					</div>
				</div>
			) : null}

			{/* Exit confirmation dialog */}
			{exitConfirmOpen ? (
				<div
					role="dialog"
					aria-modal="true"
					data-testid="vocab-exit-confirm-dialog"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
				>
					<div className="neu w-full max-w-md space-y-4 rounded-md p-6">
						<h2 className="font-display font-extrabold text-fg text-xl">
							Tạm dừng phiên học?
						</h2>
						<p className="text-meta text-sm">
							Các từ đã hoàn thành đều đã được lưu tự động trên hệ thống.
						</p>
						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setExitConfirmOpen(false)}
							>
								Tiếp tục học
							</Button>
							<Button
								type="button"
								data-testid="vocab-confirm-exit-btn"
								onClick={onExit}
							>
								Thoát phiên
							</Button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

function LearnIntroCard({
	card,
	isRevealed,
	introRevealedOnce,
	disabled,
	onReveal,
	onContinue,
}: {
	card: VocabSessionData["cards"][number];
	isRevealed: boolean;
	introRevealedOnce: boolean;
	disabled: boolean;
	onReveal: () => void;
	onContinue: () => void;
}) {
	const [audioUrl, setAudioUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!card.audioKey && !card.hasAudio) {
			setAudioUrl(null);
			return;
		}
		const controller = new AbortController();
		let created: string | null = null;
		fetchVocabAudioObjectUrl(card.wordId, controller.signal)
			.then((url) => {
				if (controller.signal.aborted) {
					URL.revokeObjectURL(url);
					return;
				}
				created = url;
				setAudioUrl(url);
			})
			.catch(() => undefined);
		return () => {
			controller.abort();
			if (created) URL.revokeObjectURL(created);
		};
	}, [card.audioKey, card.hasAudio, card.wordId]);

	return (
		<div data-testid="vocab-learn-intro" className="space-y-6">
			<div className="neu space-y-4 rounded-md p-6 text-center">
				<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
					Làm quen từ mới
				</p>
				<p
					data-testid="vocab-intro-word"
					className="font-display font-extrabold text-3xl text-fg tracking-[-0.03em]"
				>
					{card.word}
				</p>
				{card.ipa ? (
					<p className="font-mono text-meta text-sm">{card.ipa}</p>
				) : null}

				{audioUrl ? (
					<div className="flex justify-center pt-2">
						<VocabPronunciationButtons
							src={audioUrl}
							testIdPrefix="vocab-intro-audio"
							disabled={disabled}
						/>
					</div>
				) : null}

				{isRevealed ? (
					<div className="mt-4 border-line border-t pt-4">
						<p className="font-mono text-[11px] text-meta uppercase tracking-[0.15em]">
							Nghĩa tiếng Việt
						</p>
						<p
							data-testid="vocab-intro-translation"
							className="mt-1 font-semibold text-fg text-xl"
						>
							{card.translation}
						</p>
					</div>
				) : (
					<p className="pt-2 font-mono text-meta text-xs">
						Hãy lật thẻ để xem nghĩa trước khi chuyển sang bước luyện tập
					</p>
				)}
			</div>

			<div className="flex flex-wrap justify-center gap-3">
				<Button
					type="button"
					variant="outline"
					data-testid="vocab-intro-flip-btn"
					disabled={disabled}
					onClick={onReveal}
				>
					{isRevealed ? "Úp thẻ" : "Lật thẻ xem nghĩa"}
				</Button>
				<Button
					type="button"
					data-testid="vocab-intro-continue-btn"
					disabled={disabled || !introRevealedOnce}
					onClick={onContinue}
				>
					Tiếp tục
				</Button>
			</div>
		</div>
	);
}
