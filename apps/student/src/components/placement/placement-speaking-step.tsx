import {
	type PlacementPublishedSpeakingTask,
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
import {
	Mic,
	MicOff,
	RotateCcw,
	SkipForward,
	Square,
	Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
	computeSpeechFallbackTimeoutMs,
	createInitialSpeakingSession,
	formatPlacementClock,
	PLACEMENT_SPEAKING_MAX_BYTES,
	pickSupportedRecorderMime,
	resolveSpeakingTaskTimings,
	resolveSpeakingUploadMeta,
	type SpeakingSessionState,
	startSpeakingTaskReading,
	transitionSpeakingAfterReading,
	transitionSpeakingNextTask,
	transitionSpeakingToAnswer,
} from "@/lib/placement-test-helpers";
import { resolveStudentPlacementMediaSrc } from "@/lib/repos/placement-test";

export interface RecordedSpeakingAudio {
	blob: Blob;
	url: string;
	mimeType: string;
	durationSec: number;
}

export function PlacementSpeakingStep({
	tasks,
	speakingMode,
	recordedAudio,
	onRecordedAudioChange,
	onSkipSpeaking,
	onBusyChange,
}: {
	tasks: readonly PlacementPublishedSpeakingTask[];
	speakingMode: "none" | "skipped" | "upload";
	recordedAudio: RecordedSpeakingAudio | null;
	onRecordedAudioChange: (next: RecordedSpeakingAudio | null) => void;
	onSkipSpeaking: () => void;
	onBusyChange: (busy: boolean) => void;
}) {
	const [session, setSession] = useState<SpeakingSessionState>(() =>
		createInitialSpeakingSession(tasks.length),
	);
	const [isRequestingMic, setIsRequestingMic] = useState(false);
	const [isFinalizing, setIsFinalizing] = useState(false);
	const [isPromptReplaying, setIsPromptReplaying] = useState(false);
	const [mediaError, setMediaError] = useState("");

	const sessionRef = useRef(session);
	sessionRef.current = session;

	const mediaStreamRef = useRef<MediaStream | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);
	const activeAnswerMsRef = useRef(0);
	const answerStartedAtRef = useRef(0);
	const hasRecordedAnyAnswerRef = useRef(false);
	const discardOnStopRef = useRef(false);
	const isStoppingStreamRef = useRef(false);
	const startTokenRef = useRef(0);
	const promptTokenRef = useRef(0);
	const activePromptAudioRef = useRef<HTMLAudioElement | null>(null);
	const readingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const phaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const preferredMimeRef = useRef("");

	const hasMediaApi =
		typeof navigator !== "undefined" &&
		Boolean(navigator.mediaDevices?.getUserMedia) &&
		typeof window !== "undefined" &&
		typeof window.MediaRecorder === "function";

	const isBusy = session.status === "active" || isFinalizing || isRequestingMic;

	useEffect(() => {
		onBusyChange(isBusy);
	}, [isBusy, onBusyChange]);

	const teardownPromptPlayback = useCallback(() => {
		promptTokenRef.current += 1;
		setIsPromptReplaying(false);
		if (readingTimeoutRef.current) {
			clearTimeout(readingTimeoutRef.current);
			readingTimeoutRef.current = null;
		}
		if (activePromptAudioRef.current) {
			const audio = activePromptAudioRef.current;
			try {
				audio.onloadedmetadata = null;
				audio.ondurationchange = null;
				audio.onplaying = null;
				audio.onended = null;
				audio.onerror = null;
				audio.pause();
				audio.src = "";
			} catch {
				// Ignore audio teardown errors
			}
			activePromptAudioRef.current = null;
		}
		if (typeof window !== "undefined") {
			try {
				window.speechSynthesis?.cancel();
			} catch {
				// Ignore speechSynthesis cancel errors
			}
		}
	}, []);

	const clearPhaseTimer = useCallback(() => {
		if (phaseIntervalRef.current) {
			clearInterval(phaseIntervalRef.current);
			phaseIntervalRef.current = null;
		}
	}, []);

	const stopMediaStream = useCallback(() => {
		const stream = mediaStreamRef.current;
		if (!stream) return;
		isStoppingStreamRef.current = true;
		try {
			for (const track of stream.getTracks()) {
				try {
					track.stop();
				} catch {
					// Ignore track stop errors
				}
			}
		} finally {
			mediaStreamRef.current = null;
			isStoppingStreamRef.current = false;
		}
	}, []);

	const abortWithError = useCallback(
		(message: string) => {
			startTokenRef.current += 1;
			setIsRequestingMic(false);
			setIsFinalizing(false);
			clearPhaseTimer();
			teardownPromptPlayback();
			mediaRecorderRef.current = null;
			stopMediaStream();
			setSession(createInitialSpeakingSession(tasks.length));
			activeAnswerMsRef.current = 0;
			answerStartedAtRef.current = 0;
			hasRecordedAnyAnswerRef.current = false;
			recordedChunksRef.current = [];
			setMediaError(message);
		},
		[clearPhaseTimer, stopMediaStream, tasks.length, teardownPromptPlayback],
	);

	// Cleanup toàn bộ thiết bị ghi âm & timer khi rời màn Speaking.
	useEffect(() => {
		return () => {
			startTokenRef.current += 1;
			clearPhaseTimer();
			teardownPromptPlayback();
			const rec = mediaRecorderRef.current;
			mediaRecorderRef.current = null;
			if (rec && rec.state !== "inactive") {
				try {
					rec.stop();
				} catch {
					// Ignore stop error on unmount
				}
			}
			stopMediaStream();
		};
	}, [clearPhaseTimer, stopMediaStream, teardownPromptPlayback]);

	const ensureRecorderRecordingForAnswer = useCallback(() => {
		answerStartedAtRef.current = Date.now();
		hasRecordedAnyAnswerRef.current = true;
		const recorder = mediaRecorderRef.current;
		if (!recorder) return;
		if (recorder.state === "inactive") {
			try {
				recorder.start(250);
			} catch {
				abortWithError(
					"Không thể bắt đầu ghi âm qua Micro. Vui lòng thử lại hoặc chọn Bỏ qua phần Speaking.",
				);
			}
			return;
		}
		if (recorder.state === "paused" && typeof recorder.resume === "function") {
			try {
				recorder.resume();
			} catch {
				// Keep existing recorder if resume throws
			}
		}
	}, [abortWithError]);

	const pauseRecorderBetweenTasks = useCallback(() => {
		if (answerStartedAtRef.current > 0) {
			activeAnswerMsRef.current += Math.max(
				0,
				Date.now() - answerStartedAtRef.current,
			);
			answerStartedAtRef.current = 0;
		}
		const recorder = mediaRecorderRef.current;
		if (
			recorder &&
			recorder.state === "recording" &&
			typeof recorder.pause === "function"
		) {
			try {
				recorder.pause();
			} catch {
				// Ignore pause errors on browsers lacking pause support
			}
		}
	}, []);

	const finalizeRecording = useCallback(
		(discard: boolean) => {
			clearPhaseTimer();
			teardownPromptPlayback();
			if (answerStartedAtRef.current > 0) {
				activeAnswerMsRef.current += Math.max(
					0,
					Date.now() - answerStartedAtRef.current,
				);
				answerStartedAtRef.current = 0;
			}
			discardOnStopRef.current = discard;
			const recorder = mediaRecorderRef.current;
			if (recorder && recorder.state !== "inactive") {
				try {
					setIsFinalizing(true);
					recorder.stop();
					return;
				} catch {
					// Fall through to cleanup
				}
			}
			stopMediaStream();
			mediaRecorderRef.current = null;
			setIsFinalizing(false);
			setSession(createInitialSpeakingSession(tasks.length));
			activeAnswerMsRef.current = 0;
			hasRecordedAnyAnswerRef.current = false;
			recordedChunksRef.current = [];
		},
		[clearPhaseTimer, stopMediaStream, tasks.length, teardownPromptPlayback],
	);

	const playPrompt = useCallback(
		(task: PlacementPublishedSpeakingTask, onFinished?: () => void) => {
			teardownPromptPlayback();
			const token = ++promptTokenRef.current;
			let finished = false;
			const finishOnce = () => {
				if (finished || token !== promptTokenRef.current) return;
				finished = true;
				teardownPromptPlayback();
				onFinished?.();
			};
			const scheduleTimeout = (ms: number) => {
				if (readingTimeoutRef.current) {
					clearTimeout(readingTimeoutRef.current);
				}
				readingTimeoutRef.current = setTimeout(finishOnce, ms);
			};

			const playTtsFallback = () => {
				if (finished || token !== promptTokenRef.current) return;
				const synth =
					typeof window !== "undefined" ? window.speechSynthesis : null;
				const Utter =
					typeof window !== "undefined"
						? window.SpeechSynthesisUtterance
						: null;
				if (!synth || typeof synth.speak !== "function" || !Utter) {
					scheduleTimeout(1200);
					return;
				}
				scheduleTimeout(computeSpeechFallbackTimeoutMs(task.prompt));
				try {
					synth.cancel();
					const utter = new Utter(task.prompt);
					utter.lang = "en-US";
					utter.rate = 0.95;
					utter.onend = () => finishOnce();
					utter.onerror = () => finishOnce();
					synth.speak(utter);
				} catch {
					finishOnce();
				}
			};

			const taskAudioUrl = task.src
				? resolveStudentPlacementMediaSrc(task.src)
				: "";
			if (taskAudioUrl) {
				const audio = new Audio(taskAudioUrl);
				audio.crossOrigin = "use-credentials";
				activePromptAudioRef.current = audio;
				let durationApplied = false;
				const applyDurationTimeout = () => {
					if (finished || token !== promptTokenRef.current) return;
					if (Number.isFinite(audio.duration) && audio.duration > 0) {
						durationApplied = true;
						scheduleTimeout(
							Math.min(240_000, Math.ceil(audio.duration * 1000) + 5_000),
						);
					} else if (!durationApplied) {
						scheduleTimeout(30_000);
					}
				};
				scheduleTimeout(10_000);
				audio.onloadedmetadata = applyDurationTimeout;
				audio.ondurationchange = applyDurationTimeout;
				audio.onplaying = applyDurationTimeout;
				audio.onended = () => finishOnce();
				audio.onerror = () => playTtsFallback();
				const playPromise = audio.play?.();
				if (playPromise && typeof playPromise.catch === "function") {
					playPromise.catch(() => playTtsFallback());
				}
				return;
			}

			playTtsFallback();
		},
		[teardownPromptPlayback],
	);

	// Quản lý bộ đếm giây trong phase prep / answer và tự chuyển phase.
	const beginTaskReadingRef = useRef<(idx: number) => void>(() => {});

	const startPhaseCountdown = useCallback(
		(initialState: SpeakingSessionState) => {
			clearPhaseTimer();
			if (
				initialState.status !== "active" ||
				(initialState.phase !== "prep" && initialState.phase !== "answer")
			) {
				return;
			}
			phaseIntervalRef.current = setInterval(() => {
				const current = sessionRef.current;
				if (current.status !== "active") {
					clearPhaseTimer();
					return;
				}
				if (current.secondsLeft > 1) {
					setSession((prev) => ({
						...prev,
						secondsLeft: Math.max(0, prev.secondsLeft - 1),
					}));
					return;
				}
				clearPhaseTimer();
				if (current.phase === "prep") {
					teardownPromptPlayback();
					const nextState = transitionSpeakingToAnswer(current, tasks);
					sessionRef.current = nextState;
					setSession(nextState);
					if (nextState.status === "active") {
						ensureRecorderRecordingForAnswer();
						startPhaseCountdown(nextState);
					}
				} else if (current.phase === "answer") {
					teardownPromptPlayback();
					pauseRecorderBetweenTasks();
					const nextState = transitionSpeakingNextTask(current, tasks);
					if (nextState.status === "completed") {
						sessionRef.current = nextState;
						setSession(nextState);
						finalizeRecording(false);
					} else {
						beginTaskReadingRef.current(nextState.taskIndex);
					}
				}
			}, 1000);
		},
		[
			clearPhaseTimer,
			ensureRecorderRecordingForAnswer,
			finalizeRecording,
			pauseRecorderBetweenTasks,
			tasks,
			teardownPromptPlayback,
		],
	);

	const advanceAfterReading = useCallback(() => {
		const current = sessionRef.current;
		if (current.status !== "active" || current.phase !== "reading") return;
		teardownPromptPlayback();
		const nextState = transitionSpeakingAfterReading(current, tasks);
		sessionRef.current = nextState;
		setSession(nextState);
		if (nextState.phase === "answer") {
			ensureRecorderRecordingForAnswer();
		}
		if (nextState.status === "active") {
			startPhaseCountdown(nextState);
		}
	}, [
		ensureRecorderRecordingForAnswer,
		startPhaseCountdown,
		tasks,
		teardownPromptPlayback,
	]);

	const beginTaskReading = useCallback(
		(taskIndex: number) => {
			clearPhaseTimer();
			const nextState = startSpeakingTaskReading(
				sessionRef.current,
				taskIndex,
				tasks,
			);
			sessionRef.current = nextState;
			setSession(nextState);
			const activeTask = tasks[nextState.taskIndex];
			if (activeTask) {
				playPrompt(activeTask, () => advanceAfterReading());
			}
		},
		[advanceAfterReading, clearPhaseTimer, playPrompt, tasks],
	);

	beginTaskReadingRef.current = beginTaskReading;

	const enterAnswerNow = () => {
		const current = sessionRef.current;
		if (
			current.status !== "active" ||
			(current.phase !== "prep" && current.phase !== "reading")
		) {
			return;
		}
		clearPhaseTimer();
		teardownPromptPlayback();
		const nextState = transitionSpeakingToAnswer(current, tasks);
		sessionRef.current = nextState;
		setSession(nextState);
		if (nextState.status === "active") {
			ensureRecorderRecordingForAnswer();
			startPhaseCountdown(nextState);
		}
	};

	const completeCurrentTask = () => {
		clearPhaseTimer();
		teardownPromptPlayback();
		pauseRecorderBetweenTasks();
		const nextState = transitionSpeakingNextTask(sessionRef.current, tasks);
		if (nextState.status === "completed") {
			sessionRef.current = nextState;
			setSession(nextState);
			finalizeRecording(false);
			return;
		}
		beginTaskReading(nextState.taskIndex);
	};

	const handleStartSpeaking = async () => {
		if (!hasMediaApi || isRequestingMic || session.status === "active") return;
		setMediaError("");
		setIsRequestingMic(true);
		const token = ++startTokenRef.current;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: false,
			});
			if (token !== startTokenRef.current) {
				for (const track of stream.getTracks()) {
					try {
						track.stop();
					} catch {
						// Ignore stale stream cleanup
					}
				}
				setIsRequestingMic(false);
				return;
			}

			setIsRequestingMic(false);
			stopMediaStream();
			mediaStreamRef.current = stream;

			const mime = pickSupportedRecorderMime(window.MediaRecorder);
			preferredMimeRef.current = mime;
			const recorder = mime
				? new window.MediaRecorder(stream, { mimeType: mime })
				: new window.MediaRecorder(stream);
			mediaRecorderRef.current = recorder;

			recordedChunksRef.current = [];
			activeAnswerMsRef.current = 0;
			answerStartedAtRef.current = 0;
			hasRecordedAnyAnswerRef.current = false;
			discardOnStopRef.current = false;
			setIsFinalizing(false);

			for (const track of stream.getAudioTracks()) {
				track.addEventListener("ended", () => {
					if (
						isStoppingStreamRef.current ||
						mediaRecorderRef.current !== recorder
					) {
						return;
					}
					if (sessionRef.current.status === "active") {
						abortWithError(
							"Kết nối Micro bị gián đoạn giữa chừng. Vui lòng thử ghi lại hoặc chọn Bỏ qua phần Speaking.",
						);
					}
				});
			}

			recorder.addEventListener("dataavailable", (evt) => {
				if (evt.data && evt.data.size > 0) {
					recordedChunksRef.current.push(evt.data);
				}
			});

			recorder.addEventListener("error", () => {
				if (mediaRecorderRef.current !== recorder) return;
				abortWithError(
					"Trình duyệt gặp lỗi khi thu âm Micro. Vui lòng thử lại hoặc chọn Bỏ qua phần Speaking.",
				);
			});

			recorder.addEventListener("stop", () => {
				if (mediaRecorderRef.current !== recorder) return;
				mediaRecorderRef.current = null;
				const shouldDiscard = discardOnStopRef.current;
				discardOnStopRef.current = false;
				setIsFinalizing(false);
				clearPhaseTimer();
				teardownPromptPlayback();
				stopMediaStream();

				if (shouldDiscard) {
					setSession(createInitialSpeakingSession(tasks.length));
					activeAnswerMsRef.current = 0;
					answerStartedAtRef.current = 0;
					hasRecordedAnyAnswerRef.current = false;
					recordedChunksRef.current = [];
					return;
				}

				const finalDuration = Math.max(
					1,
					Math.round(activeAnswerMsRef.current / 1000),
				);
				const rawMime =
					recorder.mimeType || preferredMimeRef.current || "audio/webm";
				const normalizedMime = resolveSpeakingUploadMeta(rawMime).contentType;
				const blob = new Blob(recordedChunksRef.current, {
					type: normalizedMime,
				});

				if (blob.size > 0) {
					const url =
						typeof URL !== "undefined" &&
						typeof URL.createObjectURL === "function"
							? URL.createObjectURL(blob)
							: "";
					onRecordedAudioChange({
						blob,
						url,
						mimeType: normalizedMime,
						durationSec: finalDuration,
					});
					setSession((prev) => ({
						...prev,
						status: "completed",
						phase: "done",
						secondsLeft: 0,
					}));
				} else {
					setSession(createInitialSpeakingSession(tasks.length));
					setMediaError(
						"Không thu được dữ liệu âm thanh. Vui lòng thử ghi lại hoặc chọn Bỏ qua.",
					);
				}
			});

			beginTaskReading(0);
		} catch {
			setIsRequestingMic(false);
			mediaRecorderRef.current = null;
			stopMediaStream();
			setSession(createInitialSpeakingSession(tasks.length));
			setMediaError(
				"Không thể truy cập Micro (thiếu quyền hoặc không có micro). Bạn có thể cấp quyền lại hoặc chọn Bỏ qua phần Speaking.",
			);
		}
	};

	const handleRetake = () => {
		startTokenRef.current += 1;
		setIsRequestingMic(false);
		clearPhaseTimer();
		teardownPromptPlayback();
		stopMediaStream();
		recordedChunksRef.current = [];
		activeAnswerMsRef.current = 0;
		answerStartedAtRef.current = 0;
		hasRecordedAnyAnswerRef.current = false;
		setMediaError("");
		setSession(createInitialSpeakingSession(tasks.length));
		onRecordedAudioChange(null);
	};

	const handleSkip = () => {
		startTokenRef.current += 1;
		setIsRequestingMic(false);
		clearPhaseTimer();
		teardownPromptPlayback();
		stopMediaStream();
		recordedChunksRef.current = [];
		activeAnswerMsRef.current = 0;
		answerStartedAtRef.current = 0;
		hasRecordedAnyAnswerRef.current = false;
		setMediaError("");
		setSession(createInitialSpeakingSession(tasks.length));
		onRecordedAudioChange(null);
		onSkipSpeaking();
	};

	const estimatedTotalSec = tasks.reduce((acc, task) => {
		const { prepSeconds, answerSeconds } = resolveSpeakingTaskTimings(task);
		return acc + prepSeconds + answerSeconds + 5;
	}, 0);
	const estimatedMinutes = Math.max(1, Math.ceil(estimatedTotalSec / 60));

	if (tasks.length === 0) {
		return (
			<div className="space-y-6" data-testid="placement-step-speaking">
				<Card>
					<CardHeader>
						<CardDescription className="font-mono text-[11px] uppercase tracking-[0.16em]">
							Phần 5 / 5 · Nói (Speaking)
						</CardDescription>
						<CardTitle className="text-xl">Phần Speaking</CardTitle>
						<CardDescription>
							Đề kiểm tra hiện tại không có câu hỏi Speaking. Bạn có thể bấm nộp
							bài ngay bên dưới.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const isRecordingSessionActive = session.status === "active" || isFinalizing;
	const activeTask = tasks[session.taskIndex] ?? tasks[0];
	const activeTimings = activeTask
		? resolveSpeakingTaskTimings(activeTask)
		: { prepSeconds: 15, answerSeconds: 45 };
	const activePartLabel = activeTask
		? stripInlineCefrLabel(activeTask.partLabel)
		: "";

	return (
		<div className="space-y-6" data-testid="placement-step-speaking">
			<Card>
				<CardHeader>
					<CardDescription className="font-mono text-[11px] uppercase tracking-[0.16em]">
						Phần 5 / 5 · Nói (Speaking)
					</CardDescription>
					<CardTitle className="text-xl">
						Kiểm tra Speaking — Hệ thống đọc từng câu hỏi &amp; thu âm qua Micro
					</CardTitle>
					<CardDescription className="leading-relaxed">
						Hệ thống sẽ tự động đọc lần lượt từng câu hỏi, đếm ngược thời gian
						chuẩn bị rồi ghi âm bằng micro (chỉ thu âm thanh, không cần camera)
						và ghép thành một bản ghi duy nhất.
					</CardDescription>
				</CardHeader>
			</Card>

			<Card>
				<CardContent className="space-y-4">
					{mediaError ? (
						<div
							role="alert"
							className="rounded-lg border border-destructive/40 bg-destructive-soft p-3 text-destructive text-sm"
						>
							{mediaError}
						</div>
					) : null}

					{!hasMediaApi ? (
						<div className="rounded-lg border border-warn/40 bg-warn-soft p-3.5 text-foreground text-sm">
							Trình duyệt hoặc thiết bị hiện tại chưa hỗ trợ ghi âm
							(MediaRecorder). Bạn có thể bấm{" "}
							<strong>Bỏ qua phần Speaking</strong> bên dưới để nộp bài ngay.
						</div>
					) : null}

					{isRecordingSessionActive && activeTask ? (
						<div
							data-testid="speaking-session-card"
							className="space-y-4 rounded-lg border bg-muted/20 p-4"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-semibold text-foreground text-sm">
										Câu {session.taskIndex + 1} / {tasks.length}
									</span>
									{activePartLabel ? (
										<span className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground text-xs">
											{activePartLabel}
										</span>
									) : null}
								</div>
								<span className="text-muted-foreground text-xs tabular-nums">
									Chuẩn bị {activeTimings.prepSeconds}s · Trả lời{" "}
									{activeTimings.answerSeconds}s
								</span>
							</div>

							<div
								role="progressbar"
								aria-valuemin={1}
								aria-valuemax={tasks.length}
								aria-valuenow={session.taskIndex + 1}
								aria-label="Tiến độ câu Speaking"
								className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
							>
								<div
									className="h-full bg-primary transition-[width]"
									style={{
										width: `${Math.round(((session.taskIndex + 1) / tasks.length) * 100)}%`,
									}}
								/>
							</div>

							<div
								className={cn(
									"flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5 text-sm",
									session.phase === "answer"
										? "border-destructive/40 bg-destructive-soft text-destructive"
										: "border-border bg-card text-foreground",
								)}
							>
								<span className="inline-flex items-center gap-2 font-medium">
									{session.phase === "answer" ? (
										<span
											aria-hidden="true"
											className="size-2.5 animate-pulse rounded-full bg-destructive"
										/>
									) : (
										<Volume2 aria-hidden="true" className="size-4" />
									)}
									{isFinalizing
										? "Đang hoàn tất bản ghi..."
										: session.phase === "reading"
											? "Hệ thống đang đọc câu hỏi..."
											: session.phase === "prep"
												? "Thời gian chuẩn bị"
												: "Đang ghi âm câu trả lời (Micro)"}
								</span>
								<span
									aria-live="polite"
									className="font-mono font-semibold tabular-nums"
								>
									{isFinalizing
										? "Đang lưu..."
										: session.phase === "reading"
											? "Đang phát đề"
											: formatPlacementClock(session.secondsLeft)}
								</span>
							</div>

							<div className="rounded-lg border bg-card p-4">
								<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
									Câu hỏi {session.taskIndex + 1}/{tasks.length}
									{activePartLabel ? ` · ${activePartLabel}` : ""}
								</p>
								<p className="mt-2 font-medium text-base text-foreground leading-relaxed">
									{activeTask.prompt}
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								{session.phase === "reading" && !isFinalizing ? (
									<Button type="button" size="sm" onClick={advanceAfterReading}>
										Chuẩn bị ngay →
									</Button>
								) : null}

								{session.phase === "prep" && !isFinalizing ? (
									<>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={session.replayUsedForCurrentTask}
											onClick={() => {
												if (session.replayUsedForCurrentTask) return;
												setSession((prev) => ({
													...prev,
													replayUsedForCurrentTask: true,
												}));
												setIsPromptReplaying(true);
												playPrompt(activeTask, () =>
													setIsPromptReplaying(false),
												);
											}}
										>
											<Volume2 aria-hidden="true" className="size-4" />
											<span>
												{session.replayUsedForCurrentTask
													? "Đã nghe lại (1/1)"
													: "Nghe lại câu hỏi"}
											</span>
										</Button>
										<Button type="button" size="sm" onClick={enterAnswerNow}>
											<Mic aria-hidden="true" className="size-4" />
											<span>Trả lời ngay →</span>
										</Button>
									</>
								) : null}

								{session.phase === "answer" && !isFinalizing ? (
									<Button type="button" size="sm" onClick={completeCurrentTask}>
										{session.taskIndex < tasks.length - 1
											? "✓ Xong câu này → Câu tiếp theo"
											: "✓ Hoàn thành phần Speaking"}
									</Button>
								) : null}

								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={isFinalizing}
									onClick={() => {
										const shouldDiscard =
											!hasRecordedAnyAnswerRef.current &&
											session.phase !== "answer";
										finalizeRecording(shouldDiscard);
									}}
								>
									<Square aria-hidden="true" className="size-3.5" />
									<span>
										{isFinalizing ? "Đang lưu bài nói..." : "Kết thúc sớm"}
									</span>
								</Button>
							</div>

							{session.phase === "prep" ? (
								<p aria-live="polite" className="text-muted-foreground text-xs">
									{isPromptReplaying
										? "Đang phát lại câu hỏi..."
										: session.replayUsedForCurrentTask
											? "Đã dùng lượt nghe lại cho câu này (1/1)."
											: "Bạn có thể bấm Nghe lại câu hỏi tối đa 1 lần trước khi trả lời."}
								</p>
							) : null}
						</div>
					) : recordedAudio ? (
						<div
							data-testid="speaking-review-box"
							className="space-y-4 rounded-lg border bg-muted/20 p-4"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-0.5 font-medium text-success text-xs">
									Đã ghi âm hoàn tất (sẵn sàng nộp)
								</span>
								<span className="text-muted-foreground text-xs tabular-nums">
									Thời lượng trả lời: {recordedAudio.durationSec}s ·{" "}
									{(recordedAudio.blob.size / (1024 * 1024)).toFixed(2)} MB / 50
									MB
								</span>
							</div>

							{recordedAudio.blob.size > PLACEMENT_SPEAKING_MAX_BYTES ? (
								<p role="alert" className="text-destructive text-sm">
									Bản ghi vượt quá giới hạn 50 MB. Vui lòng ghi lại ngắn hơn
									hoặc chọn Bỏ qua phần Speaking.
								</p>
							) : null}

							{recordedAudio.url ? (
								// biome-ignore lint/a11y/useMediaCaption: bản ghi bài nói của thí sinh.
								<audio
									controls
									preload="metadata"
									src={recordedAudio.url}
									className="w-full"
								/>
							) : null}

							<div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleRetake}
								>
									<RotateCcw aria-hidden="true" className="size-4" />
									<span>Ghi lại từ đầu</span>
								</Button>
							</div>
						</div>
					) : (
						<div className="space-y-4">
							{speakingMode === "skipped" ? (
								<div
									data-testid="speaking-skipped-notice"
									className="rounded-lg border bg-muted/40 p-3.5 text-sm"
								>
									<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
										<MicOff aria-hidden="true" className="size-4" />
										Đã chọn bỏ qua phần Speaking
									</span>
									<p className="mt-1 text-muted-foreground text-xs">
										Bạn có thể bấm Nộp bài ngay bên dưới (chỉ chấm 4 kỹ năng đã
										làm), hoặc bấm Bắt đầu làm bài Speaking nếu đổi ý.
									</p>
								</div>
							) : null}

							<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
								<div className="rounded-lg border bg-muted/30 p-3.5">
									<div className="text-muted-foreground text-xs">
										Số câu hỏi
									</div>
									<div className="mt-1 font-semibold text-foreground text-sm">
										{tasks.length} câu tuần tự
									</div>
								</div>
								<div className="rounded-lg border bg-muted/30 p-3.5">
									<div className="text-muted-foreground text-xs">
										Thời lượng ước tính
									</div>
									<div className="mt-1 font-semibold text-foreground text-sm">
										~{estimatedMinutes} phút
									</div>
								</div>
								<div className="rounded-lg border bg-muted/30 p-3.5">
									<div className="text-muted-foreground text-xs">
										Phương thức
									</div>
									<div className="mt-1 font-semibold text-foreground text-sm">
										Audio-only (chỉ Micro)
									</div>
								</div>
							</div>

							<ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground text-sm leading-relaxed">
								<li>
									Cấp quyền micro một lần. Nội dung từng câu hỏi sẽ lần lượt
									xuất hiện khi bắt đầu thi.
								</li>
								<li>
									Hệ thống đọc từng câu từ câu 1 đến câu {tasks.length}, đếm
									ngược chuẩn bị rồi tự bật ghi âm câu trả lời của bạn.
								</li>
								<li>
									Giữa các câu máy tự tạm dừng ghi và ghép thành một file âm
									thanh duy nhất khi hoàn thành.
								</li>
							</ol>

							<div className="flex flex-wrap items-center gap-3 pt-1">
								<Button
									type="button"
									disabled={!hasMediaApi || isRequestingMic}
									onClick={() => void handleStartSpeaking()}
								>
									<Mic aria-hidden="true" className="size-4" />
									<span>
										{isRequestingMic
											? "Đang xin quyền micro..."
											: "Bắt đầu làm bài Speaking"}
									</span>
								</Button>
								<Button type="button" variant="outline" onClick={handleSkip}>
									<SkipForward aria-hidden="true" className="size-4" />
									<span>Bỏ qua phần Speaking</span>
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
