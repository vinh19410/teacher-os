// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	StudyPackItemDetailView,
	StudyPackItemView,
} from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyPackItemViewer } from "./study-pack-item-viewer";

const mockGetStudyPackItemDetail =
	vi.fn<(packId: string, itemId: string) => Promise<StudyPackItemDetailView>>();
const mockFetchStudyPackItemAudio =
	vi.fn<
		(packId: string, itemId: string, signal?: AbortSignal) => Promise<string>
	>();

vi.mock("@/lib/repos/study-pack", () => ({
	getStudyPackItemDetail: (packId: string, itemId: string) =>
		mockGetStudyPackItemDetail(packId, itemId),
	fetchStudyPackItemAudio: (
		packId: string,
		itemId: string,
		signal?: AbortSignal,
	) => mockFetchStudyPackItemAudio(packId, itemId, signal),
}));

function renderWithQuery(ui: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>{ui}</QueryClientProvider>,
	);
}

const readingItem: StudyPackItemView = {
	id: "item-read",
	dayIndex: 1,
	position: 0,
	sourceKind: "org_prompt",
	sourceId: "ap-read-1",
	title: "Reading Passage 1: Urban Trees",
	skill: "reading",
	part: "p1",
	type: "mcq",
	level: "B2",
	status: "ready",
	note: "Ghi chú riêng cho buổi 1",
};

const readingDetail: StudyPackItemDetailView = {
	...readingItem,
	band: "6.5",
	source: "Cambridge 15",
	prompt: "Answer all questions below.",
	intro: "Questions 1–3",
	passage: "Urban forests cool city streets during heatwaves.",
	transcript: "",
	audioName: "",
	hasAudio: false,
	imageUrl: "",
	optionBank: ["Cooling effect", "Air quality"],
	exerciseNote: "Đọc kỹ câu hỏi trước khi tìm đoạn văn.",
	questions: [
		{
			stem: "What do urban forests reduce?",
			opts: ["Noise only", "Street heat", "Traffic"],
			answer: "B",
			alts: "",
			type: "mcq",
			explanation: "Đoạn văn nêu rõ cây xanh làm mát đường phố.",
		},
		{
			stem: "Trees worsen heatwaves.",
			opts: null,
			answer: "FALSE",
			alts: "",
			type: "tfng",
		},
		{
			stem: "Urban forests cool [___] during summer.",
			opts: null,
			answer: "city streets",
			alts: "streets",
			type: "gap",
		},
	],
};

const listeningItem: StudyPackItemView = {
	id: "item-listen",
	dayIndex: 2,
	position: 0,
	sourceKind: "library_exercise",
	sourceId: "lib-ex-1",
	title: "Listening Part 1: Library Registration",
	skill: "listening",
	part: "p1",
	type: "mcq",
	level: "B1",
	status: "ready",
	note: "Ghi chú chung",
};

const listeningDetail: StudyPackItemDetailView = {
	...listeningItem,
	band: "6.0",
	source: "System Library",
	prompt: "",
	intro: "Listen and choose the correct answer.",
	passage: "",
	transcript: "Receptionist: Welcome to Central Library.",
	audioName: "library-part1.mp3",
	hasAudio: true,
	imageUrl: "",
	optionBank: [],
	exerciseNote: "Ghi chú chung",
	questions: [
		{
			stem: "Where is the speaker?",
			opts: ["School", "Library"],
			answer: "B",
			alts: "",
			type: "mcq",
		},
	],
};

const writingItem: StudyPackItemView = {
	id: "item-write",
	dayIndex: 3,
	position: 0,
	sourceKind: "org_prompt",
	sourceId: "ap-write-1",
	title: "Writing Task 2: Remote Work",
	skill: "writing",
	part: "task2",
	type: "opinion",
	level: "B2",
	status: "ready",
	note: "",
};

const writingDetail: StudyPackItemDetailView = {
	...writingItem,
	band: "7.0",
	source: "",
	prompt: "Discuss remote work advantages.",
	intro: "",
	passage: "",
	transcript: "",
	audioName: "",
	hasAudio: false,
	imageUrl: "",
	optionBank: [],
	exerciseNote: "",
	questions: [],
};

let urlCounter = 0;
let createObjectUrlSpy: ReturnType<typeof vi.spyOn>;
let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	mockGetStudyPackItemDetail.mockReset();
	mockFetchStudyPackItemAudio.mockReset();
	urlCounter = 0;
	createObjectUrlSpy = vi
		.spyOn(URL, "createObjectURL")
		.mockImplementation(() => `blob:mock-${++urlCounter}`);
	revokeObjectUrlSpy = vi
		.spyOn(URL, "revokeObjectURL")
		.mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	createObjectUrlSpy.mockRestore();
	revokeObjectUrlSpy.mockRestore();
});

describe("StudyPackItemViewer", () => {
	it("renders passage, option bank, deduplicated notes, highlighted keys, and explanations in Đề & Đáp án tab", async () => {
		mockGetStudyPackItemDetail.mockResolvedValue(readingDetail);

		renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={readingItem}
				activeTab="key"
				onTabChange={vi.fn()}
			/>,
		);

		expect(
			await screen.findByText("Reading Passage 1: Urban Trees"),
		).toBeTruthy();
		expect(
			screen.getByText("Urban forests cool city streets during heatwaves."),
		).toBeTruthy();
		expect(screen.getByText("Ghi chú buổi học")).toBeTruthy();
		expect(screen.getByText("Ghi chú bài tập")).toBeTruthy();
		expect(screen.getByText("Cooling effect")).toBeTruthy();
		expect(screen.getAllByText("Đáp án đúng").length).toBeGreaterThanOrEqual(2);
		expect(screen.getByText("city streets")).toBeTruthy();
		expect(screen.getByText("(Chấp nhận: streets)")).toBeTruthy();
		expect(screen.getByText("Giải thích")).toBeTruthy();
		expect(
			screen.getByText("Đoạn văn nêu rõ cây xanh làm mát đường phố."),
		).toBeTruthy();
	});

	it("loads listening blob audio via Nghe thử, toggles transcript, and revokes blob URLs on item switch/unmount", async () => {
		mockGetStudyPackItemDetail
			.mockResolvedValueOnce(listeningDetail)
			.mockResolvedValueOnce(readingDetail);
		mockFetchStudyPackItemAudio.mockResolvedValue("blob:audio-1");

		const onTabChange = vi.fn();
		const { rerender, unmount } = renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={listeningItem}
				activeTab="key"
				onTabChange={onTabChange}
			/>,
		);

		await screen.findByText("Listening Part 1: Library Registration");
		// Deduplicated identical note shows a single "Ghi chú" heading
		expect(screen.getAllByText("Ghi chú")).toHaveLength(1);

		fireEvent.click(screen.getByRole("button", { name: "Nghe thử" }));
		await waitFor(() => {
			expect(mockFetchStudyPackItemAudio).toHaveBeenCalledWith(
				"pack-1",
				"item-listen",
				expect.any(AbortSignal),
			);
		});

		const audioEl = (await screen.findByTestId(
			"study-pack-preview-audio",
		)) as HTMLAudioElement;
		expect(audioEl.getAttribute("src")).toBe("blob:audio-1");

		// Toggle collapsible transcript
		const transcriptBtn = screen.getByRole("button", { name: /Transcript/ });
		expect(transcriptBtn.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(transcriptBtn);
		expect(transcriptBtn.getAttribute("aria-expanded")).toBe("true");
		expect(
			screen.getByText("Receptionist: Welcome to Central Library."),
		).toBeTruthy();

		// Switch item -> revokes old blob URL
		rerender(
			<QueryClientProvider
				client={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<StudyPackItemViewer
					packId="pack-1"
					item={readingItem}
					activeTab="key"
					onTabChange={onTabChange}
				/>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:audio-1");
		});
		unmount();
	});

	it("auto-loads audio and grades interactive simulation in Làm thử tab", async () => {
		mockGetStudyPackItemDetail.mockResolvedValue(listeningDetail);
		mockFetchStudyPackItemAudio.mockResolvedValue("blob:audio-sim");

		renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={listeningItem}
				activeTab="sim"
				onTabChange={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(mockFetchStudyPackItemAudio).toHaveBeenCalledWith(
				"pack-1",
				"item-listen",
				expect.any(AbortSignal),
			);
		});

		const simAudioTake = await screen.findByTestId("quiz-audio-player");
		expect(simAudioTake.getAttribute("src")).toBe("blob:audio-sim");
		expect(simAudioTake.getAttribute("aria-label")).toBe("Bài nghe");
		expect(screen.queryByText(/library-part1\.mp3/)).toBeNull();
		expect(screen.queryByText(/🔊/)).toBeNull();

		// Answer question B (Library) and submit simulation
		const libraryRadio = await screen.findByRole("radio", { name: /Library/ });
		fireEvent.click(libraryRadio);
		fireEvent.click(screen.getByRole("button", { name: /Nộp bài/ }));

		const correctCount = await screen.findByTestId("attempt-correct-count");
		expect(correctCount.textContent?.trim()).toBe("1");
		expect(screen.getByText(/trên tổng 1 câu/)).toBeTruthy();
		expect(
			screen.getByText("Receptionist: Welcome to Central Library."),
		).toBeTruthy();
		const simAudioReview = screen.getByTestId("quiz-audio-player");
		expect(simAudioReview.getAttribute("aria-label")).toBe("Bài nghe");
		expect(screen.queryByText(/library-part1\.mp3/)).toBeNull();
		expect(screen.queryByText(/🔊/)).toBeNull();
	});

	it("shows clear empty/notice state for non-auto skills in Làm thử tab and allows switching back", async () => {
		mockGetStudyPackItemDetail.mockResolvedValue(writingDetail);
		const onTabChange = vi.fn();

		renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={writingItem}
				activeTab="sim"
				onTabChange={onTabChange}
			/>,
		);

		expect(
			await screen.findByText(/chưa hỗ trợ làm thử trực tiếp/),
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Mở Đề & Đáp án" }));
		expect(onTabChange).toHaveBeenCalledWith("key");
	});

	it("shows error state with retry button when detail query fails", async () => {
		mockGetStudyPackItemDetail
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce(readingDetail);

		renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={readingItem}
				activeTab="key"
				onTabChange={vi.fn()}
			/>,
		);

		expect(
			await screen.findByText("Không tải được chi tiết bài tập này."),
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
		expect(
			await screen.findByText("Reading Passage 1: Urban Trees"),
		).toBeTruthy();
	});

	it("renders rich-text HTML exerciseNote cleanly and skips auto audio fetch in Làm thử for non-listening items", async () => {
		mockGetStudyPackItemDetail.mockResolvedValue({
			...readingDetail,
			hasAudio: true,
			exerciseNote: "<p><strong>Mẹo đọc:</strong> Tìm từ khoá trước</p>",
		});

		const { container } = renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={readingItem}
				activeTab="key"
				onTabChange={vi.fn()}
			/>,
		);

		await screen.findByText("Mẹo đọc:");
		expect(container.textContent).not.toContain("<strong>");

		renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={readingItem}
				activeTab="sim"
				onTabChange={vi.fn()}
			/>,
		);

		await screen.findByRole("button", { name: /Nộp bài/ });
		expect(mockFetchStudyPackItemAudio).not.toHaveBeenCalled();
	});

	it("preserves MCQ choices in Làm thử when detail.type is empty, supports blank-stem answerable questions, and revokes aborted audio fetches", async () => {
		mockGetStudyPackItemDetail.mockResolvedValue({
			...readingDetail,
			type: "",
			intro: "<p><strong>Hướng dẫn HTML</strong></p>",
			prompt: "<p>Yêu cầu đề HTML</p>",
			passage: "<p>Đoạn văn HTML</p>",
			transcript: "",
			questions: [
				{
					stem: "",
					opts: ["Option X", "Option Y"],
					answer: "B",
					alts: "",
					type: null,
					pin: null,
					explanation: "",
				},
			],
		});

		const { container } = renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={{ ...readingItem, type: "" }}
				activeTab="key"
				onTabChange={vi.fn()}
			/>,
		);

		await screen.findByText("Hướng dẫn HTML");
		expect(container.textContent).not.toContain("<strong>");
		expect(container.textContent).not.toContain("<p>");
		const simView = renderWithQuery(
			<StudyPackItemViewer
				packId="pack-1"
				item={{ ...readingItem, type: "" }}
				activeTab="sim"
				onTabChange={vi.fn()}
			/>,
		);
		expect(
			await simView.findByRole("radio", { name: /Option X/ }),
		).toBeTruthy();

		// Aborted in-flight audio request must revoke its resolved blob URL
		let resolveAudio!: (url: string) => void;
		let capturedSignal: AbortSignal | undefined;
		mockGetStudyPackItemDetail.mockResolvedValue(listeningDetail);
		mockFetchStudyPackItemAudio.mockImplementationOnce(
			(_packId, _itemId, signal) => {
				capturedSignal = signal;
				return new Promise<string>((resolve) => {
					resolveAudio = resolve;
				});
			},
		);

		const revokeSpy = vi.fn();
		Object.defineProperty(URL, "revokeObjectURL", {
			writable: true,
			configurable: true,
			value: revokeSpy,
		});

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { rerender } = render(
			<QueryClientProvider client={client}>
				<StudyPackItemViewer
					packId="pack-1"
					item={listeningItem}
					activeTab="sim"
					onTabChange={vi.fn()}
				/>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(mockFetchStudyPackItemAudio).toHaveBeenCalledTimes(1);
		});

		rerender(
			<QueryClientProvider client={client}>
				<StudyPackItemViewer
					packId="pack-1"
					item={readingItem}
					activeTab="key"
					onTabChange={vi.fn()}
				/>
			</QueryClientProvider>,
		);
		expect(capturedSignal?.aborted).toBe(true);

		resolveAudio("blob:aborted-url");
		await waitFor(() => {
			expect(revokeSpy).toHaveBeenCalledWith("blob:aborted-url");
		});
	});
});
