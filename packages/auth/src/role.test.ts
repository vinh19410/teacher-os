import { describe, expect, test } from "vitest";
import {
	CLASS_STATUS_MANAGE_ROLES,
	canAccessFinance,
	canManageClassStatus,
	canPublishGrade,
	canReadMaterials,
	canReviewGrade,
	canWriteMaterials,
	FINANCE_ROLES,
	GRADING_PUBLISH_ROLES,
	GRADING_REVIEW_ROLES,
	MATERIAL_READ_ROLES,
	MATERIAL_WRITE_ROLES,
	resolveRequestApp,
	resolveUserRole,
} from "./role";

const STUDENT = ["http://localhost:8003", "https://portal.example.com"];
const TEACHER = ["http://localhost:8001", "https://app.example.com"];
const ADMIN = ["http://localhost:8004", "https://admin.example.com"];

describe("resolveUserRole", () => {
	test("student maps to student", () => {
		expect(resolveUserRole("student")).toBe("student");
	});

	test("teacher and NULL/undefined fall back to teacher", () => {
		expect(resolveUserRole("teacher")).toBe("teacher");
		expect(resolveUserRole(null)).toBe("teacher");
		expect(resolveUserRole(undefined)).toBe("teacher");
		expect(resolveUserRole("weird")).toBe("teacher");
	});
});

describe("resolveRequestApp", () => {
	test("exact student origin → student", () => {
		expect(
			resolveRequestApp({
				origin: "http://localhost:8003",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
		expect(
			resolveRequestApp({
				origin: "https://portal.example.com",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
	});

	test("exact teacher origin → teacher", () => {
		expect(
			resolveRequestApp({
				origin: "http://localhost:8001",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("teacher");
	});

	test("origin matching is exact and case/whitespace tolerant only", () => {
		expect(
			resolveRequestApp({
				origin: "  HTTP://LOCALHOST:8003 ",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
		expect(
			resolveRequestApp({
				origin: "http://localhost:8003.evil.com",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
		expect(
			resolveRequestApp({
				origin: "http://localhost:80030",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
	});

	test("unknown origin falls to oauthApp stamp", () => {
		expect(
			resolveRequestApp({
				origin: "https://stranger.example.com",
				oauthApp: "teacher",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("teacher");
		expect(
			resolveRequestApp({
				origin: null,
				oauthApp: "student",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
	});

	test('literal "null" origin is never trusted', () => {
		expect(
			resolveRequestApp({
				origin: "null",
				oauthApp: null,
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
		expect(
			resolveRequestApp({
				origin: "null",
				oauthApp: "teacher",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("teacher");
	});

	test("missing everything defaults to student (least privilege)", () => {
		expect(
			resolveRequestApp({
				origin: null,
				oauthApp: null,
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
	});
});

describe("resolveUserRole — admin (plan #413 phase 1)", () => {
	test("admin maps to admin", () => {
		expect(resolveUserRole("admin")).toBe("admin");
	});
});

describe("resolveRequestApp — admin origin (plan #413 phase 1)", () => {
	test("exact admin origin → admin", () => {
		expect(
			resolveRequestApp({
				origin: "http://localhost:8004",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
				adminOrigins: ADMIN,
			}),
		).toBe("admin");
		expect(
			resolveRequestApp({
				origin: "https://admin.example.com",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
				adminOrigins: ADMIN,
			}),
		).toBe("admin");
	});

	test("admin origin matching is exact — prefix/suffix spoofs stay student", () => {
		expect(
			resolveRequestApp({
				origin: "http://localhost:80040",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
				adminOrigins: ADMIN,
			}),
		).toBe("student");
		expect(
			resolveRequestApp({
				origin: "https://admin.example.com.evil.com",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
				adminOrigins: ADMIN,
			}),
		).toBe("student");
		expect(
			resolveRequestApp({
				origin: "https://evil-admin.example.com",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
				adminOrigins: ADMIN,
			}),
		).toBe("student");
	});

	test("unknown origin with admin oauthApp stamp → admin", () => {
		expect(
			resolveRequestApp({
				origin: "https://stranger.example.com",
				oauthApp: "admin",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
				adminOrigins: ADMIN,
			}),
		).toBe("admin");
	});

	test("missing adminOrigins behaves like an empty admin list", () => {
		expect(
			resolveRequestApp({
				origin: "http://localhost:8004",
				studentOrigins: STUDENT,
				teacherOrigins: TEACHER,
			}),
		).toBe("student");
	});
});

describe("canAccessFinance (TOS-17 #451)", () => {
	test("allows teacher (legacy org owner), owner, and admin", () => {
		expect(FINANCE_ROLES).toEqual(["teacher", "owner", "admin"]);
		expect(canAccessFinance("teacher")).toBe(true);
		expect(canAccessFinance("owner")).toBe(true);
		expect(canAccessFinance("admin")).toBe(true);
	});

	test("denies ta, class_teacher, empty, null/undefined, and unknown roles", () => {
		expect(canAccessFinance("ta")).toBe(false);
		expect(canAccessFinance("class_teacher")).toBe(false);
		expect(canAccessFinance("")).toBe(false);
		expect(canAccessFinance("student")).toBe(false);
		expect(canAccessFinance("xyz")).toBe(false);
		expect(canAccessFinance(null)).toBe(false);
		expect(canAccessFinance(undefined)).toBe(false);
	});
});

describe("canPublishGrade / canReviewGrade (TOS-33 #481 AC-004)", () => {
	const ROLES = [
		"teacher",
		"owner",
		"admin",
		"class_teacher",
		"ta",
		"student",
		"xyz",
		"",
	] as const;

	test("canPublishGrade allows teacher/owner/admin/class_teacher — NOT ta", () => {
		expect(GRADING_PUBLISH_ROLES).toEqual([
			"teacher",
			"owner",
			"admin",
			"class_teacher",
		]);
		expect(canPublishGrade("teacher")).toBe(true);
		expect(canPublishGrade("owner")).toBe(true);
		expect(canPublishGrade("admin")).toBe(true);
		expect(canPublishGrade("class_teacher")).toBe(true);
		expect(canPublishGrade("ta")).toBe(false);
	});

	test("canReviewGrade allows publishing roles PLUS ta (lưu bản nháp)", () => {
		expect(GRADING_REVIEW_ROLES).toEqual([
			"teacher",
			"owner",
			"admin",
			"class_teacher",
			"ta",
		]);
		for (const role of GRADING_REVIEW_ROLES) {
			expect(canReviewGrade(role)).toBe(true);
		}
	});

	test("both deny student, unknown, empty, null/undefined", () => {
		for (const fn of [canPublishGrade, canReviewGrade]) {
			expect(fn("student")).toBe(false);
			expect(fn("xyz")).toBe(false);
			expect(fn("")).toBe(false);
			expect(fn(null)).toBe(false);
			expect(fn(undefined)).toBe(false);
		}
		// Đủ bảng: teacher+owner+admin+class_teacher publish; ta chỉ review.
		expect(canPublishGrade("ta")).toBe(false);
		expect(canReviewGrade("ta")).toBe(true);
		void ROLES;
	});
});

describe("canWriteMaterials / canReadMaterials (#646)", () => {
	test("canWriteMaterials allows teacher/owner/admin/class_teacher — NOT ta", () => {
		expect(MATERIAL_WRITE_ROLES).toEqual([
			"teacher",
			"owner",
			"admin",
			"class_teacher",
		]);
		expect(canWriteMaterials("teacher")).toBe(true);
		expect(canWriteMaterials("owner")).toBe(true);
		expect(canWriteMaterials("admin")).toBe(true);
		expect(canWriteMaterials("class_teacher")).toBe(true);
		expect(canWriteMaterials("ta")).toBe(false);
	});

	test("canReadMaterials allows write roles PLUS ta", () => {
		expect(MATERIAL_READ_ROLES).toEqual([
			"teacher",
			"owner",
			"admin",
			"class_teacher",
			"ta",
		]);
		for (const role of MATERIAL_READ_ROLES) {
			expect(canReadMaterials(role)).toBe(true);
		}
	});

	test("both deny student, case-mismatch, unknown, empty, null/undefined", () => {
		for (const fn of [canWriteMaterials, canReadMaterials]) {
			expect(fn("student")).toBe(false);
			expect(fn("TEACHER")).toBe(false);
			expect(fn("unknown")).toBe(false);
			expect(fn("")).toBe(false);
			expect(fn(null)).toBe(false);
			expect(fn(undefined)).toBe(false);
		}
	});
});

describe("class status role allowlist (#694)", () => {
	test("canManageClassStatus allows teacher/owner/admin/class_teacher and denies ta/null/undefined/unknown", () => {
		expect(CLASS_STATUS_MANAGE_ROLES).toEqual([
			"teacher",
			"owner",
			"admin",
			"class_teacher",
		]);
		expect(canManageClassStatus("teacher")).toBe(true);
		expect(canManageClassStatus("owner")).toBe(true);
		expect(canManageClassStatus("admin")).toBe(true);
		expect(canManageClassStatus("class_teacher")).toBe(true);
		expect(canManageClassStatus("ta")).toBe(false);
		expect(canManageClassStatus("student")).toBe(false);
		expect(canManageClassStatus("TEACHER")).toBe(false);
		expect(canManageClassStatus("")).toBe(false);
		expect(canManageClassStatus(null)).toBe(false);
		expect(canManageClassStatus(undefined)).toBe(false);
	});
});
