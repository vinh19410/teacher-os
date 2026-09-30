import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

/** Debounce autosave PATCH (RT#7) — 600ms sau lần gõ cuối. */
export const QUIZ_AUTOSAVE_DEBOUNCE_MS = 600;

/** localStorage key của mirror: `quiz-attempt:{attemptId}` (RT#11/#14). */
export const quizAttemptMirrorKey = (attemptId: string): string =>
	`quiz-attempt:${attemptId}`;

export type QuizSaveState = "saving" | "saved" | "error";

/** Lý do dừng hàng đợi autosave — mỗi lý do có luồng xử lý riêng (RT#11). */
export type QuizAttemptHaltReason = "auth" | "submitted" | "finalized";

export interface QuizAttemptSnapshot {
	revision: number;
	answers: Record<number, string>;
	saveState: QuizSaveState;
	halted: QuizAttemptHaltReason | null;
}

export type QuizAnswerSender = (
	q: number,
	value: string,
	opts?: { keepalive?: boolean },
) => Promise<void>;

type MirrorStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface MirrorPayload {
	t: number;
	answers: Record<string, string>;
}

interface QuizAttemptStoreOptions {
	attemptId: string;
	/** Answers từ GET quiz lúc mount — baseline cho resume reconciliation. */
	serverAnswers: Readonly<Record<string, string>>;
	send: QuizAnswerSender;
	/** 401 trên PATCH: halt + banner + redirect reauth (route wiring). */
	onAuthError?: () => void;
	/** 409 `submitted` trên PATCH: redirect cứng sang attempt route. */
	onAlreadySubmitted?: () => void;
	debounceMs?: number;
	storage?: MirrorStorage;
	now?: () => number;
}

function defaultStorage(): MirrorStorage | undefined {
	return typeof localStorage === "undefined" ? undefined : localStorage;
}

/** Đọc status từ error structural — store không phụ thuộc HttpError/repo. */
function httpStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const status = (error as { status?: unknown }).status;
	return typeof status === "number" ? status : undefined;
}

function parseQuestionIndex(key: string): number | null {
	const q = Number(key);
	return Number.isInteger(q) && q >= 0 ? q : null;
}

export interface QuizAttemptStore {
	readonly attemptId: string;
	getSnapshot(): QuizAttemptSnapshot;
	subscribe(listener: () => void): () => void;
	setAnswer(q: number, value: string): void;
	getAnswer(q: number): string | undefined;
	isDirty(): boolean;
	flush(opts?: { keepalive?: boolean }): void;
	drain(): Promise<void>;
	finalize(): void;
	dispose(): void;
}

/**
 * Autosave store cho một quiz attempt (#283 phase 3). Framework-agnostic —
 * mọi phụ thuộc (send, storage, clock, callbacks) đều inject được nên logic
 * drain/mirror/halt testable thuần ở node.
 *
 * Invariant: `answers` là truth cục bộ; `pending` là tập key chưa PATCH xong
 * (chưa gửi hoặc gửi lỗi cần retry); mirror localStorage luôn chứa toàn bộ
 * `answers` để reconciliation sau reload khôi phục đúng key chưa tới server.
 */
export function createQuizAttemptStore(
	options: QuizAttemptStoreOptions,
): QuizAttemptStore {
	const {
		attemptId,
		send,
		onAuthError,
		onAlreadySubmitted,
		debounceMs = QUIZ_AUTOSAVE_DEBOUNCE_MS,
		storage = defaultStorage(),
		now = Date.now,
	} = options;

	const mirrorKey = quizAttemptMirrorKey(attemptId);
	const answers = new Map<number, string>();
	const pending = new Map<number, string>();
	const inflight = new Set<Promise<void>>();
	const listeners = new Set<() => void>();
	let halted: QuizAttemptHaltReason | null = null;
	let saveState: QuizSaveState = "saved";
	/** Có PATCH lỗi trong wave hiện tại — sticky cho tới wave flush kế tiếp. */
	let waveFailed = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let snapshot: QuizAttemptSnapshot = {
		revision: 0,
		answers: {},
		saveState,
		halted,
	};

	const emit = (): void => {
		snapshot = {
			revision: snapshot.revision + 1,
			answers: Object.fromEntries(answers),
			saveState,
			halted,
		};
		for (const listener of listeners) listener();
	};

	const readMirror = (): Record<string, string> => {
		const raw = storage?.getItem(mirrorKey);
		if (!raw) return {};
		try {
			const parsed = JSON.parse(raw) as Partial<MirrorPayload> | null;
			if (parsed === null || typeof parsed !== "object") return {};
			return typeof parsed.answers === "object" && parsed.answers !== null
				? (parsed.answers as Record<string, string>)
				: {};
		} catch {
			return {};
		}
	};

	const writeMirror = (): void => {
		if (!storage) return;
		const payload: MirrorPayload = {
			t: now(),
			answers: Object.fromEntries(
				Array.from(answers.entries(), ([q, value]) => [String(q), value]),
			),
		};
		try {
			storage.setItem(mirrorKey, JSON.stringify(payload));
		} catch {
			// Quota/private-mode: mirror là best-effort, không break UI.
		}
	};

	const clearMirror = (): void => {
		try {
			storage?.removeItem(mirrorKey);
		} catch {
			// Storage hỏng hiếm gặp — clear mirror là best-effort.
		}
	};

	const cancelTimer = (): void => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const flushPending = (opts?: { keepalive?: boolean }): void => {
		if (halted !== null || pending.size === 0) return;
		const batch = Array.from(pending.entries());
		pending.clear();
		saveState = "saving";
		for (const [q, value] of batch) {
			const promise = (async () => {
				try {
					await send(q, value, opts);
				} catch (error) {
					const status = httpStatus(error);
					if (status === 401) {
						// Halt giữ nguyên pending + mirror: sau reauth + reload,
						// reconciliation khôi phục đúng key chưa tới server.
						halted = "auth";
						saveState = "error";
						waveFailed = true;
						cancelTimer();
						onAuthError?.();
						return;
					}
					if (status === 409) {
						// Tab khác đã nộp — mirror stale: clear + redirect cứng.
						halted = "submitted";
						saveState = "error";
						waveFailed = true;
						cancelTimer();
						pending.clear();
						clearMirror();
						onAlreadySubmitted?.();
						return;
					}
					waveFailed = true;
					saveState = "error";
					// Re-queue để flush/drain/keepalive kế tiếp retry — chỉ khi
					// value vẫn là mới nhất học viên gõ.
					if (answers.get(q) === value) pending.set(q, value);
					return;
				}
			})();
			inflight.add(promise);
			void promise.then(() => {
				inflight.delete(promise);
				if (inflight.size > 0) {
					// Vẫn còn PATCH đang bay — wave chưa kết luận.
					saveState = "saving";
				} else if (waveFailed) {
					// Wave có lỗi: "error" thắng cả khi pending đã được re-queue
					// để retry — kết quả cuối cùng người học thấy là lỗi lưu.
					saveState = "error";
				} else {
					saveState = pending.size === 0 ? "saved" : "saving";
				}
				emit();
			});
		}
		emit();
	};

	const schedule = (): void => {
		cancelTimer();
		timer = setTimeout(() => {
			timer = null;
			flush({ keepalive: false });
		}, debounceMs);
	};

	/** Gửi NGAY mọi pending — pagehide dùng `keepalive: true`. */
	const flush = (opts?: { keepalive?: boolean }): void => {
		if (pending.size > 0) waveFailed = false;
		flushPending(opts);
	};

	/**
	 * Drain-before-submit (RT#7): cancel debounce, gửi mọi pending, await
	 * toàn bộ PATCH in-flight (kể cả phát sinh trong lúc chờ) — resolves chỉ
	 * khi hàng đợi rỗng và không còn request nào đang bay.
	 */
	const drain = async (): Promise<void> => {
		cancelTimer();
		if (halted !== null) return;
		waveFailed = false;
		for (;;) {
			flushPending();
			if (inflight.size === 0) {
				if (pending.size === 0 || halted !== null) return;
				continue;
			}
			await Promise.all(Array.from(inflight));
			if (halted !== null) return;
		}
	};

	/**
	 * Resume reconciliation (RT#11/#14): merge mirror ĐÈ lên server answers —
	 * mỗi key lệch giá trị là edit chưa tới server → re-queue PATCH delta.
	 * Key trùng giá trị đã an toàn ở server, không gửi lại.
	 */
	const reconcile = (server: Readonly<Record<string, string>>): void => {
		for (const [key, value] of Object.entries(server)) {
			const q = parseQuestionIndex(key);
			if (q !== null) answers.set(q, value);
		}
		let requeued = 0;
		for (const [key, value] of Object.entries(readMirror())) {
			const q = parseQuestionIndex(key);
			if (q === null) continue;
			answers.set(q, value);
			if (server[key] !== value) {
				pending.set(q, value);
				requeued += 1;
			}
		}
		if (requeued > 0) {
			saveState = "saving";
			schedule();
		}
		if (answers.size > 0) emit();
	};

	const store: QuizAttemptStore = {
		attemptId,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot() {
			return snapshot;
		},
		setAnswer(q, value) {
			if (answers.get(q) === value) return;
			answers.set(q, value);
			pending.set(q, value);
			writeMirror();
			if (halted === null) {
				saveState = "saving";
				schedule();
			}
			emit();
		},
		getAnswer(q) {
			return answers.get(q);
		},
		isDirty() {
			return pending.size > 0;
		},
		flush,
		drain,
		/** Sau submit thành công: dừng hẳn + xoá mirror (attempt đã đóng). */
		finalize() {
			cancelTimer();
			pending.clear();
			halted = "finalized";
			clearMirror();
			emit();
		},
		/** Unmount/org-switch: best-effort flush, sau đó reset mirror (RT#14). */
		dispose() {
			cancelTimer();
			flushPending();
			halted = "finalized";
			clearMirror();
		},
	};

	reconcile(options.serverAnswers);
	return store;
}

export interface UseQuizAttemptStoreOptions {
	attemptId: string | null;
	serverAnswers: Record<string, string>;
	send: QuizAnswerSender;
	onAuthError?: () => void;
	onAlreadySubmitted?: () => void;
}

/**
 * React wiring cho store: tạo lại khi attemptId đổi (start/resume), giữ
 * latest send/callbacks qua ref, dispose (flush + clear mirror) khi unmount.
 * `serverAnswers` chỉ đọc lúc tạo store — refetch sau đó không reconcile lại
 * (đè answers cục bộ mới hơn của học viên).
 */
export function useQuizAttemptStore(
	options: UseQuizAttemptStoreOptions,
): QuizAttemptStore | null {
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const attemptId = options.attemptId;
	const [store, setStore] = useState<QuizAttemptStore | null>(null);

	useEffect(() => {
		if (attemptId === null) {
			setStore(null);
			return;
		}
		const current = optionsRef.current;
		const created = createQuizAttemptStore({
			attemptId,
			serverAnswers: current.serverAnswers,
			send: (q, value, opts) => current.send(q, value, opts),
			onAuthError: () => current.onAuthError?.(),
			onAlreadySubmitted: () => current.onAlreadySubmitted?.(),
		});
		setStore(created);
		return () => {
			created.dispose();
			setStore(null);
		};
	}, [attemptId]);

	return store;
}

const EMPTY_SNAPSHOT: QuizAttemptSnapshot = {
	revision: 0,
	answers: {},
	saveState: "saved",
	halted: null,
};

export function useQuizAttemptSnapshot(
	store: QuizAttemptStore | null,
): QuizAttemptSnapshot {
	const subscribe = useCallback(
		(listener: () => void) =>
			store === null ? () => undefined : store.subscribe(listener),
		[store],
	);
	const getSnapshot = useCallback(
		() => (store === null ? EMPTY_SNAPSHOT : store.getSnapshot()),
		[store],
	);
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
