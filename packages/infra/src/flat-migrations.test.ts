import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationRecords } from "@alchemy.run/sql/Migrations";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vitest";
import { prepareFlatMigrations } from "./flat-migrations";

const SOURCE_DIR = fileURLToPath(
	new URL("../../db/src/migrations", import.meta.url).href,
);

const readRecords = (dir: string) =>
	Effect.runPromise(
		readMigrationRecords(dir).pipe(Effect.provide(NodeServices.layer)),
	);

const sqlFiles = () =>
	readdirSync(SOURCE_DIR)
		.filter((name) => name.endsWith(".sql"))
		.sort();

describe("prepareFlatMigrations", () => {
	const tempDirs: string[] = [];
	const tempDest = () => {
		const dir = mkdtempSync(join(tmpdir(), "flat-migrations-"));
		tempDirs.push(dir);
		return join(dir, "flat");
	};

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("documents why the drizzle directory cannot be passed to Alchemy directly", async () => {
		await expect(readRecords(SOURCE_DIR)).rejects.toMatchObject({
			_tag: "DrizzleV0LayoutError",
		});
	});

	it("keeps the record names and hashes already stored in the D1 history", async () => {
		const records = await readRecords(
			prepareFlatMigrations(SOURCE_DIR, tempDest()),
		);

		expect(records.map((record) => record.name).sort()).toEqual(sqlFiles());
		for (const record of records) {
			const sql = readFileSync(join(SOURCE_DIR, record.name));
			expect(record.hash).toBe(createHash("sha256").update(sql).digest("hex"));
		}
	});

	it("drops files removed from the source on the next run", async () => {
		const dest = tempDest();
		prepareFlatMigrations(SOURCE_DIR, dest);
		const records = await readRecords(prepareFlatMigrations(SOURCE_DIR, dest));

		expect(records).toHaveLength(sqlFiles().length);
	});
});
