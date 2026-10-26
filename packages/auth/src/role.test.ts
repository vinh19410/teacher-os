import { describe, expect, test } from "vitest";
import {
	canAccessFinance,
	FINANCE_ROLES,
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
