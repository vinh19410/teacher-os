import { createDb } from "@teacher-os/db";
import * as schema from "@teacher-os/db/schema/auth";
import { env } from "@teacher-os/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authBaseURL, crossSubDomainCookieDomain } from "./topology";

export function createAuth() {
	const db = createDb();
	const cookieDomain = crossSubDomainCookieDomain(env.COOKIE_DOMAIN);

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",

			schema: schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: authBaseURL(env.BETTER_AUTH_URL),
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
			// Cross-subdomain cookies (app.<domain> <-> api.<domain>) are enabled
			// only when COOKIE_DOMAIN holds a dot-prefixed parent domain; workers.dev
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
