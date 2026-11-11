import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

describe("student multi-org schema and migration constraints", () => {
	let db: ReturnType<typeof drizzle<typeof schema>>;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

		// Seed initial organizations and teacher
		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);

		await db.insert(schema.user).values({
			id: "u-teacher",
			name: "Teacher One",
			email: "teacher@test.local",
			emailVerified: true,
		});
	});

	test("allows same student email in two different organizations", async () => {
		await db.insert(schema.student).values({
			id: "s-1",
			orgId: "org-1",
			name: "Alex",
			email: "alex@gmail.com",
		});

		await expect(
			db.insert(schema.student).values({
				id: "s-2",
				orgId: "org-2",
				name: "Alex in Org 2",
				email: "alex@gmail.com",
			}),
		).resolves.toBeDefined();
	});

	test("rejects duplicate student email within the same organization", async () => {
		await expect(
			db.insert(schema.student).values({
				id: "s-3",
				orgId: "org-1",
				name: "Alex Duplicate",
				email: "Alex@gmail.com ", // mixed case + trailing space should collide
			}),
		).rejects.toThrow();
	});

	test("enforces partial unique index on pending student invitations per org", async () => {
		// Org 1 invite
		await db.insert(schema.studentInvitation).values({
			id: "inv-1",
			orgId: "org-1",
			inviterUserId: "u-teacher",
			email: "student.invitee@test.local",
			status: "pending",
		});

		// Org 1 duplicate pending invite -> should reject
		await expect(
			db.insert(schema.studentInvitation).values({
				id: "inv-2",
				orgId: "org-1",
				inviterUserId: "u-teacher",
				email: "Student.Invitee@test.local ",
				status: "pending",
			}),
		).rejects.toThrow();

		// Org 2 pending invite for same email -> should succeed
		await expect(
			db.insert(schema.studentInvitation).values({
				id: "inv-3",
				orgId: "org-2",
				inviterUserId: "u-teacher",
				email: "student.invitee@test.local",
				status: "pending",
			}),
		).resolves.toBeDefined();
	});
});
