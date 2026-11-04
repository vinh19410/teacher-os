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
	LEAD_DEDUPE_MAX_SUBMITS,
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

	test("201 với các mã khóa mới (foundation-core, ielts-practical, workplace-interview)", async () => {
		const instance = app();
		const newCourses = [
			"foundation-core",
			"ielts-practical",
			"workplace-interview",
		] as const;
		for (let i = 0; i < newCourses.length; i++) {
			const course = newCourses[i];
			if (!course) continue;
			const res = await submit(instance, {
				name: `Học viên ${course}`,
				phone: `090912345${i}`,
				elapsedMs: LEAD_MIN_ELAPSED_MS + 500,
				course,
			});
			expect(res.status, `status for ${course}`).toBe(201);
		}
		const rows = await leadRows();
		expect(rows).toHaveLength(3);
		expect(rows.map((r) => r.course).sort()).toEqual([...newCourses].sort());
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

	test("gửi lại cùng SĐT không ghi đè tên/email; quá ngưỡng gửi lại ⇒ 429", async () => {
		const instance = app();
		const first = await submit(instance, {
			...validBody("0909123456"),
			email: "goc@example.com",
		});
		expect(first.status).toBe(201);

		for (let i = 2; i <= LEAD_DEDUPE_MAX_SUBMITS; i++) {
			const res = await submit(
				instance,
				{
					...validBody("0909123456"),
					name: "Người Khác",
					email: "khac@example.com",
				},
				{ "CF-Connecting-IP": `10.0.0.${i}` },
			);
			expect(res.status).toBe(201);
		}
		const rows = await leadRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.name).toBe("Nguyễn Thu Hà");
		expect(rows[0]!.email).toBe("goc@example.com");

		const blocked = await submit(instance, validBody("0909123456"), {
			"CF-Connecting-IP": "10.0.0.99",
		});
		expect(blocked.status).toBe(429);
		expect((await leadRows())[0]!.submitCount).toBe(LEAD_DEDUPE_MAX_SUBMITS);
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

	test("notifyNewLead chỉ gửi email cho thành viên có canAccessFinance (teacher/owner/admin), bỏ qua ta và class_teacher (#524)", async () => {
		await db.insert(schema.user).values([
			{ id: "u-ta", name: "TA", email: "ta@test.local", role: "teacher" },
			{ id: "u-ct", name: "CT", email: "ct@test.local", role: "teacher" },
			{ id: "u-ow", name: "Owner", email: "owner@test.local", role: "teacher" },
		]);
		await db.insert(schema.membership).values([
			{ id: "m-ta", orgId: "org-1", userId: "u-ta", role: "ta" },
			{ id: "m-ct", orgId: "org-1", userId: "u-ct", role: "class_teacher" },
			{ id: "m-ow", orgId: "org-1", userId: "u-ow", role: "owner" },
		]);

		const res = await submit(app(), validBody("0909555666"));
		expect(res.status).toBe(201);
		const recipients = sent.map((m) => m.to).sort();
		expect(recipients).toEqual(["lan@test.local", "owner@test.local"]);
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

	test(`request song song cùng IP (10 request đồng thời, SĐT khác nhau) chỉ cho phép đúng ${LEAD_IP_MAX} lead và ${LEAD_IP_MAX} email (#524)`, async () => {
		const instance = app();
		const responses = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				submit(instance, validBody(`090910000${i}`), {
					"CF-Connecting-IP": "198.51.100.77",
				}),
			),
		);
		const created = responses.filter((res) => res.status === 201);
		const limited = responses.filter((res) => res.status === 429);
		expect(created).toHaveLength(LEAD_IP_MAX);
		expect(limited).toHaveLength(10 - LEAD_IP_MAX);
		for (const res of limited) {
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("LEAD_RATE_LIMITED");
		}
		expect(await leadRows()).toHaveLength(LEAD_IP_MAX);
		expect(sent).toHaveLength(LEAD_IP_MAX);
	});

	test(`request song song cùng SĐT (8 request đồng thời từ các IP khác nhau) chỉ tạo 1 dòng lead, gửi 1 email, tăng submitCount tới ${LEAD_DEDUPE_MAX_SUBMITS} và chặn 3 request còn lại bằng 429 (#524)`, async () => {
		const instance = app();
		const responses = await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				submit(instance, validBody("0909888777"), {
					"CF-Connecting-IP": `10.20.0.${i + 1}`,
				}),
			),
		);
		const created = responses.filter((res) => res.status === 201);
		const limited = responses.filter((res) => res.status === 429);
		expect(created).toHaveLength(LEAD_DEDUPE_MAX_SUBMITS);
		expect(limited).toHaveLength(8 - LEAD_DEDUPE_MAX_SUBMITS);

		const submitCounts = await Promise.all(
			created.map(async (res) => {
				const body = (await res.json()) as { submitCount: number };
				return body.submitCount;
			}),
		);
		expect([...submitCounts].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);

		const rows = await leadRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.submitCount).toBe(LEAD_DEDUPE_MAX_SUBMITS);
		expect(sent).toHaveLength(1);
	});

	test(`request song song sát trần ngày (seed ${LEAD_DAILY_CAP - 2} dòng, bắn 6 request đồng thời) chỉ nhận thêm đúng 2 dòng và trả 429 LEAD_DAILY_CAP cho 4 request còn lại (#524)`, async () => {
		const now = new Date();
		await db.insert(schema.lead).values(
			Array.from({ length: LEAD_DAILY_CAP - 2 }, (_, i) => ({
				id: `seed-cap-${i}`,
				orgId: "org-1",
				name: `Seed ${i}`,
				phone: `09010000${String(i).padStart(2, "0")}`,
				createdAt: now,
				updatedAt: now,
			})),
		);
		const instance = app();
		const responses = await Promise.all(
			Array.from({ length: 6 }, (_, i) =>
				submit(instance, validBody(`090930000${i}`), {
					"CF-Connecting-IP": `10.30.0.${i + 1}`,
				}),
			),
		);
		const created = responses.filter((res) => res.status === 201);
		const limited = responses.filter((res) => res.status === 429);
		expect(created).toHaveLength(2);
		expect(limited).toHaveLength(4);
		for (const res of limited) {
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("LEAD_DAILY_CAP");
		}
		expect(await leadRows()).toHaveLength(LEAD_DAILY_CAP);
		expect(sent).toHaveLength(2);

		// Khi org đã chạm trần ngày (100 dòng), gửi lại cùng SĐT đã có trong 24h (dedupe UPDATE)
		// vẫn được cập nhật 201 vì không tạo thêm dòng lead mới.
		const dedupeAtCap = await submit(
			instance,
			{ ...validBody("0901000000"), note: "Cập nhật khi đã chạm trần ngày" },
			{ "CF-Connecting-IP": "10.30.0.99" },
		);
		expect(dedupeAtCap.status).toBe(201);
		expect(await leadRows()).toHaveLength(LEAD_DAILY_CAP);
	});

	test("dedupe UPDATE từ IP khác không xóa ip_hash của IP tạo ban đầu để lách LEAD_IP_MAX, và lead thứ 3 của cùng IP vẫn tự cập nhật dedupe được (#524)", async () => {
		const instance = app();
		for (let i = 1; i <= LEAD_IP_MAX; i++) {
			const res = await submit(instance, validBody(`090920000${i}`), {
				"CF-Connecting-IP": "198.51.100.90",
			});
			expect(res.status).toBe(201);
		}

		// Cùng IP gửi lại SĐT thứ 3 (chỉ update dòng của chính nó, không tạo dòng thứ 4) ⇒ vẫn 201.
		const selfUpdate = await submit(instance, validBody("0909200003"), {
			"CF-Connecting-IP": "198.51.100.90",
		});
		expect(selfUpdate.status).toBe(201);

		// IP khác cập nhật SĐT thứ 1 ⇒ 201, nhưng KHÔNG được xóa ip_hash gốc của 198.51.100.90.
		const otherIpUpdate = await submit(instance, validBody("0909200001"), {
			"CF-Connecting-IP": "198.51.100.91",
		});
		expect(otherIpUpdate.status).toBe(201);

		// IP ban đầu (198.51.100.90) thử tạo SĐT thứ 4 mới ⇒ vẫn phải bị 429 LEAD_RATE_LIMITED.
		const fourthPhone = await submit(instance, validBody("0909200004"), {
			"CF-Connecting-IP": "198.51.100.90",
		});
		expect(fourthPhone.status).toBe(429);
	});

	test("source=placement-test: bắt buộc email (thiếu ⇒ 400 LEAD_INVALID fields=['email']), lưu source=placement-test, gửi lần 2 gắn placement và giữ nguyên trường tuỳ chọn đã có (#534)", async () => {
		const instance = app();

		// 1. Thiếu email hoặc email rỗng khi source=placement-test ⇒ 400 LEAD_INVALID
		for (const badBody of [
			{ ...validBody("0909444555"), source: "placement-test" },
			{ ...validBody("0909444555"), source: "placement-test", email: "   " },
		]) {
			const badRes = await submit(instance, badBody);
			expect(badRes.status).toBe(400);
			const payload = (await badRes.json()) as {
				code: string;
				fields: string[];
			};
			expect(payload.code).toBe("LEAD_INVALID");
			expect(payload.fields).toContain("email");
		}
		expect(await leadRows()).toHaveLength(0);
		expect(sent).toHaveLength(0);

		// 2. Hợp lệ ở bước gate ⇒ 201, source = "placement-test", gửi 1 email
		const gateRes = await submit(instance, {
			name: "Lê Hoàng Nam",
			phone: "0909444555",
			email: "nam.le@example.com",
			birthDate: "2004-08-20",
			course: "ielts-pre",
			studyMode: "group-online",
			note: "Mục tiêu 6.5",
			source: "placement-test",
			elapsedMs: LEAD_MIN_ELAPSED_MS + 500,
		});
		expect(gateRes.status).toBe(201);
		const gateJson = (await gateRes.json()) as {
			id: string;
			submitCount: number;
		};
		expect(gateJson.submitCount).toBe(1);
		expect(sent).toHaveLength(1);

		let rows = await leadRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.source).toBe("placement-test");
		expect(rows[0]!.email).toBe("nam.le@example.com");
		expect(rows[0]!.placement).toBe("");

		// 3. Nộp bài đồng bộ điểm (cùng SĐT, kèm placement, ngay cả khi bỏ trống trường tuỳ chọn) ⇒ cập nhật cùng dòng, giữ trường cũ, không gửi email thứ 2
		const syncRes = await submit(instance, {
			name: "Lê Hoàng Nam",
			phone: "0909444555",
			email: "nam.le@example.com",
			placement:
				"Kiểm tra đầu vào: 19/30 (Vocab + Grammar 12/15, Listening 7/15) – CEFR B1",
			source: "placement-test",
			elapsedMs: LEAD_MIN_ELAPSED_MS + 1000,
		});
		expect(syncRes.status).toBe(201);
		const syncJson = (await syncRes.json()) as {
			id: string;
			submitCount: number;
		};
		expect(syncJson.id).toBe(gateJson.id);
		expect(syncJson.submitCount).toBe(2);
		expect(sent).toHaveLength(1);

		rows = await leadRows();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.source).toBe("placement-test");
		expect(rows[0]!.placement).toBe(
			"Kiểm tra đầu vào: 19/30 (Vocab + Grammar 12/15, Listening 7/15) – CEFR B1",
		);
		expect(rows[0]!.birthDate).toBe("2004-08-20");
		expect(rows[0]!.course).toBe("ielts-pre");
		expect(rows[0]!.studyMode).toBe("group-online");
		expect(rows[0]!.note).toBe("Mục tiêu 6.5");
		expect(rows[0]!.submitCount).toBe(2);

		// 4. Lead tạo từ form trang chủ (profile) sau đó làm bài test (placement-test) ⇒ giữ nguyên source="profile" và giữ studyDays/timeSlot cũ
		const profileFirst = await submit(
			instance,
			{
				...validBody("0909777888"),
				studyDays: "tf",
				timeSlot: "1815",
			},
			{ "CF-Connecting-IP": "198.51.100.120" },
		);
		expect(profileFirst.status).toBe(201);

		const testLater = await submit(
			instance,
			{
				name: "Nguyễn Thu Hà",
				phone: "0909777888",
				email: "ha.test@example.com",
				placement: "Kiểm tra đầu vào: 24/30 – CEFR B2+",
				source: "placement-test",
				elapsedMs: LEAD_MIN_ELAPSED_MS + 500,
			},
			{ "CF-Connecting-IP": "198.51.100.120" },
		);
		expect(testLater.status).toBe(201);

		const profileRow = (await leadRows()).find((r) => r.phone === "0909777888");
		expect(profileRow?.source).toBe("profile");
		expect(profileRow?.email).toBe("ha.test@example.com");
		expect(profileRow?.studyDays).toBe("tf");
		expect(profileRow?.timeSlot).toBe("1815");
		expect(profileRow?.placement).toBe("Kiểm tra đầu vào: 24/30 – CEFR B2+");
	});
});
