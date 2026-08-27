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
 * Production topology: set APP_DOMAIN to a bare domain (e.g. teacher-os.edu.vn)
 * to serve the app at app.<domain> and the API at api.<domain> with
 * cross-subdomain session cookies. Without APP_DOMAIN the stack keeps its
 * generated workers.dev URLs and per-host cookies (dev/staging behavior).
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
if (
	topology &&
	process.env.CORS_ORIGIN &&
	process.env.CORS_ORIGIN.trim() !== topology.appOrigin
) {
	throw new Error(
		`[topology] CORS_ORIGIN=${process.env.CORS_ORIGIN} overrides the derived ${topology.appOrigin} (APP_DOMAIN=${process.env.APP_DOMAIN}). Clear CORS_ORIGIN from packages/infra/.env, apps/*/.env, and the shell — production must serve the derived origin.`,
	);
}

const corsOriginConfig = topology
	? Config.string("CORS_ORIGIN").pipe(Config.withDefault(topology.appOrigin))
	: isDevCommand
		? Config.string("CORS_ORIGIN").pipe(
				Config.withDefault("http://localhost:8001"),
			)
		: Config.string("CORS_ORIGIN");

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
		BETTER_AUTH_SECRET: Config.redacted("BETTER_AUTH_SECRET"),
		BETTER_AUTH_URL: topology ? topology.apiOrigin : Cloudflare.Worker.URL,
		COOKIE_DOMAIN: topology ? topology.cookieDomain : "",
		GOOGLE_CLIENT_ID: Config.string("GOOGLE_CLIENT_ID"),
		GOOGLE_CLIENT_SECRET: Config.redacted("GOOGLE_CLIENT_SECRET"),
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
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: "single-page-application",
			},
			...(topology && { domain: topology.appHost, workersDev: false }),
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

		return {
			web: webWorker.url,
			server: serverWorker.url,
		};
	}),
);
