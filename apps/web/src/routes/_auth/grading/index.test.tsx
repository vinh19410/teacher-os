// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	GradingQueueItem,
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
		skill?: "writing" | "speaking";
		status?: "awaiting" | "graded";
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

const QUEUE_ITEMS: GradingQueueItem[] = [
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

function renderQueue(items: GradingQueueItem[] = QUEUE_ITEMS) {
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
				skill: "reading",
				status: "invalid",
			}),
		).toEqual({
			q: undefined,
			mode: undefined,
			skill: undefined,
			status: undefined,
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
		expect(gradeNgoc.getAttribute("href")).toBe("/grading/att-prac-w");
		const gradeHuy = screen.getByRole("link", {
			name: "Chấm bài của Lê Quang Huy",
		});
		expect(gradeHuy.getAttribute("href")).toBe("/grading/att-assign-s");
		const editNgoc = screen.getByRole("link", {
			name: "Xem / sửa điểm của Bảo Ngọc",
		});
		expect(editNgoc.getAttribute("href")).toBe("/grading/att-assign-w-graded");
		expect(screen.getByText("Đã chấm · Band 6.5")).toBeTruthy();
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
});
