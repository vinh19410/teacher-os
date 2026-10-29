import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { SessionUser } from "../session";
import { createRequireAdmin } from "./require-admin";

/**
 * Plan #413 phase 1: requireAdmin = role 'admin' ∧ emailVerified ∧ email ∈
 * ADMIN_EMAILS (lowercase, kiểm lại MỖI request — allowlist đổi lúc runtime
 * phải có hiệu lực ngay mà không cần tái tạo session).
 */

const SESSION: SessionUser = {
	userId: "u1",
	userName: "Root",
	email: "Root@Example.com",
	emailVerified: true,
	role: "admin",
};

interface Deps {
	session: SessionUser | null;
	adminEmails: string[];
}

function buildApp(deps: Deps) {
	const app = new Hono();
	app.use(
		"/admin/*",
		createRequireAdmin({
			getSessionUser: async () => deps.session,
			adminEmails: deps.adminEmails,
		}),
	);
	app.get("/admin/ok", (c) => c.text("granted"));
	return app;
}

function request(app: ReturnType<typeof buildApp>) {
	return app.request("/admin/ok", {
		headers: { cookie: "better-auth.session_token=t" },
	});
}

describe("createRequireAdmin (plan #413 phase 1)", () => {
	test("admin + verified + email trong allowlist (khác hoa/thường) → qua guard", async () => {
		const res = await request(
			buildApp({ session: SESSION, adminEmails: ["ROOT@example.com"] }),
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("granted");
	});

	test("allowlist có khoảng trắng/hoa thường hỗn hợp vẫn khớp lowercase", async () => {
		const res = await request(
			buildApp({
				session: SESSION,
				adminEmails: [" other@example.com ", "root@example.com"],
			}),
		);
		expect(res.status).toBe(200);
	});

	test("không có session → 401", async () => {
		const res = await request(
			buildApp({ session: null, adminEmails: ["root@example.com"] }),
		);
		expect(res.status).toBe(401);
	});

	test("role không phải admin → 403 NOT_ADMIN", async () => {
		const res = await request(
			buildApp({
				session: { ...SESSION, role: "teacher" },
				adminEmails: ["root@example.com"],
			}),
		);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(ACCOUNT_ERROR_CODES.NOT_ADMIN);
	});

	test("email chưa verified → 403 NOT_ADMIN", async () => {
		const res = await request(
			buildApp({
				session: { ...SESSION, emailVerified: false },
				adminEmails: ["root@example.com"],
			}),
		);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(ACCOUNT_ERROR_CODES.NOT_ADMIN);
	});

	test("email ngoài allowlist → 403 NOT_ADMIN", async () => {
		const res = await request(
			buildApp({
				session: { ...SESSION, email: "stranger@example.com" },
				adminEmails: ["root@example.com"],
			}),
		);
		expect(res.status).toBe(403);
	});

	test("thiếu email trên session → 403 NOT_ADMIN", async () => {
		const res = await request(
			buildApp({
				session: { ...SESSION, email: undefined },
				adminEmails: ["root@example.com"],
			}),
		);
		expect(res.status).toBe(403);
	});

	test("allowlist rỗng → không ai là admin", async () => {
		const res = await request(buildApp({ session: SESSION, adminEmails: [] }));
		expect(res.status).toBe(403);
	});

	test("allowlist được kiểm lại mỗi request (đổi runtime có hiệu lực ngay)", async () => {
		const deps: Deps = { session: SESSION, adminEmails: [] };
		const app = buildApp(deps);
		expect((await request(app)).status).toBe(403);
		deps.adminEmails.push("root@example.com");
		expect((await request(app)).status).toBe(200);
	});
});
