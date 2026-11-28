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

const { saveBankLink, removeBankLink, statusValue } = vi.hoisted(() => ({
	saveBankLink: vi.fn(),
	removeBankLink: vi.fn(),
	statusValue: { current: null as unknown },
}));

vi.mock("@/lib/repos/api-base-url", () => ({
	getApiBaseUrl: () => "",
}));

vi.mock("@/lib/repos/bank-link", async () => {
	const actual = await vi.importActual<typeof import("@/lib/repos/bank-link")>(
		"@/lib/repos/bank-link",
	);
	return {
		...actual,
		bankLinkQueryKey: ["bank-link"] as const,
		bankLinkQueryOptions: () => ({
			queryKey: ["bank-link"],
			queryFn: () => statusValue.current,
		}),
		saveBankLink: (...args: unknown[]) => saveBankLink(...args),
		removeBankLink: (...args: unknown[]) => removeBankLink(...args),
	};
});

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
	saveBankLink.mockReset();
	removeBankLink.mockReset();
	statusValue.current = {
		enabled: true,
		reconcileEnabled: true,
		status: "none",
		brandName: "",
		bankBin: "",
		bankCode: "",
		accountNumber: "",
		accountNumberMasked: "",
		vaCode: "",
		holderName: "",
		linkedAt: null,
	};
});
afterEach(cleanup);

describe("BankLinkPanel", () => {
	it("shows 'Chưa bật' badge when SePay is disabled", async () => {
		statusValue.current = {
			enabled: false,
			reconcileEnabled: false,
			status: "none",
			brandName: "",
			bankBin: "",
			bankCode: "",
			accountNumber: "",
			accountNumberMasked: "",
			vaCode: "",
			holderName: "",
			linkedAt: null,
		};
		renderPanel();
		expect(await screen.findByText("Chưa bật")).toBeTruthy();
	});

	it("validates and saves bank account with TKP VA preview via saveBankLink", async () => {
		const linkedStatus = {
			enabled: true,
			reconcileEnabled: true,
			status: "linked",
			brandName: "MBBank",
			bankBin: "970422",
			bankCode: "MB",
			accountNumber: "0123456789",
			accountNumberMasked: "•••6789",
			vaCode: "MMY",
			holderName: "NGUYEN THI MY",
			linkedAt: "2026-11-27T00:00:00.000Z",
		};
		saveBankLink.mockImplementation(async () => {
			statusValue.current = linkedStatus;
			return linkedStatus;
		});
		renderPanel();

		fireEvent.change(await screen.findByTestId("bank-bin-select"), {
			target: { value: "970422" },
		});
		fireEvent.change(screen.getByTestId("bank-account-number"), {
			target: { value: "0123 456 789" },
		});
		fireEvent.change(screen.getByTestId("bank-va-code"), {
			target: { value: "mmy" },
		});
		expect(screen.getByTestId("bank-va-preview").textContent).toContain(
			"TKPMMY MSMY7K2M9QXA",
		);
		fireEvent.change(screen.getByTestId("bank-holder-name"), {
			target: { value: "NGUYEN THI MY" },
		});
		fireEvent.click(screen.getByTestId("bank-link-submit"));

		await waitFor(() => {
			expect(saveBankLink).toHaveBeenCalledWith(
				{
					bankBin: "970422",
					accountNumber: "0123456789",
					vaCode: "MMY",
					holderName: "NGUYEN THI MY",
				},
				"",
			);
		});
		expect(await screen.findByText("Đã liên kết")).toBeTruthy();
		expect(screen.getByText("VA: TKPMMY")).toBeTruthy();
	});

	it("supports editing and removing an existing linked account", async () => {
		statusValue.current = {
			enabled: true,
			reconcileEnabled: true,
			status: "linked",
			brandName: "VietinBank",
			bankBin: "970415",
			bankCode: "ICB",
			accountNumber: "0123456789",
			accountNumberMasked: "•••6789",
			vaCode: "MMY",
			holderName: "NGUYEN THI MY",
			linkedAt: "2026-11-27T00:00:00.000Z",
		};
		const resetStatus = {
			enabled: true,
			reconcileEnabled: true,
			status: "none",
			brandName: "",
			bankBin: "",
			bankCode: "",
			accountNumber: "",
			accountNumberMasked: "",
			vaCode: "",
			holderName: "",
			linkedAt: null,
		};
		removeBankLink.mockImplementation(async () => {
			statusValue.current = resetStatus;
			return resetStatus;
		});
		renderPanel();

		fireEvent.click(await screen.findByText("Chỉnh sửa"));
		expect(
			(screen.getByTestId("bank-account-number") as HTMLInputElement).value,
		).toBe("0123456789");
		fireEvent.click(screen.getByText("Hủy"));

		fireEvent.click(await screen.findByText("Gỡ tài khoản"));
		fireEvent.click(await screen.findByText("Xác nhận gỡ"));

		await waitFor(() => {
			expect(removeBankLink).toHaveBeenCalledTimes(1);
		});
	});
});
