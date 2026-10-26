import { waitUntil } from "cloudflare:workers";
import { type Auth, type CreateAuthInput, createAuth } from "@teacher-os/auth";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
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
let libraryAudioStore: MediaStore | undefined;
let bankHub: BankHubContext | undefined;

// Plan TOS-21 (#454): mailer memoized riêng, dùng chung cho createAuth lẫn
// buildApp (AppDeps.mailer). Giữ nguyên check MAILER_IMPL + cảnh báo log-only.
let mailer: Mailer | undefined;
const getMailer = (): Mailer => {
	if (mailer) return mailer;
	if (env.MAILER_IMPL === "resend" && !env.RESEND_API_KEY) {
		throw new Error("RESEND_API_KEY is required when MAILER_IMPL=resend");
	}
	if (env.MAILER_IMPL !== "resend") {
		console.error(
			"[mail] MAILER is in LOG-ONLY mode — verification emails are NOT being sent. Set MAILER_IMPL=resend + RESEND_API_KEY to enable.",
		);
	}
	mailer =
		env.MAILER_IMPL === "resend"
			? createResendMailer({
					apiKey: env.RESEND_API_KEY,
					from: env.MAIL_FROM,
				})
			: createLogMailer();
	return mailer;
};

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
		const mailer = getMailer();
		auth = createAuth({
			db: db as unknown as CreateAuthInput["db"],
			corsOrigin: parseCORSOrigins(env.CORS_ORIGIN),
			studentOrigins: parseCORSOrigins(env.STUDENT_ORIGINS),
			// Plan #413: cổng admin + allowlist email admin (rỗng = không ai là
			// admin; so khớp lowercase diễn ra trong createAuth ở mỗi request).
			adminOrigins: parseCORSOrigins(env.ADMIN_ORIGINS),
			adminEmails: parseCORSOrigins(env.ADMIN_EMAILS),
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
	// Kho audio thư viện đề (#413 phase 3) — cùng hợp đồng: binding
	// LIBRARY_AUDIO thiếu → undefined → route audio trả 503
	// LIBRARY_AUDIO_DISABLED.
	getLibraryAudioStore: () => {
		if (!env.LIBRARY_AUDIO) return undefined;
		libraryAudioStore ??= createR2MediaStore(env.LIBRARY_AUDIO);
		return libraryAudioStore;
	},
	// Plan #413: cổng admin — allowlist email + origin console cho CSRF.
	adminEmails: parseCORSOrigins(env.ADMIN_EMAILS),
	adminOrigins: parseCORSOrigins(env.ADMIN_ORIGINS),
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
	// Webhook GitHub (#421): secret rỗng (chưa cấu hình binding) →
	// /webhooks/github trả 503 GITHUB_WEBHOOK_DISABLED.
	githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
	// Plan TOS-21 (#454): cùng mailer memoized với auth (D6) — getter để
	// check MAILER_IMPL vẫn chạy lười như cũ, không ở lúc import module.
	get mailer() {
		return getMailer();
	},
	// Plan TOS-21 (#454): origin cổng học viên đầu tiên cho link tuyệt đối
	// trong email — env STUDENT_ORIGINS là chuỗi thô nên parse ở đây.
	studentOrigin: parseCORSOrigins(env.STUDENT_ORIGINS)[0],
	runInBackground: (promise) => waitUntil(promise),
});
