import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createQuizAttemptStore,
	QUIZ_AUTOSAVE_DEBOUNCE_MS,
	type QuizAnswerSender,
	quizAttemptMirrorKey,
} from "@/lib/quiz-attempt-store";

function memoryStorage(initial: Record<string, string> = {}) {
	const stored = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => stored.get(key) ?? null,
		setItem: (key: string, value: string) => void stored.set(key, value),
		removeItem: (key: string) => void stored.delete(key),
	};
}

function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const statusError = (status: number) =>
	Object.assign(new Error(`http ${status}`), { status });

function makeStore(
	overrides: Partial<{
		attemptId: string;
		send: QuizAnswerSender;
		serverAnswers: Record<string, string>;
		stored: Record<string, string>;
		onAuthError: () => void;
		onAlreadySubmitted: () => void;
	}> = {},
) {
	const attemptId = overrides.attemptId ?? `attempt-${crypto.randomUUID()}`;
	const storage = memoryStorage(overrides.stored);
	const send = vi.fn(
		overrides.send ?? ((): Promise<void> => Promise.resolve()),
	);
	const store = createQuizAttemptStore({
		attemptId,
		serverAnswers: overrides.serverAnswers ?? {},
		send,
		storage,
		onAuthError: overrides.onAuthError,
		onAlreadySubmitted: overrides.onAlreadySubmitted,
	});
	return { store, attemptId, storage, send };
}

function mirrorOf(harness: {
	attemptId: string;
	storage: ReturnType<typeof memoryStorage>;
}): string | null {
	return harness.storage.getItem(quizAttemptMirrorKey(harness.attemptId));
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("QuizAttemptStore — debounce autosave", () => {
	it("gộp edits trong 600ms và chỉ gửi value mới nhất mỗi câu", async () => {
		const h = makeStore();
		h.store.setAnswer(0, "gl");
		h.store.setAnswer(0, "glu");
		h.store.setAnswer(1, "TRUE");
		expect(h.send).not.toHaveBeenCalled();
		expect(h.store.getSnapshot().saveState).toBe("saving");

		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);
		expect(h.send).toHaveBeenCalledTimes(2);
		expect(h.send).toHaveBeenCalledWith(0, "glu", { keepalive: false });
		expect(h.send).toHaveBeenCalledWith(1, "TRUE", { keepalive: false });
		expect(h.store.getSnapshot().saveState).toBe("saved");
		expect(h.store.isDirty()).toBe(false);
	});

	it("mirror answers vào localStorage sau mỗi lần gõ", () => {
		const h = makeStore();
		h.store.setAnswer(4, "glue");
		const raw = mirrorOf(h);
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw as string) as {
			t: number;
			answers: Record<string, string>;
		};
		expect(typeof parsed.t).toBe("number");
		expect(parsed.answers).toEqual({ "4": "glue" });
	});
});

describe("QuizAttemptStore — drain-before-submit (RT#7)", () => {
	it("drain gửi pending NGAY (không đợi debounce) và chỉ resolve sau PATCH xong", async () => {
		const gate = deferred();
		const h = makeStore({ send: () => gate.promise });
		const afterDrain = vi.fn();
		h.store.setAnswer(2, "glue");

		const drained = h.store.drain().then(() => {
			afterDrain();
		});
		expect(h.send).toHaveBeenCalledWith(2, "glue", undefined);
		expect(h.store.isDirty()).toBe(false);
		await Promise.resolve();
		expect(afterDrain).not.toHaveBeenCalled();

		gate.resolve();
		await drained;
		expect(afterDrain).toHaveBeenCalledTimes(1);
		expect(h.store.getSnapshot().saveState).toBe("saved");
	});

	it("drain await cả in-flight PATCH của wave trước", async () => {
		const gates = [deferred(), deferred()];
		let call = 0;
		const h = makeStore({ send: () => gates[call++].promise });
		h.store.setAnswer(0, "a");
		h.store.setAnswer(1, "b");
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);

		const drained = h.store.drain();
		gates[0].resolve();
		gates[1].resolve();
		await drained;
		expect(h.store.getSnapshot().saveState).toBe("saved");
	});
});

describe("QuizAttemptStore — resume reconciliation (RT#11/#14)", () => {
	it("merge mirror ĐÈ server, re-queue PATCH chỉ cho key lệch giá trị", async () => {
		const attemptId = "attempt-resume";
		const h = makeStore({
			attemptId,
			serverAnswers: { "1": "same", "2": "server-only" },
			stored: {
				[quizAttemptMirrorKey(attemptId)]: JSON.stringify({
					t: 123,
					answers: { "1": "same", "3": "mirror-only" },
				}),
			},
		});
		expect(h.store.getAnswer(1)).toBe("same");
		expect(h.store.getAnswer(2)).toBe("server-only");
		expect(h.store.getAnswer(3)).toBe("mirror-only");

		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);
		expect(h.send).toHaveBeenCalledTimes(1);
		expect(h.send).toHaveBeenCalledWith(3, "mirror-only", {
			keepalive: false,
		});
	});

	it("không có mirror → dùng nguyên server answers, không gửi gì", async () => {
		const h = makeStore({ serverAnswers: { "0": "TRUE" } });
		expect(h.store.getAnswer(0)).toBe("TRUE");
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);
		expect(h.send).not.toHaveBeenCalled();
		expect(h.store.getSnapshot().saveState).toBe("saved");
	});
});

describe("QuizAttemptStore — 401/409 handling (RT#11)", () => {
	it("PATCH 409 → clear mirror + halt + onAlreadySubmitted", async () => {
		const onAlreadySubmitted = vi.fn();
		const attemptId = "attempt-409";
		const h = makeStore({
			attemptId,
			send: () => Promise.reject(statusError(409)),
			onAlreadySubmitted,
			stored: {
				[quizAttemptMirrorKey(attemptId)]: JSON.stringify({
					t: 1,
					answers: { "0": "x" },
				}),
			},
		});
		h.store.setAnswer(0, "x");
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);

		expect(onAlreadySubmitted).toHaveBeenCalledTimes(1);
		expect(mirrorOf(h)).toBeNull();

		h.store.setAnswer(1, "y");
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);
		expect(h.send).toHaveBeenCalledTimes(1);
		expect(h.store.getSnapshot().saveState).toBe("error");
	});

	it("PATCH 401 → halt queue + onAuthError, mirror GIỮ để khôi phục sau reauth", async () => {
		const onAuthError = vi.fn();
		const h = makeStore({
			send: () => Promise.reject(statusError(401)),
			onAuthError,
		});
		h.store.setAnswer(0, "unsent");
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);

		expect(onAuthError).toHaveBeenCalledTimes(1);
		expect(h.store.getSnapshot().halted).toBe("auth");
		const raw = mirrorOf(h);
		expect(raw).not.toBeNull();
		expect(
			(JSON.parse(raw as string) as { answers: Record<string, string> })
				.answers["0"],
		).toBe("unsent");

		h.store.setAnswer(1, "later");
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);
		expect(h.send).toHaveBeenCalledTimes(1);
	});

	it("lỗi khác (mạng/5xx) → save-state error và retry ở wave kế tiếp", async () => {
		let fail = true;
		const h = makeStore({
			send: () => (fail ? Promise.reject(statusError(503)) : Promise.resolve()),
		});
		h.store.setAnswer(0, "glue");
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);
		expect(h.store.getSnapshot().saveState).toBe("error");

		fail = false;
		h.store.setAnswer(0, "glue2");
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);
		expect(h.send).toHaveBeenCalledTimes(2);
		expect(h.send).toHaveBeenLastCalledWith(0, "glue2", { keepalive: false });
		expect(h.store.getSnapshot().saveState).toBe("saved");
	});
});

describe("QuizAttemptStore — flush/finalize/dispose", () => {
	it("flush({keepalive:true}) gửi ngay với keepalive cho pagehide", () => {
		const h = makeStore();
		h.store.setAnswer(7, "last-keystroke");
		h.store.flush({ keepalive: true });
		expect(h.send).toHaveBeenCalledWith(7, "last-keystroke", {
			keepalive: true,
		});
	});

	it("finalize dừng gửi và xoá mirror (sau submit thành công)", async () => {
		const h = makeStore();
		h.store.setAnswer(0, "done");
		h.store.finalize();
		await vi.advanceTimersByTimeAsync(QUIZ_AUTOSAVE_DEBOUNCE_MS);
		expect(h.send).not.toHaveBeenCalled();
		expect(mirrorOf(h)).toBeNull();
	});

	it("dispose flush best-effort pending rồi xoá mirror", () => {
		const h = makeStore();
		h.store.setAnswer(0, "bye");
		h.store.dispose();
		expect(h.send).toHaveBeenCalledWith(0, "bye", undefined);
		expect(mirrorOf(h)).toBeNull();
	});
});
