// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	PaymentInstructions,
	StudentInvoiceItem,
} from "@teacher-os/api/contracts";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_CAP_MS, POLL_INTERVAL_MS } from "@/lib/repos/payments-portal";
import { fetchStudentInvoicePayment } from "@/lib/repos/student";
import { StudentTuitionDetailView } from "./$invoiceId";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({}),
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		const href =
			typeof to === "string"
				? to.replace("$invoiceId", params?.invoiceId ?? "")
				: String(to);
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

vi.mock("@/lib/repos/student", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/lib/repos/student")>();
	return {
		...mod,
		fetchStudentInvoicePayment: vi.fn(),
	};
});

const fetchPaymentMock = vi.mocked(fetchStudentInvoicePayment);

function setDocumentHidden(hidden: boolean) {
	Object.defineProperty(document, "hidden", {
		configurable: true,
		value: hidden,
	});
}

function makePayment(
	overrides: Partial<PaymentInstructions> = {},
): PaymentInstructions {
	return {
		invoiceCode: "INV-9D0BF200",
		amount: 1000,
		paidAmount: 0,
		amountDue: 1000,
		status: "unpaid",
		due: "2026-12-01",
		note: "",
		payable: true,
		bank: {
			brandName: "MBBank",
			accountNumber: "0123456789",
			holderName: "NGUYEN THI MY",
		},
		memo: "TKPMMY MSMY7K2M9QXA",
		qrUrl: "https://vietqr.app/img?acc=0123456789",
		...overrides,
	};
}

function createTestQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				staleTime: 60_000,
				refetchOnWindowFocus: false,
			},
		},
	});
}

async function flushMicrotasks() {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1);
		await vi.advanceTimersByTimeAsync(1);
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	setDocumentHidden(false);
	fetchPaymentMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	setDocumentHidden(false);
});

describe("StudentTuitionDetailView", () => {
	it("renders light card with text-destructive on Còn lại and hides QR title when NO_BANK_LINK", async () => {
		fetchPaymentMock.mockResolvedValueOnce(
			makePayment({
				payable: false,
				reason: "NO_BANK_LINK",
				bank: undefined,
				memo: undefined,
				qrUrl: undefined,
			}),
		);
		const qc = createTestQueryClient();

		render(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-1"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);

		await flushMicrotasks();

		const dueLabel = screen.getByText("Còn lại");
		const dueCard = dueLabel.parentElement;
		expect(dueCard?.className).toContain("bg-card");
		expect(dueCard?.className).toContain("border");
		expect(dueCard?.className).not.toContain("bg-primary");

		const dueValue = screen.getByText("1.000đ");
		expect(dueValue.className).toContain("text-destructive");
		expect(dueValue.className).toContain("tabular-nums");
		expect(dueValue.className).not.toContain("text-primary");

		expect(
			screen.getByText("Giáo viên chưa thiết lập nhận chuyển khoản"),
		).toBeTruthy();
		expect(screen.queryByText("Chuyển khoản theo QR dưới đây")).toBeNull();
	});

	it("normalizes manual mark-paid invoice to 0đ with text-foreground and hides QR title", async () => {
		fetchPaymentMock.mockResolvedValueOnce(
			makePayment({
				amount: 1000,
				paidAmount: 0,
				amountDue: 1000,
				status: "paid",
				payable: false,
				reason: "PAID",
				bank: undefined,
				memo: undefined,
				qrUrl: undefined,
			}),
		);
		const qc = createTestQueryClient();

		render(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-paid"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);

		await flushMicrotasks();

		const paidCard = screen.getByText("Đã đóng").parentElement;
		expect(paidCard?.children.item(1)?.textContent).toBe("1.000đ");

		const dueCard = screen.getByText("Còn lại").parentElement;
		const dueValue = dueCard?.children.item(1);
		expect(dueValue?.textContent).toBe("0đ");
		expect(dueValue?.className).toContain("text-foreground");
		expect(dueValue?.className).not.toContain("text-destructive");

		expect(screen.getByText("Đã thanh toán đủ")).toBeTruthy();
		expect(screen.queryByText("Chuyển khoản theo QR dưới đây")).toBeNull();
	});

	it("renders ← Học phí back link on initial error", async () => {
		fetchPaymentMock.mockRejectedValueOnce(new Error("404"));
		const qc = createTestQueryClient();

		render(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-missing"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);

		await flushMicrotasks();

		expect(screen.getByText("Không mở được phiếu học phí này.")).toBeTruthy();
		const backLink = screen.getByRole("link", { name: "← Học phí" });
		expect(backLink.getAttribute("href")).toBe("/tuition");
	});

	it("polls every 5s without flashing Đang tải… and heals/invalidates [student, invoices] cleanly", async () => {
		const initial = makePayment({
			amount: 1000,
			paidAmount: 0,
			amountDue: 1000,
			status: "unpaid",
			payable: true,
		});
		const partial = makePayment({
			amount: 1000,
			paidAmount: 400,
			amountDue: 600,
			status: "unpaid",
			payable: true,
		});
		fetchPaymentMock.mockResolvedValueOnce(initial).mockResolvedValue(partial);

		const qc = createTestQueryClient();
		const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

		render(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-poll"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);

		await flushMicrotasks();
		expect(fetchPaymentMock).toHaveBeenCalledTimes(1);
		expect(screen.getByText("Chuyển khoản theo QR dưới đây")).toBeTruthy();
		expect(invalidateSpy).not.toHaveBeenCalled();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		});
		await flushMicrotasks();

		expect(fetchPaymentMock).toHaveBeenCalledTimes(2);
		expect(screen.queryByText("Đang tải…")).toBeNull();
		expect(screen.getByText("Đã nhận 400đ / 1.000đ")).toBeTruthy();
		expect(invalidateSpy).toHaveBeenCalledWith({
			queryKey: ["student", "invoices"],
		});
	});

	it("heals stale [student, invoices] cache on initial observation when paidAmount/status differs", async () => {
		fetchPaymentMock.mockResolvedValueOnce(
			makePayment({
				amount: 1000,
				paidAmount: 1000,
				amountDue: 0,
				status: "paid",
				payable: false,
				reason: "PAID",
				bank: undefined,
				qrUrl: undefined,
			}),
		);
		const qc = createTestQueryClient();
		const staleList: StudentInvoiceItem[] = [
			{
				id: "inv-stale",
				invoiceCode: "INV-00000001",
				amount: 1000,
				paidAmount: 0,
				amountDue: 1000,
				status: "unpaid",
				due: "2026-12-01",
				type: "Học phí",
			},
		];
		qc.setQueryData(["student", "invoices"], staleList);
		const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

		render(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-stale"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);

		await flushMicrotasks();
		expect(invalidateSpy).toHaveBeenCalledWith({
			queryKey: ["student", "invoices"],
		});
	});

	it("does not invalidate [student, invoices] falsely when switching invoiceId with matching cache", async () => {
		fetchPaymentMock
			.mockResolvedValueOnce(makePayment({ payable: false, reason: "PAID" }))
			.mockResolvedValueOnce(
				makePayment({
					invoiceCode: "INV-22222222",
					amount: 2000,
					paidAmount: 0,
					amountDue: 2000,
					status: "unpaid",
					payable: true,
				}),
			);

		const qc = createTestQueryClient();
		qc.setQueryData<StudentInvoiceItem[]>(
			["student", "invoices"],
			[
				{
					id: "inv-b",
					invoiceCode: "INV-22222222",
					amount: 2000,
					paidAmount: 0,
					amountDue: 2000,
					status: "unpaid",
					due: "2026-12-01",
					type: "Học phí",
				},
			],
		);
		const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-a"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);
		await flushMicrotasks();
		expect(screen.getByText("INV-9D0BF200")).toBeTruthy();
		expect(invalidateSpy).not.toHaveBeenCalled();

		rerender(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-b"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);
		await flushMicrotasks();
		expect(screen.getByText("INV-22222222")).toBeTruthy();
		expect(invalidateSpy).not.toHaveBeenCalled();
	});

	it("keeps QR visible and stops interval on transient poll error, then recovers on visibilitychange", async () => {
		const payableData = makePayment({ payable: true });
		fetchPaymentMock
			.mockResolvedValueOnce(payableData)
			.mockRejectedValueOnce(new Error("network blip"))
			.mockResolvedValue(payableData);

		const qc = createTestQueryClient();
		render(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-err"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);

		await flushMicrotasks();
		expect(screen.getByText("Chuyển khoản theo QR dưới đây")).toBeTruthy();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		});
		await flushMicrotasks();
		expect(fetchPaymentMock).toHaveBeenCalledTimes(2);
		// QR stays visible on transient background error
		expect(screen.getByText("Chuyển khoản theo QR dưới đây")).toBeTruthy();
		expect(screen.queryByText("Không mở được phiếu học phí này.")).toBeNull();

		// Stops polling while in error state
		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
		});
		expect(fetchPaymentMock).toHaveBeenCalledTimes(2);

		// Returning to tab recovers polling
		setDocumentHidden(false);
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
			await Promise.resolve();
		});
		await flushMicrotasks();
		expect(fetchPaymentMock).toHaveBeenCalledTimes(3);
	});

	it("stops polling immediately when document becomes hidden or cap elapses, and resumes on visible", async () => {
		fetchPaymentMock.mockResolvedValue(makePayment({ payable: true }));
		const qc = createTestQueryClient();

		render(
			<QueryClientProvider client={qc}>
				<StudentTuitionDetailView
					invoiceId="inv-cap"
					studentName="Vinh Trần"
					orgId="org-1"
				/>
			</QueryClientProvider>,
		);

		await flushMicrotasks();
		expect(fetchPaymentMock).toHaveBeenCalledTimes(1);

		setDocumentHidden(true);
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
		});
		expect(fetchPaymentMock).toHaveBeenCalledTimes(1);

		setDocumentHidden(false);
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
		});
		await flushMicrotasks();
		expect(fetchPaymentMock).toHaveBeenCalledTimes(2);

		const beforeCap = fetchPaymentMock.mock.calls.length;
		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_CAP_MS + POLL_INTERVAL_MS);
		});
		const atCap = fetchPaymentMock.mock.calls.length;
		expect(atCap).toBeGreaterThan(beforeCap);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
		});
		expect(fetchPaymentMock).toHaveBeenCalledTimes(atCap);
	});
});
