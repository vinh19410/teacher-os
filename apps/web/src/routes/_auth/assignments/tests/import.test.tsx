// @vitest-environment jsdom

import type { ExamImportJob } from "@teacher-os/api/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreditCostBadge } from "@/components/exam-import/credit-cost-badge";
import { ExamImportScreen } from "./import";

// Repos giả: kiểm soát wallet/job/file mà không chạm mạng thật. Nhãn skill
// giữ nguyên giá trị thật (bản map ổn định, mock tay để không importOriginal).
vi.mock("@/lib/repos/exam-imports", () => ({
	EXAM_IMPORT_SKILL_LABELS: {
		reading: "reading",
		listening: "listening",
		writing: "writing",
		speaking: "speaking",
		mixed: "mixed",
	},
	fetchCreditWallet: vi.fn(async () => ({
		balance: 30,
		held: 0,
		available: 30,
	})),
	fetchExamImportFileUrl: vi.fn(async () => "blob:mock-file"),
	fetchExamImportJob: vi.fn(),
	createExamImport: vi.fn(),
	saveExamImportDraft: vi.fn(),
	publishExamImport: vi.fn(),
}));

// ExamImportScreen dùng useNavigate — ngoài router thật thì stub để render được;
// giữ nguyên các export khác (createFileRoute cần khi import route file).
const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	useNavigate: () => navigateMock,
	// Link thật cần router context — stub <a> đủ cho test.
	Link: (props: { to: string; children?: ReactNode; className?: string }) => (
		<a href={props.to} className={props.className}>
			{props.children}
		</a>
	),
}));

import {
	createExamImport,
	fetchCreditWallet,
	fetchExamImportJob,
	publishExamImport,
	saveExamImportDraft,
} from "@/lib/repos/exam-imports";

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	// Mỗi test tự setup matchMedia theo viewport mong muốn; dọn sạch sau test.
	Reflect.deleteProperty(window, "matchMedia");
	document.body.replaceChildren();
});

/** Giả lập matchMedia cho breakpoint lg — điều khiển nhánh 2 cột/Tabs. */
function mockMatchMedia(matches: boolean): void {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: matches && query.includes("1024"),
		media: query,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
}

const jobFixture = (overrides: Partial<ExamImportJob> = {}): ExamImportJob => ({
	id: "job-1",
	fileName: "mock.png",
	mimeType: "image/png",
	sizeBytes: 1024,
	pageCount: null,
	contentFingerprint: "a".repeat(64),
	heldCredits: 5,
	importStatus: "completed",
	draft: {
		title: "IELTS Reading Mock 01",
		skill: "reading",
		timeLimitMinutes: 60,
		parts: [
			{
				passage: "Đoạn đọc mẫu.",
				questions: [
					{
						stem: "Câu tin cậy cao?",
						answer: "A",
						confidence: 0.95,
						needsReview: false,
					},
					{
						stem: "Câu cần rà soát?",
						opts: ["A", "B"],
						answer: "B",
						explanation: "Vì…",
						confidence: 0.5,
						needsReview: true,
					},
				],
			},
		],
	},
	errorCode: null,
	createdAt: "2026-10-27T00:00:00Z",
	startedAt: "2026-10-27T00:00:00Z",
	completedAt: null,
	...overrides,
});

describe("CreditCostBadge", () => {
	it('hiện "Ví: 30 Cr" + "5 Credit" với wallet mock', () => {
		render(
			<CreditCostBadge wallet={{ balance: 30, held: 0, available: 30 }} />,
		);
		expect(screen.getByTestId("credit-cost-badge").textContent).toContain(
			"Chi phí: 5 Credit (Tạm giữ)",
		);
		expect(screen.getByTestId("wallet-balance").textContent).toBe("30 Cr");
	});

	it("wallet null → badge ví ở trạng thái chờ, không crash", () => {
		render(<CreditCostBadge wallet={null} />);
		expect(screen.queryByTestId("wallet-balance")).toBeNull();
		expect(screen.getByTestId("credit-cost-badge").textContent).toContain(
			"Chi phí: 5 Credit",
		);
	});
});

describe("ExamImportScreen — layout theo viewport", () => {
	it("viewport ≥ lg: workspace 2 cột (grid-cols-2), không có tab", async () => {
		mockMatchMedia(true);
		vi.mocked(fetchExamImportJob).mockResolvedValue(jobFixture());
		render(<ExamImportScreen jobId="job-1" />);
		const workspace = await screen.findByTestId("exam-import-workspace");
		expect(workspace.querySelector(".grid-cols-2")).not.toBeNull();
		expect(screen.queryByRole("tab")).toBeNull();
		// Viewer + panel cùng tồn tại trên 2 cột.
		expect(screen.getByTestId("source-document-viewer")).toBeTruthy();
		expect(screen.getByTestId("extracted-exam-panel")).toBeTruthy();
	});

	it("viewport < lg: 2 tab đúng nhãn, chỉ render bảng đang chọn", async () => {
		mockMatchMedia(false);
		vi.mocked(fetchExamImportJob).mockResolvedValue(jobFixture());
		render(<ExamImportScreen jobId="job-1" />);
		await screen.findByTestId("exam-import-workspace");
		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(2);
		expect(tabs[0].textContent).toBe("Tài liệu gốc");
		expect(tabs[1].textContent).toBe("Câu hỏi bóc tách");
		// Mặc định mở tab tài liệu gốc, panel câu hỏi chưa render.
		expect(screen.getByTestId("source-document-viewer")).toBeTruthy();
		expect(screen.queryByTestId("extracted-exam-panel")).toBeNull();
		// Đổi tab → panel câu hỏi xuất hiện.
		fireEvent.click(tabs[1]);
		expect(screen.getByTestId("extracted-exam-panel")).toBeTruthy();
	});
});

describe("ExamImportScreen — nhãn rà soát", () => {
	it("đúng 1 câu needsReview → đúng 1 badge vàng '(!) Cần rà soát lại'", async () => {
		mockMatchMedia(true);
		vi.mocked(fetchExamImportJob).mockResolvedValue(jobFixture());
		render(<ExamImportScreen jobId="job-1" />);
		await screen.findByTestId("extracted-exam-panel");
		const badges = screen.getAllByTestId("question-needs-review");
		expect(badges).toHaveLength(1);
		expect(badges[0].textContent).toBe("(!) Cần rà soát lại");
		expect(screen.getByText("Độ tin cậy cao")).toBeTruthy();
	});
});

describe("ExamImportScreen — luồng upload", () => {
	it("chọn file → text uploading → done hiện panel + đẩy ?job lên URL", async () => {
		mockMatchMedia(true);
		vi.mocked(createExamImport).mockResolvedValue(jobFixture());
		render(<ExamImportScreen />);
		const input = screen.getByTestId("exam-import-file-input");
		expect(input.tagName).toBe("INPUT");
		const file = new File(["pdf-bytes"], "mock.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(input, { target: { files: [file] } });
		// Trạng thái uploading với text contract e2e.
		expect(screen.getByTestId("exam-import-uploading").textContent).toContain(
			"Đang bóc tách (tối đa 120 giây)",
		);
		// createExamImport nhận đúng file, credentials do repos lo.
		await waitFor(() =>
			expect(vi.mocked(createExamImport)).toHaveBeenCalledWith(
				expect.objectContaining({ file }),
			),
		);
		// Done: panel bóc tách hiện, dropzone ẩn, navigate đẩy ?job.
		await screen.findByTestId("extracted-exam-panel");
		expect(screen.getByText("IELTS Reading Mock 01")).toBeTruthy();
		expect(navigateMock).toHaveBeenCalledWith(
			expect.objectContaining({ search: { job: "job-1" } }),
		);
		// Wallet được fetch lại sau khi job hoàn tất (badge cập nhật số dư).
		await waitFor(() =>
			expect(
				vi.mocked(fetchCreditWallet).mock.calls.length,
			).toBeGreaterThanOrEqual(2),
		);
	});
});

describe("ExamImportScreen — lưu nháp 0 Credit & xuất bản (TOS-26 #472)", () => {
	it("sửa câu → Lưu bản nháp cập nhật job; tích xác nhận → Lưu vào Ngân hàng đề gọi refresh store trước khi điều hướng", async () => {
		mockMatchMedia(true);
		const initialJob = jobFixture();
		vi.mocked(fetchExamImportJob).mockResolvedValue(initialJob);
		vi.mocked(saveExamImportDraft).mockImplementation(async ({ draft }) => ({
			...initialJob,
			draft,
		}));
		vi.mocked(publishExamImport).mockResolvedValue({
			testId: "test-import-job-1",
			status: "ready",
		});

		const callOrder: string[] = [];
		const refreshMock = vi.fn(async () => {
			callOrder.push("refresh");
			return true;
		});
		navigateMock.mockImplementation(() => {
			callOrder.push("navigate");
		});

		render(<ExamImportScreen jobId="job-1" onRefreshKernel={refreshMock} />);
		await screen.findByTestId("extracted-exam-panel");

		const publishBtn = screen.getByTestId(
			"publish-exam-button",
		) as HTMLButtonElement;
		expect(publishBtn.disabled).toBe(true);

		// Sửa đáp án câu 2 (needsReview=true) rồi bấm Lưu bản nháp
		fireEvent.change(screen.getByTestId("question-answer-1"), {
			target: { value: "Đáp án mới" },
		});
		fireEvent.click(screen.getByTestId("save-draft-button"));

		await waitFor(() =>
			expect(vi.mocked(saveExamImportDraft)).toHaveBeenCalledTimes(1),
		);
		expect(
			(await screen.findByTestId("exam-import-status-notice")).textContent,
		).toContain("Đã lưu bản nháp (0 Credit).");

		// Tích xác nhận câu Cần rà soát lại → nút xuất bản mở khóa
		fireEvent.click(screen.getByTestId("review-confirmation-checkbox"));
		expect(publishBtn.disabled).toBe(false);

		fireEvent.click(publishBtn);
		await waitFor(() =>
			expect(vi.mocked(publishExamImport)).toHaveBeenCalledWith(
				expect.objectContaining({
					jobId: "job-1",
					reviewConfirmed: true,
				}),
			),
		);
		expect(refreshMock).toHaveBeenCalledTimes(1);
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/assignments/tests/$id",
			params: { id: "test-import-job-1" },
		});
		expect(callOrder).toEqual(["refresh", "navigate"]);
	});
});
