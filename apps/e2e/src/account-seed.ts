import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";

/** Same file the boot shim uses (apps/e2e/src/boot.ts) — tests run after
 * boot, sequential (workers: 1), so a second short-lived connection is safe. */
const DB_PATH = new URL("../local.db", import.meta.url).pathname;

/**
 * Seeds a Google account row for the given user email so /profile renders the
 * connected state through the REAL listAccounts endpoint — Google OAuth cannot
 * complete in CI (boot shim holds dummy creds), but the DB truth can exist.
 *
 * Raw SQL bypasses drizzle's $onUpdate, and `updated_at` has NO database
 * default (migration 0000), so that timestamp must be supplied explicitly
 * (`created_at` does have a DDL default; we set it anyway for symmetry).
 * SQLite has no randomUUID() function either — ids come from node crypto.
 */
export async function seedGoogleAccount(email: string): Promise<void> {
	const client = createClient({ url: `file:${DB_PATH}` });
	try {
		const user = await client.execute({
			sql: "SELECT id FROM user WHERE email = ?",
			args: [email],
		});
		const userId = user.rows[0]?.id;
		if (!userId) {
			throw new Error(`seedGoogleAccount: no user row for ${email}`);
		}
		// Idempotent across retries/reloads: replace our known marker row.
		await client.execute({
			sql: "DELETE FROM account WHERE account_id = 'google-e2e-1' AND user_id = ?",
			args: [userId as string],
		});
		await client.execute({
			sql: `INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
				VALUES (?, 'google-e2e-1', 'google', ?, ?, ?)`,
			args: [randomUUID(), userId, Date.now(), Date.now()],
		});
	} finally {
		client.close();
	}
}
