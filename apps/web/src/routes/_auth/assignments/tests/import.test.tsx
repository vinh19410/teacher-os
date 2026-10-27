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
	// TOS-25: mặc định không trùng — các test banner tự override.
	lookupExamImportByFingerprint: vi.fn(async () => null),
}));

// TOS-25: hash client mock deterministic (jsdom có thể thiếu crypto.subtle).
vi.mock("@/lib/file-fingerprint", () => ({
	sha256Hex: vi.fn(async () => "a".repeat(64)),
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

import { sha256Hex } from "@/lib/file-fingerprint";
import {
	createExamImport,
	fetchCreditWallet,
	fetchExamImportJob,
	lookupExamImportByFingerprint,
} from "@/lib/repos/exam-imports";

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(sha256Hex).mockResolvedValue("a".repeat(64));
	vi.mocked(lookupExamImportByFingerprint).mockResolvedValue(null);
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
		const { promise, resolve: resolveUpload } = Promise.withResolvers<{
			kind: "created";
			job: ExamImportJob;
		}>();
		vi.mocked(createExamImport).mockReturnValue(promise);
		render(<ExamImportScreen />);
		const input = screen.getByTestId("exam-import-file-input");
		expect(input.tagName).toBe("INPUT");
		const file = new File(["pdf-bytes"], "mock.pdf", {
			type: "application/pdf",
		});
		fireEvent.change(input, { target: { files: [file] } });
		// Trạng thái uploading với text contract e2e (sau hash+lookup TOS-25).
		const uploadingBanner = await screen.findByTestId("exam-import-uploading");
		expect(uploadingBanner.textContent).toContain(
			"Đang bóc tách (tối đa 120 giây)",
		);
		// createExamImport nhận đúng file, credentials do repos lo.
		expect(vi.mocked(createExamImport)).toHaveBeenCalledWith(
			expect.objectContaining({ file }),
		);
		resolveUpload({ kind: "created", job: jobFixture() });
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

describe("ExamImportScreen — chống trùng mã băm (TOS-25)", () => {
	const duplicateFixture = {
		jobId: "job-old",
		title: "Cambridge IELTS Sample",
		completedAt: "2026-10-20T00:00:00Z",
	};

	function selectFile(): void {
		const input = screen.getByTestId("exam-import-file-input");
		fireEvent.change(input, {
			target: {
				files: [
					new File(["pdf-bytes"], "mock.pdf", { type: "application/pdf" }),
				],
			},
		});
	}

	it("lookup trùng → banner + KHÔNG upload; bấm nút → navigate ?job + banner biến mất", async () => {
		mockMatchMedia(true);
		vi.mocked(lookupExamImportByFingerprint).mockResolvedValue(
			duplicateFixture,
		);
		vi.mocked(fetchExamImportJob).mockResolvedValue(
			jobFixture({ id: "job-old" }),
		);
		const { rerender } = render(<ExamImportScreen />);
		selectFile();

		const banner = await screen.findByTestId("duplicate-exam-banner");
		expect(banner.textContent).toContain("Phát hiện tệp trùng");
		expect(banner.textContent).toContain("Mở lại bản nháp cũ (0 Cr)");
		// role="status" từ Alert (contract e2e).
		expect(screen.getByRole("status")).toBeTruthy();
		// KHÔNG upload, KHÔNG giữ trạng thái uploading.
		expect(vi.mocked(createExamImport)).not.toHaveBeenCalled();
		expect(screen.queryByTestId("exam-import-uploading")).toBeNull();
		// Hash đã tính và lookup đã gọi với fingerprint mock.
		await waitFor(() =>
			expect(vi.mocked(lookupExamImportByFingerprint)).toHaveBeenCalledWith(
				"a".repeat(64),
				undefined,
				expect.any(AbortSignal),
			),
		);

		fireEvent.click(screen.getByTestId("duplicate-reopen-button"));
		expect(navigateMock).toHaveBeenCalledWith(
			expect.objectContaining({ search: { job: "job-old" } }),
		);
		expect(screen.queryByTestId("duplicate-exam-banner")).toBeNull();
		// SPA cập nhật ?job=job-old → load đúng bản nháp cũ; quay về màn trống
		// (jobId undefined) → reset về dropzone.
		rerender(<ExamImportScreen jobId="job-old" />);
		await screen.findByTestId("extracted-exam-panel");
		rerender(<ExamImportScreen />);
		expect(screen.getByTestId("exam-import-file-input")).toBeTruthy();
	});

	it("POST trả duplicate (client bỏ qua lookup) → cùng banner, không vào done", async () => {
		mockMatchMedia(true);
		// Lookup không trùng — banner phải đến từ nhánh POST, không phải lookup.
		vi.mocked(lookupExamImportByFingerprint).mockResolvedValue(null);
		vi.mocked(createExamImport).mockResolvedValue({
			kind: "duplicate",
			duplicate: duplicateFixture,
		});
		render(<ExamImportScreen />);
		selectFile();

		const banner = await screen.findByTestId("duplicate-exam-banner");
		expect(banner.textContent).toContain("Phát hiện tệp trùng");
		// Không panel kết quả, không lỗi generic — đúng nhánh D3 lớp 2.
		expect(screen.queryByTestId("extracted-exam-panel")).toBeNull();
		expect(screen.queryByTestId("exam-import-uploading")).toBeNull();
		// Dropzone vẫn hiện (idle) để người dùng chủ động chọn nhánh.
		expect(screen.getByTestId("exam-import-file-input")).toBeTruthy();
	});

	it("lookup lỗi (mạng/non-secure) → fail-open: vẫn upload như TOS-24", async () => {
		mockMatchMedia(true);
		vi.mocked(lookupExamImportByFingerprint).mockRejectedValue(
			new Error("network down"),
		);
		vi.mocked(createExamImport).mockResolvedValue({
			kind: "created",
			job: jobFixture(),
		});
		render(<ExamImportScreen />);
		selectFile();

		await screen.findByTestId("extracted-exam-panel");
		expect(screen.queryByTestId("duplicate-exam-banner")).toBeNull();
		expect(vi.mocked(createExamImport)).toHaveBeenCalledWith(
			expect.objectContaining({ file: expect.any(File) }),
		);
	});

	it("hash lỗi trước lookup → fail-open vẫn upload (không treo màn)", async () => {
		mockMatchMedia(true);
		vi.mocked(sha256Hex).mockRejectedValue(new Error("WebCrypto unavailable"));
		vi.mocked(createExamImport).mockResolvedValue({
			kind: "created",
			job: jobFixture(),
		});
		render(<ExamImportScreen />);
		selectFile();

		await screen.findByTestId("extracted-exam-panel");
		// Hash nổ → không gọi lookup, đi thẳng upload.
		expect(vi.mocked(lookupExamImportByFingerprint)).not.toHaveBeenCalled();
		expect(screen.queryByTestId("duplicate-exam-banner")).toBeNull();
	});

	it("URL đang có sẵn ?job=<duplicate.jobId> (sau lỗi mạng tạm) → bấm mở lại vẫn nạp lại bản nháp", async () => {
		mockMatchMedia(true);
		// Lần nạp đầu lỗi mạng → rơi về idle nhưng jobId prop vẫn là "job-old".
		vi.mocked(fetchExamImportJob)
			.mockRejectedValueOnce(new Error("transient network error"))
			.mockResolvedValueOnce(jobFixture({ id: "job-old" }));
		vi.mocked(lookupExamImportByFingerprint).mockResolvedValue(
			duplicateFixture,
		);
		render(<ExamImportScreen jobId="job-old" />);
		await waitFor(() =>
			expect(vi.mocked(fetchExamImportJob)).toHaveBeenCalledTimes(1),
		);
		selectFile();
		await screen.findByTestId("duplicate-exam-banner");

		fireEvent.click(screen.getByTestId("duplicate-reopen-button"));
		await screen.findByTestId("extracted-exam-panel");
		expect(vi.mocked(fetchExamImportJob)).toHaveBeenCalledTimes(2);
	});
});

describe("ExamImportScreen — job draft hỏng (TOS-25 guard)", () => {
	it("?job= job completed thiếu draft → notice + dropzone quay lại, không màn trắng", async () => {
		mockMatchMedia(true);
		vi.mocked(fetchExamImportJob).mockResolvedValue(
			jobFixture({ draft: null }),
		);
		render(<ExamImportScreen jobId="job-broken" />);
		await screen.findByTestId("exam-import-broken-draft");
		expect(
			screen.getByTestId("exam-import-broken-draft").textContent,
		).toContain("Bản nháp hỏng hoặc không đọc được");
		// Dropzone trả lại để nhập đề mới — không dead-end.
		expect(screen.getByTestId("exam-import-file-input")).toBeTruthy();
		// Không workspace rỗng.
		expect(screen.queryByTestId("exam-import-workspace")).toBeNull();
	});
});
