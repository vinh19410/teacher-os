// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
	AssignmentPrompt,
	ClassAssignment,
	ClassGroup,
	Student,
} from "@/lib/mock-data";
import type { KernelFormNotice } from "@/lib/use-kernel-form-submit";

const testClass: ClassGroup = {
	id: "cl-1",
	name: "IELTS 7.0 Tối",
	type: "ielts",
	level: "Band 7.0",
	skills: ["Writing", "Speaking"],
	mode: "Online",
	syllabusId: "",
	schedule: "T2, T4 19:00",
	sessionsTotal: 20,
	sessionsDone: 5,
	status: "active",
	startDate: "2026-09-01",
	tuitionFee: null,
	notes: "",
	studentIds: ["st-1", "st-2"],
	invitedStudentIds: [],
};

const testStudents: Student[] = [
	{
		id: "st-1",
		name: "Nguyễn Văn A",
		phone: "0901234567",
		zalo: "0901234567",
		email: "a@test.local",
		hasPackage: true,
		parent: { name: "", phone: "" },
		targetBand: "6.5",
		skills: [],
		examDate: "",
		tags: [],
		notes: "",
		atRisk: false,
		avatar: "NA",
		pkg: {
			total: 20,
			done: 5,
			remaining: 15,
			price: 400000,
			mode: "Online",
			start: "2026-09-01",
			expiry: "",
		},
	},
	{
		id: "st-2",
		name: "Trần Thị B",
		phone: "0901234568",
		zalo: "0901234568",
		email: "b@test.local",
		hasPackage: true,
		parent: { name: "", phone: "" },
		targetBand: "6.5",
		skills: [],
		examDate: "",
		tags: [],
		notes: "",
		atRisk: false,
		avatar: "TB",
		pkg: {
			total: 20,
			done: 5,
			remaining: 15,
			price: 400000,
			mode: "Online",
			start: "2026-09-01",
			expiry: "",
		},
	},
];

const testPrompts: AssignmentPrompt[] = [
	{
		id: "p-ready",
		skill: "writing",
		part: "task2",
		type: "opinion",
		task: "task2",
		genre: "opinion",
		title: "Writing Task 2 — Opinion",
		band: "7.0",
		source: "Cambridge 15",
		prompt: "Some people believe university education should be free.",
		questions: [],
		note: "",
		status: "ready",
		createdAt: "2026-09-18T10:00:00.000Z",
	},
	{
		id: "p-draft",
		skill: "writing",
		part: "task1",
		type: "chart",
		task: "task1",
		genre: "chart",
		title: "Writing Task 1 — Draft",
		band: "6.5",
		source: "",
		prompt: "The chart shows...",
		questions: [],
		note: "",
		status: "draft",
		createdAt: "2026-09-18T09:00:00.000Z",
	},
	{
		id: "p-reading",
		skill: "reading",
		part: "p1",
		type: "info",
		task: "task1",
		genre: "",
		title: "Reading — True/False",
		band: "6.0",
		source: "IELTS Trainer",
		passage: "Read the passage carefully.",
		prompt: "Read the passage carefully.",
		questions: [],
		note: "",
		status: "ready",
		createdAt: "2026-09-18T07:00:00.000Z",
	},
	{
		id: "p-hybrid",
		skill: "grammar",
		part: "tenses",
		type: "mcq",
		task: "task2",
		genre: "",
		title: "Grammar + Writing Homework",
		band: "6.5",
		source: "",
		prompt: "",
		questions: [],
		note: "",
		status: "ready",
		writing: {
			part: "task2",
			type: "discuss",
			prompt: "<p>Discuss technology impact.</p>",
		},
		createdAt: "2026-09-18T06:00:00.000Z",
	},
];

const testAssignments: ClassAssignment[] = [
	{
		id: "ca-existing",
		classId: "cl-1",
		promptId: "p-ready",
		title: "Writing Task 2 — Opinion",
		due: "2030-01-10",
		note: "",
		createdAt: "2026-09-10T10:00:00.000Z",
		targets: [{ studentId: "st-1", submittedAt: null }],
	},
];

let currentDataFixture = {
	classAssignments: testAssignments,
	assignmentPrompts: testPrompts,
	students: testStudents,
};

const mockToastSuccess = vi.fn();

vi.mock("sonner", () => ({
	toast: {
		success: (...args: unknown[]) => mockToastSuccess(...args),
		error: vi.fn(),
	},
}));

vi.mock("@tanstack/react-router", () => ({
	Link: (props: {
		to: string;
		children?: ReactNode;
		search?: Record<string, string>;
		className?: string;
	}) => {
		const searchStr = props.search
			? `?${new URLSearchParams(props.search).toString()}`
			: "";
		return (
			<a href={`${props.to}${searchStr}`} className={props.className}>
				{props.children}
			</a>
		);
	},
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: currentDataFixture,
		studentById: (id: string) =>
			currentDataFixture.students.find((s) => s.id === id),
	}),
}));

const mockSubmit = {
	saving: false,
	error: undefined as string | undefined,
	notice: undefined as KernelFormNotice | undefined,
	submitBlocked: false,
	run: vi.fn(),
	reconcile: vi.fn(),
	reset: vi.fn(),
};

vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => mockSubmit,
}));

import { AssignClassPromptModal } from "./assign-class-prompt-modal";

beforeAll(() => {
	if (typeof globalThis.ResizeObserver === "undefined") {
		globalThis.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
});

afterEach(() => {
	cleanup();
	currentDataFixture = {
		classAssignments: testAssignments,
		assignmentPrompts: testPrompts,
		students: testStudents,
	};
	mockSubmit.saving = false;
	mockSubmit.error = undefined;
	mockSubmit.notice = undefined;
	mockSubmit.submitBlocked = false;
	mockSubmit.run.mockReset();
	mockSubmit.reconcile.mockReset();
	mockSubmit.reset.mockReset();
	mockToastSuccess.mockReset();
});

describe("AssignClassPromptModal", () => {
	it("hiển thị Modal 2 cột, ẩn bản nháp, giữ link + Tạo đề mới kèm classId (#585) và ẩn số điện thoại học viên", () => {
		render(
			<AssignClassPromptModal open onClose={vi.fn()} classGroup={testClass} />,
		);

		const dialog = screen.getByRole("dialog", {
			name: "Giao bài tập · IELTS 7.0 Tối",
		});
		expect(dialog).toBeTruthy();

		// Cột trái: 1. Chọn đề sẵn sàng + link + Tạo đề mới
		expect(screen.getByText("1. Chọn đề sẵn sàng")).toBeTruthy();
		const createLink = screen.getByRole("link", { name: "+ Tạo đề mới" });
		expect(createLink.getAttribute("href")).toBe(
			"/assignments/new?classId=cl-1",
		);
		expect(screen.getByText("Writing Task 2 — Opinion")).toBeTruthy();
		expect(screen.queryByText("Writing Task 1 — Draft")).toBeNull();

		// Xem trước đề ẩn khi chưa chọn đề
		expect(screen.queryByText("Xem trước phía học viên")).toBeNull();

		// Cột phải: 2. Hạn nộp & học viên, không lộ SĐT
		expect(screen.getByText("2. Hạn nộp & học viên")).toBeTruthy();
		expect(screen.getByText("(2/2)")).toBeTruthy();
		expect(screen.getByText("Nguyễn Văn A")).toBeTruthy();
		expect(screen.getByText("Trần Thị B")).toBeTruthy();
		expect(screen.queryByText("0901234567")).toBeNull();
		expect(screen.queryByText("0901234568")).toBeNull();

		// Footer
		expect(screen.getByText("Chưa chọn đề")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Huỷ" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Giao bài tập" })).toBeTruthy();
	});

	it("tìm kiếm theo tiêu đề/nguồn, đếm counts trên ChipFilter với aria-hidden và bung/thu xem trước khi chọn đề (#574)", () => {
		render(
			<AssignClassPromptModal open onClose={vi.fn()} classGroup={testClass} />,
		);

		// ChipFilter giữ exact accessible name "Grammar" và badge số lượng có aria-hidden
		const grammarChip = screen.getByRole("button", {
			name: "Grammar",
		});
		expect(grammarChip.textContent).toContain("1");
		const hiddenBadge = grammarChip.querySelector('[aria-hidden="true"]');
		expect(hiddenBadge?.textContent).toBe("1");
		expect(screen.getByRole("button", { name: "Vocabulary" })).toBeTruthy();

		// Tìm theo nguồn "Cambridge" -> chỉ còn Writing Task 2 — Opinion
		const searchInput = screen.getByLabelText("Tìm đề sẵn sàng");
		fireEvent.change(searchInput, { target: { value: "cambridge" } });
		expect(screen.getByText("Writing Task 2 — Opinion")).toBeTruthy();
		expect(screen.queryByText("Reading — True/False")).toBeNull();

		// Chọn đề -> card có ring-1 ring-primary (không có ring-fg), hiện cảnh báo giao lại + xem trước thu gọn
		const promptBtn = screen.getByRole("button", {
			name: /Writing Task 2 — Opinion/,
		});
		fireEvent.click(promptBtn);
		expect(promptBtn.className).toContain("ring-1");
		expect(promptBtn.className).toContain("ring-primary");
		expect(promptBtn.className).not.toContain("ring-fg");
		expect(screen.getByText(/Đề này đã giao lớp này, hạn/)).toBeTruthy();

		const previewToggle = screen.getByRole("button", {
			name: /Xem trước phía học viên/,
		});
		expect(previewToggle.getAttribute("aria-expanded")).toBe("false");
		expect(
			screen.queryByText(
				"Some people believe university education should be free.",
			),
		).toBeNull();

		fireEvent.click(previewToggle);
		expect(previewToggle.getAttribute("aria-expanded")).toBe("true");
		expect(
			screen.getByText(
				"Some people believe university education should be free.",
			),
		).toBeTruthy();

		// Tìm kiếm không có kết quả -> hiện nút Xoá bộ lọc tìm kiếm
		fireEvent.change(searchInput, { target: { value: "khong-ton-tai" } });
		expect(screen.getByText("Không có đề sẵn sàng khớp bộ lọc.")).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "Xoá bộ lọc tìm kiếm" }),
		);
		expect(screen.getByText("Grammar + Writing Homework")).toBeTruthy();
	});

	it("hỗ trợ dd/mm/yyyy DatePickerInput, giờ 24h, kiểm tra quá khứ khi bấm Giao và reset submit.error (#572)", () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(new Date("2026-11-06T14:00:00+07:00"));
			mockSubmit.error = "Không thể giao bài do giờ hạn nộp đã qua.";

			render(
				<AssignClassPromptModal
					open
					onClose={vi.fn()}
					classGroup={testClass}
				/>,
			);

			fireEvent.click(
				screen.getByRole("button", { name: /Writing Task 2 — Opinion/ }),
			);
			expect(screen.getByRole("alert").textContent).toContain(
				"Không thể giao bài",
			);

			const dueInput = document.getElementById(
				"assignment-due-input",
			) as HTMLInputElement;
			const timeInput = document.getElementById(
				"assignment-due-time-input",
			) as HTMLInputElement;

			fireEvent.focus(dueInput);
			fireEvent.change(dueInput, { target: { value: "06/11/2026" } });
			expect(mockSubmit.reset).toHaveBeenCalled();
			mockSubmit.error = undefined;

			fireEvent.focus(timeInput);
			fireEvent.change(timeInput, { target: { value: "13:59" } });
			expect(screen.queryByTestId("assignment-due-preview")).toBeNull();
			expect(
				screen.getByText("Giờ hạn nộp hôm nay phải sau thời điểm hiện tại."),
			).toBeTruthy();
			expect(screen.getByText("Giờ hạn nộp đã qua")).toBeTruthy();

			// 14:01 hợp lệ lúc 14:00, nhưng đến 14:02 bấm nút submit phải chặn lại
			fireEvent.change(timeInput, { target: { value: "14:01" } });
			expect(screen.getByTestId("assignment-due-preview")).toBeTruthy();

			vi.setSystemTime(new Date("2026-11-06T14:02:00+07:00"));
			fireEvent.click(screen.getByRole("button", { name: "Giao bài tập" }));
			expect(mockSubmit.run).not.toHaveBeenCalled();
			expect(
				screen.getByText("Giờ hạn nộp hôm nay phải sau thời điểm hiện tại."),
			).toBeTruthy();
		} finally {
			vi.useRealTimers();
		}
	});

	it("hỗ trợ đủ 4 cách huỷ/đóng (Huỷ, nút Đóng, Escape, backdrop) và đóng Modal + toast khi giao thành công", async () => {
		const onClose = vi.fn();
		const onAssigned = vi.fn();
		mockSubmit.run.mockResolvedValue({ kind: "refreshed" });

		const { rerender } = render(
			<AssignClassPromptModal
				open
				onClose={onClose}
				classGroup={testClass}
				onAssigned={onAssigned}
			/>,
		);

		// 1. Nút Huỷ
		fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
		// 2. Nút Đóng (✕)
		fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
		// 3. Phím Escape
		fireEvent.keyDown(document, { key: "Escape" });
		// 4. Click backdrop
		const dialog = screen.getByRole("dialog", {
			name: "Giao bài tập · IELTS 7.0 Tối",
		});
		const overlay = dialog.parentElement as HTMLElement;
		fireEvent.click(overlay);
		expect(onClose).toHaveBeenCalledTimes(4);

		// Đóng rồi mở lại -> reset sạch trạng thái
		rerender(
			<AssignClassPromptModal
				open={false}
				onClose={onClose}
				classGroup={testClass}
				onAssigned={onAssigned}
			/>,
		);
		rerender(
			<AssignClassPromptModal
				open
				onClose={onClose}
				classGroup={testClass}
				onAssigned={onAssigned}
			/>,
		);

		// Chọn đề & giao thành công
		fireEvent.click(
			screen.getByRole("button", { name: /Reading — True\/False/ }),
		);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Giao bài tập" }));
		});

		await waitFor(() => {
			expect(mockSubmit.run).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "assign-class-prompt",
					payload: expect.objectContaining({
						classId: "cl-1",
						promptId: "p-reading",
						studentIds: ["st-1", "st-2"],
					}),
				}),
			);
			expect(mockToastSuccess).toHaveBeenCalledWith(
				"Đã giao “Reading — True/False” cho 2 học viên.",
			);
			expect(onAssigned).toHaveBeenCalledWith(
				expect.objectContaining({
					promptId: "p-reading",
					promptTitle: "Reading — True/False",
					studentCount: 2,
					baselineIds: new Set(["ca-existing"]),
				}),
			);
			expect(onClose).toHaveBeenCalledTimes(5);
		});
	});

	it("hiển thị hướng dẫn và nút + Thêm học viên vào lớp khi lớp chưa có học viên", () => {
		const onRequestAddStudent = vi.fn();
		const emptyClass: ClassGroup = { ...testClass, studentIds: [] };

		render(
			<AssignClassPromptModal
				open
				onClose={vi.fn()}
				classGroup={emptyClass}
				onRequestAddStudent={onRequestAddStudent}
			/>,
		);

		expect(screen.getByText("Lớp chưa có học viên đang học.")).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "+ Thêm học viên vào lớp" }),
		);
		expect(onRequestAddStudent).toHaveBeenCalledTimes(1);
	});

	it("không báo thành công giả khi reconcile từ trạng thái unknown và chỉ hoàn tất khi đã committed", async () => {
		const onClose = vi.fn();
		const onAssigned = vi.fn();
		mockSubmit.run.mockResolvedValueOnce({ kind: "unknown" });
		mockSubmit.reconcile.mockResolvedValue(true);

		const { rerender } = render(
			<AssignClassPromptModal
				open
				onClose={onClose}
				classGroup={testClass}
				onAssigned={onAssigned}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /Reading — True\/False/ }),
		);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Giao bài tập" }));
		});

		mockSubmit.notice = { kind: "unknown" };
		rerender(
			<AssignClassPromptModal
				open
				onClose={onClose}
				classGroup={testClass}
				onAssigned={onAssigned}
			/>,
		);

		await act(async () => {
			fireEvent.click(
				screen.getByRole("button", { name: "Tải lại & kiểm tra" }),
			);
		});
		expect(mockSubmit.reconcile).toHaveBeenCalledTimes(1);
		expect(mockToastSuccess).not.toHaveBeenCalled();
		expect(onAssigned).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();

		// Khi outcome trước đó là committed và reconcile() thành công -> đóng Modal + toast + onAssigned
		mockSubmit.run.mockResolvedValueOnce({ kind: "committed" });
		mockSubmit.notice = undefined;
		rerender(
			<AssignClassPromptModal
				open
				onClose={onClose}
				classGroup={testClass}
				onAssigned={onAssigned}
			/>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Giao bài tập" }));
		});
		mockSubmit.notice = { kind: "committed" };
		rerender(
			<AssignClassPromptModal
				open
				onClose={onClose}
				classGroup={testClass}
				onAssigned={onAssigned}
			/>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
		});
		expect(mockToastSuccess).toHaveBeenCalledWith(
			"Đã giao “Reading — True/False” cho 2 học viên.",
		);
		expect(onAssigned).toHaveBeenCalledWith(
			expect.objectContaining({
				promptId: "p-reading",
				promptTitle: "Reading — True/False",
				studentCount: 2,
				baselineIds: new Set(["ca-existing"]),
			}),
		);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("hiện lỗi inline và aria-invalid ngay khi xoá trắng ngày hoặc giờ hạn nộp bắt buộc", () => {
		render(
			<AssignClassPromptModal open onClose={vi.fn()} classGroup={testClass} />,
		);

		const dueInput = document.getElementById(
			"assignment-due-input",
		) as HTMLInputElement;
		const timeInput = document.getElementById(
			"assignment-due-time-input",
		) as HTMLInputElement;

		fireEvent.change(dueInput, { target: { value: "" } });
		expect(dueInput.getAttribute("aria-invalid")).toBe("true");
		expect(
			screen.getByText(
				"Ngày không hợp lệ — nhập theo định dạng dd/mm/yyyy (ví dụ 06/11/2026).",
			),
		).toBeTruthy();

		fireEvent.change(dueInput, { target: { value: "20/11/2099" } });
		expect(dueInput.getAttribute("aria-invalid")).toBeNull();

		fireEvent.change(timeInput, { target: { value: "" } });
		expect(timeInput.getAttribute("aria-invalid")).toBe("true");
		expect(
			screen.getByText(
				"Giờ không hợp lệ — nhập theo định dạng 24h HH:mm (ví dụ 23:59).",
			),
		).toBeTruthy();
	});

	it("xem trước chính xác nội dung Speaking Part 2, Listening, Grammar/Vocab và Hybrid", () => {
		currentDataFixture = {
			...currentDataFixture,
			assignmentPrompts: [
				...testPrompts.slice(0, 3),
				{
					id: "p-hybrid-q",
					skill: "grammar",
					part: "tenses",
					type: "mcq",
					task: "task2",
					genre: "",
					title: "Grammar + Writing Có Câu Hỏi",
					band: "6.5",
					source: "",
					prompt: "",
					questions: [
						{
							stem: "She ____ to school daily.",
							answer: "goes",
							opts: ["go", "goes"],
							alts: "",
						},
					],
					note: "",
					status: "ready",
					writing: {
						part: "task2",
						type: "discuss",
						prompt: "<p>Discuss technology impact.</p>",
					},
					createdAt: "2026-09-18T06:00:00.000Z",
				},
				{
					id: "p-sp2",
					skill: "speaking",
					part: "part2",
					type: "cue",
					task: "part2",
					genre: "cue",
					title: "Speaking Part 2 — Neighbor",
					band: "7.0",
					source: "",
					prompt: "",
					cueTopic: "a helpful neighbor",
					cuePoints: "Who the person is\nHow you know them",
					questions: [],
					note: "",
					status: "ready",
					createdAt: "2026-09-18T05:00:00.000Z",
				},
				{
					id: "p-list",
					skill: "listening",
					part: "s1",
					type: "form",
					task: "s1",
					genre: "form",
					title: "Listening S1 — Booking",
					band: "6.5",
					source: "",
					prompt: "",
					audioName: "cam18-test1-part1.mp3",
					questions: [
						{
							stem: "Caller name: [1]",
							answer: "Taylor",
							opts: null,
							alts: "",
						},
					],
					note: "",
					status: "ready",
					createdAt: "2026-09-18T04:00:00.000Z",
				},
				{
					id: "p-vocab",
					skill: "vocabulary",
					part: "collocations",
					type: "cloze",
					task: "collocations",
					genre: "cloze",
					title: "Vocab — Collocations",
					band: "6.0",
					source: "",
					prompt: "",
					passage: "<p>Grammar context passage here.</p>",
					intro: "Fill in the missing words",
					questions: [
						{
							stem: "Make a [1] decision",
							answer: "quick",
							opts: null,
							alts: "",
						},
					],
					note: "",
					status: "ready",
					createdAt: "2026-09-18T03:00:00.000Z",
				},
				{
					id: "p-mixed",
					skill: "reading",
					part: "p1",
					type: "tfng",
					task: "p1",
					genre: "tfng",
					title: "Reading — Mixed Question Types",
					band: "7.0",
					source: "",
					prompt: "",
					passage: "<p>City planning passage.</p>",
					optionBank: ["Urban transport", "Green roofs"],
					questions: [
						{
							stem: "Paragraph A heading",
							answer: "ii",
							type: "headings",
							opts: null,
							alts: "",
						},
						{
							stem: "[table] r1 c2: Main / Transit [1]",
							answer: "bus",
							type: "tablecomp",
							opts: null,
							alts: "",
						},
					],
					note: "",
					status: "ready",
					createdAt: "2026-09-18T02:00:00.000Z",
				},
			],
		};

		render(
			<AssignClassPromptModal open onClose={vi.fn()} classGroup={testClass} />,
		);

		// 1. Speaking Part 2
		fireEvent.click(
			screen.getByRole("button", { name: /Speaking Part 2 — Neighbor/ }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Xem trước phía học viên/ }),
		);
		expect(screen.getByText("Describe a helpful neighbor.")).toBeTruthy();
		expect(screen.getByText("Who the person is")).toBeTruthy();
		expect(screen.getByText("How you know them")).toBeTruthy();

		// 2. Listening đơn (không gán cứng "Phần 1 ·" hay "trắc nghiệm")
		fireEvent.click(
			screen.getByRole("button", { name: /Listening S1 — Booking/ }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Xem trước phía học viên/ }),
		);
		expect(screen.getByText(/cam18-test1-part1\.mp3/)).toBeTruthy();
		expect(screen.queryByText(/Phần 1 ·/)).toBeNull();
		expect(screen.queryByText(/trắc nghiệm/)).toBeNull();
		expect(screen.getByText(/1 câu hỏi/)).toBeTruthy();

		// 3. Vocabulary đơn + passage ngữ cảnh (#286)
		fireEvent.click(
			screen.getByRole("button", { name: /Vocab — Collocations/ }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Xem trước phía học viên/ }),
		);
		expect(screen.getByText("Grammar context passage here.")).toBeTruthy();
		expect(screen.getByText("Fill in the missing words")).toBeTruthy();
		expect(screen.getByText(/Make a/)).toBeTruthy();

		// 4. Reading trộn dạng (#286): optionBank từ câu headings + ClozeStemText tablecomp
		fireEvent.click(
			screen.getByRole("button", { name: /Reading — Mixed Question Types/ }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Xem trước phía học viên/ }),
		);
		expect(screen.getByText("City planning passage.")).toBeTruthy();
		expect(screen.getByText(/Green roofs/)).toBeTruthy();
		expect(screen.getByText(/Hàng 1 — Cột 2:/)).toBeTruthy();

		// 5. Hybrid Grammar + Writing
		fireEvent.click(
			screen.getByRole("button", { name: /Grammar \+ Writing Có Câu Hỏi/ }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Xem trước phía học viên/ }),
		);
		expect(screen.getByText(/Phần 1 · 1 câu hỏi/)).toBeTruthy();
		expect(screen.getByText("Phần 2 · Writing (Task 2)")).toBeTruthy();
		expect(screen.getByText("Discuss technology impact.")).toBeTruthy();
	});

	it("giới hạn tối đa 100 học viên khi lớp đông và ẩn + Thêm học viên khi lớp tạm dừng trống", () => {
		const manyStudents: Student[] = Array.from({ length: 105 }, (_, idx) => ({
			...testStudents[0],
			id: `st-bulk-${idx + 1}`,
			name: `Học viên ${idx + 1}`,
			avatar: "HV",
		}));
		currentDataFixture = {
			...currentDataFixture,
			students: manyStudents,
		};
		const bigClass: ClassGroup = {
			...testClass,
			studentIds: manyStudents.map((s) => s.id),
		};

		const { rerender } = render(
			<AssignClassPromptModal open onClose={vi.fn()} classGroup={bigClass} />,
		);

		expect(screen.getByText("(100/105)")).toBeTruthy();
		expect(screen.getByText("Mỗi lượt giao tối đa 100 học viên.")).toBeTruthy();
		expect(
			(
				screen.getByRole("checkbox", {
					name: /Học viên 101$/,
				}) as HTMLInputElement
			).disabled,
		).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn tất cả" }));
		expect(screen.getByText("(0/105)")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Chọn tất cả" }));
		expect(screen.getByText("(100/105)")).toBeTruthy();

		const pausedEmptyClass: ClassGroup = {
			...testClass,
			status: "paused",
			studentIds: [],
		};
		rerender(
			<AssignClassPromptModal
				open
				onClose={vi.fn()}
				classGroup={pausedEmptyClass}
			/>,
		);
		expect(
			screen.queryByRole("button", { name: "+ Thêm học viên vào lớp" }),
		).toBeNull();
		expect(
			screen.getByText("Mở lại lớp để thêm học viên trước khi giao bài."),
		).toBeTruthy();
	});
});
