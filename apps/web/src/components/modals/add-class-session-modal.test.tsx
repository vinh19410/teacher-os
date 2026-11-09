// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AddClassSessionModal,
	suggestNextSessionDate,
} from "@/components/modals/add-class-session-modal";
import type { ClassGroup } from "@/lib/mock-data";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
} from "@/test/kernel-harness";

const testClass: ClassGroup = {
	id: "cls-1",
	name: "IELTS Manual Class",
	level: "Band 6.5",
	type: "ielts",
	skills: ["Writing"],
	mode: "Online",
	syllabusId: "",
	studentIds: [],
	invitedStudentIds: [],
	schedule: JSON.stringify({ days: [1, 3], start: "19:00", end: "20:30" }), // T3 & T5
	sessionsDone: 0,
	sessionsTotal: 0,
	status: "active",
	startDate: "2026-11-10", // Tuesday
	tuitionFee: null,
	notes: "",
	schedulingMode: "manual",
};

describe("suggestNextSessionDate", () => {
	it("suggests the first class day on or after startDate when existingDateISOs is empty", () => {
		// 2026-11-10 is a Tuesday (day0 = 1)
		const suggestion = suggestNextSessionDate(
			testClass.schedule,
			testClass.startDate,
			[],
		);
		expect(suggestion.date).toBe("2026-11-10");
		expect(suggestion.time).toBe("19:00");
		expect(suggestion.dur).toBe(90);
	});

	it("suggests the subsequent class day skipping existing dates", () => {
		// 2026-11-10 (T3) exists -> next day in schedule [1, 3] is 2026-11-12 (T5)
		const suggestion = suggestNextSessionDate(
			testClass.schedule,
			testClass.startDate,
			["2026-11-10"],
		);
		expect(suggestion.date).toBe("2026-11-12");
		expect(suggestion.time).toBe("19:00");
		expect(suggestion.dur).toBe(90);
	});

	it("cycles to the next week when all days of the current week exist", () => {
		// 2026-11-10 (T3) and 2026-11-12 (T5) exist -> next is 2026-11-17 (next T3)
		const suggestion = suggestNextSessionDate(
			testClass.schedule,
			testClass.startDate,
			["2026-11-10", "2026-11-12"],
		);
		expect(suggestion.date).toBe("2026-11-17");
	});
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("AddClassSessionModal", () => {
	it("renders modal with prefilled date, time and duration", async () => {
		startKernelServer(snapshotFixture());
		renderWithKernel(
			<AddClassSessionModal
				open={true}
				onClose={vi.fn()}
				cls={testClass}
				existingDateISOs={[]}
			/>,
		);

		const dialog = await screen.findByRole("dialog", {
			name: "Thêm buổi học thủ công",
		});
		expect(dialog).toBeTruthy();
		expect((screen.getByLabelText(/Ngày học/i) as HTMLInputElement).value).toBe(
			"2026-11-10",
		);
		expect((screen.getByLabelText(/Giờ học/i) as HTMLInputElement).value).toBe(
			"19:00",
		);
		expect(
			(screen.getByLabelText(/Thời lượng/i) as HTMLInputElement).value,
		).toBe("90");
	});

	it("validates that topic is required", async () => {
		startKernelServer(snapshotFixture());
		renderWithKernel(
			<AddClassSessionModal
				open={true}
				onClose={vi.fn()}
				cls={testClass}
				existingDateISOs={[]}
			/>,
		);

		const submitBtn = await screen.findByRole("button", {
			name: "Thêm buổi học",
		});
		fireEvent.click(submitBtn);
		expect(
			screen.getByText("Vui lòng nhập tên hoặc chủ đề buổi học."),
		).toBeTruthy();
	});

	it("validates duplicate date against existingDateISOs", async () => {
		startKernelServer(snapshotFixture());
		renderWithKernel(
			<AddClassSessionModal
				open={true}
				onClose={vi.fn()}
				cls={testClass}
				existingDateISOs={["2026-11-10"]}
			/>,
		);

		const submitBtn = await screen.findByRole("button", {
			name: "Thêm buổi học",
		});
		const dateInput = screen.getByLabelText(/Ngày học/i);
		fireEvent.change(dateInput, { target: { value: "2026-11-10" } });
		const topicInput = screen.getByLabelText(/Chủ đề buổi học/i);
		fireEvent.change(topicInput, { target: { value: "Duplicate Topic" } });

		fireEvent.click(submitBtn);
		expect(screen.getByText("Lớp đã có buổi học vào ngày này.")).toBeTruthy();
	});
});
