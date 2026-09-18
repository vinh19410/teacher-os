import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClassGroup, Invoice, Student, Syllabus } from "@/lib/mock-data";

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
} = {
	students: [],
	classes: [],
	invoices: [],
	syllabi: [],
	lessons: [],
	enrollments: [],
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

vi.mock("@/lib/repos/use-classes", () => ({
	useClasses: () => ({
		classes: mockStoreData.classes,
	}),
}));

vi.mock("@/lib/repos/use-syllabus", () => ({
	useSyllabus: () => ({
		templates: mockStoreData.syllabi,
	}),
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
import { TuitionRoute } from "@/routes/_auth/tuition";

describe("List empty states (Issue #118)", () => {
	it("renders empty state card on /students when 0 students exist", () => {
		mockStoreData.students = [];
		mockStoreData.invoices = [];

		const html = renderToStaticMarkup(<StudentsRoute />);
		expect(html).toContain('data-testid="students-empty-state"');
		expect(html).toContain("Chưa có học viên nào");
		expect(html).toContain("+ Thêm học viên");
	});

	it("renders empty state card on /classes when 0 classes exist", () => {
		mockStoreData.classes = [];

		const html = renderToStaticMarkup(<ClassesRoute />);
		expect(html).toContain('data-testid="classes-empty-state"');
		expect(html).toContain("Chưa có lớp học nào");
		expect(html).toContain("+ Tạo lớp học");
	});

	it("renders empty states on /tuition for both packages and invoices", () => {
		mockStoreData.students = [];
		mockStoreData.invoices = [];

		const html = renderToStaticMarkup(<TuitionRoute />);
		expect(html).toContain('data-testid="tuition-packages-empty"');
		expect(html).toContain("Chưa có gói học nào đang hoạt động.");
		expect(html).toContain('data-testid="tuition-invoices-empty"');
		expect(html).toContain("Chưa có hóa đơn nào");
		expect(html).toContain("+ Tạo hóa đơn");
	});

	it("renders empty state card on /syllabus when 0 templates exist", () => {
		mockStoreData.syllabi = [];

		const html = renderToStaticMarkup(<SyllabusRoute />);
		expect(html).toContain('data-testid="syllabus-empty-state"');
		expect(html).toContain("Chưa có syllabus nào");
		expect(html).toContain("+ Tạo syllabus");
	});

	it("renders empty state card on /schedule when 0 classes exist and shows bilingual legend", () => {
		mockStoreData.classes = [];
		mockStoreData.lessons = [];

		const html = renderToStaticMarkup(<ScheduleRoute />);
		expect(html).toContain('data-testid="schedule-empty-state"');
		expect(html).toContain("Chưa có lịch dạy nào");
		expect(html).toContain("Quản lý lớp học");
	});

	it("renders Vietnamese legend on /schedule when classes exist", () => {
		mockStoreData.classes = [
			{
				id: "c1",
				name: "IELTS 1",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
				studentIds: [],
				syllabusId: "",
				schedule: JSON.stringify({ days: [1], start: "18:00", end: "19:30" }),
				sessionsTotal: 10,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-09-01",
				notes: "",
			},
		];
		mockStoreData.lessons = [];

		const html = renderToStaticMarkup(<ScheduleRoute />);
		expect(html).not.toContain('data-testid="schedule-empty-state"');
		expect(html).toContain("Học thử (Trial)");
		expect(html).toContain("Thi thử (Mock)");
		expect(html).toContain("Ôn tập (Review)");
		expect(html).toContain("Không có buổi học nào trong tuần này.");
	});
});
