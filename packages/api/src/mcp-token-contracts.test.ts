import { describe, expect, test } from "vitest";
import {
	MCP_TOKEN_EXPIRY_DAYS,
	MCP_TOKEN_MAX_ACTIVE,
	MCP_TOKEN_PREFIX,
	mcpTokenCreateResponseSchema,
	mcpTokenCreateSchema,
	mcpTokenListResponseSchema,
	mcpTokenRevokeResponseSchema,
} from "./mcp-token-contracts";

describe("mcpTokenCreateSchema", () => {
	test("trims name and defaults expiresInDays to 90", () => {
		const parsed = mcpTokenCreateSchema.safeParse({ name: "  MacBook Pro  " });
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data).toEqual({
				name: "MacBook Pro",
				expiresInDays: 90,
			});
		}
	});

	test("accepts allowed expiry presets and null (no expiry)", () => {
		for (const days of [...MCP_TOKEN_EXPIRY_DAYS, null]) {
			expect(
				mcpTokenCreateSchema.safeParse({
					name: "Device",
					expiresInDays: days,
				}).success,
			).toBe(true);
		}
		expect(
			mcpTokenCreateSchema.safeParse({ name: "Device", expiresInDays: 7 })
				.success,
		).toBe(false);
	});

	test("rejects empty, overly long names, and unknown fields", () => {
		expect(mcpTokenCreateSchema.safeParse({ name: "   " }).success).toBe(false);
		expect(
			mcpTokenCreateSchema.safeParse({ name: "a".repeat(81) }).success,
		).toBe(false);
		expect(
			mcpTokenCreateSchema.safeParse({ name: "a".repeat(80) }).success,
		).toBe(true);
		expect(
			mcpTokenCreateSchema.safeParse({ name: "Device", extra: true }).success,
		).toBe(false);
	});
});

describe("mcpToken response contracts", () => {
	test("validates list, create, and revoke wire shapes", () => {
		const summary = {
			id: "tok_1",
			name: "MacBook",
			tokenPrefix: `${MCP_TOKEN_PREFIX}abcd12`,
			createdAt: "2026-11-27T06:00:00.000Z",
			lastUsedAt: null,
			expiresAt: "2027-02-25T06:00:00.000Z",
			revokedAt: null,
		};
		expect(
			mcpTokenListResponseSchema.parse({
				tokens: [summary],
				maxActiveTokens: MCP_TOKEN_MAX_ACTIVE,
				mcpPath: "/mcp",
			}).mcpPath,
		).toBe("/mcp");
		expect(
			mcpTokenCreateResponseSchema.parse({
				token: summary,
				rawToken: `${MCP_TOKEN_PREFIX}secret`,
			}).rawToken,
		).toBe(`${MCP_TOKEN_PREFIX}secret`);
		expect(
			mcpTokenRevokeResponseSchema.parse({
				id: "tok_1",
				revokedAt: "2026-11-27T06:10:00.000Z",
			}).id,
		).toBe("tok_1");
	});
});
