import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClassGroup, Invoice, Student, Syllabus } from "@/lib/mock-data";

// /tuition now embeds query-backed sections (#320 unmatched transactions) —
// static rendering needs a QueryClient like the app shell provides.
function renderWithClient(ui: React.ReactElement): string {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return renderToStaticMarkup(
		<QueryClientProvider client={client}>{ui}</QueryClientProvider>,
	);
}

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => {
		const routeOptions =
			options && typeof options === "object"
				? (options as Record<string, unknown>)
				: {};
		return Object.assign(routeOptions, {
			useSearch: () => ({}),
			component: routeOptions.component,
		});
	},
	useNavigate: () => mockNavigate,
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

const mockStoreData: {
	students: Student[];
	classes: ClassGroup[];
	invoices: Invoice[];
	syllabi: Syllabus[];
	lessons: unknown[];
	enrollments: unknown[];
	events: unknown[];
} = {
	students: [],
	classes: [],
	invoices: [],
	syllabi: [],
	lessons: [],
	enrollments: [],
	events: [],
};

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: mockStoreData,
		classById: () => undefined,
		classesForSyllabus: () => [],
	}),
}));

vi.mock("@/lib/repos/use-students", () => ({
	useStudents: () => ({
		students: mockStoreData.students,
	}),
}));

vi.mock("@/lib/repos/invitations", () => ({
	usePendingInvitations: () => ({
		data: [],
		isLoading: false,
		error: null,
	}),
	useInviteStudent: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useCancelInvitation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

vi.mock("@/lib/repos/use-classes", () => ({
	useClasses: () => ({
		classes: mockStoreData.classes,
	}),
}));

vi.mock("@/lib/repos/use-syllabus", () => ({
	useSyllabus: () => ({
		templates: mockStoreData.syllabi,
	}),
	useTemplates: () => mockStoreData.syllabi,
}));

vi.mock("@/lib/use-direct-kernel-action", () => ({
	useDirectKernelAction: () => ({
		run: vi.fn(),
		isPending: () => false,
		busy: false,
	}),
}));

import { ClassesRoute } from "@/routes/_auth/classes/index";
import { ScheduleRoute } from "@/routes/_auth/schedule";
import { StudentsRoute } from "@/routes/_auth/students/index";
import { SyllabusRoute } from "@/routes/_auth/syllabus/index";
import { TuitionRoute } from "@/routes/_auth/tuition/index";

describe("List empty states (Issue #118)", () => {
	it("renders empty state card on /students when 0 students exist", () => {
		mockStoreData.students = [];
		mockStoreData.invoices = [];

		const html = renderToStaticMarkup(<StudentsRoute />);
		expect(html).toContain('data-testid="students-empty-state"');
		expect(html).toContain("Chưa có học viên nào");
		expect(html).toContain("student portal");
	});

	it("renders empty state card on /classes when 0 classes exist", () => {
		mockStoreData.classes = [];

		const html = renderToStaticMarkup(<ClassesRoute />);
		expect(html).toContain('data-testid="classes-empty-state"');
		expect(html).toContain("Chưa có lớp học nào");
		expect(html).toContain("+ Tạo lớp");
	});

	it("renders empty states on /tuition for both packages and invoices", () => {
		mockStoreData.students = [];
		mockStoreData.invoices = [];

		const html = renderWithClient(<TuitionRoute />);
		expect(html).toContain('data-testid="tuition-packages-empty"');
		expect(html).toContain("Chưa có gói học nào đang hoạt động.");
		expect(html).toContain('data-testid="tuition-invoices-empty"');
		expect(html).toContain("Chưa có hóa đơn nào");
		expect(html).toContain("+ Tạo hóa đơn");
	});

	it("renders empty state card on /syllabus when 0 templates exist", () => {
		mockStoreData.syllabi = [];

		const html = renderWithClient(<SyllabusRoute />);
		expect(html).toContain('data-testid="syllabus-empty-state"');
		expect(html).toContain("Chưa có syllabus nào");
		expect(html).toContain("+ Tạo syllabus");
	});

	it("renders empty state card on /schedule when 0 classes exist", () => {
		mockStoreData.classes = [];
		mockStoreData.lessons = [];

		const html = renderWithClient(<ScheduleRoute />);
		expect(html).toContain('data-testid="schedule-empty-state"');
		expect(html).toContain("Chưa có lịch dạy nào");
		expect(html).toContain("Quản lý lớp học");
	});

	it("renders class-colored week grid on /schedule when classes exist", () => {
		mockStoreData.classes = [
			{
				id: "c1",
				name: "IELTS 1",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
				studentIds: [],
				invitedStudentIds: [],
				syllabusId: "",
				schedule: JSON.stringify({ days: [], start: "18:00", end: "19:30" }),
				sessionsTotal: 10,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-09-01",
				tuitionFee: null,
				notes: "",
			},
		];
		mockStoreData.lessons = [];

		const html = renderWithClient(<ScheduleRoute />);
		expect(html).not.toContain('data-testid="schedule-empty-state"');
		// TOS-14 D2: màu block theo lớp (hash class.id), không còn legend màu
		// theo loại buổi — loại buổi là badge trong block.
		expect(html).not.toContain("Học thử (Trial)");
		// Bộ chuyển view mới luôn hiện khi có lớp.
		expect(html).toContain('data-testid="schedule-view-switch"');
		expect(html).toContain("Không có buổi học nào trong tuần này.");
	});
});
