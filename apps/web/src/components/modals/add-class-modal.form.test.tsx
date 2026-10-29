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
	formatDateInputValue,
	getTomorrowDateInputValue,
} from "@/lib/date-input";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	syllabusRow,
} from "@/test/kernel-harness";
import { AddClassModal } from "./add-class-modal";

const lesson = (id: string) => ({
	id,
	title: id,
	objectives: "",
	materials: "",
	kind: "lesson" as const,
	status: "upcoming" as const,
});

const withTemplate = () =>
	snapshotFixture({
		syllabi: [
			syllabusRow({
				id: "sy-t",
				name: "Speaking Booster",
				skills: ["Speaking", "Listening"],
				modules: [
					{
						id: "m-1",
						title: "M1",
						description: "",
						lessons: [lesson("a"), lesson("b"), lesson("c")],
					},
				],
			}),
		],
	});

function fillMinimum(dialog: HTMLElement) {
	fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
		target: { value: "  Writing tối  " },
	});
	fireEvent.click(within(dialog).getByRole("button", { name: "Writing" }));
	fireEvent.click(within(dialog).getByRole("button", { name: "T2" }));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("AddClassModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: withTemplate,
		render: (onClose) => <AddClassModal open onClose={onClose} />,
		fill: fillMinimum,
		submit: "Tạo lớp",
		expectedWrite: {
			path: "/api/classes",
			body: {
				name: "Writing tối",
				skills: ["Writing"],
				templateId: "",
				schedule: { days: [0], start: "19:00", end: "20:30" },
				startDate: getTomorrowDateInputValue(),
			},
		},
	});

	async function open() {
		const server = startKernelServer(withTemplate());
		renderWithKernel(<AddClassModal open onClose={() => {}} />);
		const dialog = await screen.findByRole("dialog");
		return { server, dialog };
	}

	it("starts tomorrow by default and never offers a past start date", async () => {
		const { dialog } = await open();
		const date = within(dialog).getByLabelText(
			"Ngày bắt đầu",
		) as HTMLInputElement;
		expect(date.type).toBe("date");
		expect(date.value).toBe(getTomorrowDateInputValue());
		expect(date.min).toBe(getTomorrowDateInputValue());
	});

	it("refuses a start date of today before writing", async () => {
		const { server, dialog } = await open();
		fillMinimum(dialog);
		fireEvent.change(within(dialog).getByLabelText("Ngày bắt đầu"), {
			target: { value: formatDateInputValue(new Date()) },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Tạo lớp" }));
		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Vui lòng chọn ngày bắt đầu sau hôm nay.",
		);
		expect(server.writes).toEqual([]);
	});

	it("takes skills and session count from the chosen template and locks them", async () => {
		const { server, dialog } = await open();
		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "Speaking sáng" },
		});
		fireEvent.change(within(dialog).getByLabelText("Template giáo trình"), {
			target: { value: "sy-t" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "T2" }));

		const total = within(dialog).getByLabelText(
			"Tổng số buổi",
		) as HTMLInputElement;
		expect(total.value).toBe("3");
		expect(total.disabled).toBe(true);
		const speaking = within(dialog).getByRole("button", { name: "Speaking" });
		expect(speaking.getAttribute("aria-pressed")).toBe("true");
		expect((speaking as HTMLButtonElement).disabled).toBe(true);

		fireEvent.click(within(dialog).getByRole("button", { name: "Tạo lớp" }));
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].body).toMatchObject({
			templateId: "sy-t",
			skills: ["Speaking", "Listening"],
			sessionsTotal: 3,
		});
	});

	it("opens blank again after a class was created", async () => {
		startKernelServer(withTemplate());
		renderWithKernel(<Reopenable />);
		fireEvent.click(await screen.findByRole("button", { name: "open" }));
		let dialog = screen.getByRole("dialog");
		fillMinimum(dialog);
		fireEvent.change(within(dialog).getByLabelText("Template giáo trình"), {
			target: { value: "sy-t" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Tạo lớp" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		fireEvent.click(screen.getByRole("button", { name: "open" }));
		dialog = screen.getByRole("dialog");
		expect(
			(within(dialog).getByLabelText(/Tên lớp/) as HTMLInputElement).value,
		).toBe("");
		expect(
			(
				within(dialog).getByLabelText(
					"Template giáo trình",
				) as HTMLSelectElement
			).value,
		).toBe("");
	});
});

/** The modal stays mounted like on /classes; only `open` toggles. */
function Reopenable() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				open
			</button>
			<AddClassModal open={open} onClose={() => setOpen(false)} />
		</>
	);
}
