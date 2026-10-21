// @vitest-environment jsdom

import type { StudentAssignment } from "@teacher-os/api/contracts";
import type { NavItem } from "@teacher-os/ui/components/app-shell/nav-group";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
	useRouterState: () => "not-used-here",
}));

import {
	STUDENT_NAV,
	STUDENT_PAGE_LABEL,
	StudentShellLink,
} from "@/components/layout/student-nav";
import { AssignmentList } from "@/components/overview/assignment-list";

describe("STUDENT_NAV v2", () => {
	it("keeps one 'Học tập' group with the v1 labels and hrefs", () => {
		expect(STUDENT_NAV).toHaveLength(1);
		expect(STUDENT_NAV[0].group).toBe("Học tập");

		const ITEM_BY_HREF: Record<string, NavItem> = Object.fromEntries(
			STUDENT_NAV[0].items.map((item) => [item.href, item]),
		);
		expect(ITEM_BY_HREF["/"]?.label).toBe("Tổng quan");
		expect(ITEM_BY_HREF["/classes"]?.label).toBe("Lớp học");
		expect(ITEM_BY_HREF["/assignments"]?.label).toBe("Bài tập");
		expect(ITEM_BY_HREF["/vocab"]?.label).toBe("Từ vựng");
		expect(ITEM_BY_HREF["/tuition"]?.label).toBe("Học phí");
		// Phase 10: "Luyện tập" đã bật (5 skill con, không Dictation);
		// "Lịch sử" nằm trong list nhưng enabled=false tới phase 11.
		expect(STUDENT_NAV[0].items).toHaveLength(7);
		const practice = ITEM_BY_HREF["/practice"];
		expect(practice?.label).toBe("Luyện tập");
		expect(practice?.children?.map((child) => child.href)).toEqual([
			"/practice/reading",
			"/practice/listening",
			"/practice/writing",
			"/practice/speaking",
			"/practice/vocabulary",
		]);
		expect(
			practice?.children?.some((child) =>
				child.label.toLowerCase().includes("dictation"),
			),
		).toBe(false);
		// Phase 10: "Luyện tập" đã bật (5 skill con, không Dictation);
		// Phase 11: "Lịch sử" cũng đã bật cùng route /history.
		expect(ITEM_BY_HREF["/history"]?.enabled).toBe(true);
	});

	it("renders links through the router, exact match only for '/'", () => {
		const html = renderToStaticMarkup(
			<StudentShellLink href="/" className="h-8" aria-current="page">
				Tổng quan
			</StudentShellLink>,
		);
		expect(html).toContain('href="/"');
		expect(html).toContain('aria-current="page"');
		expect(html).toContain("Tổng quan");
	});

	it("maps activeKey to crumb labels for every nav item", () => {
		for (const item of STUDENT_NAV[0].items) {
			expect(STUDENT_PAGE_LABEL[item.key]).toBe(item.label);
		}
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
