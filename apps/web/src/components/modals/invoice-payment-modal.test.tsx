// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repos/api-base-url", () => ({
	getApiBaseUrl: () => "",
}));

import { POLL_INTERVAL_MS } from "@/lib/repos/payments";
import { InvoicePaymentModal } from "./invoice-payment-modal";

type PaymentFixture = {
	payable: boolean;
	reason?: "NO_BANK_LINK" | "PAID";
	payToken: string;
	amount: number;
	amountDue: number;
	paidAmount: number;
	status: string;
	memo?: string;
};

const PAYABLE: PaymentFixture = {
	payable: true,
	payToken: "tok-abc123def456ghi_jkl",
	amount: 500000,
	amountDue: 300000,
	paidAmount: 200000,
	status: "unpaid",
	memo: "TOSABCD12",
};

function jsonOk(body: unknown) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function renderModal(props?: {
	invoiceId?: string | null;
	open?: boolean;
	payment?: PaymentFixture;
}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const utils = render(
		<QueryClientProvider client={queryClient}>
			<InvoicePaymentModal
				invoiceId={props?.invoiceId ?? "inv-1"}
				open={props?.open ?? true}
				onClose={() => {}}
			/>
		</QueryClientProvider>,
	);
	return { queryClient, ...utils };
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => jsonOk(PAYABLE)),
	);
	Object.assign(navigator, {
		clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
	});
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("InvoicePaymentModal (characterization before hook extraction #345)", () => {
	it("renders the QR panel plus copy and rotate actions when payable", async () => {
		renderModal();
		expect(
			await screen.findByText("Chuyển khoản theo QR dưới đây"),
		).toBeTruthy();
		expect(await screen.findByText("Sao chép link thanh toán")).toBeTruthy();
		expect(screen.getByText("Tạo link mới")).toBeTruthy();
	});

	it("copies the public pay link and flips the button label", async () => {
		renderModal();
		fireEvent.click(await screen.findByText("Sao chép link thanh toán"));
		await waitFor(() => {
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
				`${window.location.origin}/pay/${PAYABLE.payToken}`,
			);
		});
		expect(screen.getByText("✓ Đã sao chép link")).toBeTruthy();
	});

	it("shows the rotate warning, cancels back, and keeps state internal", async () => {
		renderModal();
		fireEvent.click(await screen.findByText("Tạo link mới"));
		expect(screen.getByText(/Link cũ sẽ hết hiệu lực/)).toBeTruthy();
		expect(screen.getByText("Xác nhận tạo link mới")).toBeTruthy();
		fireEvent.click(screen.getByText("Không"));
		expect(screen.getByText("Tạo link mới")).toBeTruthy();
		expect(screen.queryByText(/Link cũ sẽ hết hiệu lực/)).toBeNull();
	});

	it("hides the actions footer when the invoice is not payable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonOk({ ...PAYABLE, payable: false, reason: "PAID" })),
		);
		renderModal();
		expect(await screen.findByText("Đã thanh toán đủ")).toBeTruthy();
		expect(screen.queryByText("Sao chép link thanh toán")).toBeNull();
		expect(screen.queryByText("Tạo link mới")).toBeNull();
	});

	it("resets the rotate confirmation when the modal reopens", async () => {
		const { queryClient, rerender } = renderModal();
		const modal = (open: boolean) => (
			<QueryClientProvider client={queryClient}>
				<InvoicePaymentModal invoiceId="inv-1" open={open} onClose={() => {}} />
			</QueryClientProvider>
		);
		fireEvent.click(await screen.findByText("Tạo link mới"));
		expect(screen.getByText(/Link cũ sẽ hết hiệu lực/)).toBeTruthy();
		rerender(modal(false));
		rerender(modal(true));
		expect(screen.queryByText(/Link cũ sẽ hết hiệu lực/)).toBeNull();
		expect(screen.getByText("Tạo link mới")).toBeTruthy();
	});

	it("polls every 5s while payable and stops at the 15-minute cap", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn(async () => jsonOk(PAYABLE));
		vi.stubGlobal("fetch", fetchMock);
		renderModal();
		await vi.advanceTimersByTimeAsync(10);
		expect(fetchMock.mock.calls.length).toBe(1);
		// 4 more ticks inside the cap.
		await vi.advanceTimersByTimeAsync(20_000);
		expect(fetchMock.mock.calls.length).toBe(5);
		// Cross the 15-minute cap — no further polls.
		await vi.advanceTimersByTimeAsync(20 * 60_000);
		const countAtCap = fetchMock.mock.calls.length;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(fetchMock.mock.calls.length).toBe(countAtCap);
	});

	it("does not poll a settled invoice", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn(async () =>
			jsonOk({ ...PAYABLE, payable: false, reason: "PAID" }),
		);
		vi.stubGlobal("fetch", fetchMock);
		renderModal();
		await vi.advanceTimersByTimeAsync(10);
		expect(fetchMock.mock.calls.length).toBe(1);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(fetchMock.mock.calls.length).toBe(1);
	});

	it("visibilitychange back to the tab resets the 15-minute cap", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn(async () => jsonOk(PAYABLE));
		vi.stubGlobal("fetch", fetchMock);
		renderModal();
		await vi.advanceTimersByTimeAsync(10);
		expect(fetchMock.mock.calls.length).toBe(1);
		// Cross the cap — polling stops.
		await vi.advanceTimersByTimeAsync(20 * 60_000);
		const countAtCap = fetchMock.mock.calls.length;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(fetchMock.mock.calls.length).toBe(countAtCap);
		// Teacher comes back to the tab → cap resets → polling resumes within
		// the next few interval ticks (phase depends on timer re-registration).
		document.dispatchEvent(new Event("visibilitychange"));
		for (let i = 0; i < 4; i++) {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		}
		expect(fetchMock.mock.calls.length).toBeGreaterThan(countAtCap);
	});
});
