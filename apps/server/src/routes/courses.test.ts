import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type Client,
	createClient,
	type InArgs,
	type InStatement,
} from "@libsql/client";
import type {
	CourseCatalogResponse,
	CourseCategoryDto,
	CourseItemDto,
} from "@teacher-os/api/course-contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import {
	isSqliteForeignKeyError,
	isSqliteUniqueError,
} from "../lib/course-catalog";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

function jsonHeaders(user: string): Record<string, string> {
	return {
		"x-test-user": user,
		origin: CORS_ORIGIN,
		"content-type": "application/json",
	};
}

describe("courses master data routes (/api/courses)", () => {
	let client: Client;
	let db: Db;
	let app: ServerApp;
	let nextSqlWriteUniqueErrorPattern: RegExp | null;

	beforeEach(async () => {
		nextSqlWriteUniqueErrorPattern = null;
		client = createClient({ url: "file::memory:" });
		const origExecute = client.execute.bind(client);
		client.execute = async (stmt: InStatement, args?: InArgs) => {
			const sqlText = typeof stmt === "string" ? stmt : stmt.sql;
			if (nextSqlWriteUniqueErrorPattern?.test(sqlText)) {
				nextSqlWriteUniqueErrorPattern = null;
				throw new Error("SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed");
			}
			return typeof stmt === "string"
				? origExecute(stmt, args)
				: origExecute(stmt);
		};
		const raw = drizzle(client, { schema });
		await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
		db = raw as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Trung tâm A" },
			{ id: "org-2", name: "Trung tâm B" },
		]);
		await db.insert(schema.user).values([
			{
				id: "u-owner",
				name: "Chủ trung tâm",
				email: "owner@test.local",
				role: "teacher",
			},
			{
				id: "u-ct",
				name: "GV đứng lớp",
				email: "ct@test.local",
				role: "teacher",
			},
			{
				id: "u-ta",
				name: "Trợ giảng",
				email: "ta@test.local",
				role: "teacher",
			},
			{
				id: "u-org2",
				name: "Chủ B",
				email: "org2@test.local",
				role: "teacher",
			},
		]);
		await db.insert(schema.membership).values([
			{ id: "m-owner", orgId: "org-1", userId: "u-owner", role: "owner" },
			{ id: "m-ct", orgId: "org-1", userId: "u-ct", role: "class_teacher" },
			{ id: "m-ta", orgId: "org-1", userId: "u-ta", role: "ta" },
			{ id: "m-org2", orgId: "org-2", userId: "u-org2", role: "teacher" },
		]);

		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			authHandler: async () => new Response("unused", { status: 404 }),
			getSessionUser: async (headers) => {
				const tag = headers.get("x-test-user");
				if (tag === "owner") {
					return {
						userId: "u-owner",
						userName: "Chủ trung tâm",
						role: "teacher",
					};
				}
				if (tag === "ct") {
					return { userId: "u-ct", userName: "GV đứng lớp", role: "teacher" };
				}
				if (tag === "ta") {
					return { userId: "u-ta", userName: "Trợ giảng", role: "teacher" };
				}
				if (tag === "org2") {
					return { userId: "u-org2", userName: "Chủ B", role: "teacher" };
				}
				return null;
			},
		});
	});

	test("tự động seed idempotent 2 nhóm + 7 khóa mặc định và không tự mọc lại sau khi xóa sạch", async () => {
		const [resA, resB] = await Promise.all([
			app.request("/api/courses", { headers: { "x-test-user": "owner" } }),
			app.request("/api/courses", { headers: { "x-test-user": "owner" } }),
		]);
		expect(resA.status).toBe(200);
		expect(resB.status).toBe(200);
		expect(resA.headers.get("cache-control")).toBe("no-store");

		const body = (await resA.json()) as CourseCatalogResponse;
		expect(body.categories).toHaveLength(2);
		expect(body.categories[0]?.id).toBe("org-1:cat:giao-tiep");
		expect(body.categories[0]?.name).toBe("Giao Tiếp");
		expect(body.categories[0]?.courses.map((c) => c.name)).toEqual([
			"Communication English Level 1",
			"Communication English Level 2",
			"Communication English Level 3",
		]);
		expect(body.categories[1]?.id).toBe("org-1:cat:ielts");
		expect(body.categories[1]?.name).toBe("IELTS");
		expect(body.categories[1]?.courses.map((c) => c.name)).toEqual([
			"Foundation",
			"First Step",
			"Pre IELTS",
			"Advanced",
		]);

		// Xóa sạch toàn bộ khóa rồi xóa toàn bộ nhóm -> đọc lại phải vẫn rỗng, không re-seed.
		for (const cat of body.categories) {
			for (const item of cat.courses) {
				const delItem = await app.request(`/api/courses/items/${item.id}`, {
					method: "DELETE",
					headers: { "x-test-user": "owner", origin: CORS_ORIGIN },
				});
				expect(delItem.status).toBe(200);
			}
			const delCat = await app.request(`/api/courses/categories/${cat.id}`, {
				method: "DELETE",
				headers: { "x-test-user": "owner", origin: CORS_ORIGIN },
			});
			expect(delCat.status).toBe(200);
		}

		const afterRes = await app.request("/api/courses", {
			headers: { "x-test-user": "owner" },
		});
		expect(afterRes.status).toBe(200);
		const afterBody = (await afterRes.json()) as CourseCatalogResponse;
		expect(afterBody.categories).toEqual([]);
	});

	test("phân quyền: 401 chưa đăng nhập; ta/class_teacher chỉ đọc activeOnly=true và bị 403 trên full catalog + ghi", async () => {
		const unauth = await app.request("/api/courses");
		expect(unauth.status).toBe(401);

		for (const roleUser of ["ta", "ct"]) {
			const activeRes = await app.request("/api/courses?activeOnly=true", {
				headers: { "x-test-user": roleUser },
			});
			expect(activeRes.status).toBe(200);
			const activeData = (await activeRes.json()) as CourseCatalogResponse;
			expect(activeData.categories).toHaveLength(2);

			const fullRes = await app.request("/api/courses", {
				headers: { "x-test-user": roleUser },
			});
			expect(fullRes.status).toBe(403);
			expect(((await fullRes.json()) as { code: string }).code).toBe(
				"COURSE_FORBIDDEN",
			);

			const createCat = await app.request("/api/courses/categories", {
				method: "POST",
				headers: jsonHeaders(roleUser),
				body: JSON.stringify({ name: "TOEIC" }),
			});
			expect(createCat.status).toBe(403);

			const patchCat = await app.request(
				"/api/courses/categories/org-1:cat:ielts",
				{
					method: "PATCH",
					headers: jsonHeaders(roleUser),
					body: JSON.stringify({ isActive: false }),
				},
			);
			expect(patchCat.status).toBe(403);

			const reorderCat = await app.request("/api/courses/categories/reorder", {
				method: "POST",
				headers: jsonHeaders(roleUser),
				body: JSON.stringify({
					orderedIds: ["org-1:cat:ielts", "org-1:cat:giao-tiep"],
				}),
			});
			expect(reorderCat.status).toBe(403);

			const deleteCat = await app.request(
				"/api/courses/categories/org-1:cat:ielts",
				{
					method: "DELETE",
					headers: { "x-test-user": roleUser, origin: CORS_ORIGIN },
				},
			);
			expect(deleteCat.status).toBe(403);

			const createCourse = await app.request("/api/courses/items", {
				method: "POST",
				headers: jsonHeaders(roleUser),
				body: JSON.stringify({
					categoryId: "org-1:cat:ielts",
					name: "IELTS Intensive",
				}),
			});
			expect(createCourse.status).toBe(403);

			const patchCourse = await app.request(
				"/api/courses/items/org-1:course:ielts-pre",
				{
					method: "PATCH",
					headers: jsonHeaders(roleUser),
					body: JSON.stringify({ name: "Pre IELTS 2" }),
				},
			);
			expect(patchCourse.status).toBe(403);

			const reorderCourse = await app.request("/api/courses/items/reorder", {
				method: "POST",
				headers: jsonHeaders(roleUser),
				body: JSON.stringify({
					categoryId: "org-1:cat:giao-tiep",
					orderedIds: [
						"org-1:course:comm-level-3",
						"org-1:course:comm-level-2",
						"org-1:course:comm-level-1",
					],
				}),
			});
			expect(reorderCourse.status).toBe(403);

			const deleteCourse = await app.request(
				"/api/courses/items/org-1:course:ielts-pre",
				{
					method: "DELETE",
					headers: { "x-test-user": roleUser, origin: CORS_ORIGIN },
				},
			);
			expect(deleteCourse.status).toBe(403);
		}
	});

	test("cô lập theo tổ chức: org-2 không đọc/sửa/xóa/gắn dữ liệu của org-1", async () => {
		// Seed cả 2 org
		await app.request("/api/courses", { headers: { "x-test-user": "owner" } });
		const org2List = await app.request("/api/courses", {
			headers: { "x-test-user": "org2" },
		});
		expect(org2List.status).toBe(200);
		const org2Data = (await org2List.json()) as CourseCatalogResponse;
		expect(org2Data.categories.every((c) => c.id.startsWith("org-2:"))).toBe(
			true,
		);

		const patchCatCross = await app.request(
			"/api/courses/categories/org-1:cat:ielts",
			{
				method: "PATCH",
				headers: jsonHeaders("org2"),
				body: JSON.stringify({ name: "Hijack" }),
			},
		);
		expect(patchCatCross.status).toBe(404);

		const deleteCatCross = await app.request(
			"/api/courses/categories/org-1:cat:ielts",
			{
				method: "DELETE",
				headers: { "x-test-user": "org2", origin: CORS_ORIGIN },
			},
		);
		expect(deleteCatCross.status).toBe(404);

		const addCourseCross = await app.request("/api/courses/items", {
			method: "POST",
			headers: jsonHeaders("org2"),
			body: JSON.stringify({
				categoryId: "org-1:cat:ielts",
				name: "Cross Course",
			}),
		});
		expect(addCourseCross.status).toBe(404);

		const patchCourseCross = await app.request(
			"/api/courses/items/org-1:course:ielts-pre",
			{
				method: "PATCH",
				headers: jsonHeaders("org2"),
				body: JSON.stringify({ name: "Hijack" }),
			},
		);
		expect(patchCourseCross.status).toBe(404);

		const moveIntoCrossCat = await app.request(
			"/api/courses/items/org-2:course:ielts-pre",
			{
				method: "PATCH",
				headers: jsonHeaders("org2"),
				body: JSON.stringify({ categoryId: "org-1:cat:ielts" }),
			},
		);
		expect(moveIntoCrossCat.status).toBe(404);

		const deleteCourseCross = await app.request(
			"/api/courses/items/org-1:course:ielts-pre",
			{
				method: "DELETE",
				headers: { "x-test-user": "org2", origin: CORS_ORIGIN },
			},
		);
		expect(deleteCourseCross.status).toBe(404);
	});

	test("CRUD đầy đủ, kiểm tra trùng tên (409), chặn xóa nhóm có khóa (409), sắp xếp, chuyển nhóm và lọc activeOnly", async () => {
		// 1. Tạo nhóm mới + trùng tên không phân biệt hoa/thường & khoảng trắng -> 409
		const dupCat = await app.request("/api/courses/categories", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ name: "  giao   TIẾP  " }),
		});
		expect(dupCat.status).toBe(409);
		expect(((await dupCat.json()) as { code: string }).code).toBe(
			"COURSE_CATEGORY_DUPLICATE",
		);

		const newCatRes = await app.request("/api/courses/categories", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ name: "TOEIC" }),
		});
		expect(newCatRes.status).toBe(201);
		const { category: toeicCat } = (await newCatRes.json()) as {
			category: CourseCategoryDto;
		};
		expect(toeicCat.name).toBe("TOEIC");
		expect(toeicCat.sortOrder).toBe(2);
		expect(toeicCat.isActive).toBe(true);

		// Đổi tên nhóm trùng tên nhóm khác -> 409
		const dupRenameCat = await app.request(
			`/api/courses/categories/${toeicCat.id}`,
			{
				method: "PATCH",
				headers: jsonHeaders("owner"),
				body: JSON.stringify({ name: "ielts" }),
			},
		);
		expect(dupRenameCat.status).toBe(409);

		// 2. Xóa nhóm đang có khóa -> 409 COURSE_CATEGORY_NOT_EMPTY
		const delNonEmpty = await app.request(
			"/api/courses/categories/org-1:cat:ielts",
			{
				method: "DELETE",
				headers: { "x-test-user": "owner", origin: CORS_ORIGIN },
			},
		);
		expect(delNonEmpty.status).toBe(409);
		expect(((await delNonEmpty.json()) as { code: string }).code).toBe(
			"COURSE_CATEGORY_NOT_EMPTY",
		);

		// 3. Thêm khóa học vào TOEIC + kiểm trùng tên trong cùng nhóm (409), cho phép trùng tên khác nhóm
		const addToeic = await app.request("/api/courses/items", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ categoryId: toeicCat.id, name: "Foundation" }),
		});
		expect(addToeic.status).toBe(201);
		const { course: toeicFoundation } = (await addToeic.json()) as {
			course: CourseItemDto;
		};
		expect(toeicFoundation.sortOrder).toBe(0);

		const dupCourse = await app.request("/api/courses/items", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({
				categoryId: toeicCat.id,
				name: "  foundation ",
			}),
		});
		expect(dupCourse.status).toBe(409);
		expect(((await dupCourse.json()) as { code: string }).code).toBe(
			"COURSE_DUPLICATE",
		);

		// Chuyển khóa "Foundation" từ TOEIC sang IELTS (đã có "Foundation") -> 409 COURSE_DUPLICATE
		const moveConflict = await app.request(
			`/api/courses/items/${toeicFoundation.id}`,
			{
				method: "PATCH",
				headers: jsonHeaders("owner"),
				body: JSON.stringify({ categoryId: "org-1:cat:ielts" }),
			},
		);
		expect(moveConflict.status).toBe(409);
		expect(((await moveConflict.json()) as { code: string }).code).toBe(
			"COURSE_DUPLICATE",
		);

		// Đổi tên và chuyển sang IELTS -> 200, sortOrder = max + 1 = 4
		const moveOk = await app.request(
			`/api/courses/items/${toeicFoundation.id}`,
			{
				method: "PATCH",
				headers: jsonHeaders("owner"),
				body: JSON.stringify({
					categoryId: "org-1:cat:ielts",
					name: "IELTS Speaking Clinic",
				}),
			},
		);
		expect(moveOk.status).toBe(200);
		const { course: movedCourse } = (await moveOk.json()) as {
			course: CourseItemDto;
		};
		expect(movedCourse.categoryId).toBe("org-1:cat:ielts");
		expect(movedCourse.name).toBe("IELTS Speaking Clinic");
		expect(movedCourse.sortOrder).toBe(4);

		// 4. Reorder nhóm: lỗi nếu trùng/thiếu -> 400; hợp lệ -> cập nhật thứ tự
		const badReorderCat = await app.request("/api/courses/categories/reorder", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ orderedIds: ["org-1:cat:ielts"] }),
		});
		expect(badReorderCat.status).toBe(400);

		const reorderCat = await app.request("/api/courses/categories/reorder", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({
				orderedIds: [toeicCat.id, "org-1:cat:ielts", "org-1:cat:giao-tiep"],
			}),
		});
		expect(reorderCat.status).toBe(200);
		const reorderedCats = (await reorderCat.json()) as CourseCatalogResponse;
		expect(reorderedCats.categories.map((c) => c.id)).toEqual([
			toeicCat.id,
			"org-1:cat:ielts",
			"org-1:cat:giao-tiep",
		]);

		// 5. Reorder khóa trong nhóm Giao Tiếp
		const badReorderCourse = await app.request("/api/courses/items/reorder", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({
				categoryId: "org-1:cat:giao-tiep",
				orderedIds: ["org-1:course:comm-level-1", "org-1:course:comm-level-1"],
			}),
		});
		expect(badReorderCourse.status).toBe(400);

		const reorderCourse = await app.request("/api/courses/items/reorder", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({
				categoryId: "org-1:cat:giao-tiep",
				orderedIds: [
					"org-1:course:comm-level-3",
					"org-1:course:comm-level-1",
					"org-1:course:comm-level-2",
				],
			}),
		});
		expect(reorderCourse.status).toBe(200);
		const reorderedCatalog =
			(await reorderCourse.json()) as CourseCatalogResponse;
		const gtCat = reorderedCatalog.categories.find(
			(c) => c.id === "org-1:cat:giao-tiep",
		);
		expect(gtCat?.courses.map((c) => c.id)).toEqual([
			"org-1:course:comm-level-3",
			"org-1:course:comm-level-1",
			"org-1:course:comm-level-2",
		]);

		// 6. Ẩn nhóm IELTS + ẩn 1 khóa Giao Tiếp -> activeOnly=true bỏ nhóm rỗng (TOEIC), bỏ nhóm ẩn (IELTS), bỏ khóa ẩn
		await app.request("/api/courses/categories/org-1:cat:ielts", {
			method: "PATCH",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ isActive: false }),
		});
		await app.request("/api/courses/items/org-1:course:comm-level-2", {
			method: "PATCH",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ isActive: false }),
		});

		const activeOnlyRes = await app.request("/api/courses?activeOnly=true", {
			headers: { "x-test-user": "ct" },
		});
		expect(activeOnlyRes.status).toBe(200);
		const activeCatalog = (await activeOnlyRes.json()) as CourseCatalogResponse;
		expect(activeCatalog.categories).toHaveLength(1);
		expect(activeCatalog.categories[0]?.id).toBe("org-1:cat:giao-tiep");
		expect(activeCatalog.categories[0]?.courses.map((c) => c.id)).toEqual([
			"org-1:course:comm-level-3",
			"org-1:course:comm-level-1",
		]);
	});

	test("xóa khóa học đang được placement_test_submission tham chiếu: set finalCourseId=null nhưng giữ nguyên finalDisplayCourse", async () => {
		// Seed danh mục
		const initRes = await app.request("/api/courses", {
			headers: { "x-test-user": "owner" },
		});
		expect(initRes.status).toBe(200);

		await db.insert(schema.lead).values({
			id: "lead-hist",
			orgId: "org-1",
			name: "Học viên Lịch Sử",
			phone: "0909888777",
			course: "IELTS - Pre IELTS",
			source: "placement-test",
			status: "new",
		});
		await db.insert(schema.placementTestSubmission).values({
			id: "sub-hist",
			orgId: "org-1",
			leadId: "lead-hist",
			testVersion: 1,
			snapshotJson: "{}",
			answersJson: "{}",
			objectiveBreakdownJson: "{}",
			status: "graded",
			finalBandLevel: "B1",
			finalCourseId: "org-1:course:ielts-pre",
			finalCourse: "org-1:course:ielts-pre",
			finalDisplayCourse: "IELTS - Pre IELTS",
			finalScorePct: 75,
			gradedAt: new Date(),
		});

		const delRes = await app.request(
			"/api/courses/items/org-1:course:ielts-pre",
			{
				method: "DELETE",
				headers: { "x-test-user": "owner", origin: CORS_ORIGIN },
			},
		);
		expect(delRes.status).toBe(200);
		expect(await delRes.json()).toEqual({ deleted: true });

		const [sub] = await db
			.select()
			.from(schema.placementTestSubmission)
			.where(eq(schema.placementTestSubmission.id, "sub-hist"));
		expect(sub?.finalCourseId).toBeNull();
		expect(sub?.finalDisplayCourse).toBe("IELTS - Pre IELTS");
	});

	test("bắt đúng SQLite FOREIGN KEY / UNIQUE constraint bọc trong cause (DrizzleQueryError)", async () => {
		const initRes = await app.request("/api/courses", {
			headers: { "x-test-user": "owner" },
		});
		expect(initRes.status).toBe(200);

		let fkErr: unknown = null;
		try {
			await db
				.delete(schema.courseCategory)
				.where(eq(schema.courseCategory.id, "org-1:cat:ielts"));
		} catch (err) {
			fkErr = err;
		}
		expect(fkErr).not.toBeNull();
		expect(isSqliteForeignKeyError(fkErr)).toBe(true);

		const wrappedUnique = new Error(
			"Failed query: insert into course_catalog_seed",
			{
				cause: new Error(
					"SQLITE_CONSTRAINT_PRIMARYKEY: UNIQUE constraint failed",
				),
			},
		);
		expect(isSqliteUniqueError(wrappedUnique)).toBe(true);
		expect(isSqliteUniqueError(new Error("generic database timeout"))).toBe(
			false,
		);
	});

	test("DB unique index chặn chèn trùng tên không phân biệt hoa/thường ASCII cho course_category và course, cho phép trùng tên khác org/khác nhóm", async () => {
		await app.request("/api/courses", { headers: { "x-test-user": "owner" } });
		await app.request("/api/courses", { headers: { "x-test-user": "org2" } });

		let catDupErr: unknown = null;
		try {
			await db.insert(schema.courseCategory).values({
				id: "org-1:cat:ielts-dup",
				orgId: "org-1",
				name: "  ielts  ",
				sortOrder: 99,
				isActive: true,
			});
		} catch (err) {
			catDupErr = err;
		}
		expect(catDupErr).not.toBeNull();
		expect(isSqliteUniqueError(catDupErr)).toBe(true);

		let courseDupErr: unknown = null;
		try {
			await db.insert(schema.course).values({
				id: "org-1:course:foundation-dup",
				orgId: "org-1",
				categoryId: "org-1:cat:ielts",
				name: "  FOUNDATION ",
				sortOrder: 99,
				isActive: true,
			});
		} catch (err) {
			courseDupErr = err;
		}
		expect(courseDupErr).not.toBeNull();
		expect(isSqliteUniqueError(courseDupErr)).toBe(true);

		// Same course name in a different category of the same org is allowed.
		await expect(
			db.insert(schema.course).values({
				id: "org-1:course:gt-foundation",
				orgId: "org-1",
				categoryId: "org-1:cat:giao-tiep",
				name: "Foundation",
				sortOrder: 99,
				isActive: true,
			}),
		).resolves.toBeDefined();

		// Same category name across different orgs is allowed.
		await expect(
			db.insert(schema.courseCategory).values([
				{
					id: "org-1:cat:business",
					orgId: "org-1",
					name: "Business",
					sortOrder: 50,
					isActive: true,
				},
				{
					id: "org-2:cat:business",
					orgId: "org-2",
					name: "Business",
					sortOrder: 50,
					isActive: true,
				},
			]),
		).resolves.toBeDefined();
	});

	test("cả 4 endpoint ghi trả 409 khi gặp lỗi SQLITE UNIQUE ở tầng DB (race condition sau pre-SELECT)", async () => {
		await app.request("/api/courses", { headers: { "x-test-user": "owner" } });

		const createCatOk = await app.request("/api/courses/categories", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ name: "TOEIC" }),
		});
		expect(createCatOk.status).toBe(201);
		const { category: toeicCat } = (await createCatOk.json()) as {
			category: CourseCategoryDto;
		};

		const createCourseOk = await app.request("/api/courses/items", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ categoryId: toeicCat.id, name: "TOEIC 500" }),
		});
		expect(createCourseOk.status).toBe(201);
		const { course: toeicCourse } = (await createCourseOk.json()) as {
			course: CourseItemDto;
		};

		// 1. POST /categories race
		nextSqlWriteUniqueErrorPattern =
			/^\s*insert\s+into\s+"?course_category"?\b/i;
		const postCatRace = await app.request("/api/courses/categories", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ name: "Business English" }),
		});
		expect(postCatRace.status).toBe(409);
		expect(((await postCatRace.json()) as { code: string }).code).toBe(
			"COURSE_CATEGORY_DUPLICATE",
		);

		// 2. PATCH /categories/:id race
		nextSqlWriteUniqueErrorPattern = /^\s*update\s+"?course_category"?\b/i;
		const patchCatRace = await app.request(
			`/api/courses/categories/${toeicCat.id}`,
			{
				method: "PATCH",
				headers: jsonHeaders("owner"),
				body: JSON.stringify({ name: "Business English 2" }),
			},
		);
		expect(patchCatRace.status).toBe(409);
		expect(((await patchCatRace.json()) as { code: string }).code).toBe(
			"COURSE_CATEGORY_DUPLICATE",
		);

		// 3. POST /items race
		nextSqlWriteUniqueErrorPattern = /^\s*insert\s+into\s+"?course"?\b/i;
		const postCourseRace = await app.request("/api/courses/items", {
			method: "POST",
			headers: jsonHeaders("owner"),
			body: JSON.stringify({ categoryId: toeicCat.id, name: "TOEIC 700" }),
		});
		expect(postCourseRace.status).toBe(409);
		expect(((await postCourseRace.json()) as { code: string }).code).toBe(
			"COURSE_DUPLICATE",
		);

		// 4. PATCH /items/:id race
		nextSqlWriteUniqueErrorPattern = /^\s*update\s+"?course"?\b/i;
		const patchCourseRace = await app.request(
			`/api/courses/items/${toeicCourse.id}`,
			{
				method: "PATCH",
				headers: jsonHeaders("owner"),
				body: JSON.stringify({ name: "TOEIC 800" }),
			},
		);
		expect(patchCourseRace.status).toBe(409);
		expect(((await patchCourseRace.json()) as { code: string }).code).toBe(
			"COURSE_DUPLICATE",
		);
	});

	test("PATCH /items/:id chỉ đổi isActive không kiểm trùng tên khi không đổi tên/chuyển nhóm", async () => {
		await app.request("/api/courses", { headers: { "x-test-user": "owner" } });

		// Legacy row with double whitespace: distinct under SQLite lower(trim(name))
		// but collides under app-level normalizeCourseNameKey().
		await db.insert(schema.course).values({
			id: "org-1:course:legacy-double-space",
			orgId: "org-1",
			categoryId: "org-1:cat:ielts",
			name: "Pre  IELTS",
			sortOrder: 99,
			isActive: true,
		});

		const toggleRes = await app.request(
			"/api/courses/items/org-1:course:ielts-pre",
			{
				method: "PATCH",
				headers: jsonHeaders("owner"),
				body: JSON.stringify({ isActive: false }),
			},
		);
		expect(toggleRes.status).toBe(200);
		const { course: toggled } = (await toggleRes.json()) as {
			course: CourseItemDto;
		};
		expect(toggled.isActive).toBe(false);
	});

	test("migration 0093 khử trùng an toàn bằng rowid cho dữ liệu trùng phức tạp, bảo toàn toàn bộ row và FK", async () => {
		const migFiles = readdirSync(MIGRATIONS_DIR)
			.filter((f) => f.endsWith(".sql"))
			.sort();
		const preFiles = migFiles.filter((f) => f < "0093_");
		const mig0093 = migFiles.find((f) => f.startsWith("0093_"));
		expect(mig0093, "migration 0093_*.sql must exist").toBeDefined();

		const rehearsalClient = createClient({ url: "file::memory:" });
		try {
			await rehearsalClient.execute("PRAGMA foreign_keys = OFF;");
			for (const file of preFiles) {
				const rawSql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
				for (const stmt of rawSql
					.split("--> statement-breakpoint")
					.map((s) => s.trim())
					.filter((s) => s.length > 0)) {
					await rehearsalClient.execute(stmt);
				}
			}
			await rehearsalClient.execute("PRAGMA foreign_keys = ON;");

			const now = Date.now();
			await rehearsalClient.execute({
				sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, ?)",
				args: ["org-mig", "Org Migration Test", now],
			});

			const catPrefix76 = "A".repeat(76);
			const catRows = [
				["org-mig:cat:toeic", "TOEIC", 0],
				["org-mig:cat:toeic-2", "toeic", 1],
				["org-mig:cat:toeic-existing-2", "TOEIC (2)", 2],
				["org-mig:cat:long-a1", `${catPrefix76}AAAA`, 3],
				["org-mig:cat:long-a2", `${catPrefix76}aaaa`, 4],
				["org-mig:cat:long-b1", `${catPrefix76}BBBB`, 5],
				["org-mig:cat:long-b2", `${catPrefix76}bbbb`, 6],
			] as const;
			for (const [id, name, sortOrder] of catRows) {
				await rehearsalClient.execute({
					sql: `INSERT INTO course_category (id, org_id, name, sort_order, is_active, created_at, updated_at)
						VALUES (?, ?, ?, ?, 1, ?, ?)`,
					args: [id, "org-mig", name, sortOrder, now, now],
				});
			}

			const coursePrefix116 = "C".repeat(116);
			const courseRows = [
				["org-mig:course:level-1", "Level 1", 0],
				["org-mig:course:level-1-dup", "level 1", 1],
				["org-mig:course:level-1-existing-2", "Level 1 (2)", 2],
				["org-mig:course:long-a1", `${coursePrefix116}AAAA`, 3],
				["org-mig:course:long-a2", `${coursePrefix116}aaaa`, 4],
				["org-mig:course:long-b1", `${coursePrefix116}BBBB`, 5],
				["org-mig:course:long-b2", `${coursePrefix116}bbbb`, 6],
			] as const;
			for (const [id, name, sortOrder] of courseRows) {
				await rehearsalClient.execute({
					sql: `INSERT INTO course (id, org_id, category_id, name, sort_order, is_active, created_at, updated_at)
						VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
					args: [id, "org-mig", "org-mig:cat:toeic", name, sortOrder, now, now],
				});
			}

			await rehearsalClient.execute({
				sql: `INSERT INTO lead (
						id, org_id, name, phone, email, birth_date, course, study_mode,
						study_days, time_slot, note, placement, teacher_note, source,
						status, ip_hash, submit_count, created_at, updated_at
					) VALUES (?, ?, ?, ?, '', '', '', '', '', '', '', '', '', 'placement-test', 'new', '', 1, ?, ?)`,
				args: ["lead-mig", "org-mig", "Học viên Mig", "0909111222", now, now],
			});
			await rehearsalClient.execute({
				sql: `INSERT INTO placement_test_submission (
						id, org_id, lead_id, test_version, snapshot_json, answers_json,
						objective_breakdown_json, status, final_course_id, final_course,
						final_display_course, submitted_at, updated_at
					) VALUES (?, ?, ?, 1, '{}', '{}', '{}', 'graded', ?, ?, ?, ?, ?)`,
				args: [
					"sub-mig",
					"org-mig",
					"lead-mig",
					"org-mig:course:level-1-dup",
					"org-mig:course:level-1-dup",
					"TOEIC - level 1",
					now,
					now,
				],
			});

			const sql0093 = readFileSync(
				join(MIGRATIONS_DIR, mig0093 as string),
				"utf8",
			);
			for (const stmt of sql0093
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter((s) => s.length > 0)) {
				await rehearsalClient.execute(stmt);
			}

			const catsAfter = await rehearsalClient.execute(
				"SELECT id, name FROM course_category WHERE org_id = 'org-mig'",
			);
			expect(catsAfter.rows).toHaveLength(catRows.length);
			const catKeys = new Set<string>();
			for (const row of catsAfter.rows) {
				const name = String(row.name);
				expect(name.length).toBeLessThanOrEqual(80);
				catKeys.add(name.trim().toLowerCase());
			}
			expect(catKeys.size).toBe(catRows.length);

			const coursesAfter = await rehearsalClient.execute(
				"SELECT id, name FROM course WHERE org_id = 'org-mig' AND category_id = 'org-mig:cat:toeic'",
			);
			expect(coursesAfter.rows).toHaveLength(courseRows.length);
			const courseKeys = new Set<string>();
			for (const row of coursesAfter.rows) {
				const name = String(row.name);
				expect(name.length).toBeLessThanOrEqual(120);
				courseKeys.add(name.trim().toLowerCase());
			}
			expect(courseKeys.size).toBe(courseRows.length);

			const fkRow = await rehearsalClient.execute(
				"SELECT final_course_id FROM placement_test_submission WHERE id = 'sub-mig'",
			);
			expect(fkRow.rows[0]?.final_course_id).toBe("org-mig:course:level-1-dup");

			const idxRows = await rehearsalClient.execute(
				`SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('course_category_org_name_uq', 'course_org_category_name_uq')`,
			);
			expect(idxRows.rows.map((r) => String(r.name)).sort()).toEqual([
				"course_category_org_name_uq",
				"course_org_category_name_uq",
			]);
		} finally {
			rehearsalClient.close();
		}
	});
});
