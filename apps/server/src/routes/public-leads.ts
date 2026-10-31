import {
	type LeadRow,
	type LeadSubmit,
	leadSubmitSchema,
} from "@teacher-os/api/lead-contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { lead } from "@teacher-os/db/schema/lead";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "../app";
import { notifyNewLead } from "../lib/lead-notify";

/**
 * POST /public/leads (plan #506 phase 2, D4–D7): intake công khai cho form
 * đăng ký trên msmy.io.vn. Mount NGOÀI /api/* như /public/pay — bootstrap
 * middleware và Better Auth không chạy; "auth" là tổ hợp Origin allowlist +
 * chống spam, org đích luôn lấy từ env (không tin client).
 *
 * Hợp đồng fail-closed: thiếu LEAD_ORG_ID ⇒ 503 LEAD_INTAKE_DISABLED (như
 * getBankHub); Origin không thuộc LEAD_ORIGINS ⇒ 403; bot dính honeypot /
 * quá nhanh ⇒ 201 giả KHÔNG ghi DB; vượt tần suất ⇒ 429.
 */

/** Cửa sổ tần suất theo IP (10 phút) — hằng số export để test chỉnh. */
export const LEAD_IP_WINDOW_MS = 10 * 60 * 1000;
/** Số lead tối đa mỗi IP trong cửa sổ trên (lượt thứ 4 bị 429). */
export const LEAD_IP_MAX = 3;
/** Trần lead tạo mới trong ngày (giờ VN) của org — cầu dao chống spam lũ. */
export const LEAD_DAILY_CAP = 100;
/** Thời gian điền tối thiểu (ms) — submit nhanh hơn coi là bot. */
export const LEAD_MIN_ELAPSED_MS = 3000;
/** Cửa sổ dedupe theo SĐT (24 giờ) — gửi lại cập nhật lead cũ (D7). */
export const LEAD_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Số lần gửi tối đa cho một SĐT trong cửa sổ dedupe — quá ngưỡng ⇒ 429. */
export const LEAD_DEDUPE_MAX_SUBMITS = 5;

/** Body tối đa nhận — form không bao giờ cần hơn; lớn hơn là probe. */
const LEAD_BODY_MAX_BYTES = 4096;

export interface PublicLeadRouteDeps {
	getDb(): Db;
	/** Org đích từ env LEAD_ORG_ID — rỗng ⇒ 503 LEAD_INTAKE_DISABLED. */
	leadOrgId?: string;
	/** Origin profile được phép gửi (LEAD_ORIGINS đã parse). */
	leadOrigins?: string[];
	/** Secret HMAC băm IP (BETTER_AUTH_SECRET) — không lưu IP thô (D7). */
	leadIpSecret?: string;
	mailer?: Mailer;
	runInBackground?(promise: Promise<unknown>): void;
	/** Origin app web cho link trong email báo lead. */
	appOrigin?: string;
}

/** HMAC-SHA256 qua crypto.subtle — hex, không lưu IP thô. */
async function hashIp(secret: string, ip: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(`lead-ip:${ip}`),
	);
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function publicLeadRoutes(deps: PublicLeadRouteDeps) {
	const router = new Hono();

	// CORS chỉ trên route lead (D5): origin profile, KHÔNG credentials —
	// global cors trả preflight sớm với origin list teacher/student nên
	// app.ts bỏ qua path này trước middleware toàn cục.
	router.use(
		"*",
		cors({
			origin: deps.leadOrigins ?? [],
			allowMethods: ["POST", "OPTIONS"],
			allowHeaders: ["Content-Type"],
			maxAge: 600,
		}),
	);

	router.post("/", async (c) => {
		c.header("Cache-Control", "no-store");

		// (a) fail-closed: chưa cấu hình org đích ⇒ tắt intake.
		const leadOrgId = deps.leadOrgId ?? "";
		if (leadOrgId.length === 0) {
			return c.json(
				{ error: "LEAD_INTAKE_DISABLED", code: "LEAD_INTAKE_DISABLED" },
				503,
			);
		}

		// (b) Origin bắt buộc thuộc allowlist (browser form luôn gửi Origin;
		// vắng header coi như sai — fail-closed với client lạ).
		const origin = c.req.header("Origin") ?? "";
		if (!(deps.leadOrigins ?? []).includes(origin)) {
			return c.json(
				{ error: "LEAD_ORIGIN_FORBIDDEN", code: "LEAD_ORIGIN_FORBIDDEN" },
				403,
			);
		}

		// (c) Trần body 4 KB — kiểm cả header lẫn bytes thật (header có thể
		// thiếu/sai khi probe).
		const contentLength = Number(c.req.header("Content-Length") ?? "0");
		if (Number.isFinite(contentLength) && contentLength > LEAD_BODY_MAX_BYTES) {
			return c.json(
				{ error: "payload too large", code: "payload too large" },
				413,
			);
		}
		const rawBody = await c.req.raw.text();
		if (rawBody.length > LEAD_BODY_MAX_BYTES) {
			return c.json(
				{ error: "payload too large", code: "payload too large" },
				413,
			);
		}

		// (d) Zod whitelist enum + .strict() — lỗi trả danh sách field, KHÔNG
		// echo giá trị (tránh phản hồi lộ nội dung probe).
		let submit: LeadSubmit | undefined;
		let fields: string[] = [];
		try {
			const parsed = leadSubmitSchema.safeParse(JSON.parse(rawBody));
			if (!parsed.success) {
				fields = [
					...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
				];
			} else {
				submit = parsed.data;
			}
		} catch {
			// JSON không parse được — 400 với danh sách field rỗng.
		}
		if (submit === undefined) {
			return c.json(
				{
					error: "LEAD_INVALID",
					code: "LEAD_INVALID",
					fields,
				},
				400,
			);
		}

		// (e) Honeypot + elapsedMs: bot nhận 201 giả, không ghi DB, không email.
		const fakeId = crypto.randomUUID();
		if (
			(submit.website ?? "").length > 0 ||
			submit.elapsedMs < LEAD_MIN_ELAPSED_MS
		) {
			console.log("[leads] honeypot drop", fakeId);
			return c.json({ id: fakeId }, 201);
		}

		const db = deps.getDb();
		const now = Date.now();

		// (f) Băm IP — CF-Connecting-IP ở Workers; vắng (node/e2e) ⇒ "unknown"
		// (mọi test gọi không header rơi vào cùng bucket, có header riêng thì
		// bucket riêng — D7).
		const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
		const ipHash = deps.leadIpSecret ? await hashIp(deps.leadIpSecret, ip) : "";

		// (g) Tần suất theo IP: ≥ 3 lead trong 10 phút ⇒ 429.
		if (ipHash.length > 0) {
			const [ipRow] = await db
				.select({ n: count() })
				.from(lead)
				.where(
					and(
						eq(lead.ipHash, ipHash),
						gte(lead.updatedAt, new Date(now - LEAD_IP_WINDOW_MS)),
					),
				);
			if ((ipRow?.n ?? 0) >= LEAD_IP_MAX) {
				c.header("Retry-After", "600");
				return c.json(
					{ error: "LEAD_RATE_LIMITED", code: "LEAD_RATE_LIMITED" },
					429,
				);
			}
		}

		// (h) Trần ngày (00:00 giờ VN ⇒ mốc UTC) — count trên org, mọi IP.
		const dayStartMs = Date.parse(`${vietnamTodayISO()}T00:00:00+07:00`);
		const [dayRow] = await db
			.select({ n: count() })
			.from(lead)
			.where(
				and(
					eq(lead.orgId, leadOrgId),
					gte(lead.createdAt, new Date(dayStartMs)),
				),
			);
		if ((dayRow?.n ?? 0) >= LEAD_DAILY_CAP) {
			c.header("Retry-After", "600");
			return c.json({ error: "LEAD_DAILY_CAP", code: "LEAD_DAILY_CAP" }, 429);
		}

		// (i) Dedupe SĐT 24 giờ kể từ lúc tạo: cập nhật lead cũ (giữ status + teacherNote,
		// submitCount + 1) thay vì tạo dòng mới (D7).
		const [existing] = await db
			.select()
			.from(lead)
			.where(
				and(
					eq(lead.orgId, leadOrgId),
					eq(lead.phone, submit.phone),
					gte(lead.createdAt, new Date(now - LEAD_DEDUPE_WINDOW_MS)),
				),
			)
			.orderBy(desc(lead.createdAt))
			.limit(1);

		if (existing) {
			if (existing.submitCount >= LEAD_DEDUPE_MAX_SUBMITS) {
				c.header("Retry-After", "600");
				return c.json(
					{ error: "LEAD_RATE_LIMITED", code: "LEAD_RATE_LIMITED" },
					429,
				);
			}
			// Tên/email là định danh giáo viên đang thấy: người gửi lại không ghi
			// đè được, chỉ bổ sung khi lead cũ để trống.
			await db
				.update(lead)
				.set({
					name: existing.name || submit.name,
					email: existing.email || (submit.email ?? ""),
					birthDate: submit.birthDate ?? "",
					course: submit.course ?? "",
					studyMode: submit.studyMode ?? "",
					studyDays: submit.studyDays ?? "",
					timeSlot: submit.timeSlot ?? "",
					note: submit.note ?? "",
					placement: submit.placement ?? "",
					ipHash,
					submitCount: existing.submitCount + 1,
					updatedAt: new Date(),
				})
				.where(eq(lead.id, existing.id));
			// Dedupe KHÔNG gửi email lại (D13) — giáo viên đã nhận bản đầu.
			return c.json(
				{ id: existing.id, submitCount: existing.submitCount + 1 },
				201,
			);
		}

		const id = crypto.randomUUID();
		await db.insert(lead).values({
			id,
			orgId: leadOrgId,
			name: submit.name,
			phone: submit.phone,
			email: submit.email ?? "",
			birthDate: submit.birthDate ?? "",
			course: submit.course ?? "",
			studyMode: submit.studyMode ?? "",
			studyDays: submit.studyDays ?? "",
			timeSlot: submit.timeSlot ?? "",
			note: submit.note ?? "",
			placement: submit.placement ?? "",
			status: "new",
			ipHash,
			submitCount: 1,
		});

		// (D13) Email báo lead mới — chỉ lần tạo đầu, chạy nền, lỗi nuốt.
		const row: LeadRow = {
			id,
			name: submit.name,
			phone: submit.phone,
			email: submit.email ?? "",
			birthDate: submit.birthDate ?? "",
			course: submit.course ?? "",
			studyMode: submit.studyMode ?? "",
			studyDays: submit.studyDays ?? "",
			timeSlot: submit.timeSlot ?? "",
			note: submit.note ?? "",
			placement: submit.placement ?? "",
			teacherNote: "",
			source: "profile",
			status: "new",
			submitCount: 1,
			createdAt: new Date(now).toISOString(),
			updatedAt: new Date(now).toISOString(),
			statusChangedAt: null,
		};
		const delivery = notifyNewLead({
			db,
			mailer: deps.mailer,
			orgId: leadOrgId,
			lead: row,
			appOrigin: deps.appOrigin,
		});
		if (deps.runInBackground) {
			deps.runInBackground(delivery);
		} else {
			await delivery;
		}

		console.log("[leads] created", id);
		return c.json({ id, submitCount: 1 }, 201);
	});

	return router;
}
