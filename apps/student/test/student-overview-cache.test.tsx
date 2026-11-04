// @vitest-environment jsdom

import {
	focusManager,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import type { StudentOverview } from "@teacher-os/api/contracts";
import {
	act,
	cleanup,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

vi.mock("@/lib/repos/student", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/repos/student")>();
	return {
		...actual,
		useStudentOrgs: () => ({ data: [] }),
		getActiveStudentOrgId: () => null,
		useStudentNotifications: () => ({ data: [], isLoading: false }),
		useStudentInbox: () => ({
			data: { unreadCount: 0, items: [] },
			isLoading: false,
		}),
		useAcceptInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
		useRejectInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
		useMarkInboxRead: () => ({ mutateAsync: vi.fn(), isPending: false }),
	};
});

// Mock router
const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
	useRouterState: ({
		select,
	}: {
		select: (state: { location: { pathname: string } }) => string;
	}) => select({ location: { pathname: "/assignments" } }),
	Link: (props: {
		to: string;
		params?: Record<string, string>;
		"aria-label"?: string;
		children: ReactNode;
	}) => <a href={props.to}>{props.children}</a>,
	Navigate: () => <div data-testid="mock-navigate" />,
	createFileRoute: () => () => ({
		useRouteContext: () => ({
			session: {
				data: {
					user: {
						email: "student@example.com",
					},
				},
			},
		}),
		useSearch: () => ({ status: undefined }),
	}),
}));

import {
	type UseStudentOverviewOptions,
	useStudentOverview,
} from "@/lib/repos/student";
import { StudentAssignmentsPage } from "@/routes/_auth/assignments/index";

const StudentAssignmentsComponent = StudentAssignmentsPage;

const MOCK_HW1 = {
	id: "hw-1",
	title: "Homework 1 - Writing Task 1",
	source: "class_assignment" as const,
	classId: "class-1",
	className: "IELTS Intensive",
	due: "2099-12-31",
	submittedAt: null,
	scores: null,
};

const MOCK_HW2 = {
	id: "hw-2",
	title: "Homework 2 - Reading Test",
	source: "class_assignment" as const,
	classId: "class-1",
	className: "IELTS Intensive",
	due: "2099-12-31",
	submittedAt: null,
	scores: null,
};

const BASE_OVERVIEW: StudentOverview = {
	student: {
		id: "student-1",
		name: "Alex",
	},
	classes: [],
	assignments: [MOCK_HW1],
};

const MOCK_ME = {
	user: {
		id: "user-1",
		name: "Alex",
		email: "student@example.com",
		role: "student",
	},
	student: {
		id: "student-1",
		name: "Alex",
		email: "student@example.com",
		phone: "0901234567",
		onboardingCompletedAt: "2026-01-01T00:00:00Z",
	},
};

describe("useStudentOverview & student assignments stale cache (#580)", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.restoreAllMocks();
		queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					staleTime: 60_000,
					gcTime: 5 * 60_000,
					refetchOnWindowFocus: false,
					refetchOnReconnect: false,
					retry: false,
				},
			},
		});

		// Seed "student", "me" so StudentPageGate allows access
		queryClient.setQueryData(["student", "me"], MOCK_ME);
	});

	afterEach(() => {
		cleanup();
		queryClient.clear();
		focusManager.setFocused(undefined);
	});

	it("default useStudentOverview does not refetch fresh cache on mount", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			...BASE_OVERVIEW,
			assignments: [MOCK_HW1, MOCK_HW2],
		});

		// Seed initial cache with HW1
		queryClient.setQueryData(["student", "overview"], BASE_OVERVIEW);

		// Global fetch mock
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: fetcher,
				}),
			),
		);

		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);

		const { result } = renderHook(() => useStudentOverview(), { wrapper });

		// Cache data is available immediately
		expect(result.current.data?.assignments).toHaveLength(1);
		expect(result.current.data?.assignments[0]?.title).toBe(
			"Homework 1 - Writing Task 1",
		);

		// Fetch was NOT called because staleTime: 60_000
		expect(fetcher).not.toHaveBeenCalled();
	});

	it("useStudentOverview with refetchOnMount 'always' refetches fresh cache on mount", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			...BASE_OVERVIEW,
			assignments: [MOCK_HW1, MOCK_HW2],
		});

		queryClient.setQueryData(["student", "overview"], BASE_OVERVIEW);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					json: fetcher,
				}),
			),
		);

		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);

		const { result } = renderHook(
			() =>
				useStudentOverview({
					refetchOnMount: "always",
					refetchOnWindowFocus: "always",
				} as UseStudentOverviewOptions),
			{ wrapper },
		);

		// Initially has HW1 from cache
		expect(result.current.data?.assignments).toHaveLength(1);

		// Fetch was triggered
		await waitFor(() => {
			expect(fetcher).toHaveBeenCalled();
		});

		// After fetch resolves, has HW1 and HW2
		await waitFor(() => {
			expect(result.current.data?.assignments).toHaveLength(2);
		});
	});

	it("assignments page renders cached HW1 immediately, then updates to HW2 without loader flash", async () => {
		// Teacher assigns HW2 while student had cached HW1
		queryClient.setQueryData(["student", "overview"], BASE_OVERVIEW);

		const { promise: fetchPromise, resolve: resolveFetch } =
			Promise.withResolvers<void>();

		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/student/overview")) {
					return fetchPromise.then(() => ({
						ok: true,
						json: () =>
							Promise.resolve({
								...BASE_OVERVIEW,
								assignments: [MOCK_HW1, MOCK_HW2],
							}),
					}));
				}
				if (url.includes("/api/student/me")) {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(MOCK_ME),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({}),
				});
			}),
		);

		render(
			<QueryClientProvider client={queryClient}>
				<StudentAssignmentsComponent />
			</QueryClientProvider>,
		);

		// HW1 is visible immediately from cache!
		expect(screen.getByText("Homework 1 - Writing Task 1")).toBeDefined();
		// No loader shown since cached data exists
		expect(screen.queryByTestId("loader")).toBeNull();

		// Background fetch completes
		await act(async () => {
			resolveFetch();
		});

		// HW2 now appears!
		await waitFor(() => {
			expect(screen.getByText("Homework 2 - Reading Test")).toBeDefined();
		});
		expect(screen.getByText("Homework 1 - Writing Task 1")).toBeDefined();
	});

	it("assignments page refetches when tab regains focus (refetchOnWindowFocus 'always')", async () => {
		queryClient.setQueryData(["student", "overview"], BASE_OVERVIEW);

		let fetchCount = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/student/overview")) {
					fetchCount++;
					return Promise.resolve({
						ok: true,
						json: () =>
							Promise.resolve({
								...BASE_OVERVIEW,
								assignments: fetchCount > 1 ? [MOCK_HW1, MOCK_HW2] : [MOCK_HW1],
							}),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({}),
				});
			}),
		);

		render(
			<QueryClientProvider client={queryClient}>
				<StudentAssignmentsComponent />
			</QueryClientProvider>,
		);

		// Initial mount triggers 1 fetch because refetchOnMount: 'always'
		await waitFor(() => {
			expect(fetchCount).toBe(1);
		});

		// Now simulate returning to the tab
		act(() => {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
		});

		// A second fetch is triggered because refetchOnWindowFocus: 'always'
		await waitFor(() => {
			expect(fetchCount).toBe(2);
		});

		await waitFor(() => {
			expect(screen.getByText("Homework 2 - Reading Test")).toBeDefined();
		});
	});

	it("preserves cached assignment list if background refetch fails, without flashing StudentErrorView", async () => {
		queryClient.setQueryData(["student", "overview"], BASE_OVERVIEW);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/student/overview")) {
					return Promise.resolve({
						ok: false,
						status: 500,
						json: () => Promise.resolve({ message: "Internal Server Error" }),
					});
				}
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({}),
				});
			}),
		);

		render(
			<QueryClientProvider client={queryClient}>
				<StudentAssignmentsComponent />
			</QueryClientProvider>,
		);

		// HW1 remains visible
		expect(screen.getByText("Homework 1 - Writing Task 1")).toBeDefined();

		// Wait to ensure refetch rejected
		await waitFor(() => {
			expect(queryClient.getQueryState(["student", "overview"])?.status).toBe(
				"error",
			);
		});

		// HW1 must STILL be visible! StudentErrorView must NOT replace the content.
		expect(screen.getByText("Homework 1 - Writing Task 1")).toBeDefined();
		expect(screen.queryByTestId("student-error-view")).toBeNull();
	});
});
