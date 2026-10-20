// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VocabPronunciationButtons } from "./vocab-pronunciation-buttons";

describe("VocabPronunciationButtons", () => {
	beforeEach(() => {
		vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	function renderButtons(
		props?: Partial<Parameters<typeof VocabPronunciationButtons>[0]>,
	) {
		const utils = render(
			<VocabPronunciationButtons
				src="blob:http://localhost/audio-1"
				testIdPrefix="vocab-test"
				{...props}
			/>,
		);
		const audio = utils.container.querySelector("audio") as HTMLAudioElement;
		return { ...utils, audio };
	}

	it("renders normal + slow buttons with no controls attribute anywhere", () => {
		const { container } = renderButtons();
		expect(screen.getByTestId("vocab-test-normal").textContent).toContain(
			"Nghe",
		);
		expect(screen.getByTestId("vocab-test-slow").textContent).toContain(
			"Nghe chậm",
		);
		expect(container.querySelector("[controls]")).toBeNull();
		expect(
			screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("click Nghe plays at rate 1 and marks the normal button active", () => {
		const { audio } = renderButtons();
		fireEvent.click(screen.getByTestId("vocab-test-normal"));
		expect(audio.play).toHaveBeenCalled();
		expect(audio.playbackRate).toBe(1);
		expect(
			screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen.getByTestId("vocab-test-slow").getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("click Nghe chậm plays at 0.6 from the start, keeps pitch, deactivates normal", () => {
		const { audio } = renderButtons();
		fireEvent.click(screen.getByTestId("vocab-test-slow"));
		expect(audio.playbackRate).toBe(0.6);
		expect(audio.currentTime).toBe(0);
		expect(audio.preservesPitch).toBe(true);
		expect(
			screen.getByTestId("vocab-test-slow").getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("ended event resets aria-pressed on both buttons", () => {
		const { audio } = renderButtons();
		fireEvent.click(screen.getByTestId("vocab-test-normal"));
		expect(
			screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
		).toBe("true");
		fireEvent(audio, new Event("ended"));
		expect(
			screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
		).toBe("false");
		expect(
			screen.getByTestId("vocab-test-slow").getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("rejected play() resets active state without throwing", async () => {
		vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(
			new Error("decode failure"),
		);
		renderButtons();
		fireEvent.click(screen.getByTestId("vocab-test-normal"));
		await vi.waitFor(() => {
			expect(
				screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
			).toBe("false");
		});
	});

	it("stale play() AbortError does not clobber the newer playback state (race token)", async () => {
		let rejectFirst: ((reason: unknown) => void) | undefined;
		const deferred = new Promise<undefined>((_resolve, reject) => {
			rejectFirst = reject;
		});
		const playMock = vi
			.spyOn(HTMLMediaElement.prototype, "play")
			.mockImplementationOnce(() => deferred)
			.mockImplementationOnce(() => Promise.resolve(undefined));

		renderButtons();
		// Lần 1: "Nghe" — promise play() cố tình giữ pending.
		fireEvent.click(screen.getByTestId("vocab-test-normal"));
		expect(playMock).toHaveBeenCalledTimes(1);
		// Lần 2: "Nghe chậm" — pause() làm promise lần 1 reject AbortError sau này.
		fireEvent.click(screen.getByTestId("vocab-test-slow"));
		expect(
			screen.getByTestId("vocab-test-slow").getAttribute("aria-pressed"),
		).toBe("true");

		// Cờ xác nhận catch của promise lần 1 đã thực sự chạy trước khi assert.
		let staleCaught = false;
		deferred.catch(() => {
			staleCaught = true;
		});
		if (!rejectFirst) {
			throw new Error("deferred executor not initialized");
		}
		rejectFirst(new DOMException("interrupted by pause()", "AbortError"));
		await vi.waitFor(() => {
			expect(staleCaught).toBe(true);
		});
		// Token guard: catch cũ không được tắt trạng thái của lần 2.
		expect(
			screen.getByTestId("vocab-test-slow").getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("pauses playback on unmount so detached audio does not keep playing", () => {
		const pauseMock = vi.mocked(HTMLMediaElement.prototype.pause);
		const { unmount } = renderButtons();
		fireEvent.click(screen.getByTestId("vocab-test-normal"));
		const pauseCallsBeforeUnmount = pauseMock.mock.calls.length;
		expect(pauseCallsBeforeUnmount).toBeGreaterThan(0);
		unmount();
		expect(pauseMock.mock.calls.length).toBeGreaterThan(
			pauseCallsBeforeUnmount,
		);
	});

	it("playing event re-asserts playbackRate from the latest click (engine reset guard)", () => {
		const { audio } = renderButtons();
		fireEvent.click(screen.getByTestId("vocab-test-slow"));
		expect(audio.playbackRate).toBe(0.6);
		// Mô phỏng engine reset rate khi load xong.
		audio.playbackRate = 1;
		fireEvent(audio, new Event("playing"));
		expect(audio.playbackRate).toBe(0.6);
	});

	it("changing src stops playback and clears active state", () => {
		const { rerender } = renderButtons();
		fireEvent.click(screen.getByTestId("vocab-test-normal"));
		expect(
			screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
		).toBe("true");
		rerender(
			<VocabPronunciationButtons
				src="blob:http://localhost/audio-2"
				testIdPrefix="vocab-test"
			/>,
		);
		expect(
			screen.getByTestId("vocab-test-normal").getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("disabled disables both buttons", () => {
		renderButtons({ disabled: true });
		expect(
			(screen.getByTestId("vocab-test-normal") as HTMLButtonElement).disabled,
		).toBe(true);
		expect(
			(screen.getByTestId("vocab-test-slow") as HTMLButtonElement).disabled,
		).toBe(true);
	});
});
