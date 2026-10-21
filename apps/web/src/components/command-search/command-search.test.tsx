// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockData } from "@/lib/mock-data";
import { CommandSearch } from "./command-search";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

// jsdom không có ResizeObserver — cmdk List đăng ký quan sát khi mount.
vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);
// jsdom không có layout — cmdk scroll item đang chọn vào tầm nhìn.
Element.prototype.scrollIntoView ??= () => {};

function dataFixture(): MockData {
	return {
		students: [
			{
				id: "s-1",
				name: "Lê Quang Huy",
				phone: "0901234567",
				zalo: "",
				email: "",
				hasPackage: true,
				parent: { name: "Phạm Văn Bình", phone: "" },
				targetBand: "6.5",
				skills: [],
				examDate: "",
				pkg: {
					total: 0,
					done: 0,
					remaining: 0,
					price: 0,
					mode: "Offline",
					start: "",
					expiry: "",
				},
				tags: [],
				notes: "",
				avatar: "",
				atRisk: false,
			},
			{
				id: "s-2",
				name: "Nguyễn Minh Anh",
				phone: "",
				zalo: "",
				email: "",
				hasPackage: false,
				parent: { name: "", phone: "" },
				targetBand: "7.0",
				skills: [],
				examDate: "",
				pkg: {
					total: 0,
					done: 0,
					remaining: 0,
					price: 0,
					mode: "Offline",
					start: "",
					expiry: "",
				},
				tags: [],
				notes: "",
				avatar: "",
				atRisk: false,
			},
		],
		lessons: [],
		invoices: [
			{
				id: "i-1234567890",
				sid: "s-1",
				eid: "",
				amount: 4_000_000,
				paidAmount: 0,
				status: "unpaid",
				date: "",
				type: "Học phí",
				method: "",
				due: "",
				note: "",
				createdAt: 0,
			},
		],
		assignments: [
			{
				id: "a-1",
				sid: "s-1",
				title: "Essay: Technology",
				type: "essay",
				due: "",
				status: "not-submitted",
				scores: null,
			},
		],
		assignmentPrompts: [],
		reports: [],
		notifs: [],
		commentBank: [],
		classes: [
			{
				id: "c-1",
				name: "Lớp 7 IELTS Foundation",
				level: "IELTS 5.5",
				type: "ielts",
				skills: [],
				mode: "Offline",
				syllabusId: "",
				studentIds: ["s-1"],
				invitedStudentIds: [],
				schedule: "",
				sessionsDone: 0,
				sessionsTotal: 0,
				status: "active",
				startDate: "",
				tuitionFee: null,
				notes: "",
			},
		],
		syllabi: [],
	};
}

const DATA = dataFixture();

function openPalette() {
	fireEvent.click(screen.getByTestId("command-search-trigger"));
}

function paletteInput() {
	return screen.getByPlaceholderText(
		"Tìm học viên, lớp học…",
	) as HTMLInputElement;
}

function typeQuery(value: string) {
	fireEvent.change(paletteInput(), { target: { value } });
}

afterEach(() => {
	cleanup();
	navigateMock.mockClear();
});

describe("CommandSearch — trigger và mở palette", () => {
	it("click trigger mở palette: dialog + input + nhóm Điều hướng mặc định", () => {
		render(<CommandSearch data={DATA} />);
		expect(screen.queryByRole("dialog")).toBeNull();
		openPalette();
		const dialog = screen.getByRole("dialog");
		expect(dialog.contains(paletteInput())).toBe(true);
		// Query rỗng → mục lục nhanh bằng nhóm Điều hướng.
		expect(screen.getByText("Tổng quan")).toBeTruthy();
	});

	it("⌘K mở palette từ bất kỳ đâu, nhấn lần nữa đóng", () => {
		render(<CommandSearch data={DATA} />);
		fireEvent.keyDown(document, { key: "k", metaKey: true });
		expect(screen.getByRole("dialog")).toBeTruthy();
		fireEvent.keyDown(document, { key: "k", metaKey: true });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("Ctrl+K (Windows/Linux) cũng mở", () => {
		render(<CommandSearch data={DATA} />);
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it("⌘K mở cả khi focus trong input thường (chord meta không thuộc field)", () => {
		render(
			<>
				<input data-testid="other-input" />
				<CommandSearch data={DATA} />
			</>,
		);
		const other = screen.getByTestId("other-input");
		other.focus();
		fireEvent.keyDown(other, { key: "k", metaKey: true });
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it("⌘K mở cả khi focus trong editor Tiptap (contenteditable)", () => {
		render(
			<>
				<div contentEditable data-testid="editor" />
				<CommandSearch data={DATA} />
			</>,
		);
		const editor = screen.getByTestId("editor") as HTMLElement;
		editor.focus();
		fireEvent.keyDown(editor, { key: "k", metaKey: true });
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it("store chưa tải (data null) → trạng thái 'Đang tải…'", () => {
		render(<CommandSearch data={null} />);
		openPalette();
		expect(screen.getByTestId("command-search-loading").textContent).toBe(
			"Đang tải…",
		);
		expect(screen.queryByTestId("command-search-empty")).toBeNull();
	});
});

describe("CommandSearch — kết quả và điều hướng", () => {
	it("gõ 'huy' → đúng học viên (nhóm Học viên), aria-live đọc số kết quả", () => {
		render(<CommandSearch data={DATA} />);
		openPalette();
		typeQuery("huy");
		// Tên học viên xuất hiện ở 3 nhóm: Học viên (label), Bài tập (hint =
		// tên học viên được giao) và Hóa đơn (label = tên học viên).
		expect(screen.getAllByText("Lê Quang Huy")).toHaveLength(3);
		expect(screen.getByTestId("command-search-count").textContent).toBe(
			"3 kết quả",
		);
		const groups = screen.getAllByTestId("command-search-group");
		// cmdk đặt nhãn nhóm ở data-value (heading hiển thị song song).
		expect(groups[0].getAttribute("data-value")).toBe("Học viên");
	});

	it("tìm 'lop 7' bỏ dấu vẫn khớp lớp", () => {
		render(<CommandSearch data={DATA} />);
		openPalette();
		typeQuery("lop 7");
		expect(screen.getByText("Lớp 7 IELTS Foundation")).toBeTruthy();
	});

	it("không khớp → 'Không tìm thấy', không còn item nào", () => {
		render(<CommandSearch data={DATA} />);
		openPalette();
		typeQuery("zzz-khong-co");
		expect(screen.getByTestId("command-search-empty").textContent).toBe(
			"Không tìm thấy",
		);
		expect(screen.queryByTestId("command-search-item")).toBeNull();
	});

	it("Enter chọn kết quả đầu → điều hướng tới trang học viên", () => {
		render(<CommandSearch data={DATA} />);
		openPalette();
		typeQuery("huy");
		fireEvent.keyDown(paletteInput(), { key: "Enter" });
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/students/$studentId",
			params: { studentId: "s-1" },
		});
		// Chọn xong palette đóng.
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("click kết quả lớp → điều hướng tới trang lớp", () => {
		render(<CommandSearch data={DATA} />);
		openPalette();
		typeQuery("lop 7");
		fireEvent.click(screen.getByText("Lớp 7 IELTS Foundation"));
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/classes/$classId",
			params: { classId: "c-1" },
		});
	});

	it("Enter trên nhóm Điều hướng → đi đúng route nav", () => {
		render(<CommandSearch data={DATA} />);
		openPalette();
		// Query rỗng hiển thị Điều hướng — chọn "Doanh thu" bằng phím mũi tên.
		fireEvent.keyDown(paletteInput(), { key: "ArrowDown" });
		fireEvent.keyDown(paletteInput(), { key: "Enter" });
		expect(navigateMock).toHaveBeenCalledWith({ to: expect.any(String) });
	});

	it("Escape đóng palette và trả focus về một trong hai trigger", async () => {
		render(<CommandSearch data={DATA} />);
		openPalette();
		typeQuery("huy");
		fireEvent.keyDown(paletteInput(), { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
		const desktop = screen.getByTestId("command-search-trigger");
		const icon = screen.getByTestId("command-search-trigger-icon");
		// Focus trả qua requestAnimationFrame sau khi portal đóng.
		await waitFor(() => {
			expect(
				document.activeElement === desktop || document.activeElement === icon,
			).toBe(true);
		});
	});
});
