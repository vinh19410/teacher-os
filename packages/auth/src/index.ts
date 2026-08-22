import * as schema from "@teacher-os/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authBaseURL, crossSubDomainCookieDomain } from "./topology";

/**
 * Drizzle sqlite instance handed to better-auth's adapter — the production
 * worker passes its D1 database, tests and the E2E boot shim pass libsql.
 * Derived from the adapter's own parameter type so this package stays
 * driver-neutral (no d1/libsql imports).
 */
export type AuthDatabase = Parameters<typeof drizzleAdapter>[0];

export interface CreateAuthInput {
	db: AuthDatabase;
	corsOrigin: string;
	secret: string;
	/** API origin; authBaseURL() appends the /api/auth mount path. */
	baseURL: string;
	/** Dot-prefixed parent domain enables cross-subdomain cookies; omit for per-host. */
	cookieDomain?: string;
	googleClientId: string;
	googleClientSecret: string;
}

export function createAuth(input: CreateAuthInput) {
	const cookieDomain = crossSubDomainCookieDomain(input.cookieDomain);

	return betterAuth({
		database: drizzleAdapter(input.db, {
			provider: "sqlite",

			schema: schema,
		}),
		trustedOrigins: [input.corsOrigin],
		socialProviders: {
			google: {
				clientId: input.googleClientId,
				clientSecret: input.googleClientSecret,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		secret: input.secret,
		baseURL: authBaseURL(input.baseURL),
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
			// Cross-subdomain cookies (app.<domain> <-> api.<domain>) are enabled
			// only when cookieDomain holds a dot-prefixed parent domain; workers.dev
			// and local deployments keep per-host cookies.
			...(cookieDomain && {
				crossSubDomainCookies: {
					enabled: true,
					domain: cookieDomain,
				},
			}),
		},
	});
}
