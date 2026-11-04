import type {
	StudentAssignment,
	StudentClass,
} from "@teacher-os/api/contracts";
import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

// GreetingHeader đọc org hoạt động cho kicker PageHead — mock kho dữ liệu
// để renderToStaticMarkup chạy không cần QueryClientProvider.
vi.mock("@/lib/repos/student", () => ({
	useStudentOrgs: () => ({ data: [] }),
	getActiveStudentOrgId: () => null,
}));

// AssignmentRow giờ dùng TanStack Link (route take #283) — stub thành <a>
// thuần để renderToStaticMarkup chạy không cần router context.
vi.mock("@tanstack/react-router", () => ({
	Link: (props: {
		to: string;
		params?: Record<string, string>;
		"aria-label"?: string;
		children: React.ReactNode;
	}) => (
		<a
			href={Object.entries(props.params ?? {}).reduce(
				(href, [key, value]) => href.replace(`$${key}`, value),
				props.to,
			)}
			aria-label={props["aria-label"]}
		>
			{props.children}
		</a>
	),
}));

import { getCurrentLevelLabel } from "@/components/onboarding/onboarding-steps";
import { AssignmentList } from "@/components/overview/assignment-list";
import { AssignmentRow } from "@/components/overview/assignment-row";
import { ClassCard } from "@/components/overview/class-card";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { StatCard } from "@/components/overview/stat-card";
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
			enrollmentId: "enr-1",
			enrollmentStatus: "active",
			teacher: null,
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
			enrollmentId: "enr-2",
			enrollmentStatus: "active",
			teacher: null,
			nextSession: null,
		};

		const html = renderToStaticMarkup(<ClassCard cls={cls} />);
		expect(html).toContain("General English");
		expect(html).toContain("Chưa có lịch buổi tới");
	});

	it("formats raw JSON schedule into human-readable Vietnamese schedule", () => {
		const cls: StudentClass = {
			id: "c3",
			name: "[TEST] Foundation 2",
			level: "Band 5.5",
			mode: "Online",
			schedule: '{"days":[0,2,4],"start":"19:00","end":"20:30"}',
			sessionsDone: 0,
			sessionsTotal: 26,
			status: "active",
			enrollmentId: "enr-3",
			enrollmentStatus: "active",
			teacher: null,
			nextSession: null,
		};

		const html = renderToStaticMarkup(<ClassCard cls={cls} />);
		expect(html).toContain("[TEST] Foundation 2");
		expect(html).not.toContain('{"days"');
		expect(html).toContain("T2 &amp; T4 &amp; T6 · 19:00–20:30");
	});

	it("renders pending-activation state with join button for invited enrollment", () => {
		const cls: StudentClass = {
			id: "c4",
			name: "IELTS Foundation",
			level: "Band 5.0",
			mode: "Online",
			schedule: "T2 & T5 · 18:30–20:00",
			sessionsDone: 0,
			sessionsTotal: 20,
			status: "active",
			enrollmentId: "enr-inv",
			enrollmentStatus: "invited",
			teacher: null,
			nextSession: null,
		};

		const html = renderToStaticMarkup(<ClassCard cls={cls} />);
		expect(html).toContain("Chờ kích hoạt");
		expect(html).toContain("Tham gia lớp");
		expect(html).toContain("text-primary-foreground");
		expect(html).not.toContain("text-bg");
		expect(html).toContain("Giáo viên đã mời bạn vào lớp");
		// Chưa kích hoạt thì không hiển thị tiến độ khóa học
		expect(html).not.toContain("Tiến độ khóa học");
		// Card chờ kích hoạt không mở trang lớp: không có link, chỉ có nút.
		expect(html).not.toContain("<a ");
		expect(html).toContain('<button type="button"');
	});

	const activeClass: StudentClass = {
		id: "class-42",
		name: "IELTS Linked",
		level: "Band 6.0",
		mode: "Online",
		schedule: "T3 · 19:00–20:30",
		sessionsDone: 2,
		sessionsTotal: 12,
		status: "active",
		enrollmentId: "enr-42",
		enrollmentStatus: "active",
		nextSession: null,
		teacher: {
			name: "Cô Lan",
			email: "lan.teacher@example.com",
			image: "https://lh3.googleusercontent.com/a/lan",
		},
	};

	it("shows the teacher avatar, name and plain-text email on the card", () => {
		const html = renderToStaticMarkup(<ClassCard cls={activeClass} />);
		expect(html).toContain("Cô Lan");
		expect(html).toContain("lan.teacher@example.com");
		expect(html).toContain('src="https://lh3.googleusercontent.com/a/lan"');
		expect(html).toContain('referrerPolicy="no-referrer"');
		// Không lồng link mailto trong card đã là link.
		expect(html).not.toContain("mailto:");
	});

	it("falls back to the teacher initial when there is no image", () => {
		const html = renderToStaticMarkup(
			<ClassCard
				cls={{
					...activeClass,
					teacher: { name: "lan", email: "lan@example.com", image: null },
				}}
			/>,
		);
		expect(html).not.toContain("<img");
		expect(html).toMatch(/>L<\/span>/);
	});

	it("hides the teacher row when the class has no teacher", () => {
		const html = renderToStaticMarkup(
			<ClassCard cls={{ ...activeClass, teacher: null }} />,
		);
		expect(html).not.toContain("Giáo viên:");
		expect(html).toContain("IELTS Linked");
	});

	it("makes an active class card a link to its class detail page", () => {
		const html = renderToStaticMarkup(<ClassCard cls={activeClass} />);
		// Stretched link quanh tên lớp: accessible name là tên lớp, phần
		// còn lại của card (giáo viên, tiến độ) nằm ngoài link.
		expect(html).toContain('<a href="/classes/class-42">IELTS Linked</a>');
		expect(html.match(/<a /g)).toHaveLength(1);
		expect(html).not.toContain("aria-label");
	});
});

describe("AssignmentRow", () => {
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

	it("renders assignment title, class name, and status badge", () => {
		const html = renderToStaticMarkup(<AssignmentRow assignment={asg} />);
		expect(html).toContain("Writing Task 1 – Bar Chart");
		expect(html).toContain("IELTS Intensive");
	});

	it("hides the class name when showClassName is false", () => {
		const html = renderToStaticMarkup(
			<AssignmentRow assignment={asg} showClassName={false} />,
		);
		expect(html).toContain("Writing Task 1 – Bar Chart");
		expect(html).not.toContain("IELTS Intensive");
	});

	it("links class_assignment rows to the quiz take screen", () => {
		const html = renderToStaticMarkup(<AssignmentRow assignment={asg} />);
		expect(html).toContain('href="/learn/quizzes/a1"');
		expect(html).toContain('aria-label="Làm bài: Writing Task 1 – Bar Chart"');
	});

	it("links submitted class_assignment rows for review, not retake", () => {
		const submitted: StudentAssignment = {
			...asg,
			submittedAt: "2026-09-01T00:00:00Z",
		};
		const html = renderToStaticMarkup(<AssignmentRow assignment={submitted} />);
		expect(html).toContain('href="/learn/quizzes/a1"');
		expect(html).toContain("Xem lại kết quả");
	});

	it("renders grading-source rows WITHOUT any link (RT#10)", () => {
		const grading: StudentAssignment = { ...asg, source: "grading" };
		const html = renderToStaticMarkup(<AssignmentRow assignment={grading} />);
		expect(html).toContain("Writing Task 1 – Bar Chart");
		expect(html).not.toContain("<a ");
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

	it("renders TEACHER_ON_STUDENT_PORTAL state with link to teacher portal and sign out button", () => {
		const html = renderToStaticMarkup(
			<StudentErrorView
				code={ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL}
				teacherPortalUrl="https://app.teacheros.io.vn"
			/>,
		);
		expect(html).toContain("Đây là tài khoản giáo viên");
		expect(html).toContain("Tài khoản này thuộc hệ thống giáo viên");
		expect(html).toContain("Chuyển sang cổng giáo viên");
		expect(html).toContain('href="https://app.teacheros.io.vn"');
		expect(html).toContain("Đăng xuất");
	});

	it("renders TEACHER_ON_STUDENT_PORTAL state safely without link when portal URL is unresolved", () => {
		const html = renderToStaticMarkup(
			<StudentErrorView code={ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL} />,
		);
		expect(html).toContain("Đây là tài khoản giáo viên");
		expect(html).toContain("Tài khoản này thuộc hệ thống giáo viên");
		expect(html).not.toContain("Chuyển sang cổng giáo viên");
		expect(html).toContain("Đăng xuất");
	});

	it("resolves teacher portal url from global window if available", () => {
		vi.stubGlobal("window", {
			location: {
				hostname: "student.staging.teacheros.io.vn",
				protocol: "https:",
				port: "",
			},
		});
		try {
			const html = renderToStaticMarkup(
				<StudentErrorView
					code={ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL}
				/>,
			);
			expect(html).toContain("Chuyển sang cổng giáo viên");
			expect(html).toContain('href="https://app.staging.teacheros.io.vn"');
			expect(html).toContain("Đăng xuất");
		} finally {
			vi.unstubAllGlobals();
		}
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
describe("Dashboard currentLevel StatCard", () => {
	it("renders StatCard for currentLevel when provided and not unsure", () => {
		const html = renderToStaticMarkup(
			<StatCard
				label="Trình độ hiện tại"
				value={getCurrentLevelLabel("intermediate", "ielts")}
				sub="Band IELTS tự đánh giá"
			/>,
		);
		expect(html).toContain("Trình độ hiện tại");
		expect(html).toContain("4.5 – 5.5");
		expect(html).toContain("Band IELTS tự đánh giá");
	});

	it("formats TOEIC level label properly", () => {
		const html = renderToStaticMarkup(
			<StatCard
				label="Trình độ hiện tại"
				value={getCurrentLevelLabel("basic", "toeic")}
				sub="Điểm TOEIC tự đánh giá"
			/>,
		);
		expect(html).toContain("Trình độ hiện tại");
		expect(html).toContain("Dưới 350");
		expect(html).toContain("Điểm TOEIC tự đánh giá");
	});

	it("returns empty string for null/undefined level", () => {
		expect(getCurrentLevelLabel(null)).toBe("");
		expect(getCurrentLevelLabel(undefined)).toBe("");
	});
});
