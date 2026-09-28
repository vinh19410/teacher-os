export type AppRole = "teacher" | "student";

/**
 * State key stamped server-side into the OAuth `additionalData` (verification
 * table) at `/sign-in/social` initiation so the `/callback/:id` request — which
 * carries no Origin header on top-level GET navigation — can still resolve the
 * originating app (plan #260 D5).
 */
export const OAUTH_APP_STATE_KEY = "app";

/** DB role column → AppRole. NULL/unknown falls back to teacher (defensive for
 * out-of-band rows; migration 0024 guarantees no NULL rows after backfill). */
export function resolveUserRole(role: string | null | undefined): AppRole {
	return role === "student" ? "student" : "teacher";
}

function matchOrigin(origin: string, known: string[]): boolean {
	const normalized = origin.trim().toLowerCase();
	return (
		normalized.length > 0 &&
		normalized !== "null" &&
		known.some((o) => o.trim().toLowerCase() === normalized)
	);
}

/**
 * App nguồn của request sign-up/session. Chỉ origin khớp CHÍNH XÁC một origin
 * đã biết mới đáng tin; origin lạ / chuỗi "null" / thiếu → rơi về oauthApp
 * (server-side stamp), cuối cùng mặc định "student" (least privilege — không
 * bao giờ default teacher với tín hiệu không tin cậy, plan #260 D3).
 */
export function resolveRequestApp(input: {
	origin: string | null | undefined;
	oauthApp?: string | null;
	studentOrigins: string[];
	teacherOrigins: string[];
}): AppRole {
	// matchOrigin tự loại origin rỗng/"null", nên null|undefined chỉ cần về "".
	const origin = input.origin ?? "";
	if (matchOrigin(origin, input.studentOrigins)) {
		return "student";
	}
	if (matchOrigin(origin, input.teacherOrigins)) {
		return "teacher";
	}
	if (input.oauthApp === "teacher" || input.oauthApp === "student") {
		return input.oauthApp;
	}
	return "student";
}
