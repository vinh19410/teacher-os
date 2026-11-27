// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	AiGradingDraftView,
	GradingQueueItemV2,
	TeacherAutoSubmission,
	TeacherSubmission,
} from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/kernel-load-state";
import * as gradingRepo from "@/lib/repos/grading";
import { gradingQueryKey, gradingQueueQueryKey } from "@/lib/repos/grading";
import { kernelQueryKey } from "@/lib/repos/kernel";

const mockNavigate = vi.fn();
const mockSearch = vi.hoisted(() => ({
	current: {} as {
		q?: string;
		mode?: "assignment" | "practice";
		skill?:
			| "writing"
			| "speaking"
			| "reading"
			| "listening"
			| "grammar"
			| "vocabulary";
		status?: "awaiting" | "graded" | "auto";
		from?: "grading" | "class" | "student";
	},
}));
const mockParams = vi.hoisted(() => ({
	attemptId: "att-prac-1",
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useParams: () => mockParams,
		useSearch: () => mockSearch.current,
	}),
	useNavigate: () => mockNavigate,
	useSearch: () => mockSearch.current,
	Link: ({
		to,
		params,
		search,
		children,
		...rest
	}: {
		to: string;
		params?: Record<string, string>;
		search?: Record<string, string>;
		children?: React.ReactNode;
	} & Record<string, unknown>) => {
		let href = to;
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				href = href.replace(`$${k}`, v);
			}
		}
		if (search && Object.keys(search).length > 0) {
			const qs = new URLSearchParams(search).toString();
			if (qs) href = `${href}?${qs}`;
		}
		return (
			<a href={href} {...rest}>
				{children}
			</a>
		);
	},
}));

import { GradingRoute } from "./$attemptId";
import { GradingQueueRoute, validateGradingSearch } from "./index";

const QUEUE_ITEMS: GradingQueueItemV2[] = [
	{
		attemptId: "att-prac-w",
		mode: "practice",
		classId: "",
		className: "Luyện tập",
		title: "Writing Mock 1 — Technology",
		due: "",
		student: { id: "s-1", name: "Bảo Ngọc" },
		skill: "writing",
		part: "task2",
		submittedAt: "2026-10-20T10:00:00.000Z",
		grade: null,
	},
	{
		attemptId: "att-assign-s",
		mode: "assignment",
		classId: "class-1",
		className: "IELTS 6.5 Tối",
		title: "Speaking Part 2 — A memorable trip",
		due: "2026-10-25",
		student: { id: "s-2", name: "Lê Quang Huy" },
		skill: "speaking",
		part: "part2",
		submittedAt: "2026-10-19T14:00:00.000Z",
		grade: null,
	},
	{
		attemptId: "att-assign-w-graded",
		mode: "assignment",
		classId: "class-1",
		className: "IELTS 6.5 Tối",
		title: "Writing Task 1 — Line Graph",
		due: "2026-10-18",
		student: { id: "s-1", name: "Bảo Ngọc" },
		skill: "writing",
		part: "task1",
		submittedAt: "2026-10-18T09:00:00.000Z",
		grade: {
			scores: { task: 6.5, coherence: 6.5, lexical: 6.5, grammar: 6.5 },
			band: 6.5,
			feedback: "Rõ bố cục.",
			gradedAt: "2026-10-18T12:00:00.000Z",
		},
	},
];

function renderQueue(items: GradingQueueItemV2[] = QUEUE_ITEMS) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	client.setQueryData(gradingQueueQueryKey, { items });
	return render(
		<QueryClientProvider client={client}>
			<GradingQueueRoute />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	mockNavigate.mockReset();
	mockSearch.current = {};
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("GradingQueueRoute (/grading #383)", () => {
	it("validateSearch chuẩn hóa giá trị lạ về undefined và giữ nguyên giá trị hợp lệ", () => {
		expect(
			validateGradingSearch({
				q: "ngoc",
				mode: "practice",
				skill: "writing",
				status: "awaiting",
			}),
		).toEqual({
			q: "ngoc",
			mode: "practice",
			skill: "writing",
			status: "awaiting",
		});
		expect(
			validateGradingSearch({
				q: "",
				mode: "xyz",
				skill: "unknown",
				status: "invalid",
			}),
		).toEqual({
			q: undefined,
			mode: undefined,
			skill: undefined,
			status: undefined,
		});
		expect(
			validateGradingSearch({
				skill: "grammar",
				status: "auto",
			}),
		).toEqual({
			q: undefined,
			mode: undefined,
			skill: "grammar",
			status: "auto",
		});
	});

	it("hiển thị danh sách bài nộp, nhãn Luyện tập, trạng thái Chờ chấm / Đã chấm và aria-label theo học viên", () => {
		renderQueue();
		expect(screen.getByRole("heading", { name: "Chấm bài" })).toBeTruthy();
		expect(screen.getByText("Writing Mock 1 — Technology")).toBeTruthy();
		expect(screen.getByText("Speaking Part 2 — A memorable trip")).toBeTruthy();
		expect(screen.getByText("Writing Task 1 — Line Graph")).toBeTruthy();

		// Link hành động từng dòng có aria-label phân biệt với mục nav "Chấm bài"
		const gradeNgoc = screen.getByRole("link", {
			name: "Chấm bài của Bảo Ngọc",
		});
		expect(gradeNgoc.getAttribute("href")).toBe(
			"/grading/att-prac-w?from=grading",
		);
		const gradeHuy = screen.getByRole("link", {
			name: "Chấm bài của Lê Quang Huy",
		});
		expect(gradeHuy.getAttribute("href")).toBe(
			"/grading/att-assign-s?from=grading",
		);
		const editNgoc = screen.getByRole("link", {
			name: "Xem / sửa điểm của Bảo Ngọc",
		});
		expect(editNgoc.getAttribute("href")).toBe(
			"/grading/att-assign-w-graded?from=grading",
		);
		expect(screen.getByText("Đã chấm · Band 6.5")).toBeTruthy();
	});

	it("hiển thị bài tự chấm với trạng thái Tự chấm · X/Y, link Xem bài làm, không tính vào bài chờ chấm (#978)", () => {
		renderQueue([
			...QUEUE_ITEMS,
			{
				attemptId: "att-grammar-1",
				mode: "assignment",
				classId: "class-1",
				className: "IELTS Foundation 5.5 (Test)",
				title: "[Integration test] Grammar quick check 26/11",
				due: "2026-11-30",
				student: { id: "s-3", name: "Grok Test Student" },
				skill: "grammar",
				part: "grammar",
				submittedAt: "2026-11-26T08:29:00.000Z",
				grade: null,
				aiStatus: null,
				aiGradingMode: null,
				autoScore: { correctCount: 3, totalCount: 3 },
			},
		]);

		// Chỉ 2 bài Writing/Speaking chưa chấm (att-prac-w, att-assign-s), KHÔNG tính att-grammar-1
		expect(document.body.textContent).toContain(
			"2 bài chờ chấm · 4 bài đã nộp",
		);
		expect(document.body.textContent).not.toContain("Grammar · Grammar");
		expect(screen.getByText("Tự chấm · 3/3")).toBeTruthy();
		const reviewLink = screen.getByRole("link", {
			name: "Xem bài làm của Grok Test Student",
		});
		expect(reviewLink.getAttribute("href")).toBe(
			"/grading/att-grammar-1?from=grading",
		);
		expect(reviewLink.textContent).toBe("Xem bài làm");
	});

	it("lọc theo nguồn bài (Luyện tập), kỹ năng, trạng thái và tính counts chéo nhóm chính xác", () => {
		mockSearch.current = { mode: "practice" };
		renderQueue();

		// Chỉ còn dòng practice của Bảo Ngọc
		expect(screen.getByText("Writing Mock 1 — Technology")).toBeTruthy();
		expect(screen.queryByText("Speaking Part 2 — A memorable trip")).toBeNull();
		expect(screen.queryByText("Writing Task 1 — Line Graph")).toBeNull();

		// Group Nguồn bài vẫn đếm tổng trên tập chưa lọc mode: Bài tập lớp = 2, Luyện tập = 1
		const sourceGroup = screen.getByRole("group", { name: "Nguồn bài" });
		expect(sourceGroup.textContent).toContain("Bài tập lớp2");
		expect(sourceGroup.textContent).toContain("Luyện tập1");

		// Group Kỹ năng đếm trên tập đã lọc mode=practice: Writing = 1, Speaking = 0
		const skillGroup = screen.getByRole("group", { name: "Kỹ năng" });
		expect(skillGroup.textContent).toContain("Writing1");
		expect(skillGroup.textContent).toContain("Speaking0");

		// Bấm "Xóa bộ lọc" đẩy search rỗng lên URL
		fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/grading",
			search: {},
			replace: true,
		});
	});

	it("ô tìm kiếm debounce 300ms mới đẩy ?q= lên URL và lọc bỏ dấu tiếng Việt", () => {
		vi.useFakeTimers();
		renderQueue();
		const input = screen.getByLabelText(
			"Tìm theo học viên, tiêu đề đề hoặc lớp",
		);
		fireEvent.change(input, { target: { value: "quang huy" } });

		// Lọc client tức thì theo state query
		expect(screen.getByText("Speaking Part 2 — A memorable trip")).toBeTruthy();
		expect(screen.queryByText("Writing Mock 1 — Technology")).toBeNull();

		// Chưa hết 300ms -> chưa navigate
		vi.advanceTimersByTime(299);
		expect(mockNavigate).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/grading",
			search: { q: "quang huy" },
			replace: true,
		});
	});

	it("hiển thị empty state khi tổ chức chưa có bài nộp và khi bộ lọc không khớp", () => {
		renderQueue([]);
		expect(screen.getByTestId("grading-empty-state")).toBeTruthy();
		expect(screen.getByText("Chưa có bài nộp cần chấm")).toBeTruthy();
		cleanup();

		mockSearch.current = { mode: "practice", skill: "speaking" };
		renderQueue(QUEUE_ITEMS);
		expect(
			screen.getByText("Không có bài nộp nào phù hợp với bộ lọc."),
		).toBeTruthy();
	});
});

describe("GradingRoute (/grading/$attemptId) — practice submission support (#383)", () => {
	const PRACTICE_SUBMISSION: TeacherSubmission = {
		attemptId: "att-prac-1",
		classAssignmentId: "",
		classId: "",
		className: "Luyện tập",
		title: "Writing Mock 1 — Technology",
		due: "",
		student: { id: "s-1", name: "Bảo Ngọc" },
		skill: "writing",
		part: "task2",
		prompt: {
			prompt: "<p>Some people think technology is isolating.</p>",
			imageUrl: "",
			cueTopic: "",
			cuePoints: "",
			note: "",
		},
		startedAt: "2026-10-20T09:00:00.000Z",
		submittedAt: "2026-10-20T10:00:00.000Z",
		essay: "Technology connects people across the globe.",
		media: null,
		grade: null,
		annotations: [],
		practice: true,
	};

	it("bài tự luyện hiển thị link '← Về hàng chờ chấm' trỏ tới /grading?mode=practice, ẩn 'Hạn' trên kicker và invalidate queue khi lưu điểm", async () => {
		mockParams.attemptId = "att-prac-1";
		vi.spyOn(gradingRepo, "saveGrade").mockResolvedValue({
			scores: { task: 6.5, coherence: 6.5, lexical: 6.5, grammar: 6.5 },
			band: 6.5,
			feedback: "Tốt",
			gradedAt: "2026-10-20T11:00:00.000Z",
		});
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		client.setQueryData(gradingQueryKey("att-prac-1"), {
			...PRACTICE_SUBMISSION,
			grade: {
				scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
				band: 6,
				feedback: "",
				gradedAt: "2026-10-20T10:30:00.000Z",
			},
		});
		render(
			<QueryClientProvider client={client}>
				<GradingRoute />
			</QueryClientProvider>,
		);

		const backLink = screen.getByRole("link", { name: "← Về hàng chờ chấm" });
		expect(backLink.getAttribute("href")).toBe("/grading?mode=practice");
		expect(screen.queryByRole("link", { name: "← Về lớp" })).toBeNull();
		expect(document.body.textContent).toContain("Bảo Ngọc");
		expect(document.body.textContent).toContain("Luyện tập");
		expect(document.body.textContent).not.toContain("· Hạn");

		fireEvent.click(screen.getByRole("button", { name: "Lưu điểm" }));
		await vi.waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalledWith({
				queryKey: gradingQueueQueryKey,
			});
		});
	});

	it("TOS-33: TA thấy nút Chốt trả bài bị khóa nhưng bấm được Lưu bản nháp", async () => {
		mockParams.attemptId = "att-prac-1";
		const saveDraftSpy = vi.spyOn(gradingRepo, "saveDraft").mockResolvedValue({
			status: "teacher_reviewing",
			aiScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
			aiFeedback: "AI feedback",
			reviewedScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
			reviewedFeedback: "TA nhận xét",
			gradingMode: "standard",
			version: 2,
			errorCode: null,
			publishedAt: null,
		});
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		client.setQueryData(kernelQueryKey, { viewer: { role: "ta" } });
		client.setQueryData(gradingQueryKey("att-prac-1"), {
			...PRACTICE_SUBMISSION,
			aiDraft: {
				status: "ai_drafted",
				aiScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
				aiFeedback: "AI feedback",
				reviewedScores: null,
				reviewedFeedback: "",
				gradingMode: "standard",
				version: 1,
				errorCode: null,
				publishedAt: null,
			},
		});
		render(
			<QueryClientProvider client={client}>
				<GradingRoute />
			</QueryClientProvider>,
		);

		const publishBtn = screen.getByTestId("publish-grade") as HTMLButtonElement;
		const draftBtn = screen.getByTestId("save-draft") as HTMLButtonElement;
		expect(publishBtn.disabled).toBe(true);
		expect(draftBtn.disabled).toBe(false);

		fireEvent.change(document.getElementById("grade-feedback")!, {
			target: { value: "TA nhận xét" },
		});
		fireEvent.click(draftBtn);
		await vi.waitFor(() => {
			expect(saveDraftSpy).toHaveBeenCalledWith("att-prac-1", {
				scores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
				feedback: "TA nhận xét",
				version: 1,
			});
		});
	});

	it("TOS-33: lỗi 409 E-011 mở hộp thoại, bấm Tải lại bản mới nhất giữ nội dung ở vùng Bản bạn đang sửa", async () => {
		mockParams.attemptId = "att-prac-1";
		vi.spyOn(gradingRepo, "saveDraft").mockRejectedValue(
			new HttpError(409, "conflict", { reason: "E-selfomy-alignment-011" }),
		);
		const latestSubmission: TeacherSubmission = {
			...PRACTICE_SUBMISSION,
			aiDraft: {
				status: "teacher_reviewing",
				aiScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
				aiFeedback: "AI feedback",
				reviewedScores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
				reviewedFeedback: "Bản mới nhất từ nhân sự khác",
				gradingMode: "standard",
				version: 2,
				errorCode: null,
				publishedAt: null,
			},
		};
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify(latestSubmission), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
			},
		});
		client.setQueryData(gradingQueryKey("att-prac-1"), {
			...PRACTICE_SUBMISSION,
			aiDraft: {
				status: "ai_drafted",
				aiScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
				aiFeedback: "AI feedback",
				reviewedScores: null,
				reviewedFeedback: "",
				gradingMode: "standard",
				version: 1,
				errorCode: null,
				publishedAt: null,
			},
		});
		render(
			<QueryClientProvider client={client}>
				<GradingRoute />
			</QueryClientProvider>,
		);

		fireEvent.change(document.getElementById("grade-feedback")!, {
			target: { value: "Nhận xét đang gõ dở" },
		});
		fireEvent.click(screen.getByTestId("save-draft"));

		await vi.waitFor(() => {
			expect(
				screen.getByTestId("conflict-dialog-message").textContent,
			).toContain("E-selfomy-alignment-011");
		});

		fireEvent.click(screen.getByTestId("reload-latest-draft"));

		await vi.waitFor(() => {
			expect(
				(document.getElementById("grade-feedback") as HTMLTextAreaElement)
					.value,
			).toBe("Bản mới nhất từ nhân sự khác");
		});
		// Nội dung đang gõ vẫn được giữ lại ở vùng "Bản bạn đang sửa".
		expect(
			screen.getByTestId("conflict-preserved-draft").textContent,
		).toContain("Nhận xét đang gõ dở");
	});

	it("issue #615: trong lúc lưu nháp (in-flight pending), inputs bị khóa và sau khi resolve, form remount với dữ liệu server", async () => {
		mockParams.attemptId = "att-prac-1";
		const { promise, resolve: resolveSave } =
			Promise.withResolvers<AiGradingDraftView>();
		vi.spyOn(gradingRepo, "saveDraft").mockImplementation(() => promise);

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
			},
		});
		client.setQueryData(gradingQueryKey("att-prac-1"), {
			...PRACTICE_SUBMISSION,
			aiDraft: {
				status: "ai_drafted",
				aiScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
				aiFeedback: "AI feedback",
				reviewedScores: null,
				reviewedFeedback: "",
				gradingMode: "standard",
				version: 1,
				errorCode: null,
				publishedAt: null,
			},
		});
		render(
			<QueryClientProvider client={client}>
				<GradingRoute />
			</QueryClientProvider>,
		);

		const feedback = document.getElementById(
			"grade-feedback",
		) as HTMLTextAreaElement;
		const draftBtn = screen.getByTestId("save-draft") as HTMLButtonElement;

		fireEvent.change(feedback, {
			target: { value: "Nhận xét ban đầu" },
		});
		fireEvent.click(draftBtn);

		// Trong lúc request đang pending, inputs bị khóa
		await vi.waitFor(() => {
			expect(feedback.disabled).toBe(true);
			expect(draftBtn.disabled).toBe(true);
			expect(screen.getByTestId("grade-form").getAttribute("aria-busy")).toBe(
				"true",
			);
		});

		// Resolve mutation với version mới
		const updatedDraft: AiGradingDraftView = {
			status: "teacher_reviewing",
			aiScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
			aiFeedback: "AI feedback",
			reviewedScores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
			reviewedFeedback: "Nhận xét ban đầu",
			gradingMode: "standard",
			version: 2,
			errorCode: null,
			publishedAt: null,
		};
		resolveSave(updatedDraft);

		// Form remount với version 2, hiện grade-saved và feedback đã lưu
		await vi.waitFor(() => {
			expect(screen.getByTestId("grade-saved")).toBeTruthy();
			const remountedFeedback = document.getElementById(
				"grade-feedback",
			) as HTMLTextAreaElement;
			expect(remountedFeedback.disabled).toBe(false);
			expect(remountedFeedback.value).toBe("Nhận xét ban đầu");
		});
	});
});

describe("GradingQueueRoute — demo grading sample (#508)", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("shows create demo sample button in empty state and delete button when demo-attempt is present", async () => {
		const createSpy = vi
			.spyOn(gradingRepo, "createDemoGradingSample")
			.mockResolvedValue({ attemptId: "demo-attempt:org-1" });
		const deleteSpy = vi
			.spyOn(gradingRepo, "deleteDemoGradingSample")
			.mockResolvedValue(undefined);

		renderQueue([]);
		const createBtn = screen.getByTestId("create-demo-grading-sample");
		expect(createBtn.textContent).toContain("Tạo bài nộp mẫu dùng thử");
		fireEvent.click(createBtn);
		await vi.waitFor(() => {
			expect(createSpy).toHaveBeenCalledTimes(1);
		});

		cleanup();
		renderQueue([
			{
				attemptId: "demo-attempt:org-1",
				mode: "practice",
				classId: "",
				className: "Luyện tập",
				title: "[Mẫu dùng thử] IELTS Writing Task 2 — AI in Education",
				due: "",
				student: {
					id: "demo-student:org-1",
					name: "Nguyễn Minh Anh (Học viên mẫu)",
				},
				skill: "writing",
				part: "task2",
				submittedAt: "2026-10-30T10:00:00.000Z",
				grade: null,
				aiStatus: "ai_drafted",
			},
		]);
		const deleteBtn = screen.getByTestId("delete-demo-grading-sample");
		expect(deleteBtn.textContent).toContain("Xóa bài nộp mẫu");
		fireEvent.click(deleteBtn);
		await vi.waitFor(() => {
			expect(deleteSpy).toHaveBeenCalledTimes(1);
		});
	});
});

describe("GradingRoute (/grading/$attemptId) — auto-graded review & back links (#978)", () => {
	const AUTO_SUBMISSION: TeacherAutoSubmission = {
		kind: "auto",
		attemptId: "att-mc-1",
		classAssignmentId: "ca-1",
		classId: "class-1",
		className: "IELTS Foundation 5.5 (Test)",
		title: "[Integration test] Grammar quick check 26/11",
		due: "2026-11-30",
		student: { id: "st-9", name: "Grok Test Student" },
		skill: "grammar",
		part: "",
		startedAt: "2026-11-26T08:25:00.000Z",
		submittedAt: "2026-11-26T08:29:00.000Z",
		correctCount: 3,
		wrongCount: 0,
		skippedCount: 0,
		totalCount: 3,
		items: [
			{ verdict: "correct", key: "A", answer: "A" },
			{ verdict: "correct", key: "B", answer: "B" },
			{ verdict: "correct", key: "C", answer: "C" },
		],
		detail: {
			skill: "grammar",
			type: "mcq",
			band: "5.5",
			intro: "",
			prompt: "<p>Choose the right option.</p>",
			passage: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			note: "",
		},
		questions: [
			{
				stem: "Q1",
				opts: ["A", "B", "C", "D"],
				type: "mcq",
				pin: null,
				key: "A",
				alts: "",
				verdict: "correct",
				answer: "A",
			},
			{
				stem: "Q2",
				opts: ["A", "B", "C", "D"],
				type: "mcq",
				pin: null,
				key: "B",
				alts: "",
				verdict: "correct",
				answer: "B",
			},
			{
				stem: "Q3",
				opts: ["A", "B", "C", "D"],
				type: "mcq",
				pin: null,
				key: "C",
				alts: "",
				verdict: "correct",
				answer: "C",
			},
		],
	};

	it("renders read-only AutoSubmissionView without GradeForm and adapts back link by ?from=", () => {
		mockParams.attemptId = "att-mc-1";
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		client.setQueryData(gradingQueryKey("att-mc-1"), AUTO_SUBMISSION);

		mockSearch.current = { from: "student" };
		const { rerender } = render(
			<QueryClientProvider client={client}>
				<GradingRoute />
			</QueryClientProvider>,
		);

		expect(screen.getByTestId("auto-submission-view")).toBeTruthy();
		expect(screen.getByTestId("auto-submission-score").textContent).toBe("3/3");
		expect(screen.queryByTestId("grade-form")).toBeNull();
		expect(
			screen.getByRole("link", { name: "← Về học viên" }).getAttribute("href"),
		).toBe("/students/st-9?tab=assign");

		mockSearch.current = { from: "grading" };
		rerender(
			<QueryClientProvider client={client}>
				<GradingRoute />
			</QueryClientProvider>,
		);
		expect(
			screen
				.getByRole("link", { name: "← Về hàng chờ chấm" })
				.getAttribute("href"),
		).toBe("/grading");

		mockSearch.current = { from: "class" };
		rerender(
			<QueryClientProvider client={client}>
				<GradingRoute />
			</QueryClientProvider>,
		);
		expect(
			screen.getByRole("link", { name: "← Về lớp" }).getAttribute("href"),
		).toBe("/classes/class-1?tab=assignments");
	});
});
