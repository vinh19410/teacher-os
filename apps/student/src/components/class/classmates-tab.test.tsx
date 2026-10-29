// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as repos from "@/lib/repos/student";
import { ClassmatesTab } from "./classmates-tab";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function renderTab() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<ClassmatesTab classId="class-1" />
		</QueryClientProvider>,
	);
}

describe("ClassmatesTab", () => {
	it("vẽ lưới card avatar chữ tắt + tên, đánh dấu (bạn) cho chính mình", async () => {
		vi.spyOn(repos, "useClassmates").mockReturnValue({
			isLoading: false,
			isError: false,
			data: [
				{ id: "s1", name: "Phạm Bảo Ngọc", initials: "BN", isMe: true },
				{ id: "s2", name: "Trần Văn Quân", initials: "VQ", isMe: false },
			],
		} as never);
		renderTab();
		await waitFor(() =>
			expect(screen.getAllByTestId("classmate-card")).toHaveLength(2),
		);
		expect(screen.getByText("Phạm Bảo Ngọc")).toBeTruthy();
		expect(screen.getByText("(bạn)")).toBeTruthy();
		expect(screen.getByText("Trần Văn Quân")).toBeTruthy();
		expect(screen.getByText("BN")).toBeTruthy();
	});

	it("không bao giờ hiển thị email (dữ liệu roster chỉ gồm name/initials)", () => {
		vi.spyOn(repos, "useClassmates").mockReturnValue({
			isLoading: false,
			isError: false,
			data: [{ id: "s1", name: "Hoa", initials: "H", isMe: false }],
		} as never);
		renderTab();
		expect(screen.getByTestId("classmates-grid").textContent).toBe("HHoa");
		expect(screen.queryByText(/@/)).toBeNull();
	});

	it("hiện empty state khi lớp chưa có học viên", () => {
		vi.spyOn(repos, "useClassmates").mockReturnValue({
			isLoading: false,
			isError: false,
			data: [],
		} as never);
		renderTab();
		expect(screen.getByText("Lớp chưa có học viên nào")).toBeTruthy();
	});

	it("lỗi tải → empty state báo lỗi, không vẽ card", () => {
		vi.spyOn(repos, "useClassmates").mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
		} as never);
		renderTab();
		expect(screen.getByText("Không tải được danh sách lớp")).toBeTruthy();
		expect(screen.queryByTestId("classmates-grid")).toBeNull();
	});
});
