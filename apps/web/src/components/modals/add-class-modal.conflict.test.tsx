// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassGroup } from "@/lib/mock-data";

function seedClass(partial: Partial<ClassGroup>): ClassGroup {
	return {
		id: "c-running",
		name: "[TEST] Foundation",
		level: "Band 5.5",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: "",
		studentIds: [],
		invitedStudentIds: [],
		// T2 & T4 (0 = Monday-first) 19:00–20:30.
		schedule: '{"days":[0,2],"start":"19:00","end":"20:30"}',
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		// Tue 2026-09-01 + 12 buổi T2&T4 → buổi cuối Mon 2026-10-12: còn
		// chạy khi draft bắt đầu 2026-10-06.
		startDate: "2026-09-01",
		tuitionFee: null,
		notes: "",
		...partial,
	};
}

const { classes, kernelForm, templates } = vi.hoisted(() => ({
	classes: [] as ClassGroup[],
	templates: [] as never[],
	kernelForm: {
		saving: false as boolean,
		notice: undefined as unknown,
	},
}));

vi.mock("@/lib/repos/use-syllabus", () => ({
	useTemplates: () => templates,
	useSyllabus: () => ({
		templates,
		syllabi: templates,
		syllabusById: (id: string) =>
			templates.find((item: { id: string }) => item.id === id),
	}),
}));

vi.mock("@/lib/repos/use-classes", () => ({
	useClasses: () => ({
		classes,
		classById: (id: string) => classes.find((item) => item.id === id),
	}),
}));

vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => ({
		saving: kernelForm.saving,
		error: undefined,
		setError: () => undefined,
		notice: kernelForm.notice,
		submitBlocked: false,
		run: async () => null,
		reconcile: async () => false,
	}),
}));

// Freeze "today" so the run-window fixtures stay deterministic — the modal
// seeds startDate with tomorrow and clamps it forward.
vi.mock("@/lib/date-input", () => ({
	getTomorrowDateInputValue: () => "2026-10-06",
	isFutureDateInputValue: (value: string) => value >= "2026-10-06",
}));

import { AddClassModal } from "./add-class-modal";

beforeEach(() => {
	kernelForm.saving = false;
	kernelForm.notice = undefined;
});

afterEach(cleanup);

function openModal() {
	render(<AddClassModal open onClose={() => undefined} />);
}

describe("AddClassModal schedule-conflict warning (#315)", () => {
	it("warns with the class name on shared weekday + overlapping time, submit stays enabled", () => {
		classes.splice(0, classes.length, seedClass({}));
		openModal();
		expect(screen.queryByTestId("schedule-conflict-warning")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "T2" }));

		const warning = screen.getByTestId("schedule-conflict-warning");
		expect(warning.getAttribute("role")).toBe("status");
		expect(warning.textContent).toContain("[TEST] Foundation");
		expect(warning.textContent).toContain("T2");
		expect(warning.textContent).toContain("19:00–20:30");
		// Cảnh báo KHÔNG chặn: giáo viên có thể cố ý dạy song song.
		expect(
			(screen.getByRole("button", { name: "Tạo lớp" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	it("stops warning once the time no longer overlaps (touching edge 20:30)", () => {
		classes.splice(0, classes.length, seedClass({}));
		openModal();
		fireEvent.click(screen.getByRole("button", { name: "T2" }));
		expect(screen.getByTestId("schedule-conflict-warning")).toBeTruthy();

		fireEvent.change(screen.getByLabelText("Giờ bắt đầu"), {
			target: { value: "20:30" },
		});
		// changeStart kéo end theo (+90 phút) khi end chưa được chạm tay.
		expect(screen.queryByTestId("schedule-conflict-warning")).toBeNull();
	});

	it("stops warning when the shared day is deselected", () => {
		classes.splice(0, classes.length, seedClass({}));
		openModal();
		const t2 = screen.getByRole("button", { name: "T2" });
		fireEvent.click(t2);
		expect(screen.getByTestId("schedule-conflict-warning")).toBeTruthy();

		fireEvent.click(t2); // bỏ chọn T2 → hết thứ chung.
		expect(screen.queryByTestId("schedule-conflict-warning")).toBeNull();
	});

	it("hides the warning while saving or showing a submit notice", () => {
		classes.splice(0, classes.length, seedClass({}));

		kernelForm.saving = true;
		openModal();
		fireEvent.click(screen.getByRole("button", { name: "T2" }));
		// saving: không warning dù draft vẫn trùng (chống self-conflict flash
		// sau optimistic refresh).
		expect(screen.queryByTestId("schedule-conflict-warning")).toBeNull();

		kernelForm.saving = false;
		kernelForm.notice = { kind: "unknown" };
		cleanup();
		openModal();
		fireEvent.click(screen.getByRole("button", { name: "T2" }));
		expect(screen.queryByTestId("schedule-conflict-warning")).toBeNull();
	});

	it("caps the list at 3 rows with a +N overflow line", () => {
		classes.splice(
			0,
			classes.length,
			...[1, 2, 3, 4].map((n) =>
				seedClass({
					id: `c-${n}`,
					name: `[TEST] Conflict ${n}`,
					// T6 (day 4) 19:00–20:30, còn chạy từ 2026-09-01.
					schedule: '{"days":[4],"start":"19:00","end":"20:30"}',
				}),
			),
			seedClass({
				id: "c-5",
				name: "[TEST] Conflict 5",
				schedule: '{"days":[4],"start":"19:30","end":"21:00"}',
			}),
		);
		openModal();
		fireEvent.click(screen.getByRole("button", { name: "T6" }));

		const warning = screen.getByTestId("schedule-conflict-warning");
		const rows = warning.querySelectorAll("li");
		expect(rows).toHaveLength(4); // 3 lớp + 1 dòng "+2 lớp khác"
		expect(warning.textContent).toContain("[TEST] Conflict 1");
		expect(warning.textContent).toContain("[TEST] Conflict 3");
		expect(warning.textContent).not.toContain("[TEST] Conflict 4");
		expect(warning.textContent).toContain("+2 lớp khác");
	});

	it("renders a hostile class name as inert text, never as markup", () => {
		classes.splice(
			0,
			classes.length,
			seedClass({
				id: "c-xss",
				name: "<img src=x onerror=alert(1)>",
				schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
			}),
		);
		openModal();
		fireEvent.click(screen.getByRole("button", { name: "T3" }));

		const warning = screen.getByTestId("schedule-conflict-warning");
		expect(warning.textContent).toContain("<img src=x onerror=alert(1)>");
		expect(warning.querySelector("img")).toBeNull();
	});
});
