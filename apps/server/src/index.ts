import { type Auth, type CreateAuthInput, createAuth } from "@teacher-os/auth";
import { createDb } from "@teacher-os/db";
import { env } from "@teacher-os/env/server";
import { buildApp, type Db } from "./app";
import { getSessionUser } from "./session";

// Lazy so importing this module never touches bindings at eval time.
// Cast: drizzle's schema generic is invariant; Db keeps the route-facing surface.
let db: Db | undefined;
let auth: Auth | undefined;

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
		auth = createAuth({
			db: db as unknown as CreateAuthInput["db"],
			corsOrigin: env.CORS_ORIGIN,
			secret: env.BETTER_AUTH_SECRET,
			baseURL: env.BETTER_AUTH_URL,
			...(env.COOKIE_DOMAIN ? { cookieDomain: env.COOKIE_DOMAIN } : {}),
			googleClientId: env.GOOGLE_CLIENT_ID,
			googleClientSecret: env.GOOGLE_CLIENT_SECRET,
		});
	}
	return auth;
};

export default buildApp({
	getDb: () => (db ??= createDb() as unknown as Db),
	corsOrigin: env.CORS_ORIGIN,
	getSessionUser: (headers) => getSessionUser(getAuth(), headers),
	authHandler: (req) => getAuth().handler(req),
});
