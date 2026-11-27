import { afterEach, describe, expect, test, vi } from "vitest";
import {
	buildClaudeDesktopConfigJson,
	createMcpTokenRequest,
	fetchMcpTokens,
	McpTokenRequestError,
	revokeMcpTokenRequest,
} from "./mcp-tokens";

function jsonRes(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

const TOKEN_SUMMARY = {
	id: "tok_1",
	name: "MacBook Cô Mỹ",
	tokenPrefix: "tos_mcp_123456",
	createdAt: "2026-11-27T06:00:00.000Z",
	lastUsedAt: null,
	expiresAt: "2027-02-25T06:00:00.000Z",
	revokedAt: null,
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("mcp-tokens repo", () => {
	test("fetchMcpTokens parses token list response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonRes({
					tokens: [TOKEN_SUMMARY],
					maxActiveTokens: 10,
					mcpPath: "/mcp",
				}),
			),
		);
		const res = await fetchMcpTokens("https://api.staging.teacheros.io.vn");
		expect(res.tokens).toHaveLength(1);
		expect(res.mcpPath).toBe("/mcp");
	});

	test("createMcpTokenRequest posts payload and surfaces limit error code", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonRes(
					{ token: TOKEN_SUMMARY, rawToken: "tos_mcp_secret_value" },
					201,
				),
			),
		);
		const created = await createMcpTokenRequest(
			{ name: "MacBook", expiresInDays: 90 },
			"https://api.test",
		);
		expect(created.rawToken).toBe("tos_mcp_secret_value");

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonRes({ code: "MCP_TOKEN_LIMIT_REACHED" }, 409)),
		);
		const err = await createMcpTokenRequest(
			{ name: "Extra", expiresInDays: 90 },
			"https://api.test",
		).catch((e) => e);
		expect(err).toBeInstanceOf(McpTokenRequestError);
		expect((err as McpTokenRequestError).code).toBe("MCP_TOKEN_LIMIT_REACHED");
	});

	test("revokeMcpTokenRequest sends DELETE and parses response", async () => {
		const fetchMock = vi.fn(async () =>
			jsonRes({ id: "tok_1", revokedAt: "2026-11-27T06:30:00.000Z" }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const res = await revokeMcpTokenRequest("tok_1", "https://api.test");
		expect(res.id).toBe("tok_1");
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe("https://api.test/api/mcp-tokens/tok_1");
		expect(init.method).toBe("DELETE");
	});

	test("buildClaudeDesktopConfigJson trims trailing slashes and formats mcp-remote config", () => {
		const json = buildClaudeDesktopConfigJson(
			"https://api.staging.teacheros.io.vn///",
			"tos_mcp_abc123",
		);
		const parsed = JSON.parse(json) as {
			mcpServers: {
				"teacher-os": { command: string; args: string[] };
			};
		};
		expect(parsed.mcpServers["teacher-os"]).toEqual({
			command: "npx",
			args: [
				"-y",
				"mcp-remote",
				"https://api.staging.teacheros.io.vn/mcp",
				"--header",
				"Authorization:Bearer tos_mcp_abc123",
			],
		});
	});
});
