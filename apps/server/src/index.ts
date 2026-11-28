import { waitUntil } from "cloudflare:workers";
import { type Auth, type CreateAuthInput, createAuth } from "@teacher-os/auth";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import {
	createLogMailer,
	createResendMailer,
} from "@teacher-os/auth/mail/mailer";
import { createDb } from "@teacher-os/db";
import { env } from "@teacher-os/env/server";
import { buildApp, type Db, type MediaStore, type RecordingStore } from "./app";
import { createAiProviders } from "./lib/ai-gate";
import type { PlacementAiGrader } from "./lib/placement-ai/grader";
import { createPlacementAiGrader } from "./lib/placement-ai/openai-grader";
import { createR2MediaStore } from "./lib/r2-media-store";
import { createR2RecordingStore } from "./lib/r2-recording-store";
import { dispatchScheduledCron } from "./lib/scheduled";
import {
	createSepayContext,
	type SepayContext,
} from "./lib/sepay/sepay-client";
import { getSessionUser } from "./session";

export function parseCORSOrigins(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export function appendPathPrefix(
	origin: string | undefined,
	prefix: string,
): string | undefined {
	const trimmed = (origin ?? "").trim().replace(/\/+$/, "");
	if (!trimmed) return undefined;
	if (trimmed.endsWith(prefix)) return trimmed;
	return `${trimmed}${prefix}`;
}

// Lazy so importing this module never touches bindings at eval time.
// Cast: drizzle's schema generic is invariant; Db keeps the route-facing surface.
let db: Db | undefined;
let auth: Auth | undefined;
let mediaStore: MediaStore | undefined;
let libraryAudioStore: MediaStore | undefined;
let materialsStore: MediaStore | undefined;
let recordingStore: RecordingStore | undefined;
let sepay: SepayContext | undefined;

const getRecordingStore = (): RecordingStore | undefined => {
	if (!env.RECORDINGS) return undefined;
	recordingStore ??= createR2RecordingStore(env.RECORDINGS);
	return recordingStore;
};
// TOS-24 (#470): kho file đề nhập AI dùng chung bucket MEDIA — memoized
// riêng để không tạo adapter mới mỗi request (same pattern mediaStore).
let examImportStore: MediaStore | undefined;
// #730: grader OpenAI memoized (null = đã kiểm tra, không có key).
let placementAiGrader: PlacementAiGrader | null | undefined;

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
// Better-Auth's in-memory rate limiter is explicitly enabled here with
// per-IP `cf-connecting-ip` bucketing (Cloudflare edge overwrites this header)
// and a 120 req/10s allowance on `/get-session` while keeping strict limits
// on `/sign-in/*` and `/sign-up/*`.
const getAuth = (): Auth => {
	if (!db) {
		db = createDb() as unknown as Db;
	}
	if (!auth) {
		const mailer = getMailer();
		const corsOrigins = parseCORSOrigins(env.CORS_ORIGIN);
		const adminOrigins = parseCORSOrigins(env.ADMIN_ORIGINS || env.CORS_ORIGIN);
		auth = createAuth({
			db: db as unknown as CreateAuthInput["db"],
			corsOrigin: corsOrigins,
			unifiedOrigins: corsOrigins,
			studentOrigins: parseCORSOrigins(env.STUDENT_ORIGINS ?? ""),
			adminOrigins,
			adminEmails: parseCORSOrigins(env.ADMIN_EMAILS),
			teacherEmails: parseCORSOrigins(env.TEACHER_EMAILS ?? ""),
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
			rateLimit: { enabled: true },
			trustedIpHeaders: ["cf-connecting-ip"],
		});
	}
	return auth;
};

const zoomConfig = {
	accountId: env.ZOOM_ACCOUNT_ID,
	clientId: env.ZOOM_CLIENT_ID,
	clientSecret: env.ZOOM_CLIENT_SECRET,
	hostUser: env.ZOOM_HOST_USER?.trim() || "me",
};

// Base URL học viên trên domain LMS hợp nhất cho link tuyệt đối trong email.
const studentOrigin = appendPathPrefix(
	parseCORSOrigins(env.STUDENT_ORIGINS ?? "")[0] ??
		parseCORSOrigins(env.CORS_ORIGIN)[0],
	"/student",
);

const app = buildApp({
	getDb: () => (db ??= createDb() as unknown as Db),
	corsOrigin: parseCORSOrigins(env.CORS_ORIGIN),
	getSessionUser: (headers) =>
		getSessionUser(
			getAuth(),
			headers,
			env.AUTH_ASSUME_EMAIL_VERIFIED === "true",
		),
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
	// Ngân hàng tài liệu — binding MATERIALS thiếu → undefined → route file
	// tài liệu trả 503 MATERIALS_DISABLED.
	getMaterialsStore: () => {
		if (!env.MATERIALS) return undefined;
		materialsStore ??= createR2MediaStore(env.MATERIALS);
		return materialsStore;
	},
	// Video recording buổi học Zoom (bucket R2 private `recordings`, vòng đời 90 ngày).
	getRecordingStore,
	// TOS-24 (#470): file đề gốc nhập AI dùng chung bucket MEDIA (prefix
	// `exam-imports/<orgId>/` do route tự ghép). Binding MEDIA thiếu →
	// undefined → route /api/exam-imports trả 503 EXAM_IMPORT_DISABLED.
	getExamImportStore: () => {
		if (!env.MEDIA) return undefined;
		examImportStore ??= createR2MediaStore(env.MEDIA);
		return examImportStore;
	},
	...createAiProviders(env),
	// #730: chấm nháp AI bài test đầu vào qua OpenAI — bật khi có
	// OPENAI_API_KEY (độc lập AI_ENABLED); rỗng → AI_GRADING_DISABLED.
	getPlacementAiGrader: () => {
		placementAiGrader ??= createPlacementAiGrader(env) ?? null;
		return placementAiGrader ?? undefined;
	},
	// Cổng admin — allowlist email + origin console cho CSRF (fail-closed theo exact origin).
	adminEmails: parseCORSOrigins(env.ADMIN_EMAILS),
	teacherEmails: parseCORSOrigins(env.TEACHER_EMAILS ?? ""),
	adminOrigins: parseCORSOrigins(env.ADMIN_ORIGINS || env.CORS_ORIGIN),
	// Thiếu SEPAY_WEBHOOK_SECRET (#320) → undefined → route ngân hàng
	// trả 503 SEPAY_DISABLED; local/dev không cần cấu hình gì.
	getSepay: () => {
		sepay ??= createSepayContext({
			webhookSecret: env.SEPAY_WEBHOOK_SECRET,
			apiToken: env.SEPAY_API_TOKEN,
			apiBaseUrl: env.SEPAY_API_BASE_URL,
		});
		return sepay;
	},
	// Webhook GitHub (#421): secret rỗng (chưa cấu hình binding) →
	// /webhooks/github trả 503 GITHUB_WEBHOOK_DISABLED.
	githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
	// Plan TOS-21 (#454): cùng mailer memoized với auth (D6) — getter để
	// check MAILER_IMPL vẫn chạy lười như cũ, không ở lúc import module.
	get mailer() {
		return getMailer();
	},
	// Base URL học viên trên domain LMS hợp nhất cho link tuyệt đối trong email.
	studentOrigin,
	// Lead intake (#506): org đích từ env (fail-closed khi rỗng), origin
	// profile tách khỏi CORS_ORIGIN (D5), secret HMAC tái dùng
	// BETTER_AUTH_SECRET, appOrigin cho link trong email báo lead (D13).
	leadOrgId: env.LEAD_ORG_ID,
	leadOrigins: parseCORSOrigins(env.LEAD_ORIGINS),
	leadIpSecret: env.BETTER_AUTH_SECRET,
	appOrigin: appendPathPrefix(parseCORSOrigins(env.CORS_ORIGIN)[0], "/teacher"),
	zoom: zoomConfig,
	runInBackground: (promise) => waitUntil(promise),
});

export default {
	fetch: app.fetch,
	scheduled(
		controller: { cron: string; scheduledTime: number },
		_env: unknown,
		ctx: { waitUntil: (promise: Promise<unknown>) => void },
	) {
		if (!db) {
			db = createDb() as unknown as Db;
		}
		ctx.waitUntil(
			dispatchScheduledCron(controller, {
				db,
				zoom: zoomConfig,
				getRecordingStore,
				getMailer,
				studentOrigin,
			}).catch((err) => {
				console.error("[cron] scheduled dispatch failed", controller.cron, err);
			}),
		);
	},
};
