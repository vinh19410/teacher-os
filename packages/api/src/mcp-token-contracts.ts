import { z } from "zod";

export const MCP_TOKEN_MAX_ACTIVE = 10;
export const MCP_TOKEN_PREFIX = "tos_mcp_";
export const MCP_TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;

export const MCP_TOKEN_ERROR_CODES = {
	LIMIT_REACHED: "MCP_TOKEN_LIMIT_REACHED",
	NOT_FOUND: "MCP_TOKEN_NOT_FOUND",
} as const;

export const mcpTokenCreateSchema = z
	.object({
		name: z.string().trim().min(1).max(80),
		expiresInDays: z
			.union([z.literal(30), z.literal(90), z.literal(365), z.null()])
			.default(90),
	})
	.strict();
export type McpTokenCreate = z.infer<typeof mcpTokenCreateSchema>;

export const mcpTokenSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	tokenPrefix: z.string(),
	createdAt: z.string(),
	lastUsedAt: z.string().nullable(),
	expiresAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
});
export type McpTokenSummary = z.infer<typeof mcpTokenSummarySchema>;

export const mcpTokenListResponseSchema = z.object({
	tokens: z.array(mcpTokenSummarySchema),
	maxActiveTokens: z.number().int(),
	mcpPath: z.literal("/mcp"),
});
export type McpTokenListResponse = z.infer<typeof mcpTokenListResponseSchema>;

export const mcpTokenCreateResponseSchema = z.object({
	token: mcpTokenSummarySchema,
	rawToken: z.string().min(1),
});
export type McpTokenCreateResponse = z.infer<
	typeof mcpTokenCreateResponseSchema
>;

export const mcpTokenRevokeResponseSchema = z.object({
	id: z.string(),
	revokedAt: z.string(),
});
export type McpTokenRevokeResponse = z.infer<
	typeof mcpTokenRevokeResponseSchema
>;
