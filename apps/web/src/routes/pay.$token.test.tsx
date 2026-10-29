// @vitest-environment jsdom

import type { PublicPayView } from "@teacher-os/api/contracts";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: { component: ComponentType }) => ({
		options,
		useParams: () => ({ token: "tok-1" }),
	}),
}));
vi.mock("@teacher-os/env/web", () => ({
	env: { VITE_SERVER_URL: "http://api.test" },
}));
vi.mock("@/lib/auth-client", () => ({
	getServerUrl: (url: string) => url,
}));
vi.mock("@teacher-os/ui/components/payments/payment-qr-panel", () => ({
	PaymentQrPanel: ({ data }: { data: PublicPayView }) => (
		<div>{data.payable ? "QR: chờ thanh toán" : "QR: đã thu"}</div>
	),
}));

import { Route } from "./pay.$token";

const PayRoute = (Route as unknown as { options: { component: ComponentType } })
	.options.component;

function view(payable: boolean): PublicPayView {
	return { orgName: "Lớp cô Hoa", studentName: "Bé An", payable } as never;
}
const ok = (body: unknown) =>
	Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

const fetchMock = vi.fn<typeof fetch>();
let hidden = false;

async function advance(ms: number) {
	await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
	vi.useFakeTimers();
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	hidden = false;
	Object.defineProperty(document, "hidden", {
		configurable: true,
		get: () => hidden,
	});
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("/pay/$token (#329 M5)", () => {
	it("stops polling once the invoice is no longer payable", async () => {
		fetchMock
			.mockImplementationOnce(() => ok(view(true)))
			.mockImplementation(() => ok(view(false)));
		render(<PayRoute />);
		await advance(0);
		expect(screen.getByText("QR: chờ thanh toán")).toBeTruthy();

		await advance(5000);
		expect(screen.getByText("QR: đã thu")).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledTimes(2);

		await advance(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("a network error after a good load keeps the page, not 'revoked'", async () => {
		fetchMock
			.mockImplementationOnce(() => ok(view(true)))
			.mockImplementation(() => Promise.reject(new TypeError("offline")));
		render(<PayRoute />);
		await advance(0);
		await advance(5000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(screen.getByText("QR: chờ thanh toán")).toBeTruthy();
		expect(screen.queryByText(/đã bị thu hồi/)).toBeNull();
	});

	it("a network error on first load offers a retry, not 'revoked'", async () => {
		fetchMock.mockImplementation(() =>
			Promise.reject(new TypeError("offline")),
		);
		render(<PayRoute />);
		await advance(0);
		expect(screen.queryByText(/đã bị thu hồi/)).toBeNull();
		expect(screen.getByText(/Không tải được trang thanh toán/)).toBeTruthy();
	});

	it("404 says the link is gone", async () => {
		fetchMock.mockImplementation(() =>
			Promise.resolve(new Response("{}", { status: 404 })),
		);
		render(<PayRoute />);
		await advance(0);
		expect(screen.getByText(/đã bị thu hồi/)).toBeTruthy();
	});

	it("resumes polling when the parent returns from the banking app", async () => {
		fetchMock
			.mockImplementationOnce(() => ok(view(true)))
			.mockImplementation(() => ok(view(true)));
		render(<PayRoute />);
		await advance(0);
		hidden = true;
		await advance(30_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		hidden = false;
		await advance(5000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
