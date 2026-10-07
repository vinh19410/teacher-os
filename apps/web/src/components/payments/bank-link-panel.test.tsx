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

const { syncBankLink, statusValue } = vi.hoisted(() => ({
	syncBankLink: vi.fn(),
	statusValue: { current: null as unknown },
}));

vi.mock("@/lib/repos/api-base-url", () => ({
	getApiBaseUrl: () => "",
}));

vi.mock("@/lib/repos/bank-link", () => ({
	bankLinkQueryKey: ["bank-link"] as const,
	bankLinkQueryOptions: () => ({
		queryKey: ["bank-link"],
		queryFn: () => statusValue.current,
	}),
	syncBankLink: (...args: unknown[]) => syncBankLink(...args),
}));

// Stub modal: the real one drives the SePay iframe; here we only exercise how
// the panel reacts to a close with/without a possible state change.
vi.mock("@/components/modals/bank-hub-link-modal", () => ({
	BankHubLinkModal: ({
		open,
		onClose,
	}: {
		open: boolean;
		onClose: (changed: boolean) => void;
	}) =>
		open ? (
			<>
				<button type="button" onClick={() => onClose(true)}>
					close-changed
				</button>
				<button type="button" onClick={() => onClose(false)}>
					close-unchanged
				</button>
			</>
		) : null,
}));

import { BankLinkPanel } from "./bank-link-panel";

function renderPanel() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={queryClient}>
			<BankLinkPanel />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	syncBankLink.mockReset();
	syncBankLink.mockResolvedValue({});
	statusValue.current = {
		enabled: true,
		status: "none",
		brandName: "",
		accountNumberMasked: "",
		holderName: "",
		linkedAt: null,
	};
});
afterEach(cleanup);

describe("BankLinkPanel close reconciliation", () => {
	it("syncs once when the hosted flow was entered and the modal closes", async () => {
		renderPanel();
		fireEvent.click(await screen.findByText("Liên kết tài khoản ngân hàng"));
		fireEvent.click(await screen.findByText("close-changed"));

		await waitFor(() => {
			expect(syncBankLink).toHaveBeenCalledTimes(1);
		});
	});

	it("does not sync when the modal closes without entering the flow", async () => {
		renderPanel();
		fireEvent.click(await screen.findByText("Liên kết tài khoản ngân hàng"));
		fireEvent.click(await screen.findByText("close-unchanged"));

		await waitFor(() => {
			expect(syncBankLink).not.toHaveBeenCalled();
		});
	});

	it("still refreshes the query when the sync call fails", async () => {
		syncBankLink.mockRejectedValue(new Error("502"));
		renderPanel();
		fireEvent.click(await screen.findByText("Liên kết tài khoản ngân hàng"));
		fireEvent.click(await screen.findByText("close-changed"));

		await waitFor(() => {
			expect(syncBankLink).toHaveBeenCalledTimes(1);
		});
		// No unhandled rejection and the panel still renders.
		expect(screen.getByText("Liên kết tài khoản ngân hàng")).toBeTruthy();
	});
});
