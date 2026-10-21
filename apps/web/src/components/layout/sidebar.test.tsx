// @vitest-environment jsdom

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
}));

import {
	extractUserPlan,
	TEACHER_NAV,
	TeacherShellLink,
	teacherActiveKey,
} from "./sidebar";

describe("extractUserPlan", () => {
	it("returns null for non-object, null, or undefined user", () => {
		expect(extractUserPlan(null)).toBeNull();
		expect(extractUserPlan(undefined)).toBeNull();
		expect(extractUserPlan("not an object")).toBeNull();
		expect(extractUserPlan(123)).toBeNull();
	});

	it("returns null when user has no plan or tier property", () => {
		expect(
			extractUserPlan({
				id: "u1",
				name: "QA Dogfood",
				email: "qa@example.com",
			}),
		).toBeNull();
	});

	it("returns null when plan or tier is empty or whitespace", () => {
		expect(extractUserPlan({ plan: "" })).toBeNull();
		expect(extractUserPlan({ plan: "   " })).toBeNull();
		expect(extractUserPlan({ tier: "" })).toBeNull();
		expect(extractUserPlan({ tier: "   " })).toBeNull();
	});

	it("extracts plan when plan property is non-empty string", () => {
		expect(extractUserPlan({ plan: "PRO" })).toBe("PRO");
		expect(extractUserPlan({ plan: "BASIC" })).toBe("BASIC");
		expect(extractUserPlan({ plan: " VIP " })).toBe("VIP");
	});

	it("falls back to tier when plan is missing", () => {
		expect(extractUserPlan({ tier: "PRO" })).toBe("PRO");
		expect(extractUserPlan({ tier: "ENTERPRISE" })).toBe("ENTERPRISE");
	});

	it("prefers plan over tier if both exist", () => {
		expect(extractUserPlan({ plan: "PREMIUM", tier: "STANDARD" })).toBe(
			"PREMIUM",
		);
	});
});

describe("TEACHER_NAV v2", () => {
	const ITEM_BY_HREF: Record<string, { label: string }> = Object.fromEntries(
		TEACHER_NAV.flatMap((group) => group.items).map((item) => [
			item.href,
			{ label: item.label },
		]),
	);

	it("groups teaching, IELTS and business items with app labels kept", () => {
		expect(TEACHER_NAV.map((group) => group.group)).toEqual([
			"Giảng dạy",
			"IELTS",
			"Kinh doanh",
		]);
		// Accessible name e2e: /syllabus và /tuition giữ nhãn app đang có.
		expect(ITEM_BY_HREF["/syllabus"]?.label).toBe("Syllabus");
		expect(ITEM_BY_HREF["/tuition"]?.label).toBe("Doanh thu");
		expect(ITEM_BY_HREF["/dashboard"]?.label).toBe("Tổng quan");
		expect(ITEM_BY_HREF["/classes"]?.label).toBe("Lớp học");
		expect(ITEM_BY_HREF["/students"]?.label).toBe("Học viên");
		expect(ITEM_BY_HREF["/schedule"]?.label).toBe("Lịch dạy");
		expect(ITEM_BY_HREF["/assignments"]?.label).toBe("Bài tập");
		expect(ITEM_BY_HREF["/grading"]?.label).toBe("Chấm bài");
		expect(ITEM_BY_HREF["/vocab"]?.label).toBe("Từ vựng");
		expect(ITEM_BY_HREF["/profile"]?.label).toBe("Hồ sơ");
	});

	it("moves 'Từ vựng' into the IELTS group per design v2 (supersedes #363 DOM order)", () => {
		const groupByKey: Record<string, string> = Object.fromEntries(
			TEACHER_NAV.flatMap((group) =>
				group.items.map((item) => [item.key, group.group]),
			),
		);
		expect(groupByKey.vocab).toBe("IELTS");
		expect(groupByKey.classes).toBe("Giảng dạy");
		expect(groupByKey.assignments).toBe("IELTS");
		expect(groupByKey.grading).toBe("IELTS");
	});

	it("gates the reports item behind PARENT_REPORTS_ENABLED", () => {
		const reports = TEACHER_NAV.flatMap((group) => group.items).find(
			(item) => item.key === "reports",
		);
		expect(reports).toBeDefined();
		expect(reports?.enabled).toBe(false);
	});
});

describe("teacherActiveKey", () => {
	it("maps / and /dashboard to the overview item", () => {
		expect(teacherActiveKey("/")).toBe("dashboard");
		expect(teacherActiveKey("/dashboard")).toBe("dashboard");
	});

	it("matches child routes by prefix", () => {
		expect(teacherActiveKey("/classes/abc")).toBe("classes");
		expect(teacherActiveKey("/students/u-1")).toBe("students");
		expect(teacherActiveKey("/assignments/new")).toBe("assignments");
	});

	it("maps /grading and /grading/$attemptId to grading and returns empty for unauthenticated routes", () => {
		expect(teacherActiveKey("/grading")).toBe("grading");
		expect(teacherActiveKey("/grading/a-1")).toBe("grading");
		expect(teacherActiveKey("/login")).toBe("");
	});
});

describe("TeacherShellLink", () => {
	it("renders an anchor through the router with the shell classes", () => {
		const html = renderToStaticMarkup(
			<TeacherShellLink
				href="/classes"
				className="h-8 rounded-md"
				aria-current="page"
				onClick={() => {}}
			>
				Lớp học
			</TeacherShellLink>,
		);
		expect(html).toContain('href="/classes"');
		expect(html).toContain('aria-current="page"');
		expect(html).toContain("h-8 rounded-md");
		expect(html).toContain("Lớp học");
	});
});
