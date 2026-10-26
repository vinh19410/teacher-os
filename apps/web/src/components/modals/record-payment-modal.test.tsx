// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DebtLedgerRow } from "@/lib/tuition-from-kernel";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	invoiceRow,
	type KernelServer,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { RecordPaymentModal } from "./record-payment-modal";

const row = (overrides?: Partial<DebtLedgerRow>): DebtLedgerRow => ({
	studentId: "st-1",
	name: "Nguyễn Minh Anh",
	classNames: ["IELTS Writing"],
	totalDue: 4_500_000,
	totalPaid: 0,
	remaining: 4_500_000,
	nextDue: "2099-12-31",
	status: "due",
	openInvoiceIds: ["inv-1"],
	...overrides,
});

const singleInvoice = () =>
	snapshotFixture({
		students: [studentRow({ id: "st-1", name: "Nguyễn Minh Anh" })],
		invoices: [
			invoiceRow({
				id: "inv-1",
				studentId: "st-1",
				amount: 4_500_000,
				paidAmount: 0,
				status: "unpaid",
				due: "2099-12-31",
			}),
		],
	});

const twoOpenInvoices = () =>
	snapshotFixture({
		students: [studentRow({ id: "st-1", name: "Nguyễn Minh Anh" })],
		invoices: [
			invoiceRow({
				id: "inv-late",
				studentId: "st-1",
				amount: 4_500_000,
				paidAmount: 0,
				status: "unpaid",
				due: "2099-12-31",
			}),
			invoiceRow({
				id: "inv-early",
				studentId: "st-1",
				amount: 1_000_000,
				paidAmount: 400_000,
				status: "unpaid",
				due: "2099-01-01",
			}),
		],
	});

function typeAmount(dialog: HTMLElement, value: string) {
	fireEvent.change(within(dialog).getByLabelText(/Số tiền thực thu/), {
		target: { value },
	});
}

function typeNote(dialog: HTMLElement, value: string) {
	fireEvent.change(within(dialog).getByLabelText(/^Ghi chú/), {
		target: { value },
	});
}

function chooseMethod(dialog: HTMLElement, label: string) {
	fireEvent.click(within(dialog).getByRole("radio", { name: label }));
}

/** Reads the idempotency key off a recorded write without unchecked casts. */
function clientRequestIdOf(req: { body: unknown }): string {
	if (
		req.body &&
		typeof req.body === "object" &&
		"clientRequestId" in req.body &&
		typeof req.body.clientRequestId === "string"
	) {
		return req.body.clientRequestId;
	}
	return "";
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("RecordPaymentModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: singleInvoice,
		render: (onClose) => (
			<RecordPaymentModal open onClose={onClose} row={row()} />
		),
		fill: (dialog) => {
			typeAmount(dialog, "2,000,000");
			chooseMethod(dialog, "Tiền mặt");
			typeNote(dialog, "Đợt 1");
		},
		submit: "Lưu phiếu thu học phí",
		expectedWrite: {
			path: "/api/invoices/inv-1/payments",
			body: {
				amount: 2_000_000,
				method: "cash",
				note: "Đợt 1",
			},
		},
	});

	it("shows the per-invoice summary and skips the invoice select for a single debt", async () => {
		startKernelServer(singleInvoice());
		renderWithKernel(
			<RecordPaymentModal open onClose={() => {}} row={row()} />,
		);
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).queryByLabelText("Khoản thu *")).toBeNull();
		expect(within(dialog).getByTestId("payment-summary").textContent).toContain(
			"Phải đóng 4.500.000",
		);
		expect(within(dialog).getByTestId("payment-summary").textContent).toContain(
			"Còn nợ 4.500.000",
		);
	});

	it("selects the earliest-due invoice first when several are open", async () => {
		startKernelServer(twoOpenInvoices());
		renderWithKernel(
			<RecordPaymentModal
				open
				onClose={() => {}}
				row={row({
					openInvoiceIds: ["inv-early", "inv-late"],
					totalDue: 5_500_000,
					remaining: 5_100_000,
				})}
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		const select = within(dialog).getByLabelText(
			"Khoản thu *",
		) as HTMLSelectElement;
		// openInvoiceIds is sorted by due ascending — the earliest first.
		expect(select.value).toBe("inv-early");
		expect(within(dialog).getByTestId("payment-summary").textContent).toContain(
			"Còn nợ 600.000",
		);
		const lateOption = within(select).getByRole("option", {
			name: /Hạn 2099-12-31 · Còn nợ 4.500.000/,
		}) as HTMLOptionElement;
		expect(lateOption.value).toBe("inv-late");
	});

	it("updates the after-transaction line as the amount is typed", async () => {
		startKernelServer(singleInvoice());
		renderWithKernel(
			<RecordPaymentModal open onClose={() => {}} row={row()} />,
		);
		const dialog = await screen.findByRole("dialog");
		const line = within(dialog).getByTestId("payment-summary");
		// The after-line lives in its own paragraph next to the summary.
		const afterLine = within(dialog).getByText(
			/Số dư còn nợ sau giao dịch này/,
		);
		// Chưa nhập gì: số dư giữ nguyên, trạng thái Còn nợ.
		expect(afterLine.textContent).toContain("4.500.000");
		expect(afterLine.textContent).toContain("Còn nợ");
		expect(line).toBeTruthy();

		typeAmount(dialog, "2,000,000");
		expect(afterLine.textContent).toContain("2.500.000");
		expect(afterLine.textContent).toContain("Còn nợ");

		typeAmount(dialog, "4,500,000");
		expect(afterLine.textContent).toContain("0");
		expect(afterLine.textContent).toContain("Đã thu đủ");
	});

	it('fills the whole remaining debt with "Thu toàn bộ"', async () => {
		startKernelServer(singleInvoice());
		renderWithKernel(
			<RecordPaymentModal open onClose={() => {}} row={row()} />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thu toàn bộ 4.500.000đ" }),
		);
		const input = within(dialog).getByLabelText(
			/Số tiền thực thu/,
		) as HTMLInputElement;
		expect(input.value).toBe("4,500,000");
	});

	it("keeps one clientRequestId across a rejected retry", async () => {
		const server: KernelServer = startKernelServer(singleInvoice(), () => ({
			status: 422,
			body: { error: "amount-exceeds-debt", remaining: 0 },
		}));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(
			<RecordPaymentModal open onClose={() => {}} row={row()} />,
		);
		const dialog = await screen.findByRole("dialog");
		typeAmount(dialog, "2,000,000");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu phiếu thu học phí" }),
		);
		await within(dialog).findByRole("alert");
		expect(server.writes).toHaveLength(1);
		const firstKey = clientRequestIdOf(server.writes[0]);
		expect(firstKey).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);

		// Lower the amount and retry — the server can match the same receipt.
		typeAmount(dialog, "1,000,000");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu phiếu thu học phí" }),
		);
		await waitFor(() => expect(server.writes).toHaveLength(2));
		expect(clientRequestIdOf(server.writes[1])).toBe(firstKey);
	});

	it("updates the remaining figure after amount-exceeds-debt and stays open", async () => {
		const server = startKernelServer(singleInvoice(), () => ({
			status: 422,
			body: { error: "amount-exceeds-debt", remaining: 0 },
		}));
		const paid = singleInvoice();
		if (paid.invoices) paid.invoices[0].paidAmount = 4_500_000;
		renderWithKernel(
			<RecordPaymentModal open onClose={() => {}} row={row()} />,
		);
		const dialog = await screen.findByRole("dialog");
		server.snapshotReply = () => ({ status: 200, body: paid });
		typeAmount(dialog, "2,000,000");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu phiếu thu học phí" }),
		);
		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain("vượt số dư còn nợ");
		// Dialog stays open; the summary now reflects the refreshed snapshot.
		await waitFor(() => {
			expect(
				within(dialog).getByTestId("payment-summary").textContent,
			).toContain("Đã thu 4.500.000");
		});
	});

	it("explains invoice-settled, refreshes and stays open", async () => {
		const onClose = vi.fn();
		const server = startKernelServer(singleInvoice(), () => ({
			status: 422,
			body: { error: "invoice-settled" },
		}));
		const settled = singleInvoice();
		if (settled.invoices) settled.invoices[0].paidAmount = 4_500_000;
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<RecordPaymentModal open onClose={onClose} row={row()} />);
		const dialog = await screen.findByRole("dialog");
		server.snapshotReply = () => ({ status: 200, body: settled });
		typeAmount(dialog, "2,000,000");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu phiếu thu học phí" }),
		);
		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain("đã được ghi nhận đủ");
		// Nothing was written and the dialog now shows the settled state —
		// the teacher closes it themselves.
		await waitFor(() => {
			expect(
				within(dialog).getByTestId("payment-summary").textContent,
			).toContain("Đã thu 4.500.000");
		});
		expect(onClose).not.toHaveBeenCalled();
	});

	it("explains a client-request-id conflict (409) and stays open", async () => {
		startKernelServer(singleInvoice(), () => ({
			status: 409,
			body: { error: "client-request-id-conflict" },
		}));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(
			<RecordPaymentModal open onClose={() => {}} row={row()} />,
		);
		const dialog = await screen.findByRole("dialog");
		typeAmount(dialog, "2,000,000");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu phiếu thu học phí" }),
		);
		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain("đã được dùng cho nội dung khác");
		expect(
			within(dialog).getByRole("button", { name: "Lưu phiếu thu học phí" }),
		).toBeTruthy();
	});

	it("validates invalid amounts (0 and > remaining) inline with aria-invalid/aria-describedby and disables save (TOS-17 #451)", async () => {
		startKernelServer(
			snapshotFixture({
				students: [studentRow({ id: "st-1", name: "Nguyễn Minh Anh" })],
				invoices: [
					invoiceRow({
						id: "inv-1",
						studentId: "st-1",
						amount: 4_500_000,
						paidAmount: 2_000_000,
						status: "unpaid",
						due: "2099-12-31",
					}),
				],
			}),
		);
		renderWithKernel(
			<RecordPaymentModal
				open
				onClose={() => {}}
				row={row({
					totalDue: 4_500_000,
					totalPaid: 2_000_000,
					remaining: 2_500_000,
				})}
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		const input = within(dialog).getByLabelText(
			/Số tiền thực thu/,
		) as HTMLInputElement;
		const saveBtn = within(dialog).getByRole("button", {
			name: "Lưu phiếu thu học phí",
		}) as HTMLButtonElement;

		// Mới mở hộp thoại chưa nhập: không hiện lỗi đỏ nhưng nút Lưu đã khóa
		expect(input.getAttribute("aria-invalid")).not.toBe("true");
		expect(
			within(dialog).queryByText(
				"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ",
			),
		).toBeNull();
		expect(saveBtn.disabled).toBe(true);

		// Nhập 0 → lỗi inline + aria-invalid + aria-describedby + nút Lưu khóa
		typeAmount(dialog, "0");
		fireEvent.blur(input);
		const errZero = within(dialog).getByText(
			"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ",
		);
		expect(errZero).toBeTruthy();
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(input.getAttribute("aria-describedby")).toContain(errZero.id);
		expect(saveBtn.disabled).toBe(true);

		// Nhập 3.000.000 (vượt nợ 2.500.000) → vẫn hiện lỗi inline và nút Lưu khóa
		typeAmount(dialog, "3,000,000");
		expect(
			within(dialog).getByText(
				"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ",
			),
		).toBeTruthy();
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(saveBtn.disabled).toBe(true);

		// Sửa về 2.500.000 → hết lỗi, nút Lưu bật
		typeAmount(dialog, "2,500,000");
		expect(
			within(dialog).queryByText(
				"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ",
			),
		).toBeNull();
		expect(input.getAttribute("aria-invalid")).not.toBe("true");
		expect(saveBtn.disabled).toBe(false);
	});

	it("re-validates amount when switching to an invoice with smaller remaining debt (TOS-17 #451)", async () => {
		startKernelServer(twoOpenInvoices());
		renderWithKernel(
			<RecordPaymentModal
				open
				onClose={() => {}}
				row={row({
					openInvoiceIds: ["inv-early", "inv-late"],
					totalDue: 5_500_000,
					remaining: 5_100_000,
				})}
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		const select = within(dialog).getByLabelText(
			"Khoản thu *",
		) as HTMLSelectElement;
		const saveBtn = within(dialog).getByRole("button", {
			name: "Lưu phiếu thu học phí",
		}) as HTMLButtonElement;

		// Chọn khoản inv-late (còn nợ 4.500.000) và nhập 2.000.000 → hợp lệ
		fireEvent.change(select, { target: { value: "inv-late" } });
		typeAmount(dialog, "2,000,000");
		expect(saveBtn.disabled).toBe(false);

		// Đổi sang khoản inv-early (còn nợ 600.000 < 2.000.000) → lỗi hiện lại, nút Lưu khóa
		fireEvent.change(select, { target: { value: "inv-early" } });
		expect(
			within(dialog).getByText(
				"Số tiền thu phải lớn hơn 0 và không vượt quá số tiền còn nợ",
			),
		).toBeTruthy();
		expect(saveBtn.disabled).toBe(true);
	});
});
