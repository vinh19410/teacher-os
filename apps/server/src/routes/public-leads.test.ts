import { createClient } from "@libsql/client";
import type { Mailer, MailInput } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import {
	LEAD_DAILY_CAP,
	LEAD_IP_MAX,
	LEAD_MIN_ELAPSED_MS,
} from "./public-leads";

const CORS_ORIGIN = "http://localhost:8001";
const PROFILE_ORIGIN = "https://msmy.io.vn";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const sessionFor = async (headers: Headers) => {
	if (headers.get("x-test-user") === "teacher-1") {
		return { userId: "t-1", userName: "Cô Lan", role: "teacher" as const };
	}
	return null;
};

let db: Db;
let sent: MailInput[];

const recordingMailer: Mailer = {
	async send(input) {
		sent.push(input);
	},
};
const failingMailer: Mailer = {
	async send() {
		throw new Error("resend down");
	},
};

beforeEach(async () => {
	const client = createClient({ url: "file::memory:" });
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	db = raw as unknown as Db;
	sent = [];

	await db.insert(schema.organization).values([{ id: "org-1", name: "Cô Mỹ" }]);
	await db
		.insert(schema.user)
		.values([
			{ id: "t-1", name: "Cô Lan", email: "Lan@Test.local", role: "teacher" },
		]);
	await db
		.insert(schema.membership)
		.values([{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" }]);
});

function app(overrides: Record<string, unknown> = {}): ServerApp {
	return buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser: sessionFor,
		authHandler: async () => new Response(null, { status: 404 }),
		// #506 D4/D5/D7: org đích + origin profile + secret HMAC.
		leadOrgId: "org-1",
		leadOrigins: [PROFILE_ORIGIN, "https://www.msmy.io.vn"],
		leadIpSecret: "test-lead-secret",
		mailer: recordingMailer,
		appOrigin: CORS_ORIGIN,
		...overrides,
	});
}

/** POST /public/leads với Origin profile mặc định. */
function submit(
	instance: ServerApp,
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
) {
	return instance.request("/public/leads", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			Origin: PROFILE_ORIGIN,
			"CF-Connecting-IP": "203.0.113.10",
			...headers,
		},
		body: JSON.stringify(body),
	});
}

const validBody = (phone: string) => ({
	name: "Nguyễn Thu Hà",
	phone,
	elapsedMs: LEAD_MIN_ELAPSED_MS + 500,
	course: "ielts-foundation",
	studyDays: "mt",
	timeSlot: "0900",
});

async function leadRows() {
	return db.select().from(schema.lead);
}

describe("POST /public/leads (#506 phase 2)", () => {
	test("201 + một dòng lead đúng org, không lưu IP thô", async () => {
		const res = await submit(app(), validBody("0909123456"));
		expect(res.status).toBe(201);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const body = (await res.json()) as { id: string; submitCount: number };
		expect(body.submitCount).toBe(1);

		const rows = await leadRows();
		expect(rows).toHaveLength(1);
		const row = rows[0]!;
		expect(row.orgId).toBe("org-1");
		expect(row.name).toBe("Nguyễn Thu Hà");
		expect(row.phone).toBe("0909123456");
		expect(row.status).toBe("new");
		expect(row.source).toBe("profile");
		expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(rows)).not.toContain("203.0.113.10");
	});

	test("503 LEAD_INTAKE_DISABLED khi thiếu leadOrgId (fail-closed D4)", async () => {
		const res = await submit(
			app({ leadOrgId: undefined }),
			validBody("0909123456"),
		);
		expect(res.status).toBe(503);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("LEAD_INTAKE_DISABLED");
		expect(await leadRows()).toHaveLength(0);
	});

	test("403 LEAD_ORIGIN_FORBIDDEN cho origin lạ hoặc thiếu Origin", async () => {
		const stranger = await submit(app(), validBody("0909123456"), {
			Origin: "https://evil.example",
		});
		expect(stranger.status).toBe(403);

		const noOrigin = await submit(app(), validBody("0909123457"), {
			Origin: "",
		});
		expect(noOrigin.status).toBe(403);
		expect(await leadRows()).toHaveLength(0);
	});

	test("preflight từ msmy có ACAO đúng, không Allow-Credentials; /api giữ CORS cũ", async () => {
		const preflight = await app().request("/public/leads", {
			method: "OPTIONS",
			headers: {
				Origin: PROFILE_ORIGIN,
				"Access-Control-Request-Method": "POST",
				"Access-Control-Request-Headers": "Content-Type",
			},
		});
		expect(preflight.status).toBe(204);
		expect(preflight.headers.get("access-control-allow-origin")).toBe(
			PROFILE_ORIGIN,
		);
		expect(
			preflight.headers.get("access-control-allow-credentials"),
		).toBeNull();

		// Route teacher: origin profile KHÔNG được global cors chấp nhận.
		const teacherPreflight = await app().request("/api/holidays", {
			method: "OPTIONS",
			headers: {
				Origin: PROFILE_ORIGIN,
				"Access-Control-Request-Method": "GET",
			},
		});
		expect(
			teacherPreflight.headers.get("access-control-allow-origin"),
		).toBeNull();
	});

	test("400 LEAD_INVALID: enum lạ, thiếu phone, key lạ — có fields, không echo giá trị", async () => {
		const instance = app();
		for (const body of [
			{ ...validBody("0909123456"), course: "ielts-99" },
			{ name: "Nguyễn Thu Hà", elapsedMs: 5000 },
			{ ...validBody("0909123456"), orgId: "org-1" },
		]) {
			const res = await submit(instance, body);
			expect(res.status, JSON.stringify(body)).toBe(400);
			const payload = (await res.json()) as { code: string; fields: string[] };
			expect(payload.code).toBe("LEAD_INVALID");
			expect(payload.fields.length).toBeGreaterThan(0);
			expect(JSON.stringify(payload)).not.toContain("ielts-99");
			expect(JSON.stringify(payload)).not.toContain("0909123456");
		}
	});

	test("413 khi body vượt 4 KB", async () => {
		const res = await submit(app(), {
			...validBody("0909123456"),
			note: "x".repeat(5000),
		});
		expect(res.status).toBe(413);
	});

	test("honeypot và submit quá nhanh ⇒ 201 giả, không ghi, không email", async () => {
		const instance = app();
		const honeypot = await submit(instance, {
			...validBody("0909123456"),
			website: "http://spam.example",
		});
		expect(honeypot.status).toBe(201);

		const tooFast = await submit(instance, {
			...validBody("0909123457"),
			elapsedMs: LEAD_MIN_ELAPSED_MS - 1,
		});
		expect(tooFast.status).toBe(201);

		expect(await leadRows()).toHaveLength(0);
		expect(sent).toHaveLength(0);
	});

	test(`lần thứ ${LEAD_IP_MAX + 1} cùng IP trong 10 phút ⇒ 429 LEAD_RATE_LIMITED`, async () => {
		const instance = app();
		for (let i = 1; i <= LEAD_IP_MAX; i++) {
			const res = await submit(instance, validBody(`090900000${i}`), {
				"CF-Connecting-IP": "198.51.100.7",
			});
			expect(res.status).toBe(201);
		}
		const limited = await submit(instance, validBody("0909000099"), {
			"CF-Connecting-IP": "198.51.100.7",
		});
		expect(limited.status).toBe(429);
		const body = (await limited.json()) as { code: string };
		expect(body.code).toBe("LEAD_RATE_LIMITED");
		expect(limited.headers.get("retry-after")).toBe("600");

		// IP khác vẫn gửi được.
		const otherIp = await submit(instance, validBody("0909000098"), {
			"CF-Connecting-IP": "198.51.100.8",
		});
		expect(otherIp.status).toBe(201);
	});

	test(`lead thứ ${LEAD_DAILY_CAP + 1} của org trong ngày ⇒ 429 LEAD_DAILY_CAP`, async () => {
		const now = new Date();
		await db.insert(schema.lead).values(
			Array.from({ length: LEAD_DAILY_CAP }, (_, i) => ({
				id: `seed-${i}`,
				orgId: "org-1",
				name: `Seed ${i}`,
				phone: `09000000${String(i).padStart(2, "0")}`,
				createdAt: now,
				updatedAt: now,
			})),
		);
		const res = await submit(app(), validBody("0909123456"), {
			"CF-Connecting-IP": "198.51.100.50",
		});
		expect(res.status).toBe(429);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("LEAD_DAILY_CAP");
	});

	test("cùng SĐT gửi lại trong 24 giờ ⇒ update lead cũ, submitCount tăng, giữ status, không tạo dòng", async () => {
		const instance = app();
		const first = await submit(instance, validBody("0909123456"));
		expect(first.status).toBe(201);
		const firstBody = (await first.json()) as { id: string };

		// Giáo viên đã liên hệ — status đổi qua PATCH (phase 3 route nhưng ghi
		// thẳng DB ở đây cho đúng kịch bản).
		await db
			.update(schema.lead)
			.set({ status: "contacted", teacherNote: "Đã nhắn Zalo" })
			.where(eq(schema.lead.id, firstBody.id));

		const second = await submit(instance, {
			...validBody("0909123456"),
			course: "comm-2",
			note: "Gửi lại bổ sung khóa",
		});
		expect(second.status).toBe(201);
		const secondBody = (await second.json()) as {
			id: string;
			submitCount: number;
		};
		expect(secondBody.id).toBe(firstBody.id);
		expect(secondBody.submitCount).toBe(2);

		const rows = await leadRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.status).toBe("contacted");
		expect(rows[0]!.teacherNote).toBe("Đã nhắn Zalo");
		expect(rows[0]!.course).toBe("comm-2");
		expect(rows[0]!.submitCount).toBe(2);
	});

	test("lead mới ⇒ đúng 1 email mỗi thành viên org, không PII trong email (D13)", async () => {
		const res = await submit(app(), {
			...validBody("0909123456"),
			email: "hanguyen@example.com",
			birthDate: "2008-05-14",
		});
		expect(res.status).toBe(201);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.to).toBe("lan@test.local");
		expect(sent[0]!.subject).toContain("Đăng ký học mới");
		const text = sent[0]!.text;
		expect(text).toContain("Nguyễn Thu Hà");
		expect(text).toContain("/leads?status=new");
		expect(text).not.toContain("0909123456");
		expect(text).not.toContain("hanguyen@example.com");
		expect(text).not.toContain("2008-05-14");
	});

	test("dedupe update và honeypot không gửi email; mailer lỗi vẫn 201 + ghi DB", async () => {
		const instance = app();
		await submit(instance, validBody("0909123456"));
		await submit(instance, validBody("0909123456"));
		expect(sent).toHaveLength(1); // chỉ lead mới được email

		const strict = app({ mailer: failingMailer });
		const res = await submit(strict, validBody("0911222333"));
		expect(res.status).toBe(201);
		const rows = await leadRows();
		expect(rows.some((row) => row.phone === "0911222333")).toBe(true);
	});
});
