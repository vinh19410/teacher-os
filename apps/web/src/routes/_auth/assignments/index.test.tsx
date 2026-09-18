import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Assignment, Student } from "@/lib/mock-data";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => mockNavigate,
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

function createStudent(id: string, name: string): Student {
	return {
		id,
		name,
		phone: "0901234567",
		zalo: "0901234567",
		parent: { name: "Phụ huynh", phone: "0901234568" },
		targetBand: "6.5",
		skills: ["Writing"],
		examDate: "2026-12-01",
		pkg: {
			total: 10,
			done: 0,
			remaining: 10,
			price: 4000000,
			mode: "Online",
			start: "2026-09-01",
			expiry: "2026-12-01",
		},
		tags: [],
		notes: "",
		avatar: name.slice(0, 2).toUpperCase(),
		atRisk: false,
	};
}

let mockStoreData: {
	assignments: Assignment[];
	students: Student[];
} = {
	assignments: [],
	students: [],
};

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: mockStoreData,
	}),
}));

import { AddAssignmentModal } from "@/components/modals/add-assignment-modal";
import { AssignmentsRoute } from "./index";

describe("AssignmentsRoute empty state & CTA (Issue #166)", () => {
	it("renders empty state with instructions and action CTAs when workspace has 0 assignments", () => {
		mockStoreData = {
			assignments: [],
			students: [],
		};

		const html = renderToStaticMarkup(<AssignmentsRoute />);
		expect(html).toContain('data-testid="assignments-empty-state"');
		expect(html).toContain("Chưa có bài tập nào");
		expect(html).toContain("Quản lý lớp học");
		expect(html).toContain("Quản lý học viên");
		expect(html).toContain("+ Tạo bài tập");
		expect(html).toContain("0 bài tập · 0 cần xử lý");
	});

	it("renders assignments DataTable when workspace has assignments", () => {
		mockStoreData = {
			assignments: [
				{
					id: "a1",
					sid: "s1",
					title: "IELTS Writing Task 2",
					type: "Writing",
					due: "20/09",
					status: "graded",
					scores: { task: 7, coherence: 7, lexical: 6.5, grammar: 6.5 },
				},
				{
					id: "a2",
					sid: "s2",
					title: "Reading Practice Test 1",
					type: "Reading",
					due: "22/09",
					status: "not-submitted",
					scores: null,
				},
			],
			students: [
				createStudent("s1", "Nguyễn Văn A"),
				createStudent("s2", "Trần Thị B"),
			],
		};

		const html = renderToStaticMarkup(<AssignmentsRoute />);
		expect(html).not.toContain('data-testid="assignments-empty-state"');
		expect(html).toContain("IELTS Writing Task 2");
		expect(html).toContain("Nguyễn Văn A");
		expect(html).toContain("Đã chấm");
		expect(html).toContain("Reading Practice Test 1");
		expect(html).toContain("Trần Thị B");
		expect(html).toContain("Chưa nộp");
		expect(html).toContain("+ Tạo bài tập");
		expect(html).toContain("2 bài tập · 1 cần xử lý");
	});
	it("renders filter-empty message when filter matches 0 assignments", () => {
		mockStoreData = {
			assignments: [
				{
					id: "a1",
					sid: "s1",
					title: "IELTS Writing Task 2",
					type: "Writing",
					due: "20/09",
					status: "graded",
					scores: { task: 7, coherence: 7, lexical: 6.5, grammar: 6.5 },
				},
			],
			students: [createStudent("s1", "Nguyễn Văn A")],
		};

		const html = renderToStaticMarkup(<AssignmentsRoute initialFilter="Trễ" />);
		expect(html).not.toContain('data-testid="assignments-empty-state"');
		expect(html).toContain("Không có bài tập nào phù hợp với bộ lọc.");
	});

	it("renders AddAssignmentModal correctly when open", () => {
		const html = renderToStaticMarkup(
			<AddAssignmentModal open={true} onClose={vi.fn()} />,
		);
		expect(html).toContain("Tạo bài tập");
		expect(html).toContain(
			"Tính năng giao bài tập trực tiếp đang được hoàn thiện",
		);
		expect(html).toContain("Đến trang Lớp học");
		expect(html).toContain("Quản lý danh sách học viên");
		expect(html).toContain("Quản lý danh sách lớp học");
		expect(html).toContain("Đóng");
	});

	it("does not render AddAssignmentModal when closed", () => {
		const html = renderToStaticMarkup(
			<AddAssignmentModal open={false} onClose={vi.fn()} />,
		);
		expect(html).toBe("");
	});
});
