// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryState = vi.hoisted(() => ({
	meQuery: {
		isLoading: false,
		error: null as unknown,
		data: undefined as
			| {
					user: { id: string; name: string; email: string };
					student: {
						id: string;
						orgId: string;
						name: string;
						email: string;
						onboardingCompletedAt: string | null;
					};
			  }
			| undefined,
	},
	overviewQuery: {
		isLoading: false,
		error: null as unknown,
		data: undefined as unknown,
	},
	scheduleQuery: {
		isPending: false,
		isSuccess: false,
		isError: false,
		error: null as unknown,
		data: undefined as unknown,
	},
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) =>
		Object.assign(options, {
			useRouteContext: () => ({
				session: {
					data: { user: { email: "teacher@test.local" } },
				},
			}),
		}),
	Link: ({ to, children }: { to: string; children?: ReactNode }) => (
		<a href={to}>{children}</a>
	),
	Navigate: ({ to }: { to: string }) => (
		<div data-testid="mock-navigate" data-to={to} />
	),
	useNavigate: () => vi.fn(),
}));

vi.mock("@/components/layout/student-shell", () => ({
	StudentShell: ({ children }: { children: ReactNode }) => (
		<div data-testid="student-shell">{children}</div>
	),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
		clearSessionCache: vi.fn(),
	},
}));

vi.mock("@/lib/repos/placement-test", () => ({
	useStudentPlacementStatus: () => ({ data: undefined, isError: false }),
	useDismissPlacementPrompt: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/repos/vocab", () => ({
	useVocabOverview: () => ({ data: undefined }),
	useVocabLibraryCourses: () => ({ isSuccess: false, data: undefined }),
}));

vi.mock("@/lib/repos/student", () => ({
	useStudentMe: () => queryState.meQuery,
	useStudentOverview: () => queryState.overviewQuery,
	useStudentInvoices: () => ({ data: [], isError: false }),
	useStudentSchedule: () => queryState.scheduleQuery,
	useAcceptClassEnrollment: () => ({
		mutate: vi.fn(),
		isPending: false,
		variables: undefined,
	}),
	countActiveEnrolledClasses: () => 0,
	resolveAcceptEnrollmentErrorMessage: () => "",
}));

import { StudentPageGate } from "@/components/layout/student-page-gate";
import { AttemptReviewError } from "@/components/quiz/attempt-review-error";
import { QuizTakeError } from "@/components/quiz/quiz-take-view";
import { HttpError } from "@/lib/query-client";
import { StudentOverviewPage } from "@/routes/_auth/index";

describe("wrong-role loader fallback suppresses StudentErrorView flash", () => {
	beforeEach(() => {
		queryState.meQuery = {
			isLoading: false,
			error: null,
			data: undefined,
		};
		queryState.overviewQuery = {
			isLoading: false,
			error: null,
			data: undefined,
		};
		queryState.scheduleQuery = {
			isPending: false,
			isSuccess: false,
			isError: false,
			error: null,
			data: undefined,
		};
	});

	afterEach(cleanup);

	it("StudentPageGate renders Loader instead of StudentErrorView on ACCOUNT_TEACHER_ROLE", () => {
		queryState.meQuery.error = new HttpError(403, "Forbidden", {
			code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
		});

		const { container } = render(
			<StudentPageGate sessionEmail="teacher@test.local">
				{() => <div>Protected content</div>}
			</StudentPageGate>,
		);

		expect(screen.queryByText("Đây là tài khoản giáo viên")).toBeNull();
		expect(screen.queryByText("Protected content")).toBeNull();
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});

	it("StudentPageGate still renders StudentErrorView for EMAIL_UNVERIFIED", () => {
		queryState.meQuery.error = new HttpError(403, "Email unverified", {
			code: STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
		});

		render(
			<StudentPageGate sessionEmail="student@test.local">
				{() => <div>Protected content</div>}
			</StudentPageGate>,
		);

		expect(screen.getByText("Email chưa được xác thực")).toBeTruthy();
	});

	it("StudentOverviewPage renders Loader instead of StudentErrorView when meQuery fails with ACCOUNT_TEACHER_ROLE", () => {
		queryState.meQuery.error = new HttpError(403, "Forbidden", {
			code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
		});

		const { container } = render(<StudentOverviewPage />);

		expect(screen.queryByText("Đây là tài khoản giáo viên")).toBeNull();
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});

	it("StudentOverviewPage renders Loader instead of StudentErrorView when overviewQuery fails with ACCOUNT_TEACHER_ROLE", () => {
		queryState.meQuery.data = {
			user: { id: "u-1", name: "Minh", email: "minh@test.local" },
			student: {
				id: "s-1",
				orgId: "org-1",
				name: "Minh",
				email: "minh@test.local",
				onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
			},
		};
		queryState.overviewQuery.error = new HttpError(403, "Forbidden", {
			code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
		});

		const { container } = render(<StudentOverviewPage />);

		expect(screen.queryByText("Đây là tài khoản giáo viên")).toBeNull();
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});

	it("StudentOverviewPage renders Loader instead of dashboard when scheduleQuery fails with ACCOUNT_TEACHER_ROLE", () => {
		queryState.meQuery.data = {
			user: { id: "u-1", name: "Minh", email: "minh@test.local" },
			student: {
				id: "s-1",
				orgId: "org-1",
				name: "Minh",
				email: "minh@test.local",
				onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
			},
		};
		queryState.overviewQuery.data = {
			student: { id: "s-1", name: "Minh" },
			classes: [],
			assignments: [],
		};
		queryState.scheduleQuery.isError = true;
		queryState.scheduleQuery.error = new HttpError(403, "Forbidden", {
			code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
		});

		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={qc}>
				<StudentOverviewPage />
			</QueryClientProvider>,
		);

		expect(screen.queryByText("Đây là tài khoản giáo viên")).toBeNull();
		expect(screen.queryByTestId("student-shell")).toBeNull();
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});

	it("QuizTakeError and AttemptReviewError render Loader instead of raw error code on ACCOUNT_TEACHER_ROLE", () => {
		const wrongRoleError = new HttpError(403, "Forbidden", {
			code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
		});

		const takeView = render(<QuizTakeError error={wrongRoleError} />);
		expect(
			screen.queryByText(ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL),
		).toBeNull();
		expect(takeView.container.querySelector(".animate-spin")).not.toBeNull();
		cleanup();

		const reviewView = render(<AttemptReviewError error={wrongRoleError} />);
		expect(
			screen.queryByText(ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL),
		).toBeNull();
		expect(reviewView.container.querySelector(".animate-spin")).not.toBeNull();
	});
});
