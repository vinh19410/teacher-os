import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { mcpTokenCreateResponseSchema } from "@teacher-os/api/mcp-token-contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const ORIGIN = "http://localhost:8001";
const APP_ORIGIN = "http://localhost:8001/teacher";
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
};

function parseStructured<T>(result: {
	isError?: boolean;
	content: Array<{ type: string; text?: string }>;
	structuredContent?: Record<string, unknown>;
}): T {
	expect(result.isError).not.toBe(true);
	if (result.structuredContent) return result.structuredContent as T;
	const textBlock = result.content.find((c) => c.type === "text");
	expect(textBlock?.text).toBeTruthy();
	return JSON.parse(textBlock?.text ?? "{}") as T;
}

describe("Remote Streamable HTTP MCP endpoint (/mcp)", () => {
	let app: ServerApp;
	let db: Db;
	let nowMs = Date.UTC(2026, 10, 27, 7, 0, 0);
	let teacher1Token = "";
	let teacher2Token = "";
	let teacher1TokenId = "";
	const teacherEmails = ["my@test.local", "nam@test.local"];

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
				id: "u-stu",
				name: "Học viên",
				email: "sv@test.local",
				emailVerified: true,
				role: "student",
			},
			{
				id: "u-adm",
				name: "Admin",
				email: "adm@test.local",
				emailVerified: true,
				role: "admin",
			},
		]);
		await db.insert(schema.membership).values([
			{ id: "m-1", orgId: "org-1", userId: "u-t1", role: "teacher" },
			{ id: "m-2", orgId: "org-2", userId: "u-t2", role: "teacher" },
		]);
		await db.insert(schema.student).values({
			id: "st-1",
			orgId: "org-1",
			name: "Minh",
			email: "sv@test.local",
			phone: "0901111111",
		});
		await db.insert(schema.classTable).values({
			id: "cls-1",
			orgId: "org-1",
			name: "IELTS 6.5",
			level: "IELTS 6.5",
			mode: "Online",
			schedule: "T3 & T6",
			sessionsDone: 0,
			sessionsTotal: 20,
			status: "active",
		});

		app = buildApp({
			getDb: () => db,
			corsOrigin: ORIGIN,
			teacherEmails,
			appOrigin: APP_ORIGIN,
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (USERS[key] ?? null) : null;
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
			now: () => new Date(nowMs),
		});

		const res1 = await app.request("/api/mcp-tokens", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-1",
				origin: ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ name: "Claude Desktop", expiresInDays: 90 }),
		});
		expect(res1.status).toBe(201);
		const parsed1 = mcpTokenCreateResponseSchema.parse(await res1.json());
		teacher1Token = parsed1.rawToken;
		teacher1TokenId = parsed1.token.id;

		const res2 = await app.request("/api/mcp-tokens", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-2",
				origin: ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ name: "Org 2 Device", expiresInDays: 90 }),
		});
		expect(res2.status).toBe(201);
		teacher2Token = mcpTokenCreateResponseSchema.parse(
			await res2.json(),
		).rawToken;
	});

	async function connectMcp(token: string) {
		const client = new Client({ name: "vitest-mcp-client", version: "1.0.0" });
		const transport = new StreamableHTTPClientTransport(
			new URL("http://localhost:8000/mcp"),
			{
				fetch: async (input, init) => {
					const req =
						input instanceof Request ? input : new Request(input, init);
					return app.fetch(req);
				},
				requestInit: {
					headers: { Authorization: `Bearer ${token}` },
				},
			},
		);
		await client.connect(transport);
		return {
			client,
			close: async () => {
				await client.close();
			},
		};
	}

	async function snapshot(userKey: "teacher-1" | "teacher-2") {
		const res = await app.request("/api/kernel", {
			headers: { "x-test-user": userKey },
		});
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	test("enforces HTTP auth (401/403), Origin check (403), and payload limit (413)", async () => {
		const noAuth = await app.request("/mcp", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		});
		expect(noAuth.status).toBe(401);
		expect(noAuth.headers.get("www-authenticate")).toContain("Bearer");

		const badToken = await app.request("/mcp", {
			method: "POST",
			headers: {
				authorization: "Bearer tos_mcp_invalid_token_value",
				"content-type": "application/json",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		});
		expect(badToken.status).toBe(401);

		const badOrigin = await app.request("/mcp", {
			method: "POST",
			headers: {
				origin: "https://evil.example",
				authorization: `Bearer ${teacher1Token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		});
		expect(badOrigin.status).toBe(403);

		const tooLarge = await app.request("/mcp", {
			method: "POST",
			headers: {
				authorization: `Bearer ${teacher1Token}`,
				"content-type": "application/json",
				"content-length": String(600 * 1024),
			},
			body: "{}",
		});
		expect(tooLarge.status).toBe(413);

		// Expired & revoked tokens fail closed with 401
		const expRes = await app.request("/api/mcp-tokens", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-1",
				origin: ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ name: "Short lived", expiresInDays: 30 }),
		});
		const expToken = mcpTokenCreateResponseSchema.parse(await expRes.json());
		await db
			.update(schema.mcpToken)
			.set({ expiresAt: new Date(nowMs - 1000) })
			.where(eq(schema.mcpToken.id, expToken.token.id));
		const expiredRes = await app.request("/mcp", {
			method: "POST",
			headers: {
				authorization: `Bearer ${expToken.rawToken}`,
				"content-type": "application/json",
			},
			body: "{}",
		});
		expect(expiredRes.status).toBe(401);

		// Revoked token -> 401
		const revRes = await app.request("/api/mcp-tokens", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-1",
				origin: ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify({ name: "To revoke", expiresInDays: 30 }),
		});
		const revParsed = mcpTokenCreateResponseSchema.parse(await revRes.json());
		await app.request(`/api/mcp-tokens/${revParsed.token.id}`, {
			method: "DELETE",
			headers: { "x-test-user": "teacher-1", origin: ORIGIN },
		});
		const revokedCall = await app.request("/mcp", {
			method: "POST",
			headers: {
				authorization: `Bearer ${revParsed.rawToken}`,
				"content-type": "application/json",
			},
			body: "{}",
		});
		expect(revokedCall.status).toBe(401);

		// Student & Admin role tokens fail closed with 403
		const { hashMcpToken } = await import("../lib/mcp/token-service");
		for (const [userId, raw] of [
			["u-stu", "tos_mcp_student_token_0001"],
			["u-adm", "tos_mcp_admin_token_0001"],
		] as const) {
			await db.insert(schema.mcpToken).values({
				id: crypto.randomUUID(),
				orgId: "org-1",
				userId,
				name: "Forbidden",
				tokenPrefix: raw.slice(0, 14),
				tokenHash: await hashMcpToken(raw),
				createdAt: new Date(nowMs),
			});
			const res = await app.request("/mcp", {
				method: "POST",
				headers: {
					authorization: `Bearer ${raw}`,
					"content-type": "application/json",
				},
				body: "{}",
			});
			expect(res.status).toBe(403);
		}

		// User removed from TEACHER_EMAILS allowlist -> 403
		teacherEmails.splice(1, 1); // remove nam@test.local temporarily
		const disallowed = await app.request("/mcp", {
			method: "POST",
			headers: {
				authorization: `Bearer ${teacher2Token}`,
				"content-type": "application/json",
			},
			body: "{}",
		});
		expect(disallowed.status).toBe(403);
		teacherEmails.push("nam@test.local");
	});

	test("lists exact 10 tools (no delete tools), reads catalog resource, and resolves prompts", async () => {
		const { client, close } = await connectMcp(teacher1Token);
		try {
			const tools = await client.listTools();
			const names = tools.tools.map((t) => t.name).sort();
			expect(names).toEqual([
				"create_assignment_prompt",
				"create_assignment_test",
				"get_assignment_catalog",
				"get_assignment_prompt",
				"get_assignment_test",
				"list_assignment_prompts",
				"list_assignment_tests",
				"set_assignment_test_parts",
				"update_assignment_prompt",
				"update_assignment_test",
			]);
			expect(names.some((n) => n.includes("delete"))).toBe(false);

			const createTool = tools.tools.find(
				(t) => t.name === "create_assignment_prompt",
			);
			const qSchema = (
				createTool?.inputSchema as {
					properties?: {
						questions?: { items?: { properties?: Record<string, unknown> } };
					};
				}
			)?.properties?.questions?.items?.properties;
			expect(qSchema?.stem).toBeDefined();
			expect(qSchema?.answer).toBeDefined();

			const catRes = await client.callTool({
				name: "get_assignment_catalog",
				arguments: { skill: "reading" },
			});
			const cat = parseStructured<{ skills: Array<{ skill: string }> }>(
				catRes as never,
			);
			expect(cat.skills).toHaveLength(1);
			expect(cat.skills[0]?.skill).toBe("reading");

			const resource = await client.readResource({
				uri: "teacheros://catalog/assignments",
			});
			const firstContent = resource.contents[0];
			expect(firstContent?.mimeType).toBe("application/json");
			expect(
				firstContent && "text" in firstContent ? firstContent.text : "",
			).toContain("tfng");

			const promptTpl = await client.getPrompt({
				name: "create_ielts_prompt",
				arguments: { skill: "writing", topic: "Urban transport", band: "7.0" },
			});
			expect(promptTpl.messages[0]?.content).toBeDefined();

			const testTpl = await client.getPrompt({
				name: "create_ielts_full_test",
				arguments: {
					skill: "reading",
					title: "Test 1",
					topic: "Renewable Energy",
				},
			});
			expect(testTpl.messages[0]?.content).toBeDefined();
		} finally {
			await close();
		}
	});

	test("creates and reads back all 6 skills, optionBank, hybrid writing, and media draft downgrade", async () => {
		const { client, close } = await connectMcp(teacher1Token);
		try {
			// 1. Writing (default draft)
			const writingRes = parseStructured<{
				id: string;
				status: string;
				previewUrl: string;
				editUrl: string;
			}>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "writing",
						part: "task2",
						type: "discuss",
						title: "Remote work vs Office",
						prompt: "<p>Discuss both views and give your own opinion.</p>",
					},
				})) as never,
			);
			expect(writingRes.status).toBe("draft");
			expect(writingRes.previewUrl).toContain(
				`${APP_ORIGIN}/assignments/preview?id=${writingRes.id}`,
			);
			expect(writingRes.editUrl).toContain(
				`${APP_ORIGIN}/assignments/new?promptId=${writingRes.id}`,
			);

			// 2. Reading (ready, TFNG + explanation)
			const readingP1 = parseStructured<{ id: string; status: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "reading",
						part: "p1",
						type: "tfng",
						title: "Solar Microgrids",
						band: "6.5",
						status: "ready",
						passage:
							"<p>Solar microgrids bring clean electricity to villages.</p>",
						questions: [
							{
								stem: "Microgrids supply clean electricity to rural areas.",
								answer: "TRUE",
								explanation: "Mentioned directly in paragraph 1.",
							},
						],
					},
				})) as never,
			);
			expect(readingP1.status).toBe("ready");

			// 3. Reading P2 with optionBank (headings)
			const readingP2 = parseStructured<{ id: string; status: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "reading",
						part: "p2",
						type: "headings",
						title: "Urban Forests",
						status: "ready",
						passage: "<p>Paragraph A describes cooling effects.</p>",
						optionBank: ["Cooling cities", "Biodiversity loss", "Soil erosion"],
						questions: [{ stem: "Paragraph A", answer: "i" }],
					},
				})) as never,
			);
			expect(readingP2.status).toBe("ready");

			// 4. Listening without audio requested as ready -> auto-downgrades to draft with mediaNotice
			const listeningRes = parseStructured<{
				id: string;
				status: string;
				downgradedToDraft: boolean;
				mediaNotice: string | null;
			}>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "listening",
						part: "s1",
						type: "form",
						title: "Library Membership Form",
						status: "ready",
						questions: [{ stem: "Surname: ____", answer: "Harrison" }],
					},
				})) as never,
			);
			expect(listeningRes.status).toBe("draft");
			expect(listeningRes.downgradedToDraft).toBe(true);
			expect(listeningRes.mediaNotice).toBeTruthy();

			// 5. Reading diagram without image/pin requested as ready -> auto-downgrades to draft
			const diagramRes = parseStructured<{
				id: string;
				status: string;
				downgradedToDraft: boolean;
			}>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "reading",
						part: "p1",
						type: "diagram",
						title: "Wind Turbine Diagram",
						status: "ready",
						passage: "<p>The rotor turns a generator.</p>",
						questions: [{ stem: "Main blade", answer: "rotor" }],
					},
				})) as never,
			);
			expect(diagramRes.status).toBe("draft");
			expect(diagramRes.downgradedToDraft).toBe(true);

			// 6. Speaking part 2
			const speakingRes = parseStructured<{ id: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "speaking",
						part: "part2",
						type: "place",
						title: "A quiet park",
						cueTopic: "Describe a quiet place you like to visit",
						cuePoints: "Where it is\nHow often you go there",
						status: "ready",
					},
				})) as never,
			);
			expect(speakingRes.id).toBeTruthy();

			// 7. Grammar gap (exact 1 ____) + hybrid writing
			const grammarRes = parseStructured<{ id: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "grammar",
						part: "g1",
						type: "gap",
						title: "Conditionals + Short Essay",
						status: "ready",
						questions: [
							{
								stem: "If I ____ earlier, I would not be late.",
								answer: "left",
							},
						],
						writing: {
							part: "task1",
							type: "chart",
							prompt: "<p>Summarize the chart below.</p>",
						},
					},
				})) as never,
			);
			expect(grammarRes.id).toBeTruthy();

			// 8. Vocabulary mcq
			const vocabRes = parseStructured<{ id: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "vocabulary",
						part: "v1",
						type: "mcq",
						title: "Academic Collocations",
						status: "ready",
						questions: [
							{
								stem: "Choose the best verb: ____ research.",
								opts: ["conduct", "make", "create", "invent"],
								answer: "A",
							},
						],
					},
				})) as never,
			);
			expect(vocabRes.id).toBeTruthy();

			// Invalid gap question (missing ____) returns actionable isError: true
			const badGap = await client.callTool({
				name: "create_assignment_prompt",
				arguments: {
					skill: "grammar",
					part: "g1",
					type: "gap",
					title: "Broken gap",
					status: "ready",
					questions: [{ stem: "No blank here.", answer: "is" }],
				},
			});
			expect(badGap.isError).toBe(true);
			expect((badGap.content[0] as { text?: string })?.text).toContain("____");

			// Verify via GET /api/kernel and list_assignment_prompts
			const kernel = await snapshot("teacher-1");
			expect(kernel.assignmentPrompts.length).toBeGreaterThanOrEqual(8);
			expect(
				kernel.assignmentPrompts.find((p) => p.id === readingP2.id)?.optionBank,
			).toEqual(["Cooling cities", "Biodiversity loss", "Soil erosion"]);
			expect(
				kernel.assignmentPrompts.find((p) => p.id === grammarRes.id)?.writing
					?.part,
			).toBe("task1");

			const listRes = parseStructured<{
				prompts: Array<{ id: string }>;
				total: number;
			}>(
				(await client.callTool({
					name: "list_assignment_prompts",
					arguments: { skill: "reading" },
				})) as never,
			);
			expect(listRes.prompts.some((p) => p.id === readingP1.id)).toBe(true);
		} finally {
			await close();
		}
	});

	test("enforces prompt ready checks, CONTENT_LOCKED, Full Test assembly, IDOR, and PARTS_LOCKED", async () => {
		const { client, close } = await connectMcp(teacher1Token);
		const { client: client2, close: close2 } = await connectMcp(teacher2Token);
		try {
			// Draft listening without audio cannot be updated to ready
			const draftListening = parseStructured<{ id: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "listening",
						part: "s1",
						type: "form",
						title: "Hotel Booking",
						questions: [{ stem: "Guest name: ____", answer: "Smith" }],
					},
				})) as never,
			);
			const failReady = await client.callTool({
				name: "update_assignment_prompt",
				arguments: { prompt_id: draftListening.id, status: "ready" },
			});
			expect(failReady.isError).toBe(true);
			expect((failReady.content[0] as { text?: string })?.text).toContain(
				"audio",
			);

			// Create 2 Reading prompts and assemble a Full Test atomically
			const p1 = parseStructured<{ id: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "reading",
						part: "p1",
						type: "tfng",
						title: "Test Reading P1",
						status: "ready",
						passage: "<p>Passage 1 text.</p>",
						questions: [{ stem: "Q1", answer: "TRUE" }],
					},
				})) as never,
			);
			const p2 = parseStructured<{ id: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "reading",
						part: "p2",
						type: "summary",
						title: "Test Reading P2",
						status: "ready",
						passage: "<p>Passage 2 text.</p>",
						questions: [{ stem: "Q2", answer: "growth" }],
					},
				})) as never,
			);
			const p3 = parseStructured<{ id: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "reading",
						part: "p3",
						type: "ynng",
						title: "Test Reading P3",
						status: "ready",
						passage: "<p>Passage 3 text.</p>",
						questions: [{ stem: "Q3", answer: "YES" }],
					},
				})) as never,
			);

			const fullTest = parseStructured<{
				id: string;
				partCount: number;
				status: string;
			}>(
				(await client.callTool({
					name: "create_assignment_test",
					arguments: {
						title: "IELTS Reading Full Paper",
						skill: "reading",
						timeLimitSeconds: 3600,
						collection: "Practice Set",
						testGroup: "Test 1",
						parts: [
							{ part: "p1", promptId: p1.id },
							{ part: "p2", promptId: p2.id },
						],
					},
				})) as never,
			);
			expect(fullTest.status).toBe("draft");
			expect(fullTest.partCount).toBe(2);

			// Update full test to ready + replace parts to include p3
			await client.callTool({
				name: "update_assignment_test",
				arguments: { test_id: fullTest.id, status: "ready" },
			});
			const setPartsRes = parseStructured<{ partCount: number }>(
				(await client.callTool({
					name: "set_assignment_test_parts",
					arguments: {
						test_id: fullTest.id,
						parts: [
							{ part: "p1", promptId: p1.id },
							{ part: "p2", promptId: p2.id },
							{ part: "p3", promptId: p3.id, qStartOverride: 27 },
						],
					},
				})) as never,
			);
			expect(setPartsRes.partCount).toBe(3);

			const detail = parseStructured<{
				test: {
					status: string;
					parts: Array<{ part: string; promptId: string }>;
				};
			}>(
				(await client.callTool({
					name: "get_assignment_test",
					arguments: { test_id: fullTest.id },
				})) as never,
			);
			expect(detail.test.status).toBe("ready");
			expect(detail.test.parts).toHaveLength(3);

			// IDOR: Teacher 2 cannot read Teacher 1's prompt or attach it to a test
			const crossGet = await client2.callTool({
				name: "get_assignment_prompt",
				arguments: { prompt_id: p1.id },
			});
			expect(crossGet.isError).toBe(true);
			const crossAttach = await client2.callTool({
				name: "create_assignment_test",
				arguments: {
					title: "Cross Org Test",
					skill: "reading",
					parts: [{ part: "p1", promptId: p1.id }],
				},
			});
			expect(crossAttach.isError).toBe(true);

			// Simulate a student quiz attempt against fullTest -> locks prompt p1 content & test parts
			await db.insert(schema.quizAttempt).values({
				id: "att-1",
				orgId: "org-1",
				testId: fullTest.id,
				studentId: "st-1",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				answers: "{}",
			});

			const lockedPromptPatch = await client.callTool({
				name: "update_assignment_prompt",
				arguments: {
					prompt_id: p1.id,
					passage: "<p>Tampered passage</p>",
				},
			});
			expect(lockedPromptPatch.isError).toBe(true);
			expect(
				(lockedPromptPatch.content[0] as { text?: string })?.text,
			).toContain("PROMPT_CONTENT_LOCKED");

			// Metadata update on locked prompt still succeeds
			const metaOk = await client.callTool({
				name: "update_assignment_prompt",
				arguments: { prompt_id: p1.id, title: "Updated Meta Title" },
			});
			expect(metaOk.isError).not.toBe(true);

			// Changing test parts fails with TEST_PARTS_LOCKED
			const lockedTestParts = await client.callTool({
				name: "set_assignment_test_parts",
				arguments: {
					test_id: fullTest.id,
					parts: [{ part: "p1", promptId: p1.id }],
				},
			});
			expect(lockedTestParts.isError).toBe(true);
			expect((lockedTestParts.content[0] as { text?: string })?.text).toContain(
				"TEST_PARTS_LOCKED",
			);

			// Hybrid prompt attached to a class assignment -> WRITING_SECTION_LOCKED
			const hybridPrompt = parseStructured<{ id: string }>(
				(await client.callTool({
					name: "create_assignment_prompt",
					arguments: {
						skill: "grammar",
						part: "g1",
						type: "gap",
						title: "Hybrid Locked Prompt",
						status: "ready",
						questions: [{ stem: "She ____ home.", answer: "went" }],
						writing: {
							part: "task2",
							type: "opinion",
							prompt: "<p>Write an opinion essay.</p>",
						},
					},
				})) as never,
			);
			await db.insert(schema.classAssignment).values({
				id: "ca-lock-1",
				orgId: "org-1",
				classId: "cls-1",
				promptId: hybridPrompt.id,
				title: "Hybrid Locked Prompt",
				due: "2026-12-10",
			});
			const lockedWriting = await client.callTool({
				name: "update_assignment_prompt",
				arguments: { prompt_id: hybridPrompt.id, writing: null },
			});
			expect(lockedWriting.isError).toBe(true);
			expect((lockedWriting.content[0] as { text?: string })?.text).toContain(
				"WRITING_SECTION_LOCKED",
			);

			// Verify lastUsedAt was updated on teacher1TokenId
			const [tokRow] = await db
				.select({ lastUsedAt: schema.mcpToken.lastUsedAt })
				.from(schema.mcpToken)
				.where(eq(schema.mcpToken.id, teacher1TokenId));
			expect(tokRow?.lastUsedAt).not.toBeNull();
			const firstTouch = tokRow?.lastUsedAt?.getTime() ?? 0;

			// Call within 60s keeps lastUsedAt throttled; call after >60s updates it
			nowMs += 30_000;
			await client.callTool({
				name: "list_assignment_tests",
				arguments: {},
			});
			const [tokAfter30s] = await db
				.select({ lastUsedAt: schema.mcpToken.lastUsedAt })
				.from(schema.mcpToken)
				.where(eq(schema.mcpToken.id, teacher1TokenId));
			expect(tokAfter30s?.lastUsedAt?.getTime()).toBe(firstTouch);

			nowMs += 65_000;
			await client.callTool({
				name: "list_assignment_tests",
				arguments: {},
			});
			const [tokAfter95s] = await db
				.select({ lastUsedAt: schema.mcpToken.lastUsedAt })
				.from(schema.mcpToken)
				.where(eq(schema.mcpToken.id, teacher1TokenId));
			expect(tokAfter95s?.lastUsedAt?.getTime()).toBe(nowMs);
		} finally {
			await close();
			await close2();
		}
	});
});
