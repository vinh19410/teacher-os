import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
	parseRestructureSyllabusArgs,
	runRestructureClassSyllabusCli,
} from "../../scripts/restructure-class-syllabus-prod";
import * as schema from "../schema/index";
import {
	applyRestructureClassSyllabusPlan,
	auditClassSyllabus,
	buildRestructureClassSyllabusPlan,
	createLibsqlVocabPromoteRunner,
	formatClassSyllabusAuditReport,
	formatRestructureRollbackSql,
	parseRestructureSpecJson,
	type RestructureClassSyllabusSpec,
	verifyRestructuredClassSyllabus,
} from "./restructure-class-syllabus";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../migrations", import.meta.url).href,
);

let templateDir = "";
let templateDbPath = "";

async function openMigratedDb(dbPath: string) {
	copyFileSync(templateDbPath, dbPath);
	const client = createClient({ url: `file:${dbPath}` });
	await client.execute("PRAGMA foreign_keys = ON;");
	const db = drizzle(client, { schema });
	return { client, db };
}

describe("restructure-class-syllabus pipeline", () => {
	const tmpDirs: string[] = [];

	beforeAll(async () => {
		templateDir = mkdtempSync(join(tmpdir(), "restructure-syllabus-template-"));
		templateDbPath = join(templateDir, "template.sqlite");
		const client = createClient({ url: `file:${templateDbPath}` });
		try {
			const db = drizzle(client, { schema });
			await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		} finally {
			client.close();
		}
	}, 30_000);

	afterAll(() => {
		if (templateDir) {
			rmSync(templateDir, { recursive: true, force: true });
		}
	});

	function makeTempDir(): string {
		const dir = mkdtempSync(join(tmpdir(), "restructure-syllabus-test-"));
		tmpDirs.push(dir);
		return dir;
	}

	afterEach(() => {
		for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	async function seedSampleClassCurriculum(db: ReturnType<typeof drizzle>) {
		await db.insert(schema.organization).values({
			id: "org-prod-1",
			name: "Ms My English",
		});
		await db.insert(schema.user).values({
			id: "usr-teacher-1",
			name: "Teacher My",
			email: "teacher@msmy.io.vn",
			emailVerified: true,
			role: "teacher",
		});
		await db.insert(schema.membership).values({
			id: "mem-1",
			userId: "usr-teacher-1",
			orgId: "org-prod-1",
			role: "owner",
		});

		// Shared template (must NEVER be mutated!)
		await db.insert(schema.syllabus).values({
			id: "tpl-gt2",
			orgId: "org-prod-1",
			name: "Giao tiếp Level 2",
			level: "Level 2",
			type: "communication",
			skills: "[]",
			description: "Template gốc",
			totalLessons: 4,
			classId: null,
			sourceTemplateId: null,
		});
		await db.insert(schema.syllabusModule).values([
			{
				id: "tpl-mod-1",
				orgId: "org-prod-1",
				syllabusId: "tpl-gt2",
				title: "Nơi ở (Accommodation)",
				description: "Mô tả template 1",
				position: 0,
			},
			{
				id: "tpl-mod-2",
				orgId: "org-prod-1",
				syllabusId: "tpl-gt2",
				title: "Công việc (Work)",
				description: "",
				position: 1,
			},
		]);
		await db.insert(schema.syllabusLesson).values([
			{
				id: "tpl-les-1",
				orgId: "org-prod-1",
				moduleId: "tpl-mod-1",
				title: "Buổi 1",
				objectives: "Template obj 1",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 0,
			},
			{
				id: "tpl-les-2",
				orgId: "org-prod-1",
				moduleId: "tpl-mod-2",
				title: "Buổi 2",
				objectives: "Template obj 2",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 0,
			},
		]);

		// Target class + another sibling class
		await db.insert(schema.classTable).values([
			{
				id: "cls-demo-gt2",
				orgId: "org-prod-1",
				name: "Demo Class giao tiếp level 2",
				type: "communication",
				level: "Level 2",
				mode: "Online",
				status: "active",
				schedulingMode: "auto",
				sessionsTotal: 6,
				sessionsDone: 2,
			},
			{
				id: "cls-other-gt2",
				orgId: "org-prod-1",
				name: "Lớp Giao tiếp Level 2 khác",
				type: "communication",
				level: "Level 2",
				mode: "Online",
				status: "active",
				schedulingMode: "auto",
				sessionsTotal: 2,
				sessionsDone: 0,
			},
		]);

		// Class copy for target class: 5 modules (where topics were put as modules) + 1 empty module
		await db.insert(schema.syllabus).values([
			{
				id: "sy-copy-demo",
				orgId: "org-prod-1",
				name: "Giao tiếp Level 2",
				level: "Level 2",
				type: "communication",
				skills: "[]",
				description: "Giáo trình bản copy lớp mục tiêu",
				totalLessons: 99, // intentionally mismatched to test syncTotalLessons
				classId: "cls-demo-gt2",
				sourceTemplateId: "tpl-gt2",
			},
			{
				id: "sy-copy-other",
				orgId: "org-prod-1",
				name: "Giao tiếp Level 2",
				level: "Level 2",
				type: "communication",
				skills: "[]",
				description: "Bản copy lớp khác",
				totalLessons: 1,
				classId: "cls-other-gt2",
				sourceTemplateId: "tpl-gt2",
			},
		]);

		await db
			.update(schema.classTable)
			.set({ syllabusId: "sy-copy-demo" })
			.where(eq(schema.classTable.id, "cls-demo-gt2"));

		await db.insert(schema.syllabusModule).values([
			{
				id: "mod-1",
				orgId: "org-prod-1",
				syllabusId: "sy-copy-demo",
				title: "Nơi ở (Accommodation)",
				description: "Chủ đề nhà cửa và không gian sống",
				position: 0,
			},
			{
				id: "mod-2",
				orgId: "org-prod-1",
				syllabusId: "sy-copy-demo",
				title: "Công việc (Work & Career)",
				description: "",
				position: 1,
			},
			{
				id: "mod-3-empty",
				orgId: "org-prod-1",
				syllabusId: "sy-copy-demo",
				title: "Module trống lỗi import",
				description: "",
				position: 2,
			},
			{
				id: "mod-4",
				orgId: "org-prod-1",
				syllabusId: "sy-copy-demo",
				title: "Kiểm tra giữa kỳ",
				description: "",
				position: 3,
			},
			{
				id: "mod-5",
				orgId: "org-prod-1",
				syllabusId: "sy-copy-demo",
				title: "Du lịch (Travel)",
				description: "Tình huống sân bay & khách sạn",
				position: 4,
			},
			{
				id: "mod-6",
				orgId: "org-prod-1",
				syllabusId: "sy-copy-demo",
				title: "Kiểm tra cuối kỳ",
				description: "",
				position: 5,
			},
			{
				id: "mod-other-1",
				orgId: "org-prod-1",
				syllabusId: "sy-copy-other",
				title: "Lớp khác module 1",
				description: "",
				position: 0,
			},
		]);

		await db.insert(schema.syllabusLesson).values([
			{
				id: "les-1",
				orgId: "org-prod-1",
				moduleId: "mod-1",
				title: "Buổi 1",
				objectives: "Từ vựng nhà ở",
				materials: "PRIVATE NOTE DO NOT LEAK",
				kind: "lesson",
				status: "done",
				position: 0,
			},
			{
				id: "les-2",
				orgId: "org-prod-1",
				moduleId: "mod-2",
				title: "Buổi 2",
				objectives: "Phỏng vấn cơ bản",
				materials: "",
				kind: "lesson",
				status: "done",
				position: 0,
			},
			{
				id: "les-3",
				orgId: "org-prod-1",
				moduleId: "mod-2",
				title: "Buổi 3",
				objectives: "Email công việc",
				materials: "",
				kind: "lesson",
				status: "current",
				position: 1,
			},
			{
				id: "les-4",
				orgId: "org-prod-1",
				moduleId: "mod-4",
				title: "Buổi 4",
				objectives: "Đánh giá giữa kỳ",
				materials: "",
				kind: "midterm",
				status: "upcoming",
				position: 0,
			},
			{
				id: "les-5",
				orgId: "org-prod-1",
				moduleId: "mod-5",
				title: "Buổi 5",
				objectives: "Đặt phòng khách sạn",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 0,
			},
			{
				id: "les-6",
				orgId: "org-prod-1",
				moduleId: "mod-6",
				title: "Buổi 6",
				objectives: "Tổng kết cuối kỳ",
				materials: "",
				kind: "final",
				status: "upcoming",
				position: 0,
			},
			{
				id: "les-other-1",
				orgId: "org-prod-1",
				moduleId: "mod-other-1",
				title: "Buổi 1 lớp khác",
				objectives: "",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 0,
			},
		]);

		// Bank materials linked to lessons inside modules that WILL BE DELETED (mod-4, mod-5, mod-6)
		await db.insert(schema.material).values([
			{
				id: "mat-1",
				orgId: "org-prod-1",
				title: "Slide Accommodation",
				kind: "link",
				url: "https://example.com/1",
				createdBy: "usr-teacher-1",
			},
			{
				id: "mat-2",
				orgId: "org-prod-1",
				title: "Slide Travel",
				kind: "link",
				url: "https://example.com/2",
				createdBy: "usr-teacher-1",
			},
			{
				id: "mat-3",
				orgId: "org-prod-1",
				title: "Final Test Rubric",
				kind: "link",
				url: "https://example.com/3",
				createdBy: "usr-teacher-1",
			},
		]);
		await db.insert(schema.syllabusLessonMaterial).values([
			{
				orgId: "org-prod-1",
				syllabusLessonId: "les-1",
				materialId: "mat-1",
				position: 0,
			},
			{
				orgId: "org-prod-1",
				syllabusLessonId: "les-5",
				materialId: "mat-2",
				position: 0,
			},
			{
				orgId: "org-prod-1",
				syllabusLessonId: "les-6",
				materialId: "mat-3",
				position: 0,
			},
		]);

		// Scheduled lessons for target class
		await db.insert(schema.student).values({
			id: "stu-demo",
			orgId: "org-prod-1",
			name: "Demo Student",
		});
		await db.insert(schema.enrollment).values({
			id: "enr-demo",
			orgId: "org-prod-1",
			studentId: "stu-demo",
			classId: "cls-demo-gt2",
			status: "active",
		});
		await db.insert(schema.lesson).values([
			{
				id: "sched-1",
				orgId: "org-prod-1",
				classId: "cls-demo-gt2",
				enrollmentId: "enr-demo",
				day: 1,
				time: "19:00",
				dur: 60,
				date: "2026-11-02",
				status: "completed",
				topic: "",
			},
			{
				id: "sched-2",
				orgId: "org-prod-1",
				classId: "cls-demo-gt2",
				enrollmentId: "enr-demo",
				day: 3,
				time: "19:00",
				dur: 60,
				date: "2026-11-04",
				status: "holiday",
				topic: "",
			},
			{
				id: "sched-3",
				orgId: "org-prod-1",
				classId: "cls-demo-gt2",
				enrollmentId: "enr-demo",
				day: 5,
				time: "19:00",
				dur: 60,
				date: "2026-11-06",
				status: "upcoming",
				topic: "Custom override topic",
			},
		]);
	}

	it("parses CLI args and enforces production safety gates", () => {
		expect(() => parseRestructureSyllabusArgs([])).toThrow(/transport/i);
		expect(() =>
			parseRestructureSyllabusArgs([
				"--d1",
				"--file",
				"/tmp/a.db",
				"--class",
				"X",
			]),
		).toThrow(/Cannot combine/);
		expect(() => parseRestructureSyllabusArgs(["--file", "/tmp/a.db"])).toThrow(
			/target class/i,
		);
		expect(() =>
			parseRestructureSyllabusArgs([
				"--file",
				"/tmp/a.db",
				"--class",
				"X",
				"--mode",
				"apply",
			]),
		).toThrow(/spec-json/);
		expect(() =>
			parseRestructureSyllabusArgs([
				"--d1",
				"--d1-stage",
				"prod",
				"--mode",
				"apply",
				"--class",
				"X",
				"--spec-json",
				"{}",
			]),
		).toThrow(/--allow-prod/);
		expect(() =>
			parseRestructureSyllabusArgs([
				"--d1",
				"--d1-stage",
				"prod",
				"--mode",
				"apply",
				"--allow-prod",
				"--confirm-prod",
				"wrong",
				"--class",
				"X",
				"--spec-json",
				"{}",
			]),
		).toThrow(/--confirm-prod prod/);

		const ok = parseRestructureSyllabusArgs([
			"--d1",
			"--d1-stage",
			"prod",
			"--mode",
			"apply",
			"--allow-prod",
			"--confirm-prod",
			"prod",
			"--class",
			"Demo Class giao tiếp level 2",
			"--spec-json",
			"{}",
			"--public-logs",
		]);
		expect(ok.mode).toBe("apply");
		expect(ok.d1).toBe(true);
		expect(ok.d1Stage).toBe("prod");
		expect(ok.publicLogs).toBe(true);
	});

	it("audits class curriculum read-only and redacts sensitive fields in publicLogs mode", async () => {
		const dir = makeTempDir();
		const { client, db } = await openMigratedDb(join(dir, "audit.sqlite"));
		try {
			await seedSampleClassCurriculum(db);
			const runner = createLibsqlVocabPromoteRunner(client);

			// Flexible matching (extra spaces / case / punctuation)
			const audit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				className: "  DEMO. CLASS - giao tiếp level 2 ",
			});
			expect(audit.matchedVia).toBe("punctuation_normalized");
			expect(audit.classInfo.id).toBe("cls-demo-gt2");
			expect(audit.modules).toHaveLength(6);
			expect(audit.flatLessons).toHaveLength(6);
			expect(audit.materialLinks).toHaveLength(3);
			expect(audit.sourceTemplate).toEqual({
				id: "tpl-gt2",
				exists: true,
				name: "Giao tiếp Level 2",
				moduleCount: 2,
				lessonCount: 2,
			});
			expect(audit.scheduledSessions.teachingDatesCount).toBe(2);
			expect(audit.scheduledSessions.holidayDatesCount).toBe(1);
			expect(audit.scheduledSessions.nonEmptyLessonTopicRows).toBe(1);

			const publicReport = formatClassSyllabusAuditReport(audit, {
				publicLogs: true,
			});
			expect(publicReport).toContain("Nơi ở (Accommodation)");
			expect(publicReport).toContain("Du lịch (Travel)");
			expect(publicReport).not.toContain("Demo Class");
			expect(publicReport).not.toContain("cls-demo-gt2");
			expect(publicReport).not.toContain("org-prod-1");
			expect(publicReport).not.toContain("sy-copy-demo");
			expect(publicReport).not.toContain("mod-1");
			expect(publicReport).not.toContain("les-1");
			expect(publicReport).not.toContain("PRIVATE NOTE DO NOT LEAK");
			expect(publicReport).toContain("materialsTextLen=");
		} finally {
			client.close();
		}
	});

	it("validates spec constraints fail-closed (non-contiguous, missing lesson, precondition mismatch)", async () => {
		const dir = makeTempDir();
		const { client, db } = await openMigratedDb(join(dir, "validate.sqlite"));
		try {
			await seedSampleClassCurriculum(db);
			const runner = createLibsqlVocabPromoteRunner(client);
			const audit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				className: "Demo Class giao tiếp level 2",
			});

			// Must be 2 stages
			expect(() =>
				parseRestructureSpecJson(
					JSON.stringify({
						stages: [{ title: "Only 1", lessonRange: [1, 6] }],
						lessonTitleMode: "module-title",
					}),
				),
			).toThrow(/exactly 2 stages/i);

			// Non-contiguous partition breaks session mapping -> reject
			const nonContiguous = parseRestructureSpecJson(
				JSON.stringify({
					stages: [
						{ title: "Chặng 1", lessonOrdinals: [1, 3, 5] },
						{ title: "Chặng 2", lessonOrdinals: [2, 4, 6] },
					],
					lessonTitleMode: "module-title",
				}),
			);
			expect(() =>
				buildRestructureClassSyllabusPlan(audit, nonContiguous),
			).toThrow(/strict ascending contiguous order/i);

			// Wrong expectedCurrentModules -> reject
			const wrongGuard: RestructureClassSyllabusSpec = {
				expectedCurrentModules: 99,
				stages: [
					{ title: "Chặng 1", lessonRange: [1, 4] },
					{ title: "Chặng 2", lessonRange: [5, 6] },
				],
				lessonTitleMode: "module-title",
			};
			expect(() =>
				buildRestructureClassSyllabusPlan(audit, wrongGuard),
			).toThrow(/expectedCurrentModules/);
		} finally {
			client.close();
		}
	});

	it("applies 2-stage restructure end-to-end preserving all lesson IDs, material links, template, and executes lossless rollback SQL", async () => {
		const dir = makeTempDir();
		const dbPath = join(dir, "apply.sqlite");
		const dumpPrefix = join(dir, "backup");
		const { client, db } = await openMigratedDb(dbPath);
		try {
			await seedSampleClassCurriculum(db);
			const runner = createLibsqlVocabPromoteRunner(client);

			const beforeAudit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-demo-gt2",
			});
			const beforeOtherAudit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-other-gt2",
			});

			const spec: RestructureClassSyllabusSpec = {
				expectedCurrentModules: 6,
				expectedCurrentLessons: 6,
				expectedSyllabusName: "Giao tiếp Level 2",
				stages: [
					{
						title: "Chặng 1: Nền tảng giao tiếp",
						description: "Nửa đầu khóa đến giữa kỳ",
						lessonRange: [1, 4],
					},
					{
						title: "Chặng 2: Mở rộng & Ứng dụng",
						description: "Nửa sau khóa đến cuối kỳ",
						lessonRange: [5, 6],
					},
				],
				lessonTitleMode: "module-suffix-if-multi",
				objectivesMode: "prepend-module-description",
				lessonOverrides: [{ ordinal: 4, title: "Buổi 4: Kiểm tra giữa kỳ" }],
				syncTotalLessons: true,
			};

			// 1. CLI dry-run must NOT write anything
			let dryStdout = "";
			await runRestructureClassSyllabusCli(
				[
					"--file",
					dbPath,
					"--mode",
					"dry-run",
					"--class",
					"Demo Class giao tiếp level 2",
					"--teacher-emails",
					"teacher@msmy.io.vn",
					"--spec-json",
					JSON.stringify(spec),
					"--public-logs",
				],
				{
					writeStdout: (chunk) => {
						dryStdout += chunk;
					},
				},
			);
			expect(dryStdout).toContain("DRY-RUN plan preview complete");
			expect(dryStdout).not.toContain("Demo Class");
			expect(dryStdout).not.toContain("cls-demo-gt2");

			const stillBefore = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-demo-gt2",
			});
			expect(stillBefore.stateHash).toBe(beforeAudit.stateHash);

			// 2. CLI apply with dump & public-logs
			let applyStdout = "";
			await runRestructureClassSyllabusCli(
				[
					"--file",
					dbPath,
					"--mode",
					"apply",
					"--class",
					"Demo Class giao tiếp level 2",
					"--teacher-emails",
					"teacher@msmy.io.vn",
					"--spec-json",
					JSON.stringify(spec),
					"--dump",
					dumpPrefix,
					"--public-logs",
				],
				{
					writeStdout: (chunk) => {
						applyStdout += chunk;
					},
				},
			);
			expect(applyStdout).toContain("Verify: ok=true, modules=2, lessons=6");
			expect(applyStdout).toContain("materialLinks=3/3");
			expect(applyStdout).toContain("flatOrderPreserved=true");
			expect(applyStdout).not.toContain("Demo Class");
			expect(applyStdout).not.toContain("cls-demo-gt2");

			const preimagePath = `${dumpPrefix}-preimage.json`;
			const rollbackPath = `${dumpPrefix}-rollback.sql`;
			expect(existsSync(preimagePath)).toBe(true);
			expect(existsSync(rollbackPath)).toBe(true);

			// Verify restructured state directly in DB
			const afterAudit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-demo-gt2",
			});
			expect(afterAudit.modules).toHaveLength(2);
			expect(afterAudit.modules[0]?.module.title).toBe(
				"Chặng 1: Nền tảng giao tiếp",
			);
			expect(afterAudit.modules[1]?.module.title).toBe(
				"Chặng 2: Mở rộng & Ứng dụng",
			);
			expect(afterAudit.syllabus.totalLessons).toBe(6);

			// Exact lesson IDs, flattened order, statuses, materials preserved
			expect(afterAudit.flatLessons.map((f) => f.lesson.id)).toEqual([
				"les-1",
				"les-2",
				"les-3",
				"les-4",
				"les-5",
				"les-6",
			]);
			expect(afterAudit.flatLessons.map((f) => f.lesson.title)).toEqual([
				"Nơi ở (Accommodation)",
				"Công việc (Work & Career) — Buổi 2",
				"Công việc (Work & Career) — Buổi 3",
				"Buổi 4: Kiểm tra giữa kỳ",
				"Du lịch (Travel)",
				"Kiểm tra cuối kỳ",
			]);
			expect(afterAudit.flatLessons[0]?.lesson.objectives).toBe(
				"Chủ đề nhà cửa và không gian sống\nTừ vựng nhà ở",
			);
			expect(afterAudit.flatLessons[0]?.lesson.status).toBe("done");
			expect(afterAudit.flatLessons[0]?.lesson.materials).toBe(
				"PRIVATE NOTE DO NOT LEAK",
			);
			// All 3 bank material links survived even though mod-5 and mod-6 were deleted!
			expect(afterAudit.materialLinks).toHaveLength(3);
			expect(
				afterAudit.materialLinks
					.map((l) => `${l.syllabusLessonId}:${l.materialId}`)
					.sort(),
			).toEqual(["les-1:mat-1", "les-5:mat-2", "les-6:mat-3"]);

			// Shared template & sibling class completely untouched
			const tplModules = await runner.queryRows(
				"SELECT id, title FROM syllabus_module WHERE syllabus_id = 'tpl-gt2' ORDER BY position ASC",
			);
			expect(tplModules).toHaveLength(2);
			expect(tplModules[0]?.title).toBe("Nơi ở (Accommodation)");
			const afterOtherAudit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-other-gt2",
			});
			expect(afterOtherAudit.stateHash).toBe(beforeOtherAudit.stateHash);

			// 3. Execute generated rollback SQL and verify bit-for-bit restoration!
			const rollbackSql = readFileSync(rollbackPath, "utf8");
			const sqlStatements = rollbackSql
				.split(/;\s*\n/)
				.map((s) =>
					s
						.split("\n")
						.filter((line) => !line.trim().startsWith("--"))
						.join("\n")
						.trim(),
				)
				.filter((s) => s.length > 0);
			for (const stmt of sqlStatements) {
				await client.execute(stmt);
			}
			const rolledBackAudit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-demo-gt2",
			});
			expect(rolledBackAudit.stateHash).toBe(beforeAudit.stateHash);
			expect(rolledBackAudit.modules).toHaveLength(6);
			expect(rolledBackAudit.materialLinks).toHaveLength(3);
		} finally {
			client.close();
		}
	});

	it("blocks live drift between audit and apply, single-use replay, and supports expanding 1 module to 2 stages", async () => {
		const dir = makeTempDir();
		const { client, db } = await openMigratedDb(join(dir, "guards.sqlite"));
		try {
			await seedSampleClassCurriculum(db);
			const runner = createLibsqlVocabPromoteRunner(client);

			// Test live drift detection
			const audit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-demo-gt2",
			});
			const plan = buildRestructureClassSyllabusPlan(audit, {
				stages: [
					{ title: "Chặng 1", lessonRange: [1, 3] },
					{ title: "Chặng 2", lessonRange: [4, 6] },
				],
				lessonTitleMode: "lesson-colon-module",
			});
			expect(plan.lessonChanges[0]?.toTitle).toBe(
				"Buổi 1: Nơi ở (Accommodation)",
			);

			// Concurrent mutation after audit
			await client.execute({
				sql: "UPDATE syllabus_lesson SET title = 'Edited concurrently' WHERE id = 'les-1'",
				args: [],
			});
			await expect(
				applyRestructureClassSyllabusPlan(runner, plan),
			).rejects.toThrow(/Live preflight failed/i);
			// Single-use plan guard
			await expect(
				applyRestructureClassSyllabusPlan(runner, plan),
			).rejects.toThrow(/already been consumed/i);

			// Test expanding from 1 module -> 2 modules (sibling class: add 1 more lesson so it has 2 lessons in 1 module)
			await db.insert(schema.syllabusLesson).values({
				id: "les-other-2",
				orgId: "org-prod-1",
				moduleId: "mod-other-1",
				title: "Buổi 2 lớp khác",
				objectives: "",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 1,
			});
			const singleModAudit = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-other-gt2",
			});
			const expandPlan = buildRestructureClassSyllabusPlan(singleModAudit, {
				stages: [
					{ title: "Chặng 1", lessonRange: [1, 1] },
					{ title: "Chặng 2", lessonRange: [2, 2] },
				],
				lessonTitleMode: "keep",
			});
			expect(expandPlan.targetModules[0].action).toBe("reuse");
			expect(expandPlan.targetModules[1].action).toBe("insert");
			await applyRestructureClassSyllabusPlan(runner, expandPlan);
			const verifyExpand = await verifyRestructuredClassSyllabus(
				runner,
				expandPlan,
			);
			expect(verifyExpand.ok).toBe(true);
			expect(verifyExpand.moduleCount).toBe(2);

			// Rollback SQL of insert path also cleanly removes inserted stage
			const rollbackSql = formatRestructureRollbackSql(expandPlan);
			for (const stmt of rollbackSql
				.split(/;\s*\n/)
				.map((s) =>
					s
						.split("\n")
						.filter((l) => !l.trim().startsWith("--"))
						.join("\n")
						.trim(),
				)
				.filter((s) => s.length > 0)) {
				await client.execute(stmt);
			}
			const afterRollback = await auditClassSyllabus(runner, {
				targetOrgId: "org-prod-1",
				classId: "cls-other-gt2",
			});
			expect(afterRollback.stateHash).toBe(singleModAudit.stateHash);
		} finally {
			client.close();
		}
	});
});
