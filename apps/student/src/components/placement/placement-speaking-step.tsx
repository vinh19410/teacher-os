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
import { Mic, Pause, RotateCcw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	canRetrySpeakingTask,
	computeSpeechFallbackTimeoutMs,
	createInitialSpeakingSession,
	formatPlacementClock,
	isLikelyInAppBrowser,
	MAX_SPEAKING_RETRIES_PER_TASK,
	PLACEMENT_SPEAKING_MAX_BYTES,
	pickSupportedRecorderMime,
	resolveSpeakingTaskTimings,
	resolveSpeakingUploadMeta,
	retrySpeakingCurrentTask,
	type SpeakingSessionState,
	startSpeakingTaskReading,
	transitionSpeakingAfterReading,
	transitionSpeakingNextTask,
	transitionSpeakingToAnswer,
	transitionSpeakingToPaused,
} from "@/lib/placement-test-helpers";
import {
	resolveStudentPlacementMediaSrc,
	useActiveStudentOrgId,
} from "@/lib/repos/placement-test";
import {
	mergeSpeakingAudioSegments,
	type SpeakingAudioSegment,
} from "@/lib/speaking-audio-merger";

export interface RecordedSpeakingAudio {
	blob: Blob;
	url: string;
	mimeType: string;
	durationSec: number;
}

interface ActiveRecorderHandle {
	recorder: MediaRecorder;
	taskIndex: number;
	stop: (discard?: boolean) => Promise<SpeakingAudioSegment | null>;
}

export function PlacementSpeakingStep({
	tasks,
	recordedAudio,
	onRecordedAudioChange,
	onBusyChange,
	hideIntroHeader = false,
}: {
	tasks: readonly PlacementPublishedSpeakingTask[];
	recordedAudio: RecordedSpeakingAudio | null;
	onRecordedAudioChange: (next: RecordedSpeakingAudio | null) => void;
	onBusyChange: (busy: boolean) => void;
	hideIntroHeader?: boolean;
}) {
	const activeOrgId = useActiveStudentOrgId();
	const [session, setSession] = useState<SpeakingSessionState>(() =>
		createInitialSpeakingSession(tasks.length),
	);
	const [isRequestingMic, setIsRequestingMic] = useState(false);
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [isFinalizing, setIsFinalizing] = useState(false);
	const [isPromptReplaying, setIsPromptReplaying] = useState(false);
	const [confirmEarlyFinish, setConfirmEarlyFinish] = useState(false);
	const [segmentDurationsSec, setSegmentDurationsSec] = useState<
		Record<number, number>
	>({});
	const [mediaError, setMediaError] = useState("");

	const sessionRef = useRef(session);
	sessionRef.current = session;

	const mediaStreamRef = useRef<MediaStream | null>(null);
	const activeRecorderRef = useRef<ActiveRecorderHandle | null>(null);
	const recordedSegmentsRef = useRef<Array<SpeakingAudioSegment | undefined>>(
		[],
	);
	const isStoppingStreamRef = useRef(false);
	const isTransitioningRef = useRef(false);
	const isFinalizingRef = useRef(false);
	const unmountedRef = useRef(false);
	const sessionTokenRef = useRef(0);
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

	const isBusy =
		session.status === "active" ||
		isFinalizing ||
		isRequestingMic ||
		isTransitioning;

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

	const stopActiveRecorder = useCallback(
		async (discard = false): Promise<SpeakingAudioSegment | null> => {
			const handle = activeRecorderRef.current;
			if (!handle) return null;
			return handle.stop(discard);
		},
		[],
	);

	const abortWithError = useCallback(
		(message: string) => {
			sessionTokenRef.current += 1;
			isTransitioningRef.current = false;
			isFinalizingRef.current = false;
			setIsRequestingMic(false);
			setIsTransitioning(false);
			setIsFinalizing(false);
			setConfirmEarlyFinish(false);
			clearPhaseTimer();
			teardownPromptPlayback();
			const handle = activeRecorderRef.current;
			activeRecorderRef.current = null;
			if (handle) {
				void handle.stop(true);
			}
			stopMediaStream();
			recordedSegmentsRef.current = [];
			setSegmentDurationsSec({});
			const resetState = createInitialSpeakingSession(tasks.length);
			sessionRef.current = resetState;
			setSession(resetState);
			setMediaError(message);
		},
		[clearPhaseTimer, stopMediaStream, tasks.length, teardownPromptPlayback],
	);

	// Cleanup toàn bộ thiết bị ghi âm & timer khi rời màn Speaking.
	useEffect(() => {
		unmountedRef.current = false;
		return () => {
			unmountedRef.current = true;
			sessionTokenRef.current += 1;
			clearPhaseTimer();
			teardownPromptPlayback();
			const handle = activeRecorderRef.current;
			activeRecorderRef.current = null;
			if (handle && handle.recorder.state !== "inactive") {
				try {
					handle.recorder.stop();
				} catch {
					// Ignore stop error on unmount
				}
			}
			stopMediaStream();
		};
	}, [clearPhaseTimer, stopMediaStream, teardownPromptPlayback]);

	const startTaskRecorder = useCallback(
		(taskIndex: number): boolean => {
			const stream = mediaStreamRef.current;
			if (!stream || typeof window === "undefined" || !window.MediaRecorder) {
				abortWithError(
					"Không tìm thấy nguồn Micro đang hoạt động. Vui lòng kiểm tra Micro và thử lại.",
				);
				return false;
			}

			if (activeRecorderRef.current) {
				void activeRecorderRef.current.stop(true);
				activeRecorderRef.current = null;
			}

			const token = sessionTokenRef.current;
			const mime = preferredMimeRef.current;
			let recorder: MediaRecorder;
			try {
				recorder = mime
					? new window.MediaRecorder(stream, { mimeType: mime })
					: new window.MediaRecorder(stream);
			} catch {
				abortWithError(
					"Không thể khởi tạo bộ ghi âm cho câu hiện tại. Vui lòng kiểm tra Micro và thử lại.",
				);
				return false;
			}

			const chunks: Blob[] = [];
			const startedAt = Date.now();
			let settled = false;
			let discardThis = false;
			let stopPromise: Promise<SpeakingAudioSegment | null> | null = null;
			let resolveStop: ((seg: SpeakingAudioSegment | null) => void) | null =
				null;

			const finishStop = (seg: SpeakingAudioSegment | null) => {
				if (settled) return;
				settled = true;
				if (activeRecorderRef.current?.recorder === recorder) {
					activeRecorderRef.current = null;
				}
				resolveStop?.(seg);
			};

			recorder.addEventListener("dataavailable", (evt) => {
				if (evt.data && evt.data.size > 0) {
					chunks.push(evt.data);
				}
			});

			recorder.addEventListener("error", () => {
				if (token !== sessionTokenRef.current || unmountedRef.current) {
					finishStop(null);
					return;
				}
				finishStop(null);
				abortWithError(
					"Trình duyệt gặp lỗi khi thu âm Micro. Vui lòng thử lại hoặc liên hệ giáo viên hỗ trợ.",
				);
			});

			recorder.addEventListener("stop", () => {
				if (token !== sessionTokenRef.current || unmountedRef.current) {
					finishStop(null);
					return;
				}
				const durationMs = Math.max(0, Date.now() - startedAt);
				const rawMime =
					recorder.mimeType ||
					preferredMimeRef.current ||
					chunks[0]?.type ||
					"";
				const blob = rawMime
					? new Blob(chunks, {
							type: resolveSpeakingUploadMeta(rawMime).contentType,
						})
					: new Blob(chunks);
				const seg = !discardThis && blob.size > 0 ? { blob, durationMs } : null;
				if (seg) {
					recordedSegmentsRef.current[taskIndex] = seg;
					const sec = Math.max(1, Math.round(durationMs / 1000));
					setSegmentDurationsSec((prev) => ({ ...prev, [taskIndex]: sec }));
				} else if (!discardThis) {
					recordedSegmentsRef.current[taskIndex] = undefined;
					setSegmentDurationsSec((prev) => ({ ...prev, [taskIndex]: 0 }));
				}
				finishStop(seg);
			});

			const handle: ActiveRecorderHandle = {
				recorder,
				taskIndex,
				stop: (discard = false) => {
					if (discard) discardThis = true;
					if (settled) {
						return Promise.resolve(
							discardThis
								? null
								: (recordedSegmentsRef.current[taskIndex] ?? null),
						);
					}
					if (!stopPromise) {
						stopPromise = new Promise<SpeakingAudioSegment | null>(
							(resolve) => {
								resolveStop = resolve;
							},
						);
						if (recorder.state === "inactive") {
							finishStop(
								discardThis
									? null
									: (recordedSegmentsRef.current[taskIndex] ?? null),
							);
						} else {
							try {
								recorder.stop();
							} catch {
								finishStop(null);
							}
						}
					}
					return stopPromise;
				},
			};

			activeRecorderRef.current = handle;

			try {
				recorder.start(250);
				return true;
			} catch {
				activeRecorderRef.current = null;
				abortWithError(
					"Không thể bắt đầu ghi âm qua Micro. Vui lòng kiểm tra quyền Micro và thử lại.",
				);
				return false;
			}
		},
		[abortWithError],
	);

	const finalizeSession = useCallback(
		async (discardAll = false) => {
			if (isFinalizingRef.current) return;
			const token = sessionTokenRef.current;
			isFinalizingRef.current = true;
			setIsFinalizing(true);
			setConfirmEarlyFinish(false);
			clearPhaseTimer();
			teardownPromptPlayback();

			try {
				await stopActiveRecorder(discardAll);
				if (token !== sessionTokenRef.current || unmountedRef.current) return;

				const orderedSegments: SpeakingAudioSegment[] = [];
				if (!discardAll) {
					for (let i = 0; i < tasks.length; i++) {
						const seg = recordedSegmentsRef.current[i];
						if (seg && seg.blob.size > 0) {
							orderedSegments.push(seg);
						}
					}
				}

				stopMediaStream();

				if (discardAll || orderedSegments.length === 0) {
					recordedSegmentsRef.current = [];
					setSegmentDurationsSec({});
					const resetState = createInitialSpeakingSession(tasks.length);
					sessionRef.current = resetState;
					setSession(resetState);
					if (!discardAll) {
						setMediaError(
							"Không thu được dữ liệu âm thanh. Vui lòng kiểm tra Micro và thử ghi lại.",
						);
					}
					return;
				}

				const merged = await mergeSpeakingAudioSegments(orderedSegments);
				if (token !== sessionTokenRef.current || unmountedRef.current) return;

				if (merged.blob.size > 0) {
					const url =
						typeof URL !== "undefined" &&
						typeof URL.createObjectURL === "function"
							? URL.createObjectURL(merged.blob)
							: "";
					onRecordedAudioChange({
						blob: merged.blob,
						url,
						mimeType: merged.mimeType,
						durationSec: merged.durationSec,
					});
					const doneState: SpeakingSessionState = {
						...sessionRef.current,
						status: "completed",
						phase: "done",
						secondsLeft: 0,
					};
					sessionRef.current = doneState;
					setSession(doneState);
				} else {
					recordedSegmentsRef.current = [];
					setSegmentDurationsSec({});
					const resetState = createInitialSpeakingSession(tasks.length);
					sessionRef.current = resetState;
					setSession(resetState);
					setMediaError(
						"Không thu được dữ liệu âm thanh. Vui lòng kiểm tra Micro và thử ghi lại.",
					);
				}
			} finally {
				if (token === sessionTokenRef.current && !unmountedRef.current) {
					isFinalizingRef.current = false;
					setIsFinalizing(false);
				}
			}
		},
		[
			clearPhaseTimer,
			onRecordedAudioChange,
			stopActiveRecorder,
			stopMediaStream,
			tasks.length,
			teardownPromptPlayback,
		],
	);

	const pauseCurrentAnswer = useCallback(async () => {
		const current = sessionRef.current;
		if (
			current.status !== "active" ||
			current.phase !== "answer" ||
			isTransitioningRef.current ||
			isFinalizingRef.current
		) {
			return;
		}
		const token = sessionTokenRef.current;
		isTransitioningRef.current = true;
		setIsTransitioning(true);
		clearPhaseTimer();
		teardownPromptPlayback();
		try {
			await stopActiveRecorder(false);
			if (
				token !== sessionTokenRef.current ||
				unmountedRef.current ||
				isFinalizingRef.current
			) {
				return;
			}
			const nextState = transitionSpeakingToPaused(sessionRef.current);
			sessionRef.current = nextState;
			setSession(nextState);
		} finally {
			if (token === sessionTokenRef.current && !unmountedRef.current) {
				isTransitioningRef.current = false;
				setIsTransitioning(false);
			}
		}
	}, [clearPhaseTimer, stopActiveRecorder, teardownPromptPlayback]);

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
				? resolveStudentPlacementMediaSrc(task.src, activeOrgId)
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
		[teardownPromptPlayback, activeOrgId],
	);

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
					const updated: SpeakingSessionState = {
						...current,
						secondsLeft: Math.max(0, current.secondsLeft - 1),
					};
					sessionRef.current = updated;
					setSession(updated);
					return;
				}
				clearPhaseTimer();
				if (current.phase === "prep") {
					teardownPromptPlayback();
					const nextState = transitionSpeakingToAnswer(current, tasks);
					sessionRef.current = nextState;
					setSession(nextState);
					if (nextState.status === "active") {
						if (startTaskRecorder(nextState.taskIndex)) {
							startPhaseCountdown(nextState);
						}
					}
				} else if (current.phase === "answer") {
					void pauseCurrentAnswer();
				}
			}, 1000);
		},
		[
			clearPhaseTimer,
			pauseCurrentAnswer,
			startTaskRecorder,
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
			if (!startTaskRecorder(nextState.taskIndex)) return;
		}
		if (nextState.status === "active") {
			startPhaseCountdown(nextState);
		}
	}, [startPhaseCountdown, startTaskRecorder, tasks, teardownPromptPlayback]);

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

	const enterAnswerNow = () => {
		const current = sessionRef.current;
		if (
			current.status !== "active" ||
			(current.phase !== "prep" && current.phase !== "reading") ||
			isFinalizingRef.current ||
			isTransitioningRef.current
		) {
			return;
		}
		clearPhaseTimer();
		teardownPromptPlayback();
		const nextState = transitionSpeakingToAnswer(current, tasks);
		sessionRef.current = nextState;
		setSession(nextState);
		if (nextState.status === "active") {
			if (startTaskRecorder(nextState.taskIndex)) {
				startPhaseCountdown(nextState);
			}
		}
	};

	const retryCurrentTask = () => {
		const current = sessionRef.current;
		if (
			isFinalizingRef.current ||
			isTransitioningRef.current ||
			!canRetrySpeakingTask(current)
		) {
			return;
		}
		setConfirmEarlyFinish(false);
		clearPhaseTimer();
		teardownPromptPlayback();
		const nextState = retrySpeakingCurrentTask(current, tasks);
		sessionRef.current = nextState;
		setSession(nextState);
		if (nextState.status === "active" && nextState.phase === "answer") {
			if (startTaskRecorder(nextState.taskIndex)) {
				startPhaseCountdown(nextState);
			}
		}
	};

	const advanceFromPaused = () => {
		const current = sessionRef.current;
		if (
			current.status !== "active" ||
			(current.phase !== "paused" && current.phase !== "answer") ||
			isFinalizingRef.current ||
			isTransitioningRef.current
		) {
			return;
		}
		setConfirmEarlyFinish(false);
		clearPhaseTimer();
		teardownPromptPlayback();
		const nextState = transitionSpeakingNextTask(current, tasks);
		if (nextState.status === "completed") {
			void finalizeSession(false);
			return;
		}
		beginTaskReading(nextState.taskIndex);
	};

	const confirmEndEarly = () => {
		const hasAnyRecordedOrRecording =
			sessionRef.current.phase === "answer" ||
			Boolean(activeRecorderRef.current) ||
			recordedSegmentsRef.current.some((seg) =>
				Boolean(seg && seg.blob.size > 0),
			);
		void finalizeSession(!hasAnyRecordedOrRecording);
	};

	const handleStartSpeaking = async () => {
		if (!hasMediaApi || isRequestingMic || session.status === "active") return;
		setMediaError("");
		setConfirmEarlyFinish(false);
		setIsRequestingMic(true);
		const token = ++sessionTokenRef.current;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: false,
			});
			if (token !== sessionTokenRef.current || unmountedRef.current) {
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
			preferredMimeRef.current = pickSupportedRecorderMime(
				window.MediaRecorder,
			);
			recordedSegmentsRef.current = [];
			setSegmentDurationsSec({});
			isTransitioningRef.current = false;
			isFinalizingRef.current = false;
			setIsTransitioning(false);
			setIsFinalizing(false);

			for (const track of stream.getAudioTracks()) {
				track.addEventListener("ended", () => {
					if (
						isStoppingStreamRef.current ||
						token !== sessionTokenRef.current ||
						unmountedRef.current
					) {
						return;
					}
					if (sessionRef.current.status === "active") {
						abortWithError(
							"Kết nối Micro bị gián đoạn giữa chừng. Vui lòng kiểm tra Micro và thử ghi lại.",
						);
					}
				});
			}

			beginTaskReading(0);
		} catch {
			if (token !== sessionTokenRef.current || unmountedRef.current) return;
			setIsRequestingMic(false);
			stopMediaStream();
			const resetState = createInitialSpeakingSession(tasks.length);
			sessionRef.current = resetState;
			setSession(resetState);
			setMediaError(
				"Không thể truy cập Micro (thiếu quyền hoặc không có micro). Vui lòng cấp quyền Micro và thử lại.",
			);
		}
	};

	const handleResetOversizedRecording = () => {
		abortWithError("");
		onRecordedAudioChange(null);
	};

	const estimatedTotalSec = tasks.reduce((acc, task) => {
		const { prepSeconds, answerSeconds } = resolveSpeakingTaskTimings(task);
		return acc + prepSeconds + answerSeconds + 5;
	}, 0);
	const estimatedMinutes = Math.max(1, Math.ceil(estimatedTotalSec / 60));

	const inAppBrowser = isLikelyInAppBrowser(
		typeof navigator !== "undefined" ? navigator.userAgent : "",
	);

	if (tasks.length === 0) {
		return (
			<div className="space-y-6" data-testid="placement-step-speaking">
				<Card>
					<CardHeader>
						{hideIntroHeader ? null : (
							<CardDescription className="font-mono text-[11px] uppercase tracking-[0.16em]">
								Phần 5 / 5 · Nói (Speaking)
							</CardDescription>
						)}
						<CardTitle className="text-xl">Kiểm tra Speaking</CardTitle>
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
	const remainingRetries = Math.max(
		0,
		MAX_SPEAKING_RETRIES_PER_TASK - session.retriesUsedForCurrentTask,
	);
	const canRetryCurrent = canRetrySpeakingTask(session);
	const currentTaskDurationSec = segmentDurationsSec[session.taskIndex] ?? 0;

	return (
		<div className="space-y-6" data-testid="placement-step-speaking">
			{hideIntroHeader ? null : (
				<Card>
					<CardHeader>
						<CardDescription className="font-mono text-[11px] uppercase tracking-[0.16em]">
							Phần 5 / 5 · Nói (Speaking)
						</CardDescription>
						<CardTitle className="text-xl">Kiểm tra Speaking</CardTitle>
					</CardHeader>
				</Card>
			)}

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
							(MediaRecorder). Vui lòng sử dụng trình duyệt/thiết bị có Micro
							(Chrome, Safari, Edge) để hoàn thành phần Speaking trước khi nộp
							bài.
						</div>
					) : null}

					{inAppBrowser || mediaError ? (
						<div
							data-testid="speaking-in-app-browser-hint"
							className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-foreground text-xs leading-relaxed"
						>
							Nếu bạn đang mở bài kiểm tra trong trình duyệt tích hợp (Zalo,
							Facebook, Messenger) và gặp lỗi Micro hoặc không ghi âm được, hãy
							chọn{" "}
							<strong className="font-semibold">Mở bằng Safari / Chrome</strong>{" "}
							để ghi âm và tải bài nói ổn định hơn.
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

							<div className="rounded-lg border bg-card p-4">
								<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
									Câu hỏi {session.taskIndex + 1}/{tasks.length}
									{activePartLabel ? ` · ${activePartLabel}` : ""}
								</p>
								<p className="mt-2 font-medium text-base text-foreground leading-relaxed">
									{activeTask.prompt}
								</p>
							</div>

							{isFinalizing ? (
								<div
									aria-live="polite"
									className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card px-4 py-6 text-center"
								>
									<p className="font-medium text-foreground text-sm">
										Đang hoàn tất bản ghi...
									</p>
								</div>
							) : session.phase === "reading" ? (
								<div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-card px-4 py-6 text-center">
									<div className="inline-flex items-center gap-2 font-medium text-foreground text-sm">
										<Volume2 aria-hidden="true" className="size-4" />
										<span>Hệ thống đang đọc câu hỏi...</span>
									</div>
									<Button type="button" size="sm" onClick={advanceAfterReading}>
										Chuẩn bị ngay →
									</Button>
								</div>
							) : session.phase === "prep" ? (
								<div
									data-testid="speaking-prep-stage"
									className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-card px-4 py-6 text-center"
								>
									<div className="space-y-1">
										<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
											Thời gian chuẩn bị
										</p>
										<div
											aria-live="polite"
											data-testid="speaking-prep-timer"
											className="font-bold font-mono text-4xl text-foreground tabular-nums"
										>
											{formatPlacementClock(session.secondsLeft)}
										</div>
									</div>

									<div className="flex flex-wrap items-center justify-center gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={session.replayUsedForCurrentTask}
											onClick={() => {
												if (session.replayUsedForCurrentTask) return;
												const nextState: SpeakingSessionState = {
													...sessionRef.current,
													replayUsedForCurrentTask: true,
												};
												sessionRef.current = nextState;
												setSession(nextState);
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
									</div>

									{isPromptReplaying ? (
										<p
											aria-live="polite"
											className="text-muted-foreground text-xs"
										>
											Đang phát lại câu hỏi...
										</p>
									) : session.replayUsedForCurrentTask ? (
										<p
											aria-live="polite"
											className="text-muted-foreground text-xs"
										>
											Đã dùng lượt nghe lại (1/1)
										</p>
									) : null}
								</div>
							) : session.phase === "answer" ? (
								<div
									data-testid="speaking-answer-stage"
									className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card px-4 py-6 text-center"
								>
									<Button
										type="button"
										variant="destructive"
										size="icon-lg"
										disabled={isFinalizing || isTransitioning}
										aria-label="Dừng ghi âm câu hiện tại"
										className="size-16 rounded-full shadow-md focus-visible:shadow-[var(--focus-ring)]"
										onClick={() => void pauseCurrentAnswer()}
									>
										<Pause aria-hidden="true" className="size-6" />
									</Button>

									<div className="inline-flex items-center gap-2 font-medium text-destructive text-sm">
										<span
											aria-hidden="true"
											className="size-2 animate-pulse rounded-full bg-destructive"
										/>
										<span>Đang ghi âm câu trả lời</span>
									</div>

									<div
										aria-live="polite"
										data-testid="speaking-answer-timer"
										className="font-bold font-mono text-2xl text-foreground tabular-nums"
									>
										{formatPlacementClock(session.secondsLeft)}
									</div>
								</div>
							) : session.phase === "paused" ? (
								<div
									data-testid="speaking-paused-stage"
									className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-card px-4 py-6 text-center"
								>
									<p className="text-muted-foreground text-sm tabular-nums">
										Đã ghi âm câu này:{" "}
										<span className="font-semibold text-foreground">
											{currentTaskDurationSec}s
										</span>
									</p>
									<div className="flex flex-wrap items-center justify-center gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={
												!canRetryCurrent || isFinalizing || isTransitioning
											}
											onClick={retryCurrentTask}
										>
											<RotateCcw aria-hidden="true" className="size-4" />
											<span>
												{canRetryCurrent
													? `Ghi lại câu này (còn ${remainingRetries}/${MAX_SPEAKING_RETRIES_PER_TASK})`
													: `Đã hết lượt ghi lại (0/${MAX_SPEAKING_RETRIES_PER_TASK})`}
											</span>
										</Button>
										<Button
											type="button"
											size="sm"
											disabled={isFinalizing || isTransitioning}
											onClick={advanceFromPaused}
										>
											<span>
												{session.taskIndex < tasks.length - 1
													? "Câu tiếp theo →"
													: "Hoàn thành phần Speaking"}
											</span>
										</Button>
									</div>
								</div>
							) : null}

							<div className="border-t pt-3">
								{confirmEarlyFinish ? (
									<div
										role="alertdialog"
										aria-label="Xác nhận kết thúc sớm phần Speaking"
										data-testid="speaking-early-finish-confirm"
										className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
									>
										<p className="text-muted-foreground text-sm">
											Bạn chưa hoàn thành tất cả câu Speaking. Dừng và kết thúc
											sớm?
										</p>
										<div className="flex flex-wrap items-center gap-2">
											<Button
												type="button"
												variant="destructive"
												size="sm"
												disabled={isFinalizing}
												onClick={confirmEndEarly}
											>
												{isFinalizing
													? "Đang lưu bài nói..."
													: "Xác nhận kết thúc sớm"}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={isFinalizing}
												onClick={() => setConfirmEarlyFinish(false)}
											>
												Tiếp tục làm bài
											</Button>
										</div>
									</div>
								) : (
									<div className="flex justify-end">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={isFinalizing}
											className="text-muted-foreground hover:text-destructive"
											onClick={() => setConfirmEarlyFinish(true)}
										>
											Kết thúc phần Speaking
										</Button>
									</div>
								)}
							</div>
						</div>
					) : recordedAudio ? (
						<div
							data-testid="speaking-review-box"
							className="space-y-4 rounded-lg border bg-muted/20 p-4"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								{recordedAudio.blob.size > PLACEMENT_SPEAKING_MAX_BYTES ? (
									<span className="inline-flex items-center rounded-full bg-destructive-soft px-2.5 py-0.5 font-medium text-destructive text-xs">
										Bản ghi vượt quá giới hạn dung lượng
									</span>
								) : (
									<span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-0.5 font-medium text-success text-xs">
										Đã ghi âm hoàn tất (sẵn sàng nộp)
									</span>
								)}
								<span className="text-muted-foreground text-xs tabular-nums">
									Thời lượng trả lời: {recordedAudio.durationSec}s ·{" "}
									{(recordedAudio.blob.size / (1024 * 1024)).toFixed(2)} MB / 50
									MB
								</span>
							</div>

							{recordedAudio.blob.size > PLACEMENT_SPEAKING_MAX_BYTES ? (
								<div className="space-y-2">
									<p role="alert" className="text-destructive text-sm">
										Bản ghi vượt quá giới hạn 50 MB. Vui lòng xóa bản ghi để ghi
										lại hoặc liên hệ giáo viên để được hỗ trợ.
									</p>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleResetOversizedRecording}
									>
										<RotateCcw aria-hidden="true" className="size-4" />
										<span>Xóa bản ghi &amp; ghi lại</span>
									</Button>
								</div>
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
						</div>
					) : (
						<div className="space-y-4">
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
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
