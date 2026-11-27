import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	MCP_TOKEN_ERROR_CODES,
	MCP_TOKEN_MAX_ACTIVE,
	MCP_TOKEN_PREFIX,
	mcpTokenCreateResponseSchema,
	mcpTokenListResponseSchema,
	mcpTokenRevokeResponseSchema,
} from "@teacher-os/api/mcp-token-contracts";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const USERS: Record<string, SessionUser> = {
	"teacher-1": {
		userId: "u-t1",
		userName: "Cô Mỹ",
		email: "my@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"teacher-2": {
		userId: "u-t2",
		userName: "Thầy Nam",
		email: "nam@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"ta-1": {
		userId: "u-ta1",
		userName: "Trợ giảng",
		email: "ta@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"student-1": {
		userId: "u-s1",
		userName: "Học viên",
		email: "sv@test.local",
		emailVerified: true,
		role: "student",
	},
};

describe("/api/mcp-tokens REST endpoints", () => {
	let app: ServerApp;
	let db: Db;
	let nowMs = Date.UTC(2026, 10, 27, 6, 0, 0);

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const rawDb = drizzle(client, { schema });
		await migrate(rawDb, { migrationsFolder: MIGRATIONS_DIR });
		db = rawDb as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Org 1" },
			{ id: "org-2", name: "Org 2" },
		]);
		await db.insert(schema.user).values([
			{
				id: "u-t1",
				name: "Cô Mỹ",
				email: "my@test.local",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-t2",
				name: "Thầy Nam",
				email: "nam@test.local",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-ta1",
				name: "Trợ giảng",
				email: "ta@test.local",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-s1",
				name: "Học viên",
				email: "sv@test.local",
				emailVerified: true,
				role: "student",
			},
		]);
		await db.insert(schema.membership).values([
			{ id: "m-1", orgId: "org-1", userId: "u-t1", role: "teacher" },
			{ id: "m-2", orgId: "org-2", userId: "u-t2", role: "teacher" },
			{ id: "m-3", orgId: "org-1", userId: "u-ta1", role: "ta" },
		]);

		app = buildApp({
			getDb: () => db,
			corsOrigin: ORIGIN,
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (USERS[key] ?? null) : null;
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
			now: () => new Date(nowMs),
		});
	});

	async function call(
		path: string,
		opts: {
			method?: string;
			user?: string;
			origin?: string | null;
			body?: unknown;
		} = {},
	) {
		const headers: Record<string, string> = {};
		if (opts.user) headers["x-test-user"] = opts.user;
		if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
		if (opts.body !== undefined) headers["content-type"] = "application/json";
		return app.request(path, {
			method: opts.method ?? "GET",
			headers,
			body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
		});
	}

	test("rejects unauthenticated, student, TA, and foreign-origin CSRF requests", async () => {
		expect((await call("/api/mcp-tokens")).status).toBe(401);
		expect((await call("/api/mcp-tokens", { user: "student-1" })).status).toBe(
			403,
		);
		expect((await call("/api/mcp-tokens", { user: "ta-1" })).status).toBe(403);
		expect(
			(
				await call("/api/mcp-tokens", {
					method: "POST",
					user: "teacher-1",
					origin: "https://evil.example",
					body: { name: "MacBook", expiresInDays: 90 },
				})
			).status,
		).toBe(403);
		expect(
			(
				await call("/api/mcp-tokens", {
					method: "POST",
					user: "teacher-1",
					origin: null,
					body: { name: "MacBook", expiresInDays: 90 },
				})
			).status,
		).toBe(403);
	});

	test("creates, lists without raw token/hash, revokes, and enforces org/user isolation", async () => {
		const createdRes = await call("/api/mcp-tokens", {
			method: "POST",
			user: "teacher-1",
			body: { name: "MacBook Cô Mỹ", expiresInDays: 90 },
		});
		expect(createdRes.status).toBe(201);
		expect(createdRes.headers.get("cache-control")).toBe("no-store");
		const created = mcpTokenCreateResponseSchema.parse(await createdRes.json());
		expect(created.rawToken.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
		expect(created.token.tokenPrefix).toBe(
			created.rawToken.slice(0, created.token.tokenPrefix.length),
		);
		expect(created.token.name).toBe("MacBook Cô Mỹ");
		expect(created.token.expiresAt).not.toBeNull();

		const listRes = await call("/api/mcp-tokens", { user: "teacher-1" });
		expect(listRes.status).toBe(200);
		const listText = await listRes.text();
		expect(listText).not.toContain(created.rawToken);
		expect(listText).not.toContain("tokenHash");
		const listed = mcpTokenListResponseSchema.parse(JSON.parse(listText));
		expect(listed.tokens).toHaveLength(1);
		expect(listed.tokens[0]?.id).toBe(created.token.id);

		// Teacher 2 cannot see or revoke Teacher 1's token (IDOR)
		const listT2 = mcpTokenListResponseSchema.parse(
			await (await call("/api/mcp-tokens", { user: "teacher-2" })).json(),
		);
		expect(listT2.tokens).toHaveLength(0);
		const crossRevoke = await call(`/api/mcp-tokens/${created.token.id}`, {
			method: "DELETE",
			user: "teacher-2",
		});
		expect(crossRevoke.status).toBe(404);

		// Teacher 1 revokes their own token; second revoke returns 404
		nowMs += 5_000;
		const revokeRes = await call(`/api/mcp-tokens/${created.token.id}`, {
			method: "DELETE",
			user: "teacher-1",
		});
		expect(revokeRes.status).toBe(200);
		const revoked = mcpTokenRevokeResponseSchema.parse(await revokeRes.json());
		expect(revoked.id).toBe(created.token.id);

		const revokeAgain = await call(`/api/mcp-tokens/${created.token.id}`, {
			method: "DELETE",
			user: "teacher-1",
		});
		expect(revokeAgain.status).toBe(404);

		const afterList = mcpTokenListResponseSchema.parse(
			await (await call("/api/mcp-tokens", { user: "teacher-1" })).json(),
		);
		expect(afterList.tokens).toHaveLength(0);
	});

	test(`enforces active token limit (${MCP_TOKEN_MAX_ACTIVE}) and allows creating again after revoke`, async () => {
		const ids: string[] = [];
		for (let i = 0; i < MCP_TOKEN_MAX_ACTIVE; i += 1) {
			const res = await call("/api/mcp-tokens", {
				method: "POST",
				user: "teacher-2",
				body: { name: `Device ${i + 1}`, expiresInDays: null },
			});
			expect(res.status).toBe(201);
			const parsed = mcpTokenCreateResponseSchema.parse(await res.json());
			ids.push(parsed.token.id);
		}

		const overLimit = await call("/api/mcp-tokens", {
			method: "POST",
			user: "teacher-2",
			body: { name: "Device 11", expiresInDays: 30 },
		});
		expect(overLimit.status).toBe(409);
		const errBody = (await overLimit.json()) as { code?: string };
		expect(errBody.code).toBe(MCP_TOKEN_ERROR_CODES.LIMIT_REACHED);

		const revoked = await call(`/api/mcp-tokens/${ids[0]}`, {
			method: "DELETE",
			user: "teacher-2",
		});
		expect(revoked.status).toBe(200);

		const replacement = await call("/api/mcp-tokens", {
			method: "POST",
			user: "teacher-2",
			body: { name: "Replacement", expiresInDays: 30 },
		});
		expect(replacement.status).toBe(201);
	});
});
