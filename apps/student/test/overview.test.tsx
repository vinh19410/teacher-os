import type {
	StudentAssignment,
	StudentClass,
} from "@teacher-os/api/contracts";
import { STUDENT_ERROR_CODES } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

import { AssignmentList } from "@/components/overview/assignment-list";
import { AssignmentRow } from "@/components/overview/assignment-row";
import { ClassCard } from "@/components/overview/class-card";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { StudentErrorView } from "@/components/overview/student-error-view";

describe("ClassCard", () => {
	it("renders class details, level, mode, and next session", () => {
		const cls: StudentClass = {
			id: "c1",
			name: "IELTS Intensive",
			level: "IELTS 6.5+",
			mode: "Online",
			schedule: "T2 & T5 · 18:30–20:00",
			sessionsDone: 8,
			sessionsTotal: 24,
			status: "active",
			nextSession: {
				date: "2099-01-05",
				time: "18:30",
				topic: "Speaking Mock Test",
			},
		};

		const html = renderToStaticMarkup(<ClassCard cls={cls} />);
		expect(html).toContain("IELTS Intensive");
		expect(html).toContain("IELTS 6.5+");
		expect(html).toContain("Online");
		expect(html).toContain("T2 &amp; T5 · 18:30–20:00");
		expect(html).toContain("Buổi 8/24");
		expect(html).toContain("Buổi tới:");
		expect(html).toContain("Speaking Mock Test");
	});

	it("handles class without upcoming session", () => {
		const cls: StudentClass = {
			id: "c2",
			name: "General English",
			level: "B1",
			mode: "Offline",
			schedule: "T7",
			sessionsDone: 10,
			sessionsTotal: 10,
			status: "active",
			nextSession: null,
		};

		const html = renderToStaticMarkup(<ClassCard cls={cls} />);
		expect(html).toContain("General English");
		expect(html).toContain("Chưa có lịch buổi tới");
	});
});

describe("AssignmentRow", () => {
	it("renders assignment title, class name, and status badge", () => {
		const asg: StudentAssignment = {
			id: "a1",
			title: "Writing Task 1 – Bar Chart",
			source: "class_assignment",
			classId: "c1",
			className: "IELTS Intensive",
			due: "2099-01-10",
			submittedAt: null,
			scores: null,
		};

		const html = renderToStaticMarkup(<AssignmentRow assignment={asg} />);
		expect(html).toContain("Writing Task 1 – Bar Chart");
		expect(html).toContain("IELTS Intensive");
	});
});

describe("AssignmentList", () => {
	it("renders filter tabs with counts and empty state when empty", () => {
		const html = renderToStaticMarkup(<AssignmentList assignments={[]} />);
		expect(html).toContain("Tất cả");
		expect(html).toContain("Sắp đến hạn");
		expect(html).toContain("Quá hạn");
		expect(html).toContain("Đã nộp");
		expect(html).toContain("Chưa có bài tập nào");
	});

	it("renders list of assignments", () => {
		const assignments: StudentAssignment[] = [
			{
				id: "a1",
				title: "Essay 1",
				source: "class_assignment",
				classId: "c1",
				className: "Class A",
				due: "2099-01-10",
				submittedAt: null,
				scores: null,
			},
		];
		const html = renderToStaticMarkup(
			<AssignmentList assignments={assignments} />,
		);
		expect(html).toContain("Essay 1");
	});
});

describe("GreetingHeader", () => {
	it("renders greeting with first name and summary text", () => {
		const html = renderToStaticMarkup(
			<GreetingHeader studentName="Nguyễn Văn Minh" dueSoonCount={2} />,
		);
		expect(html).toContain("Chào Minh");
		expect(html).toContain("2 bài tập sắp đến hạn cần nộp.");
	});

	it("renders zero due soon message", () => {
		const html = renderToStaticMarkup(
			<GreetingHeader studentName="Lan" dueSoonCount={0} />,
		);
		expect(html).toContain("Chào Lan");
		expect(html).toContain("Bạn không có bài tập nào cần nộp gấp.");
	});
});

describe("StudentErrorView", () => {
	it("renders NOT_LINKED state", () => {
		const html = renderToStaticMarkup(
			<StudentErrorView
				code={STUDENT_ERROR_CODES.NOT_LINKED}
				userEmail="test@student.vn"
			/>,
		);
		expect(html).toContain("Tài khoản chưa được liên kết");
		expect(html).toContain("test@student.vn");
		expect(html).toContain("Đăng xuất");
	});

	it("renders EMAIL_UNVERIFIED state without userEmail", () => {
		const html = renderToStaticMarkup(
			<StudentErrorView code={STUDENT_ERROR_CODES.EMAIL_UNVERIFIED} />,
		);
		expect(html).toContain("Email chưa được xác thực");
		expect(html).toContain("Tôi đã xác thực");
		expect(html).toContain("Đăng xuất");
		expect(html).not.toContain("Gửi lại email");
	});

	it("renders EMAIL_UNVERIFIED state with userEmail", () => {
		const html = renderToStaticMarkup(
			<StudentErrorView
				code={STUDENT_ERROR_CODES.EMAIL_UNVERIFIED}
				userEmail="test@example.com"
			/>,
		);
		expect(html).toContain("Email chưa được xác thực");
		expect(html).toContain("test@example.com");
		expect(html).toContain("Gửi lại email");
		expect(html).toContain("Tôi đã xác thực");
		expect(html).toContain("Đăng xuất");
	});

	it("renders AMBIGUOUS state", () => {
		const html = renderToStaticMarkup(
			<StudentErrorView code={STUDENT_ERROR_CODES.AMBIGUOUS} />,
		);
		expect(html).toContain("Thông tin tài khoản chưa rõ ràng");
		expect(html).toContain("Đăng xuất");
	});
});

describe("OverviewEmptyState", () => {
	it("renders custom empty state with title and description", () => {
		const html = renderToStaticMarkup(
			<OverviewEmptyState
				icon="book"
				title="Chưa có dữ liệu"
				description="Chi tiết mô tả"
			/>,
		);
		expect(html).toContain("Chưa có dữ liệu");
		expect(html).toContain("Chi tiết mô tả");
	});
});
