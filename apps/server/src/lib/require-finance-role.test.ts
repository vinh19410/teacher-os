import { createClient } from "@libsql/client";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import { classTable } from "@teacher-os/db/schema/class";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { membership } from "@teacher-os/db/schema/membership";
import { organization } from "@teacher-os/db/schema/organization";
import { student } from "@teacher-os/db/schema/student";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "../app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

interface TestSession {
	userId: string;
	userName: string;
	token: string;
}

async function createFinanceTestHarness() {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const db = libsql as unknown as Db;

	async function getSessionUser(headers: Headers) {
		const cookie = headers.get("cookie") ?? "";
		const token = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
		if (!token) return null;
		const [row] = await libsql
			.select({
				userId: authSession.userId,
				expiresAt: authSession.expiresAt,
				userName: authUser.name,
			})
			.from(authSession)
			.innerJoin(authUser, eq(authSession.userId, authUser.id))
			.where(eq(authSession.token, token));
		if (!row || row.expiresAt.getTime() <= Date.now()) return null;
		return {
			userId: row.userId,
			userName: row.userName,
			role: "teacher" as const,
		};
	}

	const app = buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser,
		authHandler: () => new Response("auth stub", { status: 404 }),
	});

	async function insertMember(opts: {
		orgId: string;
		role: string;
		name?: string;
	}): Promise<TestSession> {
		const userId = crypto.randomUUID();
		const token = crypto.randomUUID();
		const userName = opts.name ?? `Member ${opts.role}`;
		await libsql
			.insert(authUser)
			.values({ id: userId, name: userName, email: `${userId}@test.local` });
		await libsql.insert(authSession).values({
			id: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			token,
			userId,
		});
		await libsql.insert(membership).values({
			id: crypto.randomUUID(),
			orgId: opts.orgId,
			userId,
			role: opts.role,
		});
		return { userId, userName, token };
	}

	async function call(
		path: string,
		options: {
			method?: string;
			session?: TestSession;
			origin?: string | null;
			body?: unknown;
		} = {},
	) {
		const headers: Record<string, string> = {};
		if (options.session) {
			headers.cookie = `better-auth.session_token=${options.session.token}`;
		}
		if (options.origin !== null) {
			headers.origin = options.origin ?? CORS_ORIGIN;
		}
		if (options.body !== undefined) {
			headers["content-type"] = "application/json";
		}
		return app.request(path, {
			method: options.method ?? "GET",
			headers,
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}

	const orgId = crypto.randomUUID();
	const studentId = crypto.randomUUID();
	const classId = crypto.randomUUID();
	const enrollmentId = crypto.randomUUID();
	const invoiceId = crypto.randomUUID();
	const payToken = "paytok_tos17_test_token_123456";
	const today = vietnamTodayISO();

	await libsql.insert(organization).values({ id: orgId, name: "Org TOS-17" });
	await libsql.insert(student).values({
		id: studentId,
		orgId,
		name: "Nguyễn Minh Anh",
		phone: "0901112222",
		email: "minhanh@test.local",
		zalo: "0901112222",
		parentName: "",
		parentPhone: "",
	});
	await libsql.insert(classTable).values({
		id: classId,
		orgId,
		name: "IELTS 6.5A",
		level: "Band 6.5",
		type: "ielts",
		skills: '["Writing"]',
		mode: "Online",
		schedule: "",
		sessionsTotal: 12,
		sessionsDone: 0,
		status: "active",
		startDate: "01/10",
		notes: "",
	});
	await libsql.insert(enrollment).values({
		id: enrollmentId,
		orgId,
		classId,
		studentId,
		status: "active",
	});
	await libsql.insert(invoice).values({
		id: invoiceId,
		orgId,
		studentId,
		enrollmentId,
		amount: 4_500_000,
		paidAmount: 0,
		status: "unpaid",
		date: "26/10",
		due: today,
		type: "Học phí",
		method: "Chuyển khoản",
		note: "",
		payToken,
	});

	return {
		call,
		insertMember,
		orgId,
		studentId,
		enrollmentId,
		invoiceId,
		payToken,
	};
}

const FINANCE_ENDPOINTS: ReadonlyArray<{
	method: "GET" | "POST";
	path: (invoiceId: string) => string;
	body?: (enrollmentId: string, invoiceId: string) => unknown;
}> = [
	{ method: "GET", path: () => "/api/invoices" },
	{
		method: "POST",
		path: () => "/api/invoices",
		body: (enrollmentId) => ({
			enrollmentId,
			amount: 1_000_000,
			due: "2099-12-31",
			note: "",
		}),
	},
	{
		method: "POST",
		path: (id) => `/api/invoices/${id}/mark-paid`,
		body: () => ({ method: "Tiền mặt" }),
	},
	{
		method: "POST",
		path: (id) => `/api/invoices/${id}/payments`,
		body: () => ({
			clientRequestId: crypto.randomUUID(),
			amount: 500_000,
			method: "cash",
			note: "",
		}),
	},
	{
		method: "POST",
		path: (id) => `/api/invoices/${id}/rotate-pay-token`,
		body: () => ({}),
	},
	{ method: "GET", path: (id) => `/api/invoices/${id}/payment` },
	{ method: "GET", path: (id) => `/api/invoices/${id}/transactions` },
	{ method: "GET", path: () => "/api/payment-transactions" },
	{
		method: "POST",
		path: () => "/api/payment-transactions/tx-1/assign",
		body: (_, invoiceId) => ({ invoiceId }),
	},
	{
		method: "POST",
		path: () => "/api/payment-transactions/tx-1/ignore",
		body: () => ({}),
	},
	{ method: "GET", path: () => "/api/bank-link" },
	{
		method: "POST",
		path: () => "/api/bank-link/link-token",
		body: () => ({ purpose: "link" }),
	},
	{
		method: "POST",
		path: () => "/api/bank-link/reconcile",
		body: () => ({}),
	},
	{
		method: "POST",
		path: () => "/api/bank-link/sync",
		body: () => ({}),
	},
];

describe("requireFinanceRole & snapshot viewer (TOS-17 #451)", () => {
	test.each(["ta", "class_teacher", "", "unknown_role"])(
		"blocks finance routes with 403 finance-forbidden and hides snapshot invoices for role %j",
		async (blockedRole) => {
			const h = await createFinanceTestHarness();
			const member = await h.insertMember({
				orgId: h.orgId,
				role: blockedRole,
			});

			for (const ep of FINANCE_ENDPOINTS) {
				const res = await h.call(ep.path(h.invoiceId), {
					method: ep.method,
					session: member,
					body: ep.body?.(h.enrollmentId, h.invoiceId),
				});
				expect(
					res.status,
					`${ep.method} ${ep.path(h.invoiceId)} for role=${blockedRole}`,
				).toBe(403);
				expect(await res.json()).toEqual({ error: "finance-forbidden" });
			}

			const snapRes = await h.call("/api/kernel", { session: member });
			expect(snapRes.status).toBe(200);
			const snap = (await snapRes.json()) as KernelSnapshot;
			expect(snap.invoices).toEqual([]);
			expect(snap.viewer).toEqual({
				role: blockedRole,
				canAccessFinance: false,
			});

			const remRes = await h.call("/api/dashboard/reminders", {
				session: member,
			});
			expect(remRes.status).toBe(200);
			const rem = (await remRes.json()) as Record<string, unknown>;
			expect(rem.tuition).toBeUndefined();
		},
	);

	test.each(["teacher", "owner", "admin"])(
		"allows finance routes and returns snapshot invoices + viewer.canAccessFinance=true for role %j",
		async (allowedRole) => {
			const h = await createFinanceTestHarness();
			const member = await h.insertMember({
				orgId: h.orgId,
				role: allowedRole,
			});

			const listRes = await h.call("/api/invoices", { session: member });
			expect(listRes.status).toBe(200);
			const list = (await listRes.json()) as unknown[];
			expect(list).toHaveLength(1);

			const txRes = await h.call(`/api/invoices/${h.invoiceId}/transactions`, {
				session: member,
			});
			expect(txRes.status).toBe(200);

			const payRes = await h.call(`/api/invoices/${h.invoiceId}/payments`, {
				method: "POST",
				session: member,
				body: {
					clientRequestId: crypto.randomUUID(),
					amount: 500_000,
					method: "cash",
					note: "Thu thử",
				},
			});
			expect(payRes.status).toBe(201);

			const snapRes = await h.call("/api/kernel", { session: member });
			expect(snapRes.status).toBe(200);
			const snap = (await snapRes.json()) as KernelSnapshot;
			expect(snap.invoices).toHaveLength(1);
			expect(snap.viewer).toEqual({
				role: allowedRole,
				canAccessFinance: true,
			});

			const remRes = await h.call("/api/dashboard/reminders", {
				session: member,
			});
			expect(remRes.status).toBe(200);
			const rem = (await remRes.json()) as {
				tuition?: { students: number; outstanding: number };
			};
			expect(rem.tuition).toEqual({ students: 1, outstanding: 4_000_000 });
		},
	);

	test("unauthenticated calls still receive 401 unauthorized, while public pay and webhooks are unaffected", async () => {
		const h = await createFinanceTestHarness();

		for (const ep of FINANCE_ENDPOINTS) {
			const res = await h.call(ep.path(h.invoiceId), {
				method: ep.method,
				body: ep.body?.(h.enrollmentId, h.invoiceId),
			});
			expect(
				res.status,
				`unauthenticated ${ep.method} ${ep.path(h.invoiceId)}`,
			).toBe(401);
		}

		const publicPayRes = await h.call(`/public/pay/${h.payToken}`, {
			origin: null,
		});
		expect(publicPayRes.status).toBe(200);
	});
});
