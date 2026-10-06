import { waitUntil } from "cloudflare:workers";
import { type Auth, type CreateAuthInput, createAuth } from "@teacher-os/auth";
import {
	createLogMailer,
	createResendMailer,
} from "@teacher-os/auth/mail/mailer";
import { createDb } from "@teacher-os/db";
import { env } from "@teacher-os/env/server";
import { buildApp, type Db, type MediaStore } from "./app";
import {
	type BankHubContext,
	createBankHubContext,
} from "./lib/bank-hub/bank-hub-client";
import { createR2MediaStore } from "./lib/r2-media-store";
import { getSessionUser } from "./session";

export function parseCORSOrigins(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

// Lazy so importing this module never touches bindings at eval time.
// Cast: drizzle's schema generic is invariant; Db keeps the route-facing surface.
let db: Db | undefined;
let auth: Auth | undefined;
let mediaStore: MediaStore | undefined;
let bankHub: BankHubContext | undefined;

// One memoized auth (sharing the memoized db) per isolate, still created
// lazily on the first request that needs it — never at module-eval time.
// Behavior note vs. the old construct-per-request code: better-auth's
// in-memory rate limiter is now actually effective (one persistent instance
// per isolate); bursts on /api/auth/* may see 429s they never saw before.
const getAuth = (): Auth => {
	if (!db) {
		db = createDb() as unknown as Db;
	}
	if (!auth) {
		if (env.MAILER_IMPL === "resend" && !env.RESEND_API_KEY) {
			throw new Error("RESEND_API_KEY is required when MAILER_IMPL=resend");
		}
		if (env.MAILER_IMPL !== "resend") {
			console.error(
				"[mail] MAILER is in LOG-ONLY mode — verification emails are NOT being sent. Set MAILER_IMPL=resend + RESEND_API_KEY to enable.",
			);
		}
		const mailer =
			env.MAILER_IMPL === "resend"
				? createResendMailer({
						apiKey: env.RESEND_API_KEY,
						from: env.MAIL_FROM,
					})
				: createLogMailer();
		auth = createAuth({
			db: db as unknown as CreateAuthInput["db"],
			corsOrigin: parseCORSOrigins(env.CORS_ORIGIN),
			studentOrigins: parseCORSOrigins(env.STUDENT_ORIGINS),
			secret: env.BETTER_AUTH_SECRET,
			baseURL: env.BETTER_AUTH_URL,
			...(env.COOKIE_DOMAIN ? { cookieDomain: env.COOKIE_DOMAIN } : {}),
			// Issue #125: stage-scoped cookie namespace for non-prod members of
			// the prod cookie zone (derived in infra topology); empty = default
			// better-auth names (prod/local posture).
			...(env.BETTER_AUTH_COOKIE_PREFIX
				? { cookiePrefix: env.BETTER_AUTH_COOKIE_PREFIX }
				: {}),
			googleClientId: env.GOOGLE_CLIENT_ID,
			googleClientSecret: env.GOOGLE_CLIENT_SECRET,
			mailer,
			runInBackground: (promise) => waitUntil(promise),
		});
	}
	return auth;
};

export default buildApp({
	getDb: () => (db ??= createDb() as unknown as Db),
	corsOrigin: parseCORSOrigins(env.CORS_ORIGIN),
	getSessionUser: (headers) => getSessionUser(getAuth(), headers),
	authHandler: (req) => getAuth().handler(req),
	// Binding MEDIA thiếu (deploy chưa tạo bucket) → undefined → route 503,
	// không phải TypeError 500.
	getMediaStore: () => {
		if (!env.MEDIA) return undefined;
		mediaStore ??= createR2MediaStore(env.MEDIA);
		return mediaStore;
	},
	// Thiếu bất kỳ secret Bank Hub nào (#320) → undefined → route ngân hàng
	// trả 503 BANKHUB_DISABLED; local/dev không cần cấu hình gì.
	getBankHub: () => {
		bankHub ??= createBankHubContext({
			clientId: env.SEPAY_BANKHUB_CLIENT_ID,
			clientSecret: env.SEPAY_BANKHUB_CLIENT_SECRET,
			ipnApiKey: env.SEPAY_BANKHUB_IPN_API_KEY,
			webhookSecret: env.SEPAY_BANKHUB_WEBHOOK_SECRET,
			baseUrl: env.SEPAY_BANKHUB_BASE_URL,
		});
		return bankHub;
	},
	runInBackground: (promise) => waitUntil(promise),
});
