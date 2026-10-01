const RESET_TOKEN_PATH = /(\/api\/auth\/reset-password\/)[^?\s]+/g;

export function redactResetToken(line: string): string {
	return line.replace(RESET_TOKEN_PATH, "$1[redacted]");
}
