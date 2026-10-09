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
import { formatDateInputValue } from "@/lib/date-input";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	classRow,
	enrollmentRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { AddInvoiceModal } from "./add-invoice-modal";

const enrolled = () =>
	snapshotFixture({
		classes: [classRow({ id: "cl-1", name: "IELTS Writing" })],
		students: [studentRow({ id: "st-1", name: "Học viên Một" })],
		enrollments: [
			enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
		],
	});

function typeAmount(dialog: HTMLElement, value: string) {
	fireEvent.change(within(dialog).getByLabelText(/Số tiền/), {
		target: { value },
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("AddInvoiceModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: enrolled,
		render: (onClose) => <AddInvoiceModal open onClose={onClose} />,
		fill: (dialog) => typeAmount(dialog, "400000"),
		submit: "Tạo hóa đơn",
		expectedWrite: {
			path: "/api/invoices",
			body: {
				enrollmentId: "en-1",
				amount: 400000,
				due: formatDateInputValue(new Date()),
				note: "",
			},
		},
	});

	it("names each enrollment by student and class", async () => {
		startKernelServer(enrolled());
		renderWithKernel(<AddInvoiceModal open onClose={() => {}} />);
		const dialog = await screen.findByRole("dialog");
		expect(
			within(dialog).getByRole("option", {
				name: "Học viên Một · IELTS Writing",
			}),
		).toBeTruthy();
	});

	it("requires an amount before writing", async () => {
		const server = startKernelServer(enrolled());
		renderWithKernel(<AddInvoiceModal open onClose={() => {}} />);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Tạo hóa đơn" }),
		);
		expect(
			await within(dialog).findByText("Vui lòng nhập số tiền."),
		).toBeTruthy();
		expect(server.writes).toEqual([]);
	});

	it("starts a fresh session on every open: values, field errors and a pending notice", async () => {
		const server = startKernelServer(enrolled(), (_req, srv) => {
			srv.snapshotReply = () => ({ status: 503, body: {} });
			return undefined;
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<Reopenable />);
		fireEvent.click(await screen.findByRole("button", { name: "open" }));
		let dialog = screen.getByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Ghi chú"), {
			target: { value: "học phí tháng 10" },
		});
		typeAmount(dialog, "400000");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Tạo hóa đơn" }),
		);
		await within(dialog).findByRole("button", { name: "Tải lại" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));

		server.snapshotReply = undefined;
		fireEvent.click(screen.getByRole("button", { name: "open" }));
		dialog = screen.getByRole("dialog");
		expect(
			(within(dialog).getByLabelText("Ghi chú") as HTMLTextAreaElement).value,
		).toBe("");
		expect(
			(within(dialog).getByLabelText(/Số tiền/) as HTMLInputElement).value,
		).toBe("");
		expect(
			within(dialog).queryByRole("button", { name: "Tải lại" }),
		).toBeNull();
		await waitFor(() =>
			expect(
				(
					within(dialog).getByRole("button", {
						name: "Tạo hóa đơn",
					}) as HTMLButtonElement
				).disabled,
			).toBe(false),
		);
	});
});

function Reopenable() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				open
			</button>
			<AddInvoiceModal open={open} onClose={() => setOpen(false)} />
		</>
	);
}
