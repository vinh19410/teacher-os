// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

const mockOrgs = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		...rest
	}: { to: string; children?: React.ReactNode } & Record<string, unknown>) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
	useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
		select({ location: { pathname: "/classes" } }),
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/repos/student", () => ({
	useStudentOrgs: () => mockOrgs(),
	getActiveStudentOrgId: () => "org-1",
	setActiveStudentOrgId: vi.fn(),
	useStudentNotifications: () => ({ data: [], isLoading: false }),
	useAcceptInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useRejectInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { StudentShell } from "@/components/layout/student-shell";

// Mặc định chưa có org — các test về org ghi đè trong từng case.
beforeAll(() => {
	mockOrgs.mockReturnValue({ data: [], isLoading: false });
});

function renderShell() {
	return renderToStaticMarkup(
		<StudentShell userName="Nguyễn Minh" userEmail="minh@student.vn">
			<div data-testid="page-body">Nội dung trang</div>
		</StudentShell>,
	);
}

describe("StudentShell v2", () => {
	it("renders the shared shell with the student nav contract", () => {
		const html = renderShell();
		expect(html).toContain('aria-label="Điều hướng học viên"');
		expect(html).toContain("Học tập");
		// Trang con render bên trong <main> của shell.
		expect(html).toContain('data-testid="page-body"');
	});

	it("marks the current section active from the route (aria-current)", () => {
		const html = renderShell();
		const classesLink = html.match(
			/<a href="\/classes"[^>]*aria-current="page"[^>]*>/,
		);
		expect(classesLink).not.toBeNull();
		const overviewLink = html.match(
			/<a href="\/"[^>]*aria-current="page"[^>]*>/,
		);
		expect(overviewLink).toBeNull();
	});

	it("renders breadcrumb 'tổ chức › mục' and the org switcher hooks", () => {
		mockOrgs.mockReturnValue({
			data: [
				{ id: "org-1", name: "IELTS Thầy Vinh", isCurrent: true },
				{ id: "org-2", name: "TOEIC Cô Mai", isCurrent: false },
			],
			isLoading: false,
		});
		const html = renderShell();
		expect(html).toContain('aria-label="Breadcrumb"');
		expect(html).toContain("IELTS Thầy Vinh");
		expect(html).toContain("Lớp học");
		// Hook e2e org-switcher giữ nguyên từ v1 (đa org → trigger).
		expect(html).toContain('data-testid="org-switcher-trigger"');
	});

	it("renders the user footer with the student account menu trigger", () => {
		mockOrgs.mockReturnValue({ data: [], isLoading: false });
		const html = renderShell();
		// Trigger footer: accessible name v1 của avatar-menu.
		expect(html).toContain('aria-label="Tài khoản học viên"');
		expect(html).toContain("Nguyễn Minh");
		expect(html).toContain("minh@student.vn");
	});
});
