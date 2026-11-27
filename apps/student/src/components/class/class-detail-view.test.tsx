// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentClassDetail } from "@teacher-os/api/contracts";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildClassDetailSearch,
	type ClassDetailSearchState,
} from "./class-detail-helpers";
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

	it("shows neutral pause banner and suppresses next-session indicators on paused class", () => {
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
		expect(screen.queryByTestId("journey-next-hero")).toBeNull();
		expect(screen.queryByText(/Buổi tới/)).toBeNull();
		expect(screen.getByText("Tạm hoãn")).toBeTruthy();
		expect(screen.getByText("Đã học")).toBeTruthy();
	});

	it("omits footer from ClassInfoCard while keeping next-session indicators in Hành trình học for active class", () => {
		render(
			<ClassDetailView
				detail={makeDetail("active")}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.queryByTestId("class-paused-banner")).toBeNull();
		const infoCard = screen.getByRole("region", { name: "Thông tin lớp học" });
		expect(within(infoCard).queryByText(/Buổi tới/)).toBeNull();
		expect(within(infoCard).queryByText(/\d+\s*tháng/)).toBeNull();
		expect(screen.getByTestId("journey-next-hero").textContent).toContain(
			"Buổi tiếp theo",
		);
		expect(screen.getAllByText("Buổi tới")).toHaveLength(1);
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

	it("TodoBanner bỏ qua bộ đề tự học tương lai nhưng giữ homework tương lai, RingStat đếm cả gradedAt != null mà giữ mẫu số Band trung bình, Hành trình học mở quiz trực tiếp và Tab Bài tập chỉ hiện bộ đề tự học", async () => {
		const base = makeDetail("active");
		const detailWithMixedAssignments: StudentClassDetail = {
			...base,
			assignments: [
				{
					id: "hw-future",
					source: "class_assignment",
					classId: "cls-1",
					className: "IELTS Speaking",
					title: "Homework Reading buổi tới",
					skill: "reading",
					due: "2026-12-01",
					submittedAt: null,
					gradedAt: null,
					scores: null,
					sessionDate: "2026-11-28",
					classStudyPackId: null,
				},
				{
					id: "sp-future",
					source: "class_assignment",
					classId: "cls-1",
					className: "IELTS Speaking",
					title: "Study Pack Ngày 2 tương lai",
					skill: "listening",
					due: "2026-11-27",
					submittedAt: null,
					gradedAt: null,
					scores: null,
					classStudyPackId: "csp-1",
					studyPackTitle: "Daily Pack",
					studyPackStatus: "active",
					studyPackDayIndex: 2,
					studyPackPosition: 0,
				},
				{
					id: "sp-graded-noscores",
					source: "class_assignment",
					classId: "cls-1",
					className: "IELTS Speaking",
					title: "Study Pack Speaking đã chấm",
					skill: "speaking",
					due: "2026-11-20",
					submittedAt: null,
					gradedAt: "2026-11-25T10:00:00Z",
					scores: null,
					classStudyPackId: "csp-1",
					studyPackTitle: "Daily Pack",
					studyPackStatus: "active",
					studyPackDayIndex: 1,
					studyPackPosition: 0,
				},
				{
					id: "hw-graded-writing",
					source: "class_assignment",
					classId: "cls-1",
					className: "IELTS Speaking",
					title: "Writing có band",
					skill: "writing",
					due: "2026-11-20",
					submittedAt: "2026-11-20T09:00:00Z",
					gradedAt: "2026-11-21T09:00:00Z",
					scores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
					classStudyPackId: null,
				},
			],
		};

		renderWithQueryClient(detailWithMixedAssignments);

		// TodoBanner chỉ đếm 1 bài (hw-future), KHÔNG đếm sp-future hay sp-graded-noscores
		const banner = screen.getByRole("region", { name: "Việc cần làm" });
		expect(banner.textContent).toContain(
			"Bạn còn 1 bài chưa làm trong IELTS Speaking",
		);
		expect(
			within(banner)
				.getByRole("link", { name: "Làm ngay" })
				.getAttribute("href"),
		).toBe("/learn/quizzes/hw-future");

		// RingStat Bài tập đếm 2/4 (sp-graded-noscores + hw-graded-writing), Band trung bình giữ mẫu số 1
		expect(screen.getByText("2/4")).toBeTruthy();
		expect(screen.getByText("Trên 1 bài đã chấm")).toBeTruthy();

		// Hành trình học có link 1-click trực tiếp tới quiz, không có nút "Mở trong Bài tập"
		expect(
			screen.queryByRole("button", { name: "Mở trong Bài tập" }),
		).toBeNull();
		expect(
			screen
				.getByRole("link", { name: "Làm bài: Homework Reading buổi tới" })
				.getAttribute("href"),
		).toBe("/learn/quizzes/hw-future");

		// Tab Bài tập chỉ hiển thị bài thuộc bộ đề tự học (ẩn hw-future và hw-graded-writing)
		fireEvent.click(screen.getByTestId("class-tab-assignments"));
		expect(screen.getByText("Study Pack Ngày 2 tương lai")).toBeTruthy();
		expect(screen.queryByText("Homework Reading buổi tới")).toBeNull();
	});

	it("preserves controlled Tab 3 deep-link search & clear URL sync on initial mount without dropping mq", async () => {
		stubClassMaterialsFetch([
			{
				id: "m-1",
				title: "Cambridge 18 Reading.pdf",
				description: "",
				kind: "file",
				url: null,
				mimeType: "application/pdf",
				sizeBytes: 2048,
				originalName: "cambridge-18.pdf",
				position: 0,
			},
			{
				id: "m-2",
				title: "Audio Speaking Sample.mp3",
				description: "",
				kind: "media",
				url: null,
				mimeType: "audio/mpeg",
				sizeBytes: 4096,
				originalName: "speaking.mp3",
				position: 1,
			},
		]);

		let currentSearch: ClassDetailSearchState = {
			tab: "materials",
			mq: "cambridge",
		};
		const observed: ClassDetailSearchState[] = [];
		const onSearchChange = vi.fn(
			(updater: (prev: ClassDetailSearchState) => ClassDetailSearchState) => {
				currentSearch = buildClassDetailSearch(updater(currentSearch));
				observed.push(currentSearch);
			},
		);

		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const detail = makeDetail("active");
		const fixedNow = new Date("2026-11-26T10:00:00+07:00");
		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<ClassDetailView
					detail={detail}
					todayISO="2026-11-26"
					now={fixedNow}
					searchState={currentSearch}
					onSearchChange={onSearchChange}
				/>
			</QueryClientProvider>,
		);

		expect(
			(await screen.findAllByText("Cambridge 18 Reading.pdf")).length,
		).toBeGreaterThan(0);

		// Bấm nút xóa trên deep-link ?tab=materials&mq=cambridge phải đẩy xóa mq lên URL
		fireEvent.click(
			screen.getByRole("button", { name: "Xóa từ khóa tìm kiếm" }),
		);
		expect(onSearchChange).toHaveBeenCalledTimes(1);
		expect(observed[0]).toEqual({ tab: "materials" });

		// Rerender với searchState đã cập nhật rồi gõ từ khóa mới sau 300ms
		rerender(
			<QueryClientProvider client={qc}>
				<ClassDetailView
					detail={detail}
					todayISO="2026-11-26"
					now={fixedNow}
					searchState={currentSearch}
					onSearchChange={onSearchChange}
				/>
			</QueryClientProvider>,
		);

		vi.useFakeTimers();
		try {
			const input = screen.getByLabelText("Tìm tài liệu");
			fireEvent.change(input, { target: { value: "audio" } });
			await act(async () => {
				vi.advanceTimersByTime(310);
			});
			expect(onSearchChange).toHaveBeenCalledTimes(2);
			expect(observed[1]).toEqual({ tab: "materials", mq: "audio" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps mk='all' when switching kind filter during debounce while async router state still holds previous mk", async () => {
		stubClassMaterialsFetch([
			{
				id: "m-1",
				title: "Cambridge Audio.mp3",
				description: "",
				kind: "media",
				url: null,
				mimeType: "audio/mpeg",
				sizeBytes: 4096,
				originalName: "cambridge.mp3",
				position: 0,
			},
		]);

		// Mô phỏng router chưa commit (prev.mk vẫn là "media" trong suốt cửa sổ 300ms)
		const staleRouterState: ClassDetailSearchState = {
			tab: "materials",
			mk: "media",
		};
		const committed: ClassDetailSearchState[] = [];
		const onSearchChange = vi.fn(
			(updater: (prev: ClassDetailSearchState) => ClassDetailSearchState) => {
				committed.push(buildClassDetailSearch(updater(staleRouterState)));
			},
		);

		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={qc}>
				<ClassDetailView
					detail={makeDetail("active")}
					todayISO="2026-11-26"
					now={new Date("2026-11-26T10:00:00+07:00")}
					searchState={staleRouterState}
					onSearchChange={onSearchChange}
				/>
			</QueryClientProvider>,
		);

		expect(
			(await screen.findAllByText("Cambridge Audio.mp3")).length,
		).toBeGreaterThan(0);

		vi.useFakeTimers();
		try {
			const input = screen.getByLabelText("Tìm tài liệu");
			fireEvent.change(input, { target: { value: "cambridge" } });
			await act(async () => {
				vi.advanceTimersByTime(150);
			});
			// Đổi loại từ "Audio – Video" về "Tất cả" giữa cửa sổ debounce
			fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
			expect(committed[0]).toEqual({ tab: "materials" });

			await act(async () => {
				vi.advanceTimersByTime(200);
			});
			// Debounce nổ khi staleRouterState vẫn có mk="media" — phải giữ mk undefined ("Tất cả")
			expect(committed[1]).toEqual({ tab: "materials", mq: "cambridge" });
		} finally {
			vi.useRealTimers();
		}
	});
});
