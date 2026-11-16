import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	buildPlacementSnapshot,
	type PlacementContent,
} from "@teacher-os/api/placement-test-contracts";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "../app";
import {
	loadPublishedPlacementSnapshot,
	resolveLeadTargetOrg,
} from "./resolve-lead-org";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

let db: Db;

function makeSampleContent(title = "Reading"): PlacementContent {
	return {
		bands: [
			{
				min: 0,
				max: 100,
				cefr: "A2",
				course: "comm-1",
				displayCourse: "Communication English Level 1",
				advice: "Học Level 1.",
			},
		],
		parts: [
			{
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-la",
						partLabel: "Part 1",
						instruction: "Listen.",
						title: "Clip 1",
						notesTitle: "",
						transcript: "",
						audioId: null,
						maxPlays: 2,
						level: "A1",
						questions: [
							{
								id: "l-a1",
								type: "mcq",
								level: "A1",
								prompt: "What time?",
								options: ["7:00", "7:15", "7:30"],
								answer: 0,
							},
						],
					},
				],
			},
			{
				id: "vocab-grammar",
				title: "Grammar & Vocabulary",
				questions: [
					{
						id: "gv-01",
						kind: "grammar",
						level: "A1",
						prompt: "She ___ a nurse.",
						options: ["am", "is", "are"],
						answer: 1,
					},
				],
			},
			{
				id: "reading",
				title,
				passages: [
					{
						id: "ra",
						partLabel: "Part 1",
						kind: "sign",
						instruction: "Choose.",
						title: "POOL",
						body: "POOL CLOSED",
						questions: [
							{
								id: "r-a1",
								level: "A1",
								prompt: "",
								options: ["Open", "Closed", "Free"],
								answer: 1,
							},
						],
					},
				],
			},
			{
				id: "writing",
				title: "Writing",
				promptTitle: "Email",
				promptBody: "Write an email.",
				minWords: 20,
				maxWords: 50,
			},
			{
				id: "speaking",
				title: "Speaking",
				tasks: [
					{
						id: "s-1",
						partLabel: "Part 1",
						level: "A1",
						prompt: "Introduce yourself.",
						prepSeconds: 10,
						answerSeconds: 30,
					},
				],
			},
		],
	};
}

beforeEach(async () => {
	const client = createClient({ url: "file::memory:" });
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	db = raw as unknown as Db;

	await db.insert(schema.organization).values([
		{ id: "org-qa", name: "QA Old Org" },
		{ id: "org-teacher-1", name: "Cô Mỹ Org 1" },
		{ id: "org-teacher-2", name: "Cô Mỹ Org 2" },
		{ id: "org-backup", name: "Backup Teacher Org" },
	]);
});

describe("resolveLeadTargetOrg (#742)", () => {
	test("trả null khi leadOrgId rỗng hoặc chỉ toàn khoảng trắng (giữ fail-closed 503)", async () => {
		expect(
			await resolveLeadTargetOrg(db, {
				leadOrgId: undefined,
				teacherEmails: ["comy@example.com"],
			}),
		).toBeNull();
		expect(
			await resolveLeadTargetOrg(db, {
				leadOrgId: "   ",
				teacherEmails: ["comy@example.com"],
			}),
		).toBeNull();
	});

	test("trả leadOrgId khi teacherEmails rỗng hoặc chưa có thành viên khớp", async () => {
		expect(
			await resolveLeadTargetOrg(db, {
				leadOrgId: "  org-qa  ",
				teacherEmails: [],
			}),
		).toBe("org-qa");

		expect(
			await resolveLeadTargetOrg(db, {
				leadOrgId: "org-qa",
				teacherEmails: ["comy@example.com"],
			}),
		).toBe("org-qa");
	});

	test("tương thích AUTH_ASSUME_EMAIL_VERIFIED=true: không lọc user.emailVerified=1 trong SQL", async () => {
		await db.insert(schema.user).values({
			id: "u-my",
			name: "Cô Mỹ",
			email: "CoMy@Example.com",
			emailVerified: false,
			role: "teacher",
		});
		await db.insert(schema.membership).values({
			id: "m-my",
			orgId: "org-teacher-1",
			userId: "u-my",
			role: "teacher",
		});

		const resolved = await resolveLeadTargetOrg(db, {
			leadOrgId: "org-qa",
			teacherEmails: ["  comy@example.com  "],
		});
		expect(resolved).toBe("org-teacher-1");
	});

	test("chỉ nhận FINANCE_ROLES (teacher/owner/admin) và loại trừ user.role student/admin", async () => {
		await db.insert(schema.user).values([
			{
				id: "u-ta",
				name: "TA",
				email: "ta@example.com",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-student",
				name: "Student",
				email: "student@example.com",
				emailVerified: true,
				role: "student",
			},
			{
				id: "u-admin",
				name: "Admin",
				email: "admin@example.com",
				emailVerified: true,
				role: "admin",
			},
			{
				id: "u-owner",
				name: "Owner",
				email: "owner@example.com",
				emailVerified: true,
				role: "teacher",
			},
		]);
		await db.insert(schema.membership).values([
			{
				id: "m-ta",
				orgId: "org-teacher-1",
				userId: "u-ta",
				role: "ta",
				createdAt: new Date(1000),
			},
			{
				id: "m-student",
				orgId: "org-teacher-1",
				userId: "u-student",
				role: "teacher",
				createdAt: new Date(1000),
			},
			{
				id: "m-admin",
				orgId: "org-teacher-1",
				userId: "u-admin",
				role: "admin",
				createdAt: new Date(1000),
			},
			{
				id: "m-owner",
				orgId: "org-teacher-2",
				userId: "u-owner",
				role: "owner",
				createdAt: new Date(2000),
			},
		]);

		const resolved = await resolveLeadTargetOrg(db, {
			leadOrgId: "org-qa",
			teacherEmails: [
				"ta@example.com",
				"student@example.com",
				"admin@example.com",
				"owner@example.com",
			],
		});
		expect(resolved).toBe("org-teacher-2");
	});

	test("ưu tiên thứ tự TEACHER_EMAILS trước, rồi membership createdAt ASC, id ASC", async () => {
		await db.insert(schema.user).values([
			{
				id: "u-backup",
				name: "Backup",
				email: "backup@example.com",
				role: "teacher",
			},
			{
				id: "u-primary",
				name: "Primary",
				email: "primary@example.com",
				role: "teacher",
			},
		]);
		// Backup tạo sớm hơn Primary, nhưng Primary đứng đầu TEACHER_EMAILS.
		await db.insert(schema.membership).values([
			{
				id: "m-backup",
				orgId: "org-backup",
				userId: "u-backup",
				role: "teacher",
				createdAt: new Date(1000),
			},
			{
				id: "m-primary-later",
				orgId: "org-qa",
				userId: "u-primary",
				role: "teacher",
				createdAt: new Date(3000),
			},
			{
				id: "m-primary-b",
				orgId: "org-teacher-2",
				userId: "u-primary",
				role: "admin",
				createdAt: new Date(2000),
			},
			{
				id: "m-primary-a",
				orgId: "org-teacher-1",
				userId: "u-primary",
				role: "teacher",
				createdAt: new Date(2000),
			},
		]);

		const resolved = await resolveLeadTargetOrg(db, {
			leadOrgId: "org-qa",
			teacherEmails: ["primary@example.com", "backup@example.com"],
		});
		// Cùng createdAt = 2000 -> id "m-primary-a" < "m-primary-b" -> org-teacher-1.
		expect(resolved).toBe("org-teacher-1");
	});
});

describe("loadPublishedPlacementSnapshot (#742)", () => {
	test("fallback về LEAD_ORG_ID nếu org giáo viên chưa có bản phát hành, ưu tiên org giáo viên khi đã phát hành", async () => {
		const qaSnap = buildPlacementSnapshot(makeSampleContent("QA Reading"), 1);
		const teacherSnap = buildPlacementSnapshot(
			makeSampleContent("Teacher Reading"),
			2,
		);

		await db.insert(schema.placementTest).values({
			orgId: "org-qa",
			draft: JSON.stringify(makeSampleContent("QA Reading")),
			published: JSON.stringify(qaSnap),
			revision: 1,
			publishedRevision: 1,
			publishedVersion: 1,
			publishedAt: new Date(),
			updatedAt: new Date(),
		});

		// Org giáo viên chỉ mới có draft (published = null) -> fallback về org-qa.
		await db.insert(schema.placementTest).values({
			orgId: "org-teacher-1",
			draft: JSON.stringify(makeSampleContent("Teacher Draft Only")),
			published: null,
			revision: 1,
			publishedVersion: 0,
			updatedAt: new Date(),
		});

		const fallbackRes = await loadPublishedPlacementSnapshot(
			db,
			"org-teacher-1",
			"org-qa",
		);
		expect(fallbackRes?.sourceOrgId).toBe("org-qa");
		expect(fallbackRes?.publishedVersion).toBe(1);
		expect(fallbackRes?.snapshot.parts[2].title).toBe("QA Reading");

		// Giáo viên phát hành bộ đề riêng -> ưu tiên org-teacher-1.
		await db.insert(schema.placementTest).values({
			orgId: "org-teacher-2",
			draft: JSON.stringify(makeSampleContent("Teacher Reading")),
			published: JSON.stringify(teacherSnap),
			revision: 2,
			publishedRevision: 2,
			publishedVersion: 2,
			publishedAt: new Date(),
			updatedAt: new Date(),
		});

		const ownRes = await loadPublishedPlacementSnapshot(
			db,
			"org-teacher-2",
			"org-qa",
		);
		expect(ownRes?.sourceOrgId).toBe("org-teacher-2");
		expect(ownRes?.publishedVersion).toBe(2);
		expect(ownRes?.snapshot.parts[2].title).toBe("Teacher Reading");
	});

	test("trả null khi cả org giáo viên lẫn fallback đều chưa phát hành", async () => {
		expect(
			await loadPublishedPlacementSnapshot(db, "org-teacher-1", "org-qa"),
		).toBeNull();
	});
});
