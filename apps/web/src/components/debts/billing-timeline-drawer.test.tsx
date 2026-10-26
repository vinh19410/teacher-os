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
import type { DebtLedgerRow } from "@/lib/tuition-from-kernel";
import { resetRouterState } from "@/test/router-mock";

// Vitest hoists vi.mock above top-level imports, so the factory must load router-mock dynamically.
vi.mock("@tanstack/react-router", async () => {
	const mod = await import("@/test/router-mock");
	return mod.routerMock();
});

const fetchBillingTimelineMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/repos/payments", () => ({
	fetchBillingTimeline: fetchBillingTimelineMock,
	billingTimelineQueryOptions: (studentId: string) => ({
		queryKey: ["billing-timeline", studentId] as const,
		queryFn: () => fetchBillingTimelineMock(studentId),
		staleTime: 0,
	}),
}));

import { BillingTimelineDrawer } from "./billing-timeline-drawer";

const SAMPLE_ROW: DebtLedgerRow = {
	studentId: "st-1",
	name: "Nguyễn Minh Anh",
	classNames: ["IELTS 6.5A"],
	totalDue: 4_500_000,
	totalPaid: 2_000_000,
	remaining: 2_500_000,
	nextDue: "2026-10-20",
	status: "overdue",
	openInvoiceIds: ["inv-1111aaaa"],
};

function renderDrawer(props: {
	open: boolean;
	row: DebtLedgerRow | null;
	onClose: () => void;
}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BillingTimelineDrawer {...props} />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	resetRouterState();
	fetchBillingTimelineMock.mockReset();
});

afterEach(() => {
	cleanup();
});

describe("BillingTimelineDrawer (TOS-18 #452)", () => {
	it("hiển thị 3 chỉ số lũy kế (Phải đóng / Đã thu / Còn nợ) và nhóm sự kiện theo tháng với đúng nhãn nguồn", async () => {
		fetchBillingTimelineMock.mockResolvedValue({
			events: [
				{
					kind: "payment",
					id: "tx-manual-1",
					at: "2026-10-26T08:30:00.000Z", // Tháng 10/2026 giờ VN
					invoiceId: "inv-1111aaaa",
					code: "INV-1111AAAA",
					amount: 1_000_000,
					source: "manual",
					method: "Tiền mặt",
					note: "Đóng đợt 2 tại quầy",
				},
				{
					kind: "payment",
					id: "tx-bank-1",
					at: "2026-10-25T03:00:00.000Z", // Tháng 10/2026 giờ VN
					invoiceId: "inv-1111aaaa",
					code: "INV-1111AAAA",
					amount: 1_000_000,
					source: "bank_hub",
					method: "",
					note: "",
				},
				{
					kind: "invoice_issued",
					at: "2026-09-28T02:00:00.000Z", // Tháng 09/2026 giờ VN
					invoiceId: "inv-1111aaaa",
					code: "INV-1111AAAA",
					type: "Học phí khóa IELTS",
					amount: 4_500_000,
					due: "2026-10-20",
					status: "unpaid",
				},
			],
		});

		const onClose = vi.fn();
		renderDrawer({ open: true, row: SAMPLE_ROW, onClose });

		expect(
			screen.getByRole("heading", {
				name: /Lịch sử hóa đơn & giao dịch — Nguyễn Minh Anh/,
			}),
		).toBeTruthy();

		// 3 chỉ số lũy kế từ row
		const summary = screen.getByTestId("billing-timeline-summary");
		expect(summary.textContent).toContain("4.500.000đ");
		expect(summary.textContent).toContain("2.000.000đ");
		expect(summary.textContent).toContain("2.500.000đ");

		// Nhóm theo tháng giờ VN
		await screen.findByText("Tháng 10/2026");
		expect(screen.getByText("Tháng 09/2026")).toBeTruthy();

		// Thứ tự các mục và nhãn nguồn
		const items = screen.getAllByTestId("billing-timeline-item");
		expect(items).toHaveLength(3);
		expect(items[0]?.textContent).toContain("Thu 1.000.000đ");
		expect(items[0]?.textContent).toContain("Thu thủ công · Tiền mặt");
		expect(items[0]?.textContent).toContain("— Đóng đợt 2 tại quầy");

		expect(items[1]?.textContent).toContain("Thu 1.000.000đ");
		expect(items[1]?.textContent).toContain("QR Bank-Hub");
		expect(items[1]?.textContent).not.toContain(" — ");

		expect(items[2]?.textContent).toContain(
			"Phát hành hóa đơn INV-1111AAAA · Học phí khóa IELTS · 4.500.000đ",
		);
		expect(items[2]?.textContent).toContain("hạn 20/10");

		// Mỗi mục có link sang /tuition/$invoiceId
		const links = screen
			.getAllByRole("link")
			.filter((el) => el.getAttribute("href") === "/tuition/inv-1111aaaa");
		expect(links.length).toBeGreaterThanOrEqual(3);
	});

	it("hiển thị trạng thái loading, lỗi (nút Thử lại gọi lại API) và rỗng", async () => {
		// 1. Loading state
		const { promise, resolve } = Promise.withResolvers<unknown>();
		fetchBillingTimelineMock.mockReturnValueOnce(promise);
		const view = renderDrawer({
			open: true,
			row: SAMPLE_ROW,
			onClose: vi.fn(),
		});
		expect(screen.getByTestId("billing-timeline-loading")).toBeTruthy();
		resolve({ events: [] });
		expect(
			await screen.findByText("Chưa có hóa đơn hoặc giao dịch nào."),
		).toBeTruthy();
		view.unmount();

		// 2. Error state + retry
		fetchBillingTimelineMock
			.mockRejectedValueOnce(new Error("network down"))
			.mockResolvedValueOnce({ events: [] });
		renderDrawer({ open: true, row: SAMPLE_ROW, onClose: vi.fn() });
		const retryBtn = await screen.findByRole("button", { name: "Thử lại" });
		fireEvent.click(retryBtn);
		expect(
			await screen.findByText("Chưa có hóa đơn hoặc giao dịch nào."),
		).toBeTruthy();
		expect(fetchBillingTimelineMock).toHaveBeenCalledTimes(3);
	});

	it("focus vào tiêu đề khi mở, nhấn Escape đóng drawer và hoàn trả focus về nút đã mở", async () => {
		fetchBillingTimelineMock.mockResolvedValue({ events: [] });
		const trigger = document.createElement("button");
		trigger.textContent = "Xem timeline";
		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		const onClose = vi.fn();
		const { rerender } = render(
			<QueryClientProvider
				client={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<BillingTimelineDrawer open={true} row={SAMPLE_ROW} onClose={onClose} />
			</QueryClientProvider>,
		);

		const heading = screen.getByRole("heading", {
			name: /Lịch sử hóa đơn & giao dịch — Nguyễn Minh Anh/,
		});
		await waitFor(() => {
			expect(document.activeElement).toBe(heading);
		});

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);

		rerender(
			<QueryClientProvider
				client={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<BillingTimelineDrawer
					open={false}
					row={SAMPLE_ROW}
					onClose={onClose}
				/>
			</QueryClientProvider>,
		);
		expect(document.activeElement).toBe(trigger);
		trigger.remove();
	});
});
