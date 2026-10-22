import { env } from "@teacher-os/env/web";
// Cùng một cơ chế resolve server URL với auth-client (export từ đó để hai
// module không drift).
import { getServerUrl } from "@/lib/auth-client";
import { HttpError } from "@/lib/query-client";

/**
 * Fetch JSON tới API server (cookie session, `credentials: include`).
 * Response không ok → ném `HttpError` với status và `code` trong body
 * (requireAdmin trả `{ error, code }` — dùng cho mapping guard admin).
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
	const base = getServerUrl(env.VITE_SERVER_URL);
	const res = await fetch(`${base}${path}`, {
		credentials: "include",
		...init,
		headers: {
			accept: "application/json",
			...(init?.headers ?? {}),
		},
	});
	if (!res.ok) {
		let code: string | undefined;
		try {
			const body: unknown = await res.json();
			if (
				body &&
				typeof body === "object" &&
				"code" in body &&
				typeof body.code === "string"
			) {
				code = body.code;
			}
		} catch {
			// body không phải JSON — bỏ qua, vẫn ném theo status
		}
		throw new HttpError(res.status, `API ${res.status} ${path}`, { code });
	}
	return (await res.json()) as T;
}

/** `{email, name}` trả về từ `GET /api/admin/me` (requireAdmin, phase 3). */
export interface AdminMe {
	email: string;
	name: string;
}
