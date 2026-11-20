// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LibraryTestListPageResponse } from "@teacher-os/api/library-contracts";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibrarySearchParams } from "@/components/library/library-filters";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.fn();
let currentSearch: LibrarySearchParams = {};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => navigateMock,
	useSearch: () => currentSearch,
	Link: ({
		children,
		className,
		to,
	}: {
		children?: ReactNode;
		className?: string;
		to?: string;
	}) => (
		<a href={to ?? "#"} className={className}>
			{children}
		</a>
	),
}));

import { LibraryTestsRoute } from "./index";

function makeTestItem(id: string, title: string) {
	return {
		id,
		title,
		description: null,
		skill: "reading",
		timeLimitSeconds: 3600,
		collection: "Cambridge 18",
		testGroup: "TEST 1",
		status: "ready",
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-02T00:00:00.000Z",
		partCount: 3,
		questionCount: 40,
		hasAllAudio: true,
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	} as Response;
}

async function waitUntil(assertion: () => void) {
	const deadline = Date.now() + 2000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
		try {
			assertion();
			return;
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

describe("LibraryTestsRoute (phân trang phía server)", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	const fetchMock = vi.fn();

	beforeEach(() => {
		currentSearch = {};
		navigateMock.mockReset();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		queryClient.clear();
		vi.unstubAllGlobals();
	});

	function mountRoute() {
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<LibraryTestsRoute />
				</QueryClientProvider>,
			);
		});
	}

	it("tải dữ liệu phân trang, hiển thị chip count từ server, một vùng aria-live và chuyển trang với replace: false", async () => {
		const payload: LibraryTestListPageResponse = {
			tests: [makeTestItem("t1", "Reading Test 1")],
			total: 25,
			page: 1,
			pageSize: 20,
			totalPages: 2,
			counts: {
				skill: { reading: 15, listening: 10 },
				status: { draft: 7, ready: 18 },
			},
		};
		fetchMock.mockResolvedValue(jsonResponse(200, payload));

		mountRoute();
		await waitUntil(() => {
			expect(container.querySelector('[role="status"]')?.textContent).toBe(
				"Tìm thấy 25 bộ đề.",
			);
		});

		const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
		expect(calledUrl.searchParams.get("page")).toBe("1");
		expect(calledUrl.searchParams.get("pageSize")).toBe("20");

		// Chỉ có đúng 1 vùng aria-live="polite" trên trang.
		expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
		expect(container.textContent).toContain("Reading Test 1");
		expect(container.textContent).toContain("Hiển thị 1–20 / 25 bộ đề");

		// Chip count lấy từ counts server.
		const skillGroup = container.querySelector(
			'[aria-label="Lọc theo kỹ năng"]',
		);
		expect(skillGroup?.textContent).toContain("Reading15");
		expect(skillGroup?.textContent).toContain("Listening10");

		// Bấm trang 2 → navigate với replace: false và gọi scrollIntoView.
		const scrollIntoView = vi.fn();
		const tableWrapper =
			container.querySelector("table")?.parentElement?.parentElement;
		if (tableWrapper) {
			tableWrapper.scrollIntoView = scrollIntoView;
		}
		const page2Button = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Trang 2"]',
		);
		act(() => {
			page2Button?.click();
		});
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/library/tests",
			search: { page: 2 },
			replace: false,
		});
		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "nearest",
		});
	});

	it("đổi bộ lọc hoặc pageSize trên trang 2 sẽ reset về page 1 với replace: true", async () => {
		currentSearch = { page: 2, pageSize: 10 };
		const payload: LibraryTestListPageResponse = {
			tests: [makeTestItem("t11", "Reading Test 11")],
			total: 25,
			page: 2,
			pageSize: 10,
			totalPages: 3,
			counts: {
				skill: { reading: 15, listening: 10 },
				status: { draft: 7, ready: 18 },
			},
		};
		fetchMock.mockResolvedValue(jsonResponse(200, payload));

		mountRoute();
		await waitUntil(() => {
			expect(container.textContent).toContain("Reading Test 11");
		});

		// Bấm chip Listening → bỏ page (reset về 1), giữ pageSize=10, replace: true.
		const listeningChip = Array.from(
			container.querySelectorAll('[aria-label="Lọc theo kỹ năng"] button'),
		).find((btn) => btn.textContent?.startsWith("Listening")) as
			| HTMLButtonElement
			| undefined;
		act(() => {
			listeningChip?.click();
		});
		expect(navigateMock).toHaveBeenLastCalledWith({
			to: "/library/tests",
			search: { skill: "listening", pageSize: 10 },
			replace: true,
		});

		// Đổi pageSize sang 50 → reset page về 1, replace: true.
		const select = container.querySelector("select");
		const valueSetter = Object.getOwnPropertyDescriptor(
			HTMLSelectElement.prototype,
			"value",
		)?.set;
		act(() => {
			valueSetter?.call(select, "50");
			select?.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(navigateMock).toHaveBeenLastCalledWith({
			to: "/library/tests",
			search: { pageSize: 50 },
			replace: true,
		});
	});

	it("trang vượt totalPages sẽ tự kẹp về totalPages với replace: true và không nháy empty state", async () => {
		currentSearch = { page: 5, skill: "reading" };
		const payload: LibraryTestListPageResponse = {
			tests: [],
			total: 25,
			page: 5,
			pageSize: 20,
			totalPages: 2,
			counts: {
				skill: { reading: 25, listening: 0 },
				status: { draft: 5, ready: 20 },
			},
		};
		fetchMock.mockResolvedValue(jsonResponse(200, payload));

		mountRoute();
		await waitUntil(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: "/library/tests",
				search: { skill: "reading", page: 2 },
				replace: true,
			});
		});
		expect(container.textContent).not.toContain(
			"Không có bộ đề nào khớp bộ lọc.",
		);
		expect(container.textContent).not.toContain("Chưa có bộ đề nào.");
	});

	it("xóa bộ đề cuối cùng ở trang cuối → refetch thấy trang rỗng và tự lùi về trang trước", async () => {
		currentSearch = { page: 2, pageSize: 10 };
		let deleted = false;
		fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
			if (init?.method === "DELETE") {
				deleted = true;
				return Promise.resolve(jsonResponse(200, { ok: true }));
			}
			const payload: LibraryTestListPageResponse = deleted
				? {
						tests: [],
						total: 10,
						page: 2,
						pageSize: 10,
						totalPages: 1,
						counts: {
							skill: { reading: 10, listening: 0 },
							status: { draft: 0, ready: 10 },
						},
					}
				: {
						tests: [makeTestItem("t11", "Last Test On Page 2")],
						total: 11,
						page: 2,
						pageSize: 10,
						totalPages: 2,
						counts: {
							skill: { reading: 11, listening: 0 },
							status: { draft: 0, ready: 11 },
						},
					};
			return Promise.resolve(jsonResponse(200, payload));
		});

		mountRoute();
		await waitUntil(() => {
			expect(container.textContent).toContain("Last Test On Page 2");
		});

		const deleteBtn = Array.from(container.querySelectorAll("button")).find(
			(btn) => btn.textContent === "Xóa",
		);
		act(() => {
			deleteBtn?.click();
		});
		const confirmBtn = Array.from(container.querySelectorAll("button")).find(
			(btn) => btn.textContent === "Xóa bộ đề",
		);
		act(() => {
			confirmBtn?.click();
		});

		await waitUntil(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				to: "/library/tests",
				search: { pageSize: 10 },
				replace: true,
			});
		});
	});

	it("khi không có kết quả với bộ lọc đang bật → hiện Xóa bộ lọc và làm sạch input + URL", async () => {
		currentSearch = { skill: "listening", q: "missing", pageSize: 10 };
		const payload: LibraryTestListPageResponse = {
			tests: [],
			total: 0,
			page: 1,
			pageSize: 10,
			totalPages: 1,
			counts: {
				skill: { reading: 0, listening: 0 },
				status: { draft: 0, ready: 0 },
			},
		};
		fetchMock.mockResolvedValue(jsonResponse(200, payload));

		mountRoute();
		await waitUntil(() => {
			expect(container.textContent).toContain(
				"Không có bộ đề nào khớp bộ lọc.",
			);
		});
		const clearBtn = Array.from(container.querySelectorAll("button")).find(
			(btn) => btn.textContent === "Xóa bộ lọc",
		);
		expect(clearBtn).toBeDefined();

		act(() => {
			clearBtn?.click();
		});
		const input = container.querySelector<HTMLInputElement>(
			"#library-test-search",
		);
		expect(input?.value).toBe("");
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/library/tests",
			search: {},
			replace: true,
		});
	});

	it("khi thư viện rỗng hoàn toàn không có bộ lọc → hiện trạng thái tạo bộ đề đầu tiên", async () => {
		const payload: LibraryTestListPageResponse = {
			tests: [],
			total: 0,
			page: 1,
			pageSize: 20,
			totalPages: 1,
			counts: {
				skill: { reading: 0, listening: 0 },
				status: { draft: 0, ready: 0 },
			},
		};
		fetchMock.mockResolvedValue(jsonResponse(200, payload));

		mountRoute();
		await waitUntil(() => {
			expect(container.textContent).toContain("Chưa có bộ đề nào.");
		});
		expect(
			container.querySelector('nav[aria-label="Phân trang bộ đề"]'),
		).toBeNull();
	});
});
