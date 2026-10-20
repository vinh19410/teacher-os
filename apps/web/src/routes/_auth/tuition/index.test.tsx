// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	invoiceRow,
	type KernelServer,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
	type WriteHandler,
} from "@/test/kernel-harness";
import { resetRouterState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { Route } from "./index";

const Tuition = (Route as unknown as { component: () => React.ReactNode })
	.component;

/** The unmatched-transactions card queries its own endpoint. */
const withPayments =
	(onWrite?: WriteHandler): WriteHandler =>
	(req, server) =>
		req.path.startsWith("/api/payment-transactions")
			? { status: 200, body: [] }
			: onWrite?.(req, server);

function start(
	invoices: ReturnType<typeof invoiceRow>[],
	onWrite?: WriteHandler,
) {
	return startKernelServer(
		snapshotFixture({
			students: [
				studentRow({ id: "st-1", name: "Học viên Một" }),
				studentRow({ id: "st-2", name: "Học viên Hai" }),
			],
			invoices,
		}),
		withPayments(onWrite),
	);
}

function kpi(label: string): HTMLElement {
	return screen.getByText(label).parentElement as HTMLElement;
}

const kernelWrites = (server: KernelServer) =>
	server.writes.filter((w) => w.method !== "GET");

beforeEach(resetRouterState);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("tuition KPIs", () => {
	it("derives collected and outstanding from the invoices", async () => {
		start([
			invoiceRow({
				id: "inv-1",
				amount: 400000,
				status: "paid",
				paidAmount: 400000,
			}),
			invoiceRow({ id: "inv-2", amount: 300000, studentId: "st-2" }),
		]);
		renderWithKernel(<Tuition />);
		await screen.findByText("Còn nợ (VND)");
		expect(kpi("Đã thu (VND)").textContent).toContain("400.000");
		expect(kpi("Còn nợ (VND)").textContent).toContain("300.000");
	});

	it("shows a zero debt neutral and only flags debt that exists", async () => {
		start([invoiceRow({ status: "paid", paidAmount: 400000 })]);
		const view = renderWithKernel(<Tuition />);
		await screen.findByText("Còn nợ (VND)");
		// Thẻ được đánh dấu (v2) là số đỏ text-destructive; nợ 0đ giữ thường.
		expect(
			screen.getByText("Còn nợ (VND)").previousElementSibling!.className,
		).not.toContain("text-destructive");
		view.unmount();

		start([invoiceRow()]);
		renderWithKernel(<Tuition />);
		await screen.findByText("Còn nợ (VND)");
		expect(
			screen.getByText("Còn nợ (VND)").previousElementSibling!.className,
		).toContain("text-destructive");
	});
});

describe("mark an invoice paid", () => {
	it("records the payment once, reports it, and blocks every row while saving", async () => {
		let land: () => void = () => {};
		const server = start(
			[
				invoiceRow({ id: "inv-1" }),
				invoiceRow({ id: "inv-2", studentId: "st-2" }),
			],
			() =>
				new Promise((resolve) => {
					land = () => resolve(undefined);
				}),
		);
		renderWithKernel(<Tuition />);
		// One "Đã nhận" per open invoice, in invoice order.
		const [first, second] = (await screen.findAllByRole("button", {
			name: "Đã nhận",
		})) as HTMLButtonElement[];

		fireEvent.click(first);
		const saving = await screen.findByRole("button", { name: "Đang lưu…" });
		expect((saving as HTMLButtonElement).disabled).toBe(true);
		expect(second.disabled).toBe(true);
		fireEvent.click(second);

		land();
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Đã ghi nhận thanh toán."),
		);
		expect(kernelWrites(server)).toEqual([
			{
				method: "POST",
				path: "/api/invoices/inv-1/mark-paid",
				body: { method: "CK" },
			},
		]);
	});

	it("reports a rejected payment visibly", async () => {
		start([invoiceRow()], (req) =>
			req.method === "POST" ? { status: 422, body: {} } : undefined,
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<Tuition />);
		fireEvent.click(await screen.findByRole("button", { name: "Đã nhận" }));
		await waitFor(() => expect(toast.error).toHaveBeenCalled());
		expect(toast.success).not.toHaveBeenCalled();
	});
});
