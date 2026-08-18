import { createAuth } from "@teacher-os/auth";
import { createDb } from "@teacher-os/db";
import { env } from "@teacher-os/env/server";
import { buildApp, type Db } from "./app";
import { getSessionUser } from "./session";

// Lazy so importing this module never touches bindings at eval time.
// Cast: drizzle's schema generic is invariant; Db keeps the route-facing surface.
let db: Db | undefined;

export default buildApp({
	getDb: () => (db ??= createDb() as unknown as Db),
	corsOrigin: env.CORS_ORIGIN,
	getSessionUser,
	authHandler: (req) => createAuth().handler(req),
});
