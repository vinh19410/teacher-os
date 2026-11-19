import {
	GOOGLE_MEET_ERROR_CODES,
	GOOGLE_MEET_SCOPES,
	type GoogleIntegrationStatus,
} from "@teacher-os/api/contracts";

export { GOOGLE_MEET_SCOPES };

import { account, user } from "@teacher-os/db/schema/auth";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../app";

export type FetchFn = typeof fetch;

export class GoogleIntegrationError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, message: string, status = 400) {
		super(message);
		this.name = "GoogleIntegrationError";
		this.code = code;
		this.status = status;
	}
}

export function parseAccountScopes(raw: string | null | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export function hasRequiredGoogleMeetScopes(scopes: string[]): boolean {
	const set = new Set(scopes);
	return GOOGLE_MEET_SCOPES.every((required) => set.has(required));
}

export async function getGoogleIntegrationStatus(
	db: Db,
	userId: string,
): Promise<GoogleIntegrationStatus> {
	const [row] = await db
		.select({
			scope: account.scope,
			refreshToken: account.refreshToken,
			email: user.email,
		})
		.from(account)
		.innerJoin(user, eq(account.userId, user.id))
		.where(and(eq(account.userId, userId), eq(account.providerId, "google")))
		.limit(1);

	if (!row) {
		return {
			linked: false,
			hasMeetScopes: false,
			hasRefreshToken: false,
			scopes: [],
			email: null,
		};
	}

	const scopes = parseAccountScopes(row.scope);
	return {
		linked: true,
		hasMeetScopes: hasRequiredGoogleMeetScopes(scopes),
		hasRefreshToken: Boolean(row.refreshToken && row.refreshToken.length > 0),
		scopes,
		email: row.email,
	};
}

interface GoogleTokenRefreshResponse {
	access_token?: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
	error?: string;
	error_description?: string;
}

const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60_000;

export async function getValidGoogleAccessToken(
	db: Db,
	input: {
		userId: string;
		clientId: string;
		clientSecret: string;
		fetchFn?: FetchFn;
		nowMs?: number;
	},
): Promise<string> {
	const fetchFn = input.fetchFn ?? fetch;
	const nowMs = input.nowMs ?? Date.now();

	const [row] = await db
		.select({
			id: account.id,
			accessToken: account.accessToken,
			refreshToken: account.refreshToken,
			accessTokenExpiresAt: account.accessTokenExpiresAt,
			scope: account.scope,
		})
		.from(account)
		.where(
			and(eq(account.userId, input.userId), eq(account.providerId, "google")),
		)
		.limit(1);

	if (!row) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.NOT_CONNECTED,
			"Tài khoản chưa liên kết Google. Vui lòng kết nối Google tại trang Hồ sơ.",
			412,
		);
	}

	const scopes = parseAccountScopes(row.scope);
	if (!hasRequiredGoogleMeetScopes(scopes)) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.INSUFFICIENT_SCOPES,
			"Tài khoản Google chưa cấp đủ quyền Calendar, Meet và Drive. Vui lòng cấp lại quyền tại trang Hồ sơ.",
			412,
		);
	}

	const expiresAtMs = row.accessTokenExpiresAt?.getTime() ?? 0;
	if (row.accessToken && expiresAtMs > nowMs + ACCESS_TOKEN_EXPIRY_BUFFER_MS) {
		return row.accessToken;
	}

	if (!row.refreshToken) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.REAUTH_REQUIRED,
			"Phiên Google đã hết hạn (thiếu refresh token). Vui lòng kết nối lại Google tại trang Hồ sơ.",
			412,
		);
	}

	if (!input.clientId || !input.clientSecret) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.API_ERROR,
			"Server chưa cấu hình Google OAuth client.",
			503,
		);
	}

	const body = new URLSearchParams({
		client_id: input.clientId,
		client_secret: input.clientSecret,
		refresh_token: row.refreshToken,
		grant_type: "refresh_token",
	});

	const res = await fetchFn("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});

	const payload = (await res
		.json()
		.catch(() => ({}))) as GoogleTokenRefreshResponse;

	if (!res.ok || !payload.access_token) {
		const isInvalidGrant =
			payload.error === "invalid_grant" ||
			res.status === 400 ||
			res.status === 401;
		if (payload.error === "invalid_grant") {
			await db
				.update(account)
				.set({
					accessToken: null,
					refreshToken: null,
					accessTokenExpiresAt: null,
				})
				.where(eq(account.id, row.id));
		}
		throw new GoogleIntegrationError(
			isInvalidGrant
				? GOOGLE_MEET_ERROR_CODES.REAUTH_REQUIRED
				: GOOGLE_MEET_ERROR_CODES.API_ERROR,
			isInvalidGrant
				? "Quyền Google đã hết hạn hoặc bị thu hồi. Vui lòng kết nối lại Google tại trang Hồ sơ."
				: `Không làm mới được token Google (${res.status}).`,
			isInvalidGrant ? 412 : 502,
		);
	}

	const nextExpiresAt = new Date(
		nowMs +
			(typeof payload.expires_in === "number" ? payload.expires_in : 3600) *
				1000,
	);
	await db
		.update(account)
		.set({
			accessToken: payload.access_token,
			accessTokenExpiresAt: nextExpiresAt,
			...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
			...(payload.scope ? { scope: payload.scope } : {}),
		})
		.where(eq(account.id, row.id));

	return payload.access_token;
}
