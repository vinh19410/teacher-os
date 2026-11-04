export interface PortalLocation {
	hostname?: string;
	protocol?: string;
	port?: string;
}

/**
 * Suy luận URL của cổng giáo viên (web app) dựa trên topology:
 * - Khi đang ở `student.<domain>` -> chuyển sang `app.<domain>`.
 * - Khi ở `localhost` hoặc `127.0.0.1`:
 *   - port `8003` (dev portal) -> `8001` (dev web).
 *   - port `8103` (e2e/verify portal) -> `8101` (e2e/verify web).
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

	// student.<domain> -> app.<domain>
	if (hostname.startsWith("student.")) {
		const appHost = hostname.replace(/^student\./, "app.");
		const portSuffix = current.port ? `:${current.port}` : "";
		return `${protocol}://${appHost}${portSuffix}`;
	}

	// Localhost hoặc loopback
	if (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "::1"
	) {
		const port = current.port ?? "";
		if (port === "8003") {
			return `${protocol}://${hostname}:8001`;
		}
		if (port === "8103") {
			return `${protocol}://${hostname}:8101`;
		}
		return undefined;
	}

	return undefined;
}
