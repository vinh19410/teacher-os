// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
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
import { startMaterialsBankServer } from "@/test/materials-harness";

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
	it("renders modal with prefilled dd/mm/yyyy date, 24h time and duration", async () => {
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

		const dateInput = screen.getByLabelText(/Ngày học/i) as HTMLInputElement;
		expect(dateInput.type).toBe("text");
		expect(dateInput.value).toBe("10/11/2026");
		expect(
			within(dialog).getByRole("button", { name: "Chọn ngày" }),
		).toBeTruthy();

		const timeInput = screen.getByLabelText(/Giờ học/i) as HTMLInputElement;
		expect(timeInput.type).toBe("text");
		expect(timeInput.value).toBe("19:00");
		expect(within(dialog).queryByRole("button", { name: "23:59" })).toBeNull();

		expect(
			(screen.getByLabelText(/Thời lượng/i) as HTMLInputElement).value,
		).toBe("90");
		expect(within(dialog).queryByLabelText(/Link Zoom/i)).toBeNull();
	});

	it("validates that topic is required without marking date invalid", async () => {
		const server = startKernelServer(snapshotFixture());
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
		expect(screen.getByRole("alert").textContent).toContain(
			"Vui lòng nhập tên hoặc chủ đề buổi học.",
		);
		expect(
			screen.getByLabelText(/Ngày học/i).getAttribute("aria-invalid"),
		).toBeNull();
		// Blurring through valid date/time inputs must not dismiss an unrelated form error
		fireEvent.blur(screen.getByLabelText(/Ngày học/i));
		fireEvent.blur(screen.getByLabelText(/Giờ học/i));
		expect(screen.getByRole("alert").textContent).toContain(
			"Vui lòng nhập tên hoặc chủ đề buổi học.",
		);
		expect(server.writes).toHaveLength(0);
	});

	it("blocks submit when date text is invalid", async () => {
		const server = startKernelServer(snapshotFixture());
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
		const dateInput = screen.getByLabelText(/Ngày học/i);
		fireEvent.change(dateInput, {
			target: { value: "31/02/2026" },
		});
		expect(dateInput.getAttribute("aria-invalid")).toBe("true");
		fireEvent.change(screen.getByLabelText(/Chủ đề buổi học/i), {
			target: { value: "Invalid Date Topic" },
		});
		fireEvent.click(submitBtn);

		expect(
			screen.getByText("Vui lòng chọn ngày học hợp lệ (dd/mm/yyyy)."),
		).toBeTruthy();
		expect(server.writes).toHaveLength(0);
	});

	it("blocks submit when time text is invalid", async () => {
		const server = startKernelServer(snapshotFixture());
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
		const timeInput = screen.getByLabelText(/Giờ học/i);
		fireEvent.change(timeInput, {
			target: { value: "25:99" },
		});
		expect(timeInput.getAttribute("aria-invalid")).toBe("true");
		fireEvent.change(screen.getByLabelText(/Chủ đề buổi học/i), {
			target: { value: "Invalid Time Topic" },
		});
		fireEvent.click(submitBtn);

		expect(
			screen.getByText("Vui lòng chọn giờ học hợp lệ (HH:mm)."),
		).toBeTruthy();
		expect(server.writes).toHaveLength(0);
	});

	it("validates duplicate date against existingDateISOs", async () => {
		const server = startKernelServer(snapshotFixture());
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
		fireEvent.change(dateInput, { target: { value: "10/11/2026" } });
		const topicInput = screen.getByLabelText(/Chủ đề buổi học/i);
		fireEvent.change(topicInput, { target: { value: "Duplicate Topic" } });

		fireEvent.click(submitBtn);
		expect(screen.getByText("Lớp đã có buổi học vào ngày này.")).toBeTruthy();
		expect(server.writes).toHaveLength(0);
	});

	it("submits ISO date and 24h time chosen via calendar popover and TimeInput24h", async () => {
		const server = startKernelServer(snapshotFixture());
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
		fireEvent.click(within(dialog).getByRole("button", { name: "Chọn ngày" }));
		fireEvent.click(await screen.findByRole("button", { name: "12/11/2026" }));
		expect((screen.getByLabelText(/Ngày học/i) as HTMLInputElement).value).toBe(
			"12/11/2026",
		);

		const timeInput = screen.getByLabelText(/Giờ học/i);
		fireEvent.change(timeInput, { target: { value: "8:30" } });
		fireEvent.blur(timeInput);
		expect((timeInput as HTMLInputElement).value).toBe("08:30");

		fireEvent.change(within(dialog).getByLabelText(/Chủ đề buổi học/i), {
			target: { value: "Speaking Part 2" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thêm buổi học" }),
		);

		await waitFor(() =>
			expect(
				server.writes.find(
					(req) =>
						req.method === "POST" && req.path === "/api/classes/cls-1/sessions",
				),
			).toBeTruthy(),
		);
		const write = server.writes.find(
			(req) =>
				req.method === "POST" && req.path === "/api/classes/cls-1/sessions",
		);
		expect(write?.body).toMatchObject({
			date: "2026-11-12",
			time: "08:30",
			dur: 90,
			topic: "Speaking Part 2",
		});
	});

	it("resets invalid date/time flags and refreshes suggestion when reopened", async () => {
		const server = startKernelServer(snapshotFixture());
		function Harness() {
			const [open, setOpen] = useState(true);
			const [existing, setExisting] = useState<string[]>([]);
			return (
				<>
					<button
						type="button"
						onClick={() => {
							setExisting(["2026-11-10"]);
							setOpen(true);
						}}
					>
						Reopen
					</button>
					<AddClassSessionModal
						open={open}
						onClose={() => setOpen(false)}
						cls={testClass}
						existingDateISOs={existing}
					/>
				</>
			);
		}
		renderWithKernel(<Harness />);

		fireEvent.change(await screen.findByLabelText(/Ngày học/i), {
			target: { value: "99/99/2026" },
		});
		fireEvent.change(screen.getByLabelText(/Giờ học/i), {
			target: { value: "99:99" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Thêm buổi học thủ công" }),
			).toBeNull(),
		);
		fireEvent.click(screen.getByRole("button", { name: "Reopen" }));

		const dateInput = (await screen.findByLabelText(
			/Ngày học/i,
		)) as HTMLInputElement;
		const timeInput = screen.getByLabelText(/Giờ học/i) as HTMLInputElement;
		await waitFor(() => expect(dateInput.value).toBe("12/11/2026"));
		expect(timeInput.value).toBe("19:00");
		expect(dateInput.getAttribute("aria-invalid")).toBeNull();
		expect(timeInput.getAttribute("aria-invalid")).toBeNull();

		// Submit proves parent dateInvalid/timeInvalid flags were actually reset
		fireEvent.change(screen.getByLabelText(/Chủ đề buổi học/i), {
			target: { value: "Reopened Session" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Thêm buổi học" }));
		await waitFor(() =>
			expect(
				server.writes.find(
					(req) =>
						req.method === "POST" && req.path === "/api/classes/cls-1/sessions",
				),
			).toBeTruthy(),
		);
		expect(screen.queryByRole("alert")).toBeNull();
		const write = server.writes.find(
			(req) =>
				req.method === "POST" && req.path === "/api/classes/cls-1/sessions",
		);
		expect(write?.body).toMatchObject({
			date: "2026-11-12",
			time: "19:00",
			dur: 90,
			topic: "Reopened Session",
		});
	});

	/** Mở form, chọn 1 tài liệu từ ngân hàng qua picker. */
	async function openWithPickedMaterial() {
		const server = startMaterialsBankServer();
		renderWithKernel(
			<AddClassSessionModal
				open
				onClose={vi.fn()}
				cls={testClass}
				existingDateISOs={[]}
			/>,
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Thêm buổi học thủ công",
		});
		fireEvent.click(
			await within(dialog).findByRole("button", { name: "Chọn từ ngân hàng" }),
		);
		const pickerDialog = await screen.findByRole("dialog", {
			name: "Chọn từ ngân hàng tài liệu",
		});
		fireEvent.click(
			await within(pickerDialog).findByRole("button", {
				name: "Gắn Reading pack",
			}),
		);
		// Chip đã chọn hiện trong form chính (list "Tài liệu đã chọn" — tránh
		// trùng tiêu đề trong danh sách duyệt đang mở lồng nhau).
		const chips = await within(dialog).findByRole("list", {
			name: "Tài liệu đã chọn",
		});
		expect(within(chips).getByText("Reading pack")).toBeTruthy();
		fireEvent.change(within(dialog).getByLabelText(/Chủ đề buổi học/), {
			target: { value: "With materials" },
		});
		return { server, dialog };
	}

	it("sends materialIds of picked bank materials in the session payload", async () => {
		const { server, dialog } = await openWithPickedMaterial();

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thêm buổi học" }),
		);
		await waitFor(() =>
			expect(
				server.writes.find(
					(req) =>
						req.method === "POST" && req.path === "/api/classes/cls-1/sessions",
				),
			).toBeTruthy(),
		);
		const write = server.writes.find(
			(req) =>
				req.method === "POST" && req.path === "/api/classes/cls-1/sessions",
		);
		expect(write?.body).toMatchObject({
			topic: "With materials",
			materialIds: ["mat-1"],
		});
		expect(write?.body).not.toHaveProperty("zoom");
	});

	it("drops the materialIds key after the chip is removed", async () => {
		const { server, dialog } = await openWithPickedMaterial();

		// Gỡ chip: payload không còn materialIds (server default []).
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Gỡ Reading pack" }),
		);
		await waitFor(() =>
			expect(
				within(dialog).queryByRole("list", { name: "Tài liệu đã chọn" }),
			).toBeNull(),
		);

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thêm buổi học" }),
		);
		await waitFor(() =>
			expect(
				server.writes.find(
					(req) =>
						req.method === "POST" && req.path === "/api/classes/cls-1/sessions",
				),
			).toBeTruthy(),
		);
		const write = server.writes.find(
			(req) =>
				req.method === "POST" && req.path === "/api/classes/cls-1/sessions",
		);
		expect(write?.body).not.toHaveProperty("materialIds");
	});
});
