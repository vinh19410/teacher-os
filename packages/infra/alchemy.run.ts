import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { config } from "dotenv";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { resolveDomainTopology } from "./src/topology.ts";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

/**
 * Domain topology: set APP_DOMAIN to a bare domain (teacheros.io.vn for prod,
 * staging.teacheros.io.vn for staging) to serve the app at app.<domain> and
 * the API at api.<domain> with cross-subdomain session cookies. Without
 * APP_DOMAIN (local dev only) the stack keeps its generated workers.dev URLs
 * and per-host cookies.
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
if (topology && process.env.CORS_ORIGIN) {
	const explicit = process.env.CORS_ORIGIN.split(",").map((s) => s.trim());
	if (
		!explicit.includes(topology.appOrigin) ||
		!explicit.includes(topology.studentOrigin)
	) {
		throw new Error(
			`[topology] CORS_ORIGIN=${process.env.CORS_ORIGIN} missing required origins ${topology.appOrigin} or ${topology.studentOrigin} (APP_DOMAIN=${process.env.APP_DOMAIN}). Clear CORS_ORIGIN from packages/infra/.env, apps/*/.env, and the shell — production must serve the derived origins.`,
		);
	}
}

const corsOriginConfig = topology
	? Config.string("CORS_ORIGIN").pipe(
			Config.withDefault(`${topology.appOrigin},${topology.studentOrigin}`),
		)
	: isDevCommand
		? Config.string("CORS_ORIGIN").pipe(
				Config.withDefault("http://localhost:8001,http://localhost:8003"),
			)
		: Config.string("CORS_ORIGIN");

// An explicit STUDENT_ORIGINS that misses the portal origin (topology mode)
// silently classifies every portal sign-up as teacher and locks students out
// of the portal, so fail the whole run before any resource is touched — the
// same override risk as CORS_ORIGIN above (alchemy loads apps/*/.env on
// deploy too). Presence (not truthiness) is the gate: `STUDENT_ORIGINS=`
// (empty) must throw as well, or the empty list would classify the portal
// origin as teacher.
const studentOriginsEnv = process.env.STUDENT_ORIGINS;
if (topology && studentOriginsEnv !== undefined) {
	const explicitStudents = studentOriginsEnv
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (!explicitStudents.includes(topology.studentOrigin)) {
		throw new Error(
			`[topology] STUDENT_ORIGINS=${studentOriginsEnv || "(empty)"} missing required portal origin ${topology.studentOrigin} (APP_DOMAIN=${process.env.APP_DOMAIN}). Clear STUDENT_ORIGINS from packages/infra/.env, apps/*/.env, and the shell — production must serve the derived origin.`,
		);
	}
}

const studentOriginsConfig = topology
	? Config.string("STUDENT_ORIGINS").pipe(
			Config.withDefault(topology.studentOrigin),
		)
	: isDevCommand
		? Config.string("STUDENT_ORIGINS").pipe(
				Config.withDefault("http://localhost:8003"),
			)
		: Config.string("STUDENT_ORIGINS");

export const db = Cloudflare.D1.Database("database", {
	migrationsDir: "../../packages/db/src/migrations",
});

export const server = Cloudflare.Worker("server", {
	main: "../../apps/server/src/index.ts",
	compatibility: {
		flags: ["nodejs_compat"],
	},
	...(topology && { domain: topology.apiHost, workersDev: false }),
	env: {
		DB: db,
		CORS_ORIGIN: corsOriginConfig,
		STUDENT_ORIGINS: studentOriginsConfig,
		BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
		BETTER_AUTH_URL: topology ? topology.apiOrigin : Cloudflare.Worker.URL,
		COOKIE_DOMAIN: topology ? topology.cookieDomain : "",
		// Issue #125: stage-scoped auth cookie namespace (empty = default
		// better-auth namespace for prod/local).
		BETTER_AUTH_COOKIE_PREFIX: topology
			? (topology.authCookiePrefix ?? "")
			: "",
		GOOGLE_CLIENT_ID: Config.string("GOOGLE_CLIENT_ID"),
		GOOGLE_CLIENT_SECRET: Config.redacted("GOOGLE_CLIENT_SECRET"),
		MAILER_IMPL: Config.string("MAILER_IMPL").pipe(Config.withDefault("log")),
		MAIL_FROM: Config.string("MAIL_FROM").pipe(
			Config.withDefault("TeacherOS <onboarding@resend.dev>"),
		),
		// plain string vì redacted không combine được với withDefault
		RESEND_API_KEY: Config.string("RESEND_API_KEY").pipe(
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
		const webWorker = yield* Cloudflare.Website.Vite("web", {
			rootDir: "../../apps/web",
			main: "src/worker.ts",
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: "none",
			},
			...(topology && {
				domain: {
					name: topology.appHost,
					aliases: topology.appAliases,
				},
				workersDev: false,
			}),
			env: {
				VITE_SERVER_URL: topology
					? topology.apiOrigin
					: serverWorker.url.as<string>(),
			},
			dev: {
				port: 8001,
				strictPort: true,
			},
		});

		const landingWorker = yield* Cloudflare.Website.StaticSite("landing", {
			cwd: "../../apps/landing",
			command: "pnpm build",
			outdir: "dist",
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: "none",
			},
			...(topology && {
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

		const studentWorker = yield* Cloudflare.Website.Vite("student", {
			rootDir: "../../apps/student",
			main: "src/worker.ts",
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: "none",
			},
			...(topology && {
				domain: {
					name: topology.studentHost,
				},
				workersDev: false,
			}),
			env: {
				VITE_SERVER_URL: topology
					? topology.apiOrigin
					: serverWorker.url.as<string>(),
			},
			dev: {
				port: 8003,
				strictPort: true,
			},
		});

		return {
			web: webWorker.url,
			server: serverWorker.url,
			landing: landingWorker.url,
			student: studentWorker.url,
		};
	}),
);
