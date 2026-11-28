import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import { config } from "dotenv";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { prepareFlatMigrations } from "./src/flat-migrations";
import {
	resolveAssumeEmailVerified,
	resolveDomainTopology,
	resolveLeadOrigins,
	resolveStudentPracticeEnabled,
	resolveTeacherEmails,
	resolveZoomHostUser,
} from "./src/topology.ts";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

/**
 * Domain topology: set APP_DOMAIN to a bare domain (msmy.io.vn for prod,
 * staging.teacheros.io.vn for staging) to serve the unified LMS app at
 * lms.<domain> (with 301 aliases app/student/admin.<domain>) and the API at
 * api.<domain> with cross-subdomain session cookies. Without APP_DOMAIN
 * (local dev only) the stack keeps its generated workers.dev URLs and
 * per-host cookies.
 *
 * APP_DOMAIN is read from process.env (after dotenv), not Effect Config: it is
 * deploy-time topology wiring the operator sets, and its presence/absence
 * switches the whole resource shape. CORS_ORIGIN stays a Config value to keep
 * its validation + derived-default semantics.
 */
const topology = process.env.APP_DOMAIN
	? resolveDomainTopology(process.env.APP_DOMAIN)
	: undefined;

// The topology-unset branch is entered by dev AND by staging/prod deploys that
// lack inline APP_DOMAIN, so the dev CORS default must never apply to deploys.
// `alchemy dev` evaluates this file inside a spawned child process whose argv
// is empty, so the command name is unusable here; alchemy sets ALCHEMY_DEV=true
// only on that child (deploy/plan evaluate in-process and leave it unset). If
// ALCHEMY_DEV ever goes missing, dev fails loud demanding an explicit
// CORS_ORIGIN instead of silently using the wrong origin.
const isDevCommand = process.env.ALCHEMY_DEV === "true";

// An explicit CORS_ORIGIN that disagrees with APP_DOMAIN silently breaks
// both Hono CORS and better-auth trustedOrigins (Google sign-in fails at the
// callback, not just CORS), so fail the whole run before any resource is
// touched — no legitimate combination sets both to different values.
// dotenv precedence: packages/infra/.env wins over apps/*/.env.
const corsOriginEnv = process.env.CORS_ORIGIN;
if (topology && corsOriginEnv !== undefined) {
	const explicit = corsOriginEnv
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (!explicit.includes(topology.lmsOrigin)) {
		throw new Error(
			`[topology] CORS_ORIGIN=${corsOriginEnv || "(empty)"} missing required LMS origin ${topology.lmsOrigin} (APP_DOMAIN=${process.env.APP_DOMAIN}). Clear CORS_ORIGIN from packages/infra/.env, apps/*/.env, and the shell — production must serve the derived origin.`,
		);
	}
}

const corsOriginConfig = topology
	? Config.String("CORS_ORIGIN").pipe(Config.withDefault(topology.lmsOrigin))
	: isDevCommand
		? Config.String("CORS_ORIGIN").pipe(
				Config.withDefault("http://localhost:8001"),
			)
		: Config.String("CORS_ORIGIN");

// An explicit STUDENT_ORIGINS that misses the unified LMS origin (topology
// mode) breaks student-portal origin matching, so fail the whole run before
// any resource is touched — the same override risk as CORS_ORIGIN above
// (alchemy loads apps/*/.env on deploy too). Presence (not truthiness) is the
// gate: `STUDENT_ORIGINS=` (empty) must throw as well.
const studentOriginsEnv = process.env.STUDENT_ORIGINS;
if (topology && studentOriginsEnv !== undefined) {
	const explicitStudents = studentOriginsEnv
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (!explicitStudents.includes(topology.lmsOrigin)) {
		throw new Error(
			`[topology] STUDENT_ORIGINS=${studentOriginsEnv || "(empty)"} missing required LMS origin ${topology.lmsOrigin} (APP_DOMAIN=${process.env.APP_DOMAIN}). Clear STUDENT_ORIGINS from packages/infra/.env, apps/*/.env, and the shell — production must serve the derived origin.`,
		);
	}
}

const studentOriginsConfig = topology
	? Config.String("STUDENT_ORIGINS").pipe(
			Config.withDefault(topology.lmsOrigin),
		)
	: isDevCommand
		? Config.String("STUDENT_ORIGINS").pipe(
				Config.withDefault("http://localhost:8001"),
			)
		: Config.String("STUDENT_ORIGINS");

// ADMIN_ORIGINS mặc định theo topology (lms.<APP_DOMAIN>) — explicit thiếu
// origin LMS ở topology mode fail loud, cùng pattern STUDENT_ORIGINS ở trên
// (presence, không phải truthiness, là gate).
const adminOriginsEnv = process.env.ADMIN_ORIGINS;
if (topology && adminOriginsEnv !== undefined) {
	const explicitAdmins = adminOriginsEnv
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (!explicitAdmins.includes(topology.lmsOrigin)) {
		throw new Error(
			`[topology] ADMIN_ORIGINS=${adminOriginsEnv || "(empty)"} missing required LMS origin ${topology.lmsOrigin} (APP_DOMAIN=${process.env.APP_DOMAIN}). Clear ADMIN_ORIGINS from packages/infra/.env, apps/*/.env, and the shell — production must serve the derived origin.`,
		);
	}
}

const aiEnabledConfig = Config.String("AI_ENABLED").pipe(
	Config.withDefault("false"),
);

// Lead intake (#506, #524): LEAD_ORG_ID KHÔNG có default theo deploy — rỗng
// (không set hoặc chỉ khoảng trắng) ⇒ /public/leads trả 503
// LEAD_INTAKE_DISABLED (fail-closed, dev không cần cấu hình gì).
const leadOrgId = (process.env.LEAD_ORG_ID ?? "").trim();

// Lead intake (#506 D5, #524, #536): origin form profile — topology mặc định
// theo stage (`topology.profileOrigins`: prod msmy + www, staging
// profile.<domain>), dev mặc định port profile local; rỗng/khoảng trắng/dấu
// phẩy từ `${{ vars.LEAD_ORIGINS }}` chưa set đều rơi về mặc định qua
// resolveLeadOrigins.
const leadOrigins = resolveLeadOrigins(process.env.LEAD_ORIGINS, {
	topology,
	isDev: isDevCommand,
});

const adminOriginsConfig = topology
	? Config.String("ADMIN_ORIGINS").pipe(Config.withDefault(topology.lmsOrigin))
	: isDevCommand
		? Config.String("ADMIN_ORIGINS").pipe(
				Config.withDefault("http://localhost:8001"),
			)
		: Config.String("ADMIN_ORIGINS");

// Plan #413: ADMIN_EMAILS KHÔNG có default — rỗng (không set) = không ai là
// admin, không ai đăng ký được account admin. Danh sách email phân tách dấu
// phẩy; server so khớp lowercase mỗi request.
const adminEmailsConfig = Config.String("ADMIN_EMAILS").pipe(
	Config.withDefault(""),
);

// Single-org theo chính sách (#513): danh sách email giáo viên (phân loại role
// teacher trên unified LMS và allowlist bootstrapMiddleware); production bắt
// buộc set (fail-closed khi APP_DOMAIN=msmy.io.vn), staging truyền qua vars.TEACHER_EMAILS.
const teacherEmails = resolveTeacherEmails(
	process.env.TEACHER_EMAILS,
	process.env.APP_DOMAIN,
);

// Staging QA: coi mọi tài khoản là đã xác minh email, vì staging không
// gửi mail. Chặn cứng trên prod để cờ không thể lọt sang môi trường thật.
const assumeEmailVerified = resolveAssumeEmailVerified(
	process.env.AUTH_ASSUME_EMAIL_VERIFIED,
	process.env.APP_DOMAIN,
);

// Staging QA (#852): bật lại menu Luyện tập & Lịch sử ở apps/student trên staging;
// mặc định tắt và chặn fail-closed trên production. Dùng biến hạ tầng không mang
// prefix VITE_ để apps/lms không đọc lén từ process.env bỏ qua Alchemy config.define.
const studentPracticeEnabled = resolveStudentPracticeEnabled(
	process.env.STUDENT_PRACTICE_ENABLED,
	process.env.APP_DOMAIN,
);

// Zoom Server-to-Server OAuth (#1031): chuẩn hóa và chặn fail-loud
// ZOOM_HOST_USER sai định dạng (vd tên hiển thị "Ms My"); chấp nhận "me",
// email tài khoản Zoom Pro, hoặc Zoom User ID.
const zoomHostUser = resolveZoomHostUser(process.env.ZOOM_HOST_USER);

// Alchemy's default date moves with each release. Pinning it keeps runtime
// behavior changes out of Alchemy upgrades, so bumping it stays its own decision.
const WORKER_COMPATIBILITY_DATE = "2026-03-17";

export const db = Cloudflare.D1.Database("database", {
	migrations: prepareFlatMigrations(
		"../../packages/db/src/migrations",
		".alchemy/d1-migrations",
	),
});

// Private bucket for student speaking submissions (audio/video). No public
// domain and no forceDestroy: objects are student data, read and written only
// by the server Worker through /api/student/attempts/:id/media.
export const media = Cloudflare.R2.Bucket("media", {});

// Kho audio đề listening của thư viện (#413 phase 3) — private như bucket
// media, KHÔNG forceDestroy: object audio là dữ liệu đề dùng chung, chỉ
// server Worker đọc/ghi qua /api/admin/library/.../audio.
export const libraryAudio = Cloudflare.R2.Bucket("library-audio", {});

// Ngân hàng tài liệu của org (file, audio/video) gắn vào buổi học — private
// như bucket media, KHÔNG forceDestroy: object là tài liệu giảng dạy của
// giáo viên, key `<orgId>/<materialId>`, chỉ server Worker đọc/ghi qua
// /api/materials và /api/student/.../materials (kiểm enrollment).
export const materials = Cloudflare.R2.Bucket("materials", {});

// Kho video recording buổi học Zoom reup lên R2 (#994) — bucket riêng hoàn toàn
// với media/materials để rule tự xóa 90 ngày không bao giờ chạm dữ liệu vĩnh viễn.
// Private (không public domain), KHÔNG forceDestroy; R2 tự xóa object quá 90 ngày
// (7_776_000s) và tự hủy multipart upload dở quá 1 ngày (86_400s).
const RECORDING_RETENTION_SECONDS = 90 * 86_400;
const RECORDING_MULTIPART_ABORT_SECONDS = 86_400;

export const recordings = Cloudflare.R2.Bucket("recordings", {
	lifecycleRules: [
		{
			id: "expire-recordings-90d",
			enabled: true,
			prefix: "",
			deleteObjectsTransition: {
				condition: {
					type: "Age",
					maxAge: RECORDING_RETENTION_SECONDS,
				},
			},
			abortMultipartUploadsTransition: {
				condition: {
					type: "Age",
					maxAge: RECORDING_MULTIPART_ABORT_SECONDS,
				},
			},
		},
	],
});

export const server = Cloudflare.Worker("server", {
	main: "../../apps/server/src/index.ts",
	compatibility: {
		date: WORKER_COMPATIBILITY_DATE,
		flags: ["nodejs_compat"],
	},
	// Single 10-minute cron trigger running Zoom recording sync/reup/expiry on every tick
	// and daily deadline reminder emails during 23:00–23:09 UTC (06:00 Asia/Ho_Chi_Minh).
	crons: ["*/10 * * * *"],
	...(topology && { domain: topology.apiHost, workersDev: false }),
	env: {
		DB: db,
		MEDIA: media,
		LIBRARY_AUDIO: libraryAudio,
		MATERIALS: materials,
		RECORDINGS: recordings,
		// TOS-24 (#470): Workers AI cho bóc tách đề — binding `ai` không cần
		// cấu hình thêm; dev local đi qua proxy Cloudflare của alchemy, e2e
		// không dùng workerd nên inject fake extractor qua boot.ts.
		AI: Cloudflare.Workers.AI(),
		AI_ENABLED: aiEnabledConfig,
		CORS_ORIGIN: corsOriginConfig,
		STUDENT_ORIGINS: studentOriginsConfig,
		ADMIN_ORIGINS: adminOriginsConfig,
		ADMIN_EMAILS: adminEmailsConfig,
		TEACHER_EMAILS: teacherEmails,
		// Lead intake (#506, #524): org đích + origin profile cho /public/leads.
		LEAD_ORG_ID: leadOrgId,
		LEAD_ORIGINS: leadOrigins,
		BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
		BETTER_AUTH_URL: topology ? topology.apiOrigin : Cloudflare.Worker.URL,
		COOKIE_DOMAIN: topology ? topology.cookieDomain : "",
		// Issue #125: stage-scoped auth cookie namespace (empty = default
		// better-auth namespace for prod/local).
		BETTER_AUTH_COOKIE_PREFIX: topology
			? (topology.authCookiePrefix ?? "")
			: "",
		GOOGLE_CLIENT_ID: Config.String("GOOGLE_CLIENT_ID"),
		GOOGLE_CLIENT_SECRET: Config.Redacted("GOOGLE_CLIENT_SECRET"),
		// Zoom Server-to-Server OAuth. Rỗng ⇒ tính năng Zoom tắt (ZOOM_NOT_CONFIGURED).
		// Plain string vì redacted không combine được với withDefault (cùng mẫu RESEND_API_KEY).
		ZOOM_ACCOUNT_ID: Config.String("ZOOM_ACCOUNT_ID").pipe(
			Config.withDefault(""),
		),
		ZOOM_CLIENT_ID: Config.String("ZOOM_CLIENT_ID").pipe(
			Config.withDefault(""),
		),
		ZOOM_CLIENT_SECRET: Config.String("ZOOM_CLIENT_SECRET").pipe(
			Config.withDefault(""),
		),
		ZOOM_HOST_USER: zoomHostUser,
		AUTH_ASSUME_EMAIL_VERIFIED: assumeEmailVerified ? "true" : "",
		MAILER_IMPL: Config.String("MAILER_IMPL").pipe(Config.withDefault("log")),
		MAIL_FROM: Config.String("MAIL_FROM").pipe(
			Config.withDefault('"Cô Mỹ Dạy Tiếng Anh" <onboarding@resend.dev>'),
		),
		// plain string vì redacted không combine được với withDefault
		RESEND_API_KEY: Config.String("RESEND_API_KEY").pipe(
			Config.withDefault(""),
		),
		// #730: chấm nháp AI bài test đầu vào qua OpenAI. Key rỗng ⇒ grader
		// tắt (AI_GRADING_DISABLED). Same pattern as RESEND_API_KEY —
		// redacted conflicts with withDefault. Model rỗng ⇒ mặc định trong code.
		OPENAI_API_KEY: Config.String("OPENAI_API_KEY").pipe(
			Config.withDefault(""),
		),
		OPENAI_GRADING_MODEL: Config.String("OPENAI_GRADING_MODEL").pipe(
			Config.withDefault("gpt-6-luna"),
		),
		OPENAI_TRANSCRIBE_MODEL: Config.String("OPENAI_TRANSCRIBE_MODEL").pipe(
			Config.withDefault("gpt-4o-transcribe"),
		),
		// SePay cá nhân thường (my.sepay.vn, #320): blank SEPAY_WEBHOOK_SECRET ⇒
		// getSepay() trả undefined ⇒ webhook và bank-link trả 503 SEPAY_DISABLED.
		// Same pattern as RESEND_API_KEY — redacted conflicts with withDefault.
		SEPAY_WEBHOOK_SECRET: Config.String("SEPAY_WEBHOOK_SECRET").pipe(
			Config.withDefault(""),
		),
		// Optional: API Token 64 ký tự từ my.sepay.vn để bật nút Đối soát qua SePay API v2.
		SEPAY_API_TOKEN: Config.String("SEPAY_API_TOKEN").pipe(
			Config.withDefault(""),
		),
		// Mặc định production host (chỉ đọc giao dịch); staging dùng Test mode có thể đặt
		// https://userapi-sandbox.sepay.vn/v2.
		SEPAY_API_BASE_URL: Config.String("SEPAY_API_BASE_URL").pipe(
			Config.withDefault("https://userapi.sepay.vn/v2"),
		),
		// Webhook GitHub (#421): blank secret ⇒ /webhooks/github trả 503
		// GITHUB_WEBHOOK_DISABLED (dev không cần cấu hình). Same pattern as
		// RESEND_API_KEY — redacted conflicts with withDefault.
		GITHUB_WEBHOOK_SECRET: Config.String("GITHUB_WEBHOOK_SECRET").pipe(
			Config.withDefault(""),
		),
	},
	dev: {
		port: 8000,
		strictPort: true,
	},
});

export type ServerEnv = Cloudflare.InferEnv<typeof server>;

export default Alchemy.Stack(
	"teacher-os",
	{
		providers: Cloudflare.providers(),
		state: Cloudflare.state(),
	},
	Effect.gen(function* () {
		const serverWorker = yield* server;
		const aiEnabled = yield* aiEnabledConfig;
		const lmsWorker = yield* Cloudflare.Website.Vite("lms", {
			compatibility: { date: WORKER_COMPATIBILITY_DATE },
			rootDir: "../../apps/lms",
			main: "src/worker.ts",
			memo: {
				// Hash all 3 sub-portals and shared packages alongside apps/lms so
				// edits inside web/student/admin always trigger a fresh composite build.
				workspaces: [
					{ cwd: "../web" },
					{ cwd: "../student" },
					{ cwd: "../admin" },
					{ cwd: "../../packages/api" },
					{ cwd: "../../packages/auth" },
					{ cwd: "../../packages/config" },
					{ cwd: "../../packages/env" },
					{ cwd: "../../packages/ui" },
				],
			},
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: "none",
				...(isDevCommand ? {} : { runWorkerFirst: true }),
			},
			...(topology && {
				domain: {
					name: topology.lmsHost,
					aliases: topology.lmsAliases,
				},
				workersDev: false,
			}),
			env: {
				VITE_SERVER_URL: topology
					? topology.apiOrigin
					: serverWorker.url.as<string>(),
				VITE_AI_ENABLED: aiEnabled,
				VITE_STUDENT_PRACTICE_ENABLED: studentPracticeEnabled,
			},
			dev: {
				port: 8001,
				strictPort: true,
			},
		});

		const landingWorker = yield* Cloudflare.Website.StaticSite("landing", {
			compatibility: { date: WORKER_COMPATIBILITY_DATE },
			cwd: "../../apps/landing",
			command: "pnpm build",
			outdir: "dist",
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: "none",
			},
			// Prod has no landingHost (msmy.io.vn apex is the profile site), so
			// landing stays on its generated workers.dev URL there.
			...(topology?.landingHost && {
				domain: {
					name: topology.landingHost,
					aliases: topology.landingAliases,
				},
				workersDev: false,
			}),
			dev: {
				command: "pnpm dev:bare",
				url: "http://localhost:8002",
			},
		});

		// Plan #536: trang hồ sơ giảng viên cô Mỹ — StaticSite tại msmy.io.vn (+ www)
		// trên prod, profile.<domain> trên staging, dev port 8005.
		// Khi apps/profile/maintenance.json bật disabled=true (hoặc PROFILE_MAINTENANCE=true),
		// fallback SPA để mọi đường dẫn con đều hiển thị trang đang phát triển.
		const profileMaintenanceOverride = String(
			process.env.PROFILE_MAINTENANCE ?? "",
		)
			.trim()
			.toLowerCase();
		const profileDisabled = (() => {
			if (profileMaintenanceOverride === "") {
				return Boolean(
					JSON.parse(
						readFileSync(
							fileURLToPath(
								new URL("../../apps/profile/maintenance.json", import.meta.url)
									.href,
							),
							"utf8",
						),
					)?.disabled,
				);
			}
			if (
				profileMaintenanceOverride === "false" ||
				profileMaintenanceOverride === "0"
			) {
				return false;
			}
			if (
				profileMaintenanceOverride === "true" ||
				profileMaintenanceOverride === "1"
			) {
				return true;
			}
			throw new Error(
				`Invalid PROFILE_MAINTENANCE value "${process.env.PROFILE_MAINTENANCE}" (expected true, 1, false, or 0)`,
			);
		})();

		const profileWorker = yield* Cloudflare.Website.StaticSite("profile", {
			compatibility: { date: WORKER_COMPATIBILITY_DATE },
			cwd: "../../apps/profile",
			command: "pnpm build",
			outdir: "dist",
			env: {
				LEAD_API_URL: topology
					? topology.apiOrigin
					: serverWorker.url.as<string>(),
				STUDENT_PORTAL_URL: topology
					? topology.studentPortalUrl
					: lmsWorker.url.as<string>(),
				...(process.env.PROFILE_MAINTENANCE !== undefined && {
					PROFILE_MAINTENANCE: process.env.PROFILE_MAINTENANCE,
				}),
			},
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: profileDisabled ? "single-page-application" : "none",
			},
			...(topology && {
				domain: {
					name: topology.profileHost,
					aliases: topology.profileAliases,
				},
				workersDev: false,
			}),
			dev: {
				command: "pnpm dev:bare",
				url: "http://localhost:8005",
			},
		});

		return {
			lms: lmsWorker.url,
			server: serverWorker.url,
			landing: landingWorker.url,
			profile: profileWorker.url,
		};
	}),
);
