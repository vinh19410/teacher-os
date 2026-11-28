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
	ACTIVE_KEY_BY_PREFIX,
	PRACTICE_HISTORY_ITEMS,
	PRACTICE_ROUTES_LIVE,
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
		expect(ITEM_BY_HREF["/placement-test"]).toBeUndefined();
		expect(ITEM_BY_HREF["/classes"]?.label).toBe("Lớp học");
		expect(ITEM_BY_HREF["/schedule"]?.label).toBe("Lịch học");
		expect(ITEM_BY_HREF["/assignments"]?.label).toBe("Bài tập");
		expect(ITEM_BY_HREF["/vocab"]).toBeUndefined();
		expect(ITEM_BY_HREF["/tuition"]?.label).toBe("Học phí");
		// #584: "Lịch học" đã có route riêng /schedule gộp các buổi của mọi lớp.
		// #852 + #1054: Mặc định trên PROD (PRACTICE_ROUTES_LIVE=false) ẩn "Luyện tập"
		// và "Lịch sử", đồng thời hiển thị mục cấp 1 "Từ vựng" (/practice/vocabulary).
		expect(PRACTICE_ROUTES_LIVE).toBe(false);
		expect(STUDENT_NAV[0].items).toHaveLength(6);
		expect(ITEM_BY_HREF["/practice/vocabulary"]?.label).toBe("Từ vựng");
		expect(ITEM_BY_HREF["/practice/vocabulary"]?.children).toBeUndefined();
		expect(ITEM_BY_HREF["/practice"]).toBeUndefined();
		expect(ITEM_BY_HREF["/history"]).toBeUndefined();

		// Cấu trúc của PRACTICE_HISTORY_ITEMS vẫn được bảo toàn khi bật cờ
		const PRACTICE_ITEM_BY_HREF: Record<string, NavItem> = Object.fromEntries(
			PRACTICE_HISTORY_ITEMS.map((item) => [item.href, item]),
		);
		const practice = PRACTICE_ITEM_BY_HREF["/practice"];
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
		// "Lịch sử" chỉ enabled khi PRACTICE_ROUTES_LIVE === true
		expect(PRACTICE_ITEM_BY_HREF["/history"]?.enabled).toBe(
			PRACTICE_ROUTES_LIVE,
		);
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
		expect(STUDENT_PAGE_LABEL.vocab).toBeUndefined();
		expect(ACTIVE_KEY_BY_PREFIX["/placement-test"]).toBe("placement-test");
		expect(STUDENT_PAGE_LABEL["placement-test"]).toBe("Kiểm tra đầu vào");
		expect(ACTIVE_KEY_BY_PREFIX["/schedule"]).toBe("schedule");
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
