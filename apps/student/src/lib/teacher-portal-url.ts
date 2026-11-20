export interface PortalLocation {
	hostname?: string;
	protocol?: string;
	port?: string;
}

/**
 * Suy luận URL của cổng giáo viên (web app) dựa trên topology:
 * - Khi đang ở domain hợp nhất `lms.<domain>` -> `${protocol}://${host}/teacher`.
 * - Khi đang ở alias cũ `student.<domain>` -> `${protocol}://lms.<domain>${port}/teacher`.
 * - Khi ở `localhost` hoặc loopback (`127.0.0.1`, `[::1]`, `::1`):
 *   - port `8001` (unified dev) hoặc `8003` (dev student) -> `:8001/teacher`.
 *   - port `8101` (unified e2e) hoặc `8103` (e2e student) -> `:8101/teacher`.
 * - Trả về `undefined` với các host/port không nhận diện được (ví dụ deploy preview workers.dev, localhost port lạ)
 *   để tránh sinh link hỏng.
 */
export function getTeacherPortalUrl(
	loc?: PortalLocation | Location,
): string | undefined {
	const current =
		loc ??
		(typeof window !== "undefined" && window.location
			? window.location
			: undefined);

	if (!current) {
		return undefined;
	}

	const hostname = current.hostname?.trim().toLowerCase();
	if (!hostname) {
		return undefined;
	}

	const protocol = current.protocol
		? current.protocol.replace(/:$/, "")
		: "http";
	const portSuffix = current.port ? `:${current.port}` : "";

	// Domain hợp nhất lms.<domain> -> cùng origin + /teacher
	if (hostname.startsWith("lms.")) {
		return `${protocol}://${hostname}${portSuffix}/teacher`;
	}

	// Alias cũ student.<domain> -> lms.<domain>/teacher
	if (hostname.startsWith("student.")) {
		const lmsHost = hostname.replace(/^student\./, "lms.");
		return `${protocol}://${lmsHost}${portSuffix}/teacher`;
	}

	// Localhost hoặc loopback
	if (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "::1"
	) {
		const port = current.port ?? "";
		if (port === "8001" || port === "8003") {
			return `${protocol}://${hostname}:8001/teacher`;
		}
		if (port === "8101" || port === "8103") {
			return `${protocol}://${hostname}:8101/teacher`;
		}
		return undefined;
	}

	return undefined;
}
