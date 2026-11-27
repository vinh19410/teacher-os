import { queryOptions } from "@tanstack/react-query";
import {
	type McpTokenCreate,
	type McpTokenCreateResponse,
	type McpTokenListResponse,
	type McpTokenRevokeResponse,
	mcpTokenCreateResponseSchema,
	mcpTokenListResponseSchema,
	mcpTokenRevokeResponseSchema,
} from "@teacher-os/api/mcp-token-contracts";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";

export const mcpTokensQueryKey = ["mcp-tokens"] as const;

export class McpTokenRequestError extends Error {
	readonly code: string;
	readonly status: number;
	constructor(code: string, status: number) {
		super(code);
		this.name = "McpTokenRequestError";
		this.code = code;
		this.status = status;
	}
}

async function parseError(res: Response): Promise<never> {
	let code = `HTTP_${res.status}`;
	try {
		const body = (await res.json()) as { code?: unknown };
		if (typeof body.code === "string" && body.code) {
			code = body.code;
		}
	} catch {
		// keep status-based code
	}
	throw new McpTokenRequestError(code, res.status);
}

export async function fetchMcpTokens(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<McpTokenListResponse> {
	const res = await fetch(`${baseUrl}/api/mcp-tokens`, {
		credentials: "include",
		signal,
	});
	if (!res.ok) await parseError(res);
	return mcpTokenListResponseSchema.parse(await res.json());
}

export function mcpTokensQueryOptions(baseUrl: string = getApiBaseUrl()) {
	return queryOptions({
		queryKey: mcpTokensQueryKey,
		queryFn: ({ signal }) => fetchMcpTokens(baseUrl, signal),
	});
}

export async function createMcpTokenRequest(
	input: McpTokenCreate,
	baseUrl: string = getApiBaseUrl(),
): Promise<McpTokenCreateResponse> {
	const res = await fetch(`${baseUrl}/api/mcp-tokens`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify(input),
	});
	if (!res.ok) await parseError(res);
	return mcpTokenCreateResponseSchema.parse(await res.json());
}

export async function revokeMcpTokenRequest(
	tokenId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<McpTokenRevokeResponse> {
	const res = await fetch(
		`${baseUrl}/api/mcp-tokens/${encodeURIComponent(tokenId)}`,
		{
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		},
	);
	if (!res.ok) await parseError(res);
	return mcpTokenRevokeResponseSchema.parse(await res.json());
}

export function buildClaudeDesktopConfigJson(
	apiBaseUrl: string,
	token: string,
): string {
	const normalizedBase = apiBaseUrl.trim().replace(/\/+$/, "");
	const mcpUrl = `${normalizedBase}/mcp`;
	return JSON.stringify(
		{
			mcpServers: {
				"teacher-os": {
					command: "npx",
					args: [
						"-y",
						"mcp-remote",
						mcpUrl,
						"--header",
						`Authorization:Bearer ${token}`,
					],
				},
			},
		},
		null,
		2,
	);
}
