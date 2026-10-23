import { createHmac } from "node:crypto";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { safeEqual } from "../lib/safe-equal";

/** GitHub luôn ký lowercase hex sha256; format khác = client lạ. */
const SIGNATURE_PATTERN = /^sha256=[0-9a-f]{64}$/;

/**
 * GitHub inbound webhooks (#421), mounted OUTSIDE /api/* (no bootstrap
 * middleware, no Better Auth) — auth is the `X-Hub-Signature-256` HMAC of
 * the RAW request bytes, verified constant-time BEFORE any parsing. Stage
 * này chỉ verify + ack + log metadata (event/delivery/action/repo); handler
 * theo event và lưu D1 thuộc các issue sau.
 *
 * Chữ ký phải tính trên raw bytes nên body đọc `arrayBuffer` trước khi
 * `JSON.parse` — parse body đã được thư viện decode có thể đổi bytes
 * (charset/BOM) và làm lệch HMAC.
 */
export function githubWebhookRoutes(deps: { secret?: string }) {
	const router = new Hono();
	// Middleware chỉ áp POST — method khác rơi thẳng 404 của router (hợp đồng),
	// kể cả khi kèm Content-Length lớn (bodyLimit của hono không kiểm method).
	//
	// GitHub luôn gửi Content-Length; request stream/chunked là client lạ —
	// chặn TRƯỚC khi body bị buffer để client stream không thể ép isolate
	// buffer tới 25 MB trước khi chữ ký kịp fail (red-team #421). Residual:
	// request khai báo Content-Length thật kèm chữ ký đúng format vẫn được
	// buffer — cái giá của hợp đồng cap 25 MB, xem plan #421.
	//
	// Trần payload GitHub là 25 MB; với Content-Length quá trần hono chặn ngay
	// theo header, không đọc body. onError JSON đồng bộ body 4xx với
	// student.ts / vocab.ts.
	router.use("*", async (c, next) => {
		if (c.req.method !== "POST") return next();
		if (c.req.header("Content-Length") === undefined) {
			return c.json({ error: "length required" }, 411);
		}
		return bodyLimit({
			maxSize: 25 * 1024 * 1024,
			onError: (bc) => bc.json({ error: "payload too large" }, 413),
		})(c, next);
	});

	const handle = async (c: Context) => {
		const secret = deps.secret ?? "";
		if (secret === "") return c.json({ error: "GITHUB_WEBHOOK_DISABLED" }, 503);
		const signature = c.req.header("X-Hub-Signature-256") ?? "";
		// Format check trước khi đọc body — request rác không tốn buffer.
		if (!SIGNATURE_PATTERN.test(signature)) {
			return c.json({ error: "unauthorized" }, 401);
		}
		const raw = Buffer.from(await c.req.arrayBuffer());
		const expected =
			"sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
		if (!safeEqual(signature, expected)) {
			return c.json({ error: "unauthorized" }, 401);
		}
		const contentType =
			(c.req.header("Content-Type") ?? "")
				.split(";")[0]
				?.trim()
				.toLowerCase() ?? "";
		if (contentType !== "application/json") {
			return c.json({ error: "unsupported content type" }, 415);
		}
		let payload: unknown;
		try {
			payload = JSON.parse(raw.toString("utf8"));
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const event = c.req.header("X-GitHub-Event");
		if (!event) return c.json({ error: "missing event" }, 400);
		if (event === "ping") return c.json({ ok: true });
		const body =
			typeof payload === "object" && payload !== null
				? (payload as {
						action?: unknown;
						repository?: { full_name?: unknown };
					})
				: {};
		const action = typeof body.action === "string" ? body.action : "-";
		const repo =
			typeof body.repository?.full_name === "string"
				? body.repository.full_name
				: "-";
		// Chỉ log metadata — không bao giờ log payload, chữ ký hay secret.
		console.log(
			`[github-webhook] event=${event} delivery=${c.req.header("X-GitHub-Delivery") ?? "-"} action=${action} repo=${repo}`,
		);
		return c.json({ ok: true }, 202);
	};

	router.post("/", handle);

	return router;
}
