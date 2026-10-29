// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { syncBankLink, createBankLinkToken, statusValue } = vi.hoisted(() => ({
	syncBankLink: vi.fn(),
	createBankLinkToken: vi.fn(),
	statusValue: { current: null as unknown },
}));

vi.mock("@/lib/repos/api-base-url", () => ({
	getApiBaseUrl: () => "",
}));

vi.mock("@/lib/repos/bank-link", () => ({
	BankLinkRequestError: class extends Error {},
	bankLinkQueryKey: ["bank-link"] as const,
	bankLinkQueryOptions: () => ({
		queryKey: ["bank-link"],
		queryFn: () => statusValue.current,
	}),
	createBankLinkToken: (...args: unknown[]) => createBankLinkToken(...args),
	syncBankLink: (...args: unknown[]) => syncBankLink(...args),
}));

import type { BankLinkPurpose } from "@/components/payments/bank-link-panel";
import { BankHubLinkModal } from "./bank-hub-link-modal";

function status(value: "none" | "linked" | "inactive" | "unlinked") {
	return {
		enabled: true,
		status: value,
		brandName: value === "none" ? "" : "MBBank",
		accountNumberMasked: "•••6789",
		holderName: "",
		linkedAt: null,
	};
}

function renderModal(purpose: BankLinkPurpose) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	// The profile panel has already loaded the status before the modal opens.
	queryClient.setQueryData(["bank-link"], statusValue.current);
	const onClose = vi.fn();
	render(
		<QueryClientProvider client={queryClient}>
			<BankHubLinkModal open purpose={purpose} onClose={onClose} />
		</QueryClientProvider>,
	);
	return { queryClient, onClose };
}

async function serverReports(
	queryClient: QueryClient,
	value: Parameters<typeof status>[0],
) {
	statusValue.current = status(value);
	await act(() => queryClient.invalidateQueries({ queryKey: ["bank-link"] }));
}

beforeEach(() => {
	syncBankLink.mockReset();
	syncBankLink.mockResolvedValue({});
	createBankLinkToken.mockReset();
	createBankLinkToken.mockResolvedValue({
		hostedLinkUrl: "https://bankhub.sepay.vn/link/abc",
		expiresAt: "2026-10-29T03:00:00Z",
	});
});
afterEach(cleanup);

describe("BankHubLinkModal auto-close (#329 H1)", () => {
	it("unlink: stays open while the account is still linked, closes once it is gone", async () => {
		statusValue.current = status("linked");
		const { queryClient, onClose } = renderModal("unlink");

		expect(
			await screen.findByTitle(
				"Liên kết tài khoản ngân hàng qua SePay Bank Hub",
			),
		).toBeTruthy();
		await serverReports(queryClient, "linked");
		expect(onClose).not.toHaveBeenCalled();
		expect(createBankLinkToken).toHaveBeenCalledWith("unlink", "");

		await serverReports(queryClient, "unlinked");
		await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
		expect(syncBankLink).toHaveBeenCalled();
	});

	it("link: stays open while unlinked, closes once the server reports linked", async () => {
		statusValue.current = status("none");
		const { queryClient, onClose } = renderModal("link");

		await screen.findByTitle("Liên kết tài khoản ngân hàng qua SePay Bank Hub");
		expect(onClose).not.toHaveBeenCalled();

		await serverReports(queryClient, "linked");
		await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
	});

	it("reactivate: stays open while inactive, closes once linked again", async () => {
		statusValue.current = status("inactive");
		const { queryClient, onClose } = renderModal("reactivate");

		await screen.findByTitle("Liên kết tài khoản ngân hàng qua SePay Bank Hub");
		await serverReports(queryClient, "inactive");
		expect(onClose).not.toHaveBeenCalled();

		await serverReports(queryClient, "linked");
		await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
	});
});
