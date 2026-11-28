// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const { mockGetCachedSession, mockFetchQuery, mockEnsureQueryData } =
	vi.hoisted(() => ({
		mockGetCachedSession: vi.fn(),
		mockFetchQuery: vi.fn(),
		mockEnsureQueryData: vi.fn(),
	}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		getCachedSession: mockGetCachedSession,
		clearSessionCache: vi.fn(),
	},
	getSessionUserRole: () => "student",
	isStudentSession: () => true,
}));

vi.mock("@/lib/query-client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/query-client")>();
	actual.studentQueryClient.fetchQuery = mockFetchQuery;
	actual.studentQueryClient.ensureQueryData = mockEnsureQueryData;
	return {
		...actual,
		clearStudentQueryCacheIfUserChanged: vi.fn(),
		syncStudentSessionUser: vi.fn(),
	};
});

type LoadedModules = {
	routeTree: typeof import("@/routeTree.gen").routeTree;
	NotFoundPage: typeof import("@/components/not-found").default;
};

async function loadModulesWithPracticeFlag(
	practiceEnabled: string | undefined,
): Promise<LoadedModules> {
	vi.resetModules();
	vi.doMock("@teacher-os/env/web", () => ({
		env: {
			VITE_SERVER_URL: "http://localhost:8000",
			VITE_STUDENT_PRACTICE_ENABLED: practiceEnabled,
		},
	}));
	const [{ routeTree }, { default: NotFoundPage }] = await Promise.all([
		import("@/routeTree.gen"),
		import("@/components/not-found"),
	]);
	return { routeTree, NotFoundPage };
}

async function renderStudentRouteAt(
	modules: LoadedModules,
	initialUrl: string,
) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	const router = createRouter({
		routeTree: modules.routeTree,
		basepath: "/student",
		history,
		defaultNotFoundComponent: modules.NotFoundPage,
		context: {},
	});

	await router.load();
	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	return { router, history };
}

describe("student practice route gates", () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		window.scrollTo = vi.fn();
		fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
			Promise.resolve(
				new Response(JSON.stringify({}), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);
		mockGetCachedSession.mockResolvedValue({
			data: {
				user: { id: "student-1", email: "sv@test.local", role: "student" },
			},
		});
		mockFetchQuery.mockReset();
		mockEnsureQueryData.mockReset();
	});

	afterEach(() => {
		cleanup();
		fetchSpy.mockRestore();
	});

	afterAll(() => {
		vi.doUnmock("@teacher-os/env/web");
		vi.resetModules();
	});

	describe("when VITE_STUDENT_PRACTICE_ENABLED is disabled ('false')", () => {
		let modules: LoadedModules;

		beforeAll(async () => {
			modules = await loadModulesWithPracticeFlag("false");
		}, 30_000);

		it("redirects /student/practice to /student/practice/vocabulary with replace", async () => {
			const { router, history } = await renderStudentRouteAt(
				modules,
				"/student/practice",
			);
			expect(router.state.location.pathname).toBe("/practice/vocabulary");
			expect(history.location.pathname).toBe("/student/practice/vocabulary");
			expect(history.length).toBe(1);
			expect(history.canGoBack()).toBe(false);
			expect(screen.queryByText("Trang không tồn tại")).toBeNull();
		});

		it.each([
			"/student/practice/reading",
			"/student/practice/listening",
			"/student/practice/writing",
			"/student/practice/speaking",
			"/student/practice/unknown",
		])("renders NotFoundPage for %s", async (path) => {
			await renderStudentRouteAt(modules, path);
			await waitFor(() => {
				expect(screen.getByText("Trang không tồn tại")).toBeTruthy();
			});
			expect(
				screen.getByRole("link", { name: "Về trang chủ" }).getAttribute("href"),
			).toBe("/student");
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("renders NotFoundPage for /student/history without fetching history APIs", async () => {
			await renderStudentRouteAt(modules, "/student/history");
			await waitFor(() => {
				expect(screen.getByText("Trang không tồn tại")).toBeTruthy();
			});
			expect(mockFetchQuery).not.toHaveBeenCalled();
			expect(mockEnsureQueryData).not.toHaveBeenCalled();
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("renders NotFoundPage for /student/learn/quizzes/practice/$testId before loader runs", async () => {
			await renderStudentRouteAt(
				modules,
				"/student/learn/quizzes/practice/test-123",
			);
			await waitFor(() => {
				expect(screen.getByText("Trang không tồn tại")).toBeTruthy();
			});
			expect(mockFetchQuery).not.toHaveBeenCalled();
			expect(mockEnsureQueryData).not.toHaveBeenCalled();
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it.each([
			"/student/practice/vocabulary",
			"/student/practice/vocabulary/courses",
			"/student/practice/vocabulary/courses/course-1",
			"/student/practice/vocabulary/deck-1",
			"/student/practice/vocabulary/deck-1/session",
		])("keeps vocabulary route %s accessible", async (path) => {
			const { history } = await renderStudentRouteAt(modules, path);
			expect(history.location.pathname).toBe(path);
			expect(screen.queryByText("Trang không tồn tại")).toBeNull();
		});
	});

	describe("when VITE_STUDENT_PRACTICE_ENABLED is unset (undefined on PROD)", () => {
		let modules: LoadedModules;

		beforeAll(async () => {
			modules = await loadModulesWithPracticeFlag(undefined);
		}, 30_000);

		it("redirects /student/practice to /student/practice/vocabulary", async () => {
			const redirectRes = await renderStudentRouteAt(
				modules,
				"/student/practice",
			);
			expect(redirectRes.history.location.pathname).toBe(
				"/student/practice/vocabulary",
			);
			expect(redirectRes.history.length).toBe(1);
			expect(redirectRes.history.canGoBack()).toBe(false);
		});

		it("renders NotFoundPage for /student/practice/reading without calling APIs", async () => {
			await renderStudentRouteAt(modules, "/student/practice/reading");
			await waitFor(() => {
				expect(screen.getByText("Trang không tồn tại")).toBeTruthy();
			});
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	});

	describe("when VITE_STUDENT_PRACTICE_ENABLED is 'true' (Staging / E2E)", () => {
		let modules: LoadedModules;

		beforeAll(async () => {
			modules = await loadModulesWithPracticeFlag("true");
		}, 30_000);

		it("redirects /student/practice to /student/practice/reading", async () => {
			const { router, history } = await renderStudentRouteAt(
				modules,
				"/student/practice",
			);
			expect(router.state.location.pathname).toBe("/practice/reading");
			expect(history.location.pathname).toBe("/student/practice/reading");
			expect(screen.queryByText("Trang không tồn tại")).toBeNull();
		});

		it("allows /student/practice/reading", async () => {
			const reading = await renderStudentRouteAt(
				modules,
				"/student/practice/reading",
			);
			expect(reading.history.location.pathname).toBe(
				"/student/practice/reading",
			);
			expect(screen.queryByText("Trang không tồn tại")).toBeNull();
		});

		it("redirects unknown skill /student/practice/unknown to /student/practice/reading", async () => {
			const unknown = await renderStudentRouteAt(
				modules,
				"/student/practice/unknown",
			);
			expect(unknown.history.location.pathname).toBe(
				"/student/practice/reading",
			);
		});

		it("allows /student/history", async () => {
			const historyRes = await renderStudentRouteAt(
				modules,
				"/student/history",
			);
			expect(historyRes.history.location.pathname).toBe("/student/history");
			expect(screen.queryByText("Trang không tồn tại")).toBeNull();
		});

		it("enters loader on /student/learn/quizzes/practice/$testId", async () => {
			mockFetchQuery.mockResolvedValueOnce({
				skill: "reading",
				attempt: null,
			});
			const practiceTake = await renderStudentRouteAt(
				modules,
				"/student/learn/quizzes/practice/test-123",
			);
			expect(practiceTake.history.location.pathname).toBe(
				"/student/learn/quizzes/practice/test-123",
			);
			expect(mockFetchQuery).toHaveBeenCalledTimes(1);
			expect(screen.queryByText("Trang không tồn tại")).toBeNull();
		});
	});
});
