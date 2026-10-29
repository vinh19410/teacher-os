import { createHmac } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";

const SECRET = "gh-webhook-secret";
const MAX_BODY = 25 * 1024 * 1024;

function sign(body: string, secret: string = SECRET): string {
	return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

// Route không chạm DB — object rỗng ép kiểu đủ cho buildApp (pattern cùng
// khu vực /webhooks, /public của bank-hub nhưng không cần libsql thật).
function makeApp(githubWebhookSecret?: string) {
	const getSessionUser = vi.fn(async () => null);
	const app = buildApp({
		getDb: (() => ({})) as unknown as () => Db,
		corsOrigin: "http://localhost:8001",
		getSessionUser,
		authHandler: () => new Response("auth stub", { status: 404 }),
		githubWebhookSecret,
	});
	return { app, getSessionUser };
}

// undici không tự gắn Content-Length cho string body (forbidden header),
// nên helper set tường minh — cùng convention putMedia
// (student-quiz-media.test.ts:285). Default đứng TRƯỚC ...headers để các
// case ghi đè (fake Content-Length 413/401-format) vẫn hoạt động.
async function post(
	app: ServerApp,
	body: string,
	headers: Record<string, string> = {},
): Promise<Response> {
	return app.request("/webhooks/github", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Content-Length": String(Buffer.byteLength(body)),
			...headers,
		},
		body,
	});
}

describe("POST /webhooks/github (#421)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("ping ký đúng → 200 {ok:true}", async () => {
		const { app } = makeApp(SECRET);
		const body = JSON.stringify({ zen: "Keep it simple.", hook_id: 1 });
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "ping",
			"X-GitHub-Delivery": "d-ping",
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	test("event khác ký đúng → 202 + 1 dòng log metadata, không chứa secret/chữ ký/payload", async () => {
		const { app } = makeApp(SECRET);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const body = JSON.stringify({
			action: "opened",
			repository: { full_name: "vinh19410/teacher-os" },
			head_commit: { message: "CANARY-PAYLOAD-not-logged" },
		});
		const signature = sign(body);
		const res = await post(app, body, {
			"X-Hub-Signature-256": signature,
			"X-GitHub-Event": "push",
			"X-GitHub-Delivery": "d-push",
		});
		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ ok: true });
		// app.ts gắn hono logger() (2 dòng/request) — dòng của route là dòng
		// duy nhất có prefix [github-webhook]; leak-check chạy trên TOÀN BỘ
		// dòng console.log của request này.
		const lines = log.mock.calls.map((call) => String(call[0]));
		const hookLines = lines.filter((l) => l.includes("[github-webhook]"));
		expect(hookLines).toHaveLength(1);
		const line = hookLines[0] ?? "";
		expect(line).toContain("event=push");
		expect(line).toContain("delivery=d-push");
		expect(line).toContain("action=opened");
		expect(line).toContain("repo=vinh19410/teacher-os");
		for (const l of lines) {
			expect(l).not.toContain(SECRET);
			expect(l).not.toContain(signature);
			expect(l).not.toContain("CANARY-PAYLOAD-not-logged");
		}
	});

	test("payload non-ASCII (tiếng Việt + emoji) ký đúng → 202 — HMAC tính trên raw UTF-8 bytes", async () => {
		const { app } = makeApp(SECRET);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const body = JSON.stringify({
			action: "opened",
			repository: { full_name: "vinh19410/teacher-os" },
			head_commit: { message: "bài nói 🎤 — CANARY-NON-ASCII" },
		});
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "push",
			"X-GitHub-Delivery": "d-utf8",
		});
		expect(res.status).toBe(202);
		const lines = log.mock.calls.map((call) => String(call[0]));
		const hookLines = lines.filter((l) => l.includes("[github-webhook]"));
		expect(hookLines).toHaveLength(1);
		expect(hookLines[0] ?? "").toContain("repo=vinh19410/teacher-os");
		for (const l of lines) {
			expect(l).not.toContain("CANARY-NON-ASCII");
		}
	});

	test("thiếu X-GitHub-Delivery → log fallback delivery=-", async () => {
		const { app } = makeApp(SECRET);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const body = JSON.stringify({});
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "push",
		});
		expect(res.status).toBe(202);
		const hookLine =
			log.mock.calls
				.map((call) => String(call[0]))
				.find((l) => l.includes("[github-webhook]")) ?? "";
		expect(hookLine).toContain("delivery=-");
	});

	test("payload thiếu action/repository → log in `-` thay vì undefined", async () => {
		const { app } = makeApp(SECRET);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const body = JSON.stringify({});
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "issues",
			"X-GitHub-Delivery": "d-bare",
		});
		expect(res.status).toBe(202);
		const lines = log.mock.calls.map((call) => String(call[0]));
		const hookLine = lines.find((l) => l.includes("[github-webhook]")) ?? "";
		expect(hookLine).toContain("action=-");
		expect(hookLine).toContain("repo=-");
	});

	test("secret rỗng + chữ ký rác → vẫn 503 (503 kiểm trước 401)", async () => {
		const { app } = makeApp("");
		const res = await post(app, "x", {
			"X-Hub-Signature-256": "sha256=abc",
			"X-GitHub-Event": "ping",
		});
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: "GITHUB_WEBHOOK_DISABLED" });
	});

	test("thiếu header chữ ký → 401", async () => {
		const { app } = makeApp(SECRET);
		const body = JSON.stringify({});
		const res = await post(app, body, {
			"X-GitHub-Event": "push",
		});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});

	test("chữ ký sai key → 401", async () => {
		const { app } = makeApp(SECRET);
		const body = JSON.stringify({});
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body, "other-secret"),
			"X-GitHub-Event": "push",
		});
		expect(res.status).toBe(401);
	});

	test("chữ ký sai độ dài → 401", async () => {
		const { app } = makeApp(SECRET);
		const body = JSON.stringify({});
		const res = await post(app, body, {
			"X-Hub-Signature-256": "sha256=abc",
			"X-GitHub-Event": "push",
		});
		expect(res.status).toBe(401);
	});

	test("chữ ký sai format (không phải hex) → 401 ngay, kể cả Content-Length lớn", async () => {
		const { app } = makeApp(SECRET);
		const res = await post(app, "x", {
			"X-Hub-Signature-256": `sha256=${"z".repeat(64)}`,
			"X-GitHub-Event": "push",
			// Format check chạy trước khi đọc body — request rác không tốn buffer.
			"Content-Length": String(MAX_BODY - 1024 * 1024),
		});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});

	test("body bị sửa sau khi ký → 401", async () => {
		const { app } = makeApp(SECRET);
		const signed = JSON.stringify({ a: 1 });
		const res = await post(app, JSON.stringify({ a: 2 }), {
			"X-Hub-Signature-256": sign(signed),
			"X-GitHub-Event": "push",
		});
		expect(res.status).toBe(401);
	});

	test("secret rỗng → 503 GITHUB_WEBHOOK_DISABLED", async () => {
		const { app } = makeApp("");
		const body = JSON.stringify({});
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "ping",
		});
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: "GITHUB_WEBHOOK_DISABLED" });
	});

	test("secret vắng → 503 GITHUB_WEBHOOK_DISABLED", async () => {
		const { app } = makeApp();
		const body = JSON.stringify({});
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "ping",
		});
		expect(res.status).toBe(503);
	});

	test("ký đúng nhưng Content-Type form-encoded → 415", async () => {
		const { app } = makeApp(SECRET);
		const body = "a=1";
		const res = await post(app, body, {
			"Content-Type": "application/x-www-form-urlencoded",
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "push",
		});
		expect(res.status).toBe(415);
		expect(await res.json()).toEqual({ error: "unsupported content type" });
	});

	test("ký đúng, body không phải JSON → 400 invalid json", async () => {
		const { app } = makeApp(SECRET);
		const body = "not-json{";
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "push",
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "invalid json" });
	});

	test("ký đúng, thiếu X-GitHub-Event → 400 missing event", async () => {
		const { app } = makeApp(SECRET);
		const body = JSON.stringify({});
		const res = await post(app, body, {
			"X-Hub-Signature-256": sign(body),
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "missing event" });
	});

	test("GET /webhooks/github → 404 (chỉ nhận POST)", async () => {
		const { app } = makeApp(SECRET);
		const res = await app.request("/webhooks/github", { method: "GET" });
		expect(res.status).toBe(404);
	});

	test.each(["PUT", "DELETE"])(
		"%s /webhooks/github → 404, kể cả Content-Length lớn",
		async (method) => {
			const { app } = makeApp(SECRET);
			const res = await app.request("/webhooks/github", {
				method,
				headers: { "Content-Length": String(26 * 1024 * 1024) },
			});
			expect(res.status).toBe(404);
		},
	);

	test("POST không Content-Length (stream) → 411, kể cả khi có chữ ký hợp lệ format", async () => {
		const { app } = makeApp(SECRET);
		const body = JSON.stringify({});
		const res = await app.request("/webhooks/github", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Hub-Signature-256": sign(body),
				"X-GitHub-Event": "ping",
			},
			body: new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(body));
					controller.close();
				},
			}),
			duplex: "half",
			// workers-types không khai báo duplex (Node undici cần cho stream
			// body) — cast hẹp theo precedent student-quiz-media.test.ts.
		} as RequestInit & { duplex: "half" });
		expect(res.status).toBe(411);
		expect(await res.json()).toEqual({ error: "length required" });
	});

	test("Content-Length khai quá 25 MB → 413 payload too large (middleware chặn trước handler)", async () => {
		const { app } = makeApp("");
		const res = await post(app, "x", {
			"X-Hub-Signature-256": `sha256=${"a".repeat(64)}`,
			"Content-Length": String(MAX_BODY + 1),
		});
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "payload too large" });
	});

	test("request vào route không chạy getSessionUser (ngoài /api/*, không Better Auth)", async () => {
		const { app, getSessionUser } = makeApp(SECRET);
		const body = JSON.stringify({});
		await post(app, body, {
			"X-Hub-Signature-256": sign(body),
			"X-GitHub-Event": "ping",
		});
		await post(app, body, { "X-GitHub-Event": "ping" });
		expect(getSessionUser).not.toHaveBeenCalled();
	});
});
