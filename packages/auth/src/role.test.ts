import { describe, expect, test } from "vitest";
import { resolveRequestApp, resolveUserRole } from "./role";

const STUDENT = ["http://localhost:8003", "https://portal.example.com"];
const TEACHER = ["http://localhost:8001", "https://app.example.com"];

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
