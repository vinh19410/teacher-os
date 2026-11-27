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

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/repos/api-base-url", () => ({
	getApiBaseUrl: () => "https://api.staging.teacheros.io.vn",
}));

const repo = vi.hoisted(() => ({
	fetchMcpTokens: vi.fn(),
	createMcpTokenRequest: vi.fn(),
	revokeMcpTokenRequest: vi.fn(),
}));

vi.mock("@/lib/repos/mcp-tokens", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/repos/mcp-tokens")>();
	return {
		...actual,
		fetchMcpTokens: repo.fetchMcpTokens,
		mcpTokensQueryOptions: (baseUrl?: string) => ({
			queryKey: actual.mcpTokensQueryKey,
			queryFn: ({ signal }: { signal?: AbortSignal }) =>
				repo.fetchMcpTokens(baseUrl, signal),
		}),
		createMcpTokenRequest: repo.createMcpTokenRequest,
		revokeMcpTokenRequest: repo.revokeMcpTokenRequest,
	};
});

import { McpTokenCard } from "./mcp-token-card";

function renderCard() {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={qc}>
			<McpTokenCard />
		</QueryClientProvider>,
	);
}

const SAMPLE_TOKEN = {
	id: "tok-1",
	name: "MacBook Cô Mỹ",
	tokenPrefix: "tos_mcp_abc123",
	createdAt: "2026-11-27T06:00:00.000Z",
	lastUsedAt: null,
	expiresAt: "2027-02-25T06:00:00.000Z",
	revokedAt: null,
};

beforeEach(() => {
	toast.success.mockReset();
	toast.error.mockReset();
	repo.fetchMcpTokens.mockReset().mockResolvedValue({
		tokens: [SAMPLE_TOKEN],
		maxActiveTokens: 10,
		mcpPath: "/mcp",
	});
	repo.createMcpTokenRequest.mockReset();
	repo.revokeMcpTokenRequest.mockReset();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("McpTokenCard", () => {
	it("renders active tokens and creates a new masked token with one-click JSON copy", async () => {
		const writeText = vi.fn(async (_text: string) => {});
		Object.assign(navigator, { clipboard: { writeText } });

		const rawToken = "tos_mcp_abc123SECRET_TOKEN_VALUE_XYZ";
		repo.createMcpTokenRequest.mockResolvedValue({
			token: { ...SAMPLE_TOKEN, id: "tok-2", name: "iMac lớp học" },
			rawToken,
		});

		renderCard();
		expect(await screen.findByText("MacBook Cô Mỹ")).toBeTruthy();

		fireEvent.change(screen.getByTestId("mcp-token-name-input"), {
			target: { value: "  iMac lớp học  " },
		});
		fireEvent.change(screen.getByTestId("mcp-token-expiry-select"), {
			target: { value: "365" },
		});
		fireEvent.click(screen.getByTestId("mcp-token-create-btn"));

		await waitFor(() =>
			expect(repo.createMcpTokenRequest).toHaveBeenCalledWith(
				{ name: "iMac lớp học", expiresInDays: 365 },
				"https://api.staging.teacheros.io.vn",
			),
		);

		// Secret is masked by default on screen
		expect(
			screen.getByTestId("mcp-token-secret-value").textContent,
		).not.toContain(rawToken);
		expect(
			screen.getByTestId("mcp-token-config-preview").textContent,
		).not.toContain(rawToken);

		// Copy JSON still copies the real raw token
		fireEvent.click(screen.getByTestId("mcp-token-copy-json"));
		await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
		expect(writeText.mock.calls[0]?.[0]).toContain(rawToken);
		expect(writeText.mock.calls[0]?.[0]).toContain(
			"https://api.staging.teacheros.io.vn/mcp",
		);

		// Reveal toggle shows raw token, dismiss clears it from DOM
		fireEvent.click(screen.getByTestId("mcp-token-toggle-reveal"));
		expect(screen.getByTestId("mcp-token-secret-value").textContent).toBe(
			rawToken,
		);
		fireEvent.click(screen.getByTestId("mcp-token-dismiss-secret"));
		expect(screen.queryByTestId("mcp-token-reveal-panel")).toBeNull();
	});

	it("requires two-step confirmation before revoking a token", async () => {
		repo.revokeMcpTokenRequest.mockResolvedValue({
			id: "tok-1",
			revokedAt: "2026-11-27T07:00:00.000Z",
		});

		renderCard();
		const revokeBtn = await screen.findByTestId("mcp-token-revoke-tok-1");
		fireEvent.click(revokeBtn);
		expect(repo.revokeMcpTokenRequest).not.toHaveBeenCalled();

		fireEvent.click(screen.getByTestId("mcp-token-confirm-revoke-tok-1"));
		await waitFor(() =>
			expect(repo.revokeMcpTokenRequest).toHaveBeenCalledWith(
				"tok-1",
				"https://api.staging.teacheros.io.vn",
			),
		);
		expect(toast.success).toHaveBeenCalledWith("Đã thu hồi mã kết nối");
	});

	it("disables creation when active token limit is reached", async () => {
		repo.fetchMcpTokens.mockResolvedValue({
			tokens: Array.from({ length: 10 }, (_, idx) => ({
				...SAMPLE_TOKEN,
				id: `tok-${idx}`,
				name: `Device ${idx}`,
			})),
			maxActiveTokens: 10,
			mcpPath: "/mcp",
		});

		renderCard();
		expect(await screen.findByText("10/10 mã")).toBeTruthy();
		expect(
			(screen.getByTestId("mcp-token-create-btn") as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
