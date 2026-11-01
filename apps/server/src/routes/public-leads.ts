import {
	type LeadRow,
	type LeadSubmit,
	leadSubmitSchema,
} from "@teacher-os/api/lead-contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "../app";
import { notifyNewLead } from "../lib/lead-notify";

/**
 * POST /public/leads (plan #506 phase 2, D4–D7; #534): intake công khai cho
 * form đăng ký và cổng bài kiểm tra đầu vào trên msmy.io.vn. Mount NGOÀI
 * /api/* như /public/pay — bootstrap middleware và Better Auth không chạy;
 * "auth" là tổ hợp Origin allowlist + chống spam, org đích luôn lấy từ env
 * (không tin client).
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
		const leadOrgId = deps.leadOrgId?.trim() ?? "";
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

		// (f) Băm IP — CF-Connecting-IP ở Workers; vắng (node/e2e) ⇒ "unknown"
		// (mọi test gọi không header rơi vào cùng bucket, có header riêng thì
		// bucket riêng — D7).
		const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
		const ipHash = deps.leadIpSecret ? await hashIp(deps.leadIpSecret, ip) : "";

		// (#524) Toàn bộ kiểm tra giới hạn IP (g), trần ngày (h) và dedupe SĐT 24h (i)
		// được đưa vào câu lệnh INSERT...SELECT...WHERE và UPDATE...WHERE nguyên tử
		// để các request song song không vượt ngưỡng hay gửi email trùng.
		const now = Date.now();
		const ipWindowStartMs = now - LEAD_IP_WINDOW_MS;
		const dayStartMs = Date.parse(`${vietnamTodayISO()}T00:00:00+07:00`);
		const dedupeWindowStartMs = now - LEAD_DEDUPE_WINDOW_MS;
		const skipIpCheck = ipHash.length === 0 ? 1 : 0;
		const id = crypto.randomUUID();
		const source = submit.source ?? "profile";
		const birthDate = submit.birthDate ?? "";
		const course = submit.course ?? "";
		const studyMode = submit.studyMode ?? "";
		const studyDays = submit.studyDays ?? "";
		const timeSlot = submit.timeSlot ?? "";
		const note = submit.note ?? "";
		const placement = submit.placement ?? "";

		const inserted = (await db.all(sql`
			INSERT INTO lead (
				id, org_id, name, phone, email, birth_date, course, study_mode,
				study_days, time_slot, note, placement, teacher_note, source,
				status, ip_hash, submit_count, created_at, updated_at, status_changed_at
			)
			SELECT
				${id},
				${leadOrgId},
				${submit.name},
				${submit.phone},
				${submit.email ?? ""},
				${birthDate},
				${course},
				${studyMode},
				${studyDays},
				${timeSlot},
				${note},
				${placement},
				'',
				${source},
				'new',
				${ipHash},
				1,
				${now},
				${now},
				NULL
			WHERE
				(${skipIpCheck} = 1 OR (
					SELECT count(*) FROM lead
					WHERE ip_hash = ${ipHash} AND updated_at >= ${ipWindowStartMs}
				) < ${LEAD_IP_MAX})
				AND (
					SELECT count(*) FROM lead
					WHERE org_id = ${leadOrgId} AND created_at >= ${dayStartMs}
				) < ${LEAD_DAILY_CAP}
				AND NOT EXISTS (
					SELECT 1 FROM lead
					WHERE org_id = ${leadOrgId}
						AND phone = ${submit.phone}
						AND created_at >= ${dedupeWindowStartMs}
				)
			RETURNING id
		`)) as Array<{ id: string }>;

		if (inserted.length === 0) {
			// Không insert được: hoặc đã có dòng dedupe SĐT trong 24h (cần update
			// nguyên tử), hoặc đã chạm ngưỡng IP / trần ngày.
			// Giữ nguyên ip_hash gốc của dòng khi dedupe update để IP khác không xóa
			// được vết rate-limit của IP tạo ban đầu; loại trừ chính dòng đang sửa
			// khỏi đếm IP (l2.id != lead.id) để lần gửi thứ 3 của cùng IP vẫn tự cập
			// nhật được; không chặn dedupe update bằng LEAD_DAILY_CAP vì không tạo
			// dòng lead mới.
			const updated = (await db.all(sql`
				UPDATE lead
				SET
					name = CASE WHEN lead.name = '' THEN ${submit.name} ELSE lead.name END,
					email = CASE WHEN lead.email = '' THEN ${submit.email ?? ""} ELSE lead.email END,
					birth_date = CASE WHEN ${birthDate} = '' THEN lead.birth_date ELSE ${birthDate} END,
					course = CASE WHEN ${course} = '' THEN lead.course ELSE ${course} END,
					study_mode = CASE WHEN ${studyMode} = '' THEN lead.study_mode ELSE ${studyMode} END,
					study_days = CASE WHEN ${studyDays} = '' THEN lead.study_days ELSE ${studyDays} END,
					time_slot = CASE WHEN ${timeSlot} = '' THEN lead.time_slot ELSE ${timeSlot} END,
					note = CASE WHEN ${note} = '' THEN lead.note ELSE ${note} END,
					placement = CASE WHEN ${placement} = '' THEN lead.placement ELSE ${placement} END,
					ip_hash = CASE WHEN lead.ip_hash = '' THEN ${ipHash} ELSE lead.ip_hash END,
					submit_count = lead.submit_count + 1,
					updated_at = max(lead.updated_at, ${now})
				WHERE lead.id = (
					SELECT id FROM lead
					WHERE org_id = ${leadOrgId}
						AND phone = ${submit.phone}
						AND created_at >= ${dedupeWindowStartMs}
					ORDER BY created_at DESC, id DESC
					LIMIT 1
				)
					AND lead.submit_count < ${LEAD_DEDUPE_MAX_SUBMITS}
					AND (${skipIpCheck} = 1 OR (
						SELECT count(*) FROM lead AS l2
						WHERE l2.ip_hash = ${ipHash}
							AND l2.updated_at >= ${ipWindowStartMs}
							AND l2.id != lead.id
					) < ${LEAD_IP_MAX})
				RETURNING id, submit_count
			`)) as Array<{ id: string; submit_count: number }>;

			const updatedRow = updated[0];
			if (updatedRow) {
				// Dedupe KHÔNG gửi email lại (D13) — giáo viên đã nhận bản đầu.
				return c.json(
					{
						id: updatedRow.id,
						submitCount: Number(updatedRow.submit_count),
					},
					201,
				);
			}

			// Cả INSERT lẫn UPDATE đều trả 0 dòng: phân loại mã lỗi 429 theo đúng thứ tự
			// ưu tiên (IP rate limit -> daily cap cho SĐT mới -> dedupe rate limit).
			const [countsRow] = (await db.all(sql`
				SELECT
					CASE
						WHEN ${skipIpCheck} = 1 THEN 0
						ELSE (
							SELECT count(*) FROM lead
							WHERE ip_hash = ${ipHash} AND updated_at >= ${ipWindowStartMs}
						)
					END AS ip_count,
					(
						SELECT count(*) FROM lead
						WHERE org_id = ${leadOrgId} AND created_at >= ${dayStartMs}
					) AS day_count,
					EXISTS (
						SELECT 1 FROM lead
						WHERE org_id = ${leadOrgId}
							AND phone = ${submit.phone}
							AND created_at >= ${dedupeWindowStartMs}
					) AS has_dedupe
			`)) as Array<{
				ip_count: number;
				day_count: number;
				has_dedupe: number;
			}>;

			c.header("Retry-After", "600");
			const ipCount = Number(countsRow?.ip_count ?? 0);
			const dayCount = Number(countsRow?.day_count ?? 0);
			const hasDedupe = Number(countsRow?.has_dedupe ?? 0) === 1;
			if (!hasDedupe && ipCount < LEAD_IP_MAX && dayCount >= LEAD_DAILY_CAP) {
				return c.json({ error: "LEAD_DAILY_CAP", code: "LEAD_DAILY_CAP" }, 429);
			}
			return c.json(
				{ error: "LEAD_RATE_LIMITED", code: "LEAD_RATE_LIMITED" },
				429,
			);
		}
		// (D13) Email báo lead mới — chỉ lần tạo đầu, chạy nền, lỗi nuốt.
		const row: LeadRow = {
			id,
			name: submit.name,
			phone: submit.phone,
			email: submit.email ?? "",
			birthDate,
			course,
			studyMode,
			studyDays,
			timeSlot,
			note,
			placement,
			teacherNote: "",
			source,
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
