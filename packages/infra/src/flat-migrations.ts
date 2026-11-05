import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Copies a drizzle-kit migrations directory into one holding only its `.sql`
 * files. Alchemy refuses a directory containing `meta/_journal.json`, and
 * `drizzle-kit up` would rename every migration, which no longer matches the
 * names recorded in each deployed D1 database. Keeping the file names and bytes
 * means applied migrations are recognized and never run again.
 */
export function prepareFlatMigrations(
	sourceDir: string,
	destDir: string,
): string {
	rmSync(destDir, { recursive: true, force: true });
	mkdirSync(destDir, { recursive: true });
	for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
		if (entry.isFile() && entry.name.endsWith(".sql")) {
			copyFileSync(join(sourceDir, entry.name), join(destDir, entry.name));
		}
	}
	return destDir;
}
