import type { StudentAssignment } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useQuery: () => ({ data: undefined, isLoading: false, error: null }),
}));

vi.mock("@/lib/repos/student", () => ({
	useStudentOrgs: () => ({ data: [], isLoading: false }),
	useStudentNotifications: () => ({ data: [], isLoading: false }),
	useAcceptInvitation: () => ({ mutate: vi.fn(), isPending: false }),
	useRejectInvitation: () => ({ mutate: vi.fn(), isPending: false }),
	getActiveStudentOrgId: () => null,
	setActiveStudentOrgId: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: (props: {
		to: string;
		activeOptions?: { exact?: boolean };
		"data-testid"?: string;
		className?: string;
		children: React.ReactNode;
	}) => (
		<a
			href={props.to}
			data-testid={props["data-testid"]}
			data-exact={String(Boolean(props.activeOptions?.exact))}
			className={props.className}
		>
			{props.children}
		</a>
	),
}));

import { STUDENT_NAV_ITEMS, StudentNav } from "@/components/layout/student-nav";
import { StudentShell } from "@/components/layout/student-shell";
import { AssignmentList } from "@/components/overview/assignment-list";

describe("StudentNav", () => {
	it("renders all 5 navigation links with aria-label and active marker ■", () => {
		const html = renderToStaticMarkup(<StudentNav />);
		expect(html).toContain('aria-label="Điều hướng học viên"');
		expect(STUDENT_NAV_ITEMS).toHaveLength(5);

		expect(html).toContain('href="/"');
		expect(html).toContain('data-testid="student-nav-overview"');
		expect(html).toContain('data-exact="true"');
		expect(html).toContain("Tổng quan");

		expect(html).toContain('href="/classes"');
		expect(html).toContain('data-testid="student-nav-classes"');
		expect(html).toContain("Lớp học");

		expect(html).toContain('href="/assignments"');
		expect(html).toContain('data-testid="student-nav-assignments"');
		expect(html).toContain("Bài tập");

		expect(html).toContain('href="/vocab"');
		expect(html).toContain('data-testid="student-nav-vocab"');
		expect(html).toContain("Từ vựng");

		expect(html).toContain('href="/tuition"');
		expect(html).toContain('data-testid="student-nav-tuition"');
		expect(html).toContain("Học phí");

		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("■");
	});
});

describe("StudentShell", () => {
	it("renders student name, StudentNav, and page children", () => {
		const html = renderToStaticMarkup(
			<StudentShell userName="Nguyễn Minh" userEmail="minh@student.vn">
				<div data-testid="page-body">Nội dung trang</div>
			</StudentShell>,
		);
		expect(html).toContain("Nguyễn Minh");
		expect(html).toContain('aria-label="Điều hướng học viên"');
		expect(html).toContain("Nội dung trang");
	});
});

describe("AssignmentList controlled mode & a11y", () => {
	const assignments: StudentAssignment[] = [
		{
			id: "a-overdue",
			title: "Reading Overdue",
			source: "class_assignment",
			classId: "c1",
			className: "IELTS 6.5",
			due: "2020-01-01",
			submittedAt: null,
			scores: null,
		},
		{
			id: "a-submitted",
			title: "Writing Submitted",
			source: "class_assignment",
			classId: "c1",
			className: "IELTS 6.5",
			due: "2099-01-01",
			submittedAt: "2026-10-01T00:00:00Z",
			scores: null,
		},
	];

	it("hides heading when hideHeading is true and filters by controlled activeTab", () => {
		const html = renderToStaticMarkup(
			<AssignmentList
				assignments={assignments}
				activeTab="overdue"
				hideHeading
			/>,
		);
		expect(html).not.toContain("<h2");
		expect(html).toContain("Reading Overdue");
		expect(html).not.toContain("Writing Submitted");
		expect(html).toContain('aria-hidden="true"');
	});
});
