// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentClassDetail } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassDetailView } from "./class-detail-view";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		const href =
			typeof to === "string"
				? to.replace("$classId", params?.classId ?? "")
				: String(to);
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function makeDetail(status: "active" | "paused"): StudentClassDetail {
	return {
		class: {
			id: "cls-1",
			name: "IELTS Speaking",
			level: "IELTS 6.5",
			mode: "1:1",
			schedule: '{"days":[1,4],"start":"19:00","end":"20:30"}',
			sessionsDone: 1,
			sessionsTotal: 8,
			status,
			nextSession: null,
			enrollmentId: "enr-1",
			enrollmentStatus: "active",
			startDate: "2026-11-01",
			teacher: {
				name: "Thầy Minh",
				email: "minh@test.local",
				image: null,
			},
		},
		lessons: [
			{
				id: "l-done",
				date: "2026-11-10",
				day: 2,
				time: "19:00",
				dur: 90,
				status: "completed",
				topic: "Part 1 Basics",
			},
			{
				id: "l-up",
				date: "2026-11-28",
				day: 6,
				time: "19:00",
				dur: 90,
				status: "upcoming",
				topic: "Cue Cards",
			},
		],
		assignments: [],
	};
}

describe("ClassDetailView — lớp tạm dừng (#694)", () => {
	const NOW = new Date("2026-11-20T03:00:00Z");
	const TODAY = "2026-11-20";

	it("shows neutral pause banner and suppresses Buổi tới in both ClassInfoCard and ClassLessonList", () => {
		render(
			<ClassDetailView
				detail={makeDetail("paused")}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.getByText("Tạm dừng")).toBeTruthy();
		const banner = screen.getByTestId("class-paused-banner");
		expect(banner.textContent).toContain("Lớp đang tạm dừng");
		expect(banner.className).not.toContain("destructive");
		expect(screen.queryByText(/Buổi tới/)).toBeNull();
		expect(screen.getByText("Tạm hoãn")).toBeTruthy();
		expect(screen.getByText("Đã học")).toBeTruthy();
	});

	it("still shows Buổi tới for active class", () => {
		render(
			<ClassDetailView
				detail={makeDetail("active")}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.queryByTestId("class-paused-banner")).toBeNull();
		expect(screen.getAllByText(/Buổi tới/).length).toBeGreaterThanOrEqual(1);
	});
});

describe("ClassDetailView — shared class materials tab", () => {
	const NOW = new Date("2026-11-20T03:00:00Z");
	const TODAY = "2026-11-20";

	function renderWithQueryClient(detail: StudentClassDetail) {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		return render(
			<QueryClientProvider client={client}>
				<ClassDetailView detail={detail} todayISO={TODAY} now={NOW} />
			</QueryClientProvider>,
		);
	}

	function stubClassMaterialsFetch(items: unknown[]) {
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify({ items }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	}

	it("places Tài liệu chung right after Giáo trình and opens shared materials on click", async () => {
		const fetchMock = stubClassMaterialsFetch([
			{
				id: "m-shared-1",
				title: "Từ vựng tổng hợp khóa",
				description: "Dùng cho cả khóa",
				kind: "link",
				url: "https://example.com/vocab",
				mimeType: null,
				sizeBytes: null,
				originalName: null,
				position: 0,
			},
		]);

		renderWithQueryClient(makeDetail("active"));

		const tabs = screen.getAllByRole("tab");
		const labels = tabs.map((t) => t.textContent);
		expect(labels.indexOf("Tài liệu chung")).toBe(
			labels.indexOf("Giáo trình") + 1,
		);

		const materialsTab = screen.getByTestId("class-tab-materials");
		expect(materialsTab.textContent).toBe("Tài liệu chung");
		expect(fetchMock).not.toHaveBeenCalled();

		fireEvent.click(materialsTab);

		expect(await screen.findByText("Từ vựng tổng hợp khóa")).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringMatching(/\/api\/student\/classes\/cls-1\/materials$/),
			expect.objectContaining({ method: "GET", credentials: "include" }),
		);
	});

	it("renders shared class materials when the class is paused", async () => {
		stubClassMaterialsFetch([
			{
				id: "m-paused-1",
				title: "Tài liệu ôn tập khi tạm dừng",
				description: "",
				kind: "link",
				url: "https://example.com/review",
				mimeType: null,
				sizeBytes: null,
				originalName: null,
				position: 0,
			},
		]);

		renderWithQueryClient(makeDetail("paused"));
		fireEvent.click(screen.getByTestId("class-tab-materials"));

		expect(
			await screen.findByText("Tài liệu ôn tập khi tạm dừng"),
		).toBeTruthy();
	});

	it("renders shared class materials when the class has no lessons yet", async () => {
		stubClassMaterialsFetch([]);
		const detailNoLessons: StudentClassDetail = {
			...makeDetail("active"),
			lessons: [],
		};

		renderWithQueryClient(detailNoLessons);
		fireEvent.click(screen.getByTestId("class-tab-materials"));

		expect(await screen.findByTestId("class-materials-empty")).toBeTruthy();
	});
});
