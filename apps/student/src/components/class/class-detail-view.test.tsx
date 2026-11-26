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
				? Object.entries(params ?? {}).reduce(
						(acc, [k, v]) => acc.replace(`$${k}`, v),
						to,
					)
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

	it("renders 3 merged tabs (Hành trình học, Bài tập, Tài liệu chung) without Giáo trình and opens shared materials on click", async () => {
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
		expect(labels).toEqual(["Hành trình học", "Bài tập", "Tài liệu chung"]);
		expect(screen.queryByTestId("class-tab-syllabus")).toBeNull();
		expect(screen.queryByTestId("class-tab-classmates")).toBeNull();

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

	it("groups lessons by syllabus modules inside Hành trình học when syllabus is attached", () => {
		const base = makeDetail("active");
		const withSyllabus: StudentClassDetail = {
			...base,
			syllabus: {
				name: "IELTS Speaking Pro",
				description: "Lộ trình giao tiếp",
				modules: [
					{
						id: "mod-1",
						title: "Module 1: Part 1 Mastery",
						description: "Nền tảng phản xạ",
					},
				],
			},
			lessons: base.lessons.map((l) => ({
				...l,
				moduleId: "mod-1",
				moduleTitle: "Module 1: Part 1 Mastery",
			})),
		};

		renderWithQueryClient(withSyllabus);
		expect(screen.getByTestId("journey-syllabus-header").textContent).toContain(
			"IELTS Speaking Pro",
		);
		const modRegion = screen.getByTestId("journey-module-mod-1");
		expect(modRegion.textContent).toContain("Module 1: Part 1 Mastery");
		expect(modRegion.textContent).toContain("1/2 buổi");
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
