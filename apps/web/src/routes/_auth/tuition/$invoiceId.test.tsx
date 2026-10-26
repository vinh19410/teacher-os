// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassGroup, Invoice, Student } from "@/lib/mock-data";

// Route hiện tại để useParams mock trả đúng param mỗi case.
let currentInvoiceId = "inv-abcdef12";
const navigateSpy = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => {
		const routeOptions =
			options && typeof options === "object"
				? (options as Record<string, unknown>)
				: {};
		return Object.assign(routeOptions, {
			useParams: () => ({ invoiceId: currentInvoiceId }),
			useSearch: () => ({}),
			component: routeOptions.component,
		});
	},
	notFound: () => {
		throw new Error("not-found");
	},
	useNavigate: () => navigateSpy,
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

vi.mock("@/lib/use-direct-kernel-action", () => ({
	useDirectKernelAction: () => ({
		run: vi.fn(),
		isPending: () => false,
		busy: false,
	}),
}));

const studentFixture = {
	id: "stu-1",
	name: "Nguyễn Văn A",
	avatar: "A",
} as unknown as Student;

const classFixture = {
	id: "cls-1",
	name: "IELTS Cơ bản",
} as unknown as ClassGroup;

// Static imports (vi.mock above is hoisted): loading the route inside a
// test body charged module transform time to the 5s test timeout, which
// timed out under a busy parallel run.
import { usePaidAmountWatch } from "@/components/modals/invoice-payment-modal";
import { InvoiceDetailRoute } from "./$invoiceId";

function invoiceFixture(overrides?: Partial<Invoice>): Invoice {
	return {
		id: "inv-abcdef12",
		sid: "stu-1",
		eid: "enr-1",
		amount: 500000,
		paidAmount: 200000,
		status: "unpaid",
		date: "07/10",
		type: "Học phí",
		method: "CK",
		due: "2026-10-15",
		note: "Học phí tháng 10",
		createdAt: Date.parse("2026-10-07T02:12:00Z"),
		...overrides,
	};
}

let storeInvoices: Invoice[] = [invoiceFixture()];
let storeViewer = { role: "teacher", canAccessFinance: true };

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: {
			students: [studentFixture],
			classes: [classFixture],
			enrollments: [
				{
					id: "enr-1",
					classId: "cls-1",
					studentId: "stu-1",
					status: "active",
					createdAt: "",
				},
			],
			invoices: storeInvoices,
			lessons: [],
			syllabi: [],
			viewer: storeViewer,
		},
	}),
}));

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

const PAYABLE_PAYMENT: PaymentFixture = {
	payable: true,
	payToken: "tok-detail-token12345",
	amount: 500000,
	amountDue: 300000,
	paidAmount: 200000,
	status: "unpaid",
	memo: "TOSDETAIL1",
};

let paymentFixture: PaymentFixture = PAYABLE_PAYMENT;

const TRANSACTIONS = [
	{
		id: "tx-1",
		amount: 200000,
		content: "TOSDETAIL1 hoc phi",
		referenceCode: "FT200000",
		transactionDate: "2026-10-05 10:00:00",
		createdAt: "2026-10-05T10:00:00.000Z",
	},
];

let transactionsFixture = TRANSACTIONS;

function jsonOk(body: unknown) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

/** jsdom render + đợi payment/transactions query flush (fetch promise) rồi
 * trả innerHTML — renderToStaticMarkup không flush async nên panel đứng
 * "Đang tải…". Mọi fixture đều có nút copy (cả settled) làm mốc chờ. */
async function renderDetail(): Promise<string> {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<InvoiceDetailRoute />
		</QueryClientProvider>,
	);
	await screen.findByText("Sao chép link thanh toán");
	return document.body.innerHTML;
}

beforeEach(() => {
	storeInvoices = [invoiceFixture()];
	transactionsFixture = TRANSACTIONS;
	paymentFixture = PAYABLE_PAYMENT;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			if (url.includes("/payment")) return jsonOk(paymentFixture);
			if (url.includes("/transactions")) return jsonOk(transactionsFixture);
			return jsonOk({});
		}),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("Invoice detail route (#345)", () => {
	it("renders every invoice field for a partial invoice", async () => {
		const html = await renderDetail();
		expect(html).toContain("INV-ABCDEF12");
		expect(html).toContain("inv-abcdef12");
		expect(html).toContain("Học phí tháng 10");
		expect(html).toContain("15/10");
		expect(html).toContain("CK");
		expect(html).toContain("500.000");
		expect(html).toContain("200.000");
		expect(html).toContain("300.000");
		expect(html).toContain("Nguyễn Văn A");
		expect(html).toContain("IELTS Cơ bản");
		expect(html).toContain("Thu một phần");
		expect(html).toContain("còn 300.000");
		// QR panel + payment link + history row.
		expect(html).toContain("Chuyển khoản theo QR dưới đây");
		expect(html).toContain("/pay/tok-detail-token12345");
		expect(html).toContain("TOSDETAIL1 hoc phi");
		expect(html).toContain("FT200000");
	});

	it("manual mark-paid shows the full amount with the manual note", async () => {
		storeInvoices = [
			invoiceFixture({ status: "paid", paidAmount: 0, due: "" }),
		];
		paymentFixture = { ...paymentFixture, payable: false, reason: "PAID" };
		transactionsFixture = [];
		const html = await renderDetail();
		expect(html).toContain("Đã thu");
		expect(html).toContain("Ghi nhận thủ công");
		expect(html).toContain("Hóa đơn được đánh dấu đã thu thủ công");
	});

	it("legacy invoice (no enrollment, no createdAt, no note) renders em dashes", async () => {
		storeInvoices = [
			invoiceFixture({
				eid: "",
				createdAt: 0,
				note: "",
				paidAmount: 0,
			}),
		];
		const html = await renderDetail();
		expect(html).toContain("Lớp: —");
		// createdAt 0 → "—" trong dl (không render số 0/1970).
		expect(html).not.toContain("01/01/1970");
	});

	it("unknown invoice id throws notFound", async () => {
		currentInvoiceId = "inv-ghost";
		storeInvoices = [];
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		expect(() =>
			renderToStaticMarkup(
				<QueryClientProvider client={client}>
					<InvoiceDetailRoute />
				</QueryClientProvider>,
			),
		).toThrow("not-found");
		currentInvoiceId = "inv-abcdef12";
	});

	it("settled invoice keeps the copy action but hides rotate", async () => {
		paymentFixture = { ...paymentFixture, payable: false, reason: "PAID" };
		const html = await renderDetail();
		expect(html).toContain("Sao chép link thanh toán");
		expect(html).not.toContain("Tạo link mới");
	});

	it("payable invoice shows the rotate confirm flow entry", async () => {
		const html = await renderDetail();
		expect(html).toContain("Tạo link mới");
		expect(html).toContain("Sao chép link thanh toán");
	});
});

describe("usePaidAmountWatch (#345)", () => {
	it("invalidates transactions + kernel only when the paid amount changes", async () => {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const invalidate = vi.spyOn(client, "invalidateQueries");

		const { rerender } = renderHook(
			({ paid }: { paid: number | undefined }) =>
				usePaidAmountWatch("inv-abcdef12", paid),
			{
				initialProps: { paid: 0 },
				wrapper: ({ children }: { children: React.ReactNode }) => (
					<QueryClientProvider client={client}>{children}</QueryClientProvider>
				),
			},
		);
		// First observation never invalidates (baseline).
		await waitFor(() => expect(invalidate).not.toHaveBeenCalled());

		// Same value again — no invalidation (value compare, not identity).
		rerender({ paid: 0 });
		await waitFor(() => expect(invalidate).not.toHaveBeenCalled());

		// Money moved — both shared caches pulled forward.
		rerender({ paid: 200000 });
		await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
		const keys = invalidate.mock.calls.map(
			(call) => (call[0] as { queryKey: unknown[] }).queryKey,
		);
		expect(keys).toContainEqual(["invoice-transactions", "inv-abcdef12"]);
		expect(keys).toContainEqual(["kernel"]);
	});

	it("heals a stale kernel snapshot on the first observation", async () => {
		// Kernel stale (paidAmount 0 trên màn) + payment lần đầu thấy 200000:
		// tiền đã về TRƯỚC lúc mở trang — phải heal ngay, không nuốt baseline.
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const invalidate = vi.spyOn(client, "invalidateQueries");

		renderHook(
			({ paid }: { paid: number | undefined }) =>
				usePaidAmountWatch("inv-abcdef12", paid, 0),
			{
				initialProps: { paid: 200000 },
				wrapper: ({ children }: { children: React.ReactNode }) => (
					<QueryClientProvider client={client}>{children}</QueryClientProvider>
				),
			},
		);
		await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
		const keys = invalidate.mock.calls.map(
			(call) => (call[0] as { queryKey: unknown[] }).queryKey,
		);
		expect(keys).toContainEqual(["invoice-transactions", "inv-abcdef12"]);
		expect(keys).toContainEqual(["kernel"]);

		// Snapshot khớp payment → lần đầu KHÔNG invalidate thừa.
		const client2 = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const invalidate2 = vi.spyOn(client2, "invalidateQueries");
		renderHook(
			({ paid }: { paid: number | undefined }) =>
				usePaidAmountWatch("inv-abcdef12", paid, 200000),
			{
				initialProps: { paid: 200000 },
				wrapper: ({ children }: { children: React.ReactNode }) => (
					<QueryClientProvider client={client2}>{children}</QueryClientProvider>
				),
			},
		);
		await new Promise((r) => setTimeout(r, 20));
		expect(invalidate2).not.toHaveBeenCalled();
	});

	it("does not carry the baseline across invoices", async () => {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const invalidate = vi.spyOn(client, "invalidateQueries");

		const { rerender } = renderHook(
			({ id, paid }: { id: string; paid: number | undefined }) =>
				usePaidAmountWatch(id, paid),
			{
				initialProps: { id: "inv-a", paid: 100000 },
				wrapper: ({ children }: { children: React.ReactNode }) => (
					<QueryClientProvider client={client}>{children}</QueryClientProvider>
				),
			},
		);
		// Điều hướng sang hóa đơn khác (cùng route, không remount): baseline
		// của inv-b là 300000, không được so với 100000 của inv-a.
		rerender({ id: "inv-b", paid: 300000 });
		await new Promise((r) => setTimeout(r, 20));
		expect(invalidate).not.toHaveBeenCalled();
	});
});

describe("InvoiceDetailRoute finance guard (TOS-17 #451)", () => {
	it("redirects to /dashboard with toast instead of throwing notFound when viewer.canAccessFinance is false", async () => {
		storeInvoices = [];
		storeViewer = { role: "ta", canAccessFinance: false };
		navigateSpy.mockClear();
		toast.error.mockClear();
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={client}>
				<InvoiceDetailRoute />
			</QueryClientProvider>,
		);
		await waitFor(() => {
			expect(navigateSpy).toHaveBeenCalledWith({
				to: "/dashboard",
				replace: true,
			});
		});
		expect(toast.error).toHaveBeenCalledWith(
			"Bạn không có quyền xem Sổ công nợ",
			expect.objectContaining({ id: "finance-forbidden" }),
		);
		expect(container.innerHTML).toBe("");
		storeViewer = { role: "teacher", canAccessFinance: true };
	});
});
