import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "./index";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../migrations", import.meta.url).href,
);

describe("enrollment schema & migration 0101 (soft-remove partial unique index)", () => {
	it("rehearses forward-only migration 0101 without table rebuild and preserves existing rows", async () => {
		const client = createClient({ url: ":memory:" });
		try {
			const files = readdirSync(MIGRATIONS_DIR)
				.filter((f) => f.endsWith(".sql"))
				.sort();
			const pre0101 = files.filter((f) => f < "0101_");
			const file0101 = files.find((f) => f.startsWith("0101_"));
			expect(file0101).toBeDefined();

			const sql0101 = readFileSync(
				join(MIGRATIONS_DIR, file0101 as string),
				"utf8",
			);
			expect(sql0101).not.toContain("CREATE TABLE `__new_enrollment`");
			expect(sql0101).toContain("ALTER TABLE `enrollment` ADD `removed_at`");
			expect(sql0101).toContain('WHERE "enrollment"."status" != \'removed\'');

			for (const file of pre0101) {
				const sqlText = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
				for (const stmt of sqlText
					.split("--> statement-breakpoint")
					.map((s) => s.trim())
					.filter(Boolean)) {
					await client.execute(stmt);
				}
			}

			await client.execute({
				sql: "INSERT INTO organization (id, name) VALUES (?, ?)",
				args: ["org-1", "Org 1"],
			});
			await client.execute({
				sql: "INSERT INTO class (id, org_id, name) VALUES (?, ?, ?)",
				args: ["class-1", "org-1", "Class 1"],
			});
			await client.execute({
				sql: "INSERT INTO student (id, org_id, name) VALUES (?, ?, ?)",
				args: ["student-1", "org-1", "Student 1"],
			});
			await client.execute({
				sql: "INSERT INTO enrollment (id, org_id, class_id, student_id, status) VALUES (?, ?, ?, ?, ?)",
				args: ["enr-1", "org-1", "class-1", "student-1", "active"],
			});

			for (const stmt of sql0101
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean)) {
				await client.execute(stmt);
			}

			const existing = await client.execute({
				sql: "SELECT id, status, removed_at FROM enrollment WHERE id = ?",
				args: ["enr-1"],
			});
			expect(existing.rows).toHaveLength(1);
			expect(existing.rows[0]?.status).toBe("active");
			expect(existing.rows[0]?.removed_at).toBeNull();
		} finally {
			client.close();
		}
	});

	it("enforces uniqueness for non-removed enrollments while allowing re-enrollment and multiple removed history rows", async () => {
		const client = createClient({ url: ":memory:" });
		const db = drizzle(client, { schema });
		try {
			await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

			await db
				.insert(schema.organization)
				.values({ id: "org-1", name: "Org 1" });
			await db.insert(schema.classTable).values({
				id: "class-1",
				orgId: "org-1",
				name: "Class 1",
			});
			await db.insert(schema.student).values({
				id: "student-1",
				orgId: "org-1",
				name: "Student 1",
			});

			await db.insert(schema.enrollment).values({
				id: "enr-1",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-1",
				status: "active",
			});

			// Duplicate active or invited enrollment in the same class is rejected
			await expect(
				db.insert(schema.enrollment).values({
					id: "enr-dup-active",
					orgId: "org-1",
					classId: "class-1",
					studentId: "student-1",
					status: "active",
				}),
			).rejects.toThrow();

			await expect(
				db.insert(schema.enrollment).values({
					id: "enr-dup-invited",
					orgId: "org-1",
					classId: "class-1",
					studentId: "student-1",
					status: "invited",
				}),
			).rejects.toThrow();

			// Soft-remove enr-1 -> re-enrollment (invited -> active) succeeds
			const removedAt = new Date(1_700_000_000_000);
			await db
				.update(schema.enrollment)
				.set({ status: "removed", removedAt })
				.where(eq(schema.enrollment.id, "enr-1"));

			await db.insert(schema.enrollment).values({
				id: "enr-2",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-1",
				status: "invited",
			});

			await db
				.update(schema.enrollment)
				.set({ status: "active" })
				.where(eq(schema.enrollment.id, "enr-2"));

			// Soft-remove enr-2 -> multiple removed rows + third active row all allowed
			await db
				.update(schema.enrollment)
				.set({ status: "removed", removedAt: new Date(1_700_000_100_000) })
				.where(eq(schema.enrollment.id, "enr-2"));

			await db.insert(schema.enrollment).values({
				id: "enr-3",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-1",
				status: "active",
			});

			const rows = await db
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.classId, "class-1"));
			expect(rows.map((r) => [r.id, r.status])).toEqual([
				["enr-1", "removed"],
				["enr-2", "removed"],
				["enr-3", "active"],
			]);
			expect(rows[0]?.removedAt?.getTime()).toBe(1_700_000_000_000);
		} finally {
			client.close();
		}
	});
});
