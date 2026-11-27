const RESET_TOKEN_PATH = /(\/api\/auth\/reset-password\/)[^?\s]+/g;
// #320: the public pay token is a capability — never let it reach logs.
const PAY_TOKEN_PATH = /(\/pay\/)[A-Za-z0-9_-]{10,}/g;
// Remote MCP personal access tokens — never let raw tokens reach logs.
const MCP_TOKEN_VALUE = /\btos_mcp_[A-Za-z0-9_-]{8,}/g;

export function redactResetToken(line: string): string {
	return line
		.replace(RESET_TOKEN_PATH, "$1[redacted]")
		.replace(PAY_TOKEN_PATH, "$1[redacted]")
		.replace(MCP_TOKEN_VALUE, "tos_mcp_[redacted]");
}
