import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type { BillingTimelineResponse } from "@teacher-os/api/contracts";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { membership } from "@teacher-os/db/schema/membership";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

describe("GET /api/students/:id/billing-timeline (TOS-18 #452)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgId: string;
	let otherOrgId: string;
	let teacherToken: string;
	let taToken: string;
	let otherToken: string;

	function api(path: string, token?: string): Promise<Response> {
		return Promise.resolve(
			app.request(path, {
				headers: token ? { cookie: `better-auth.session_token=${token}` } : {},
			}),
		);
	}

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const t = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				if (!t) return null;
				if (t === teacherToken) {
					return {
						userId: "u-teacher",
						userName: "Teacher",
						role: "teacher" as const,
					};
				}
				if (t === taToken) {
					return {
						userId: "u-ta",
						userName: "TA",
						role: "teacher" as const,
					};
				}
				if (t === otherToken) {
					return {
						userId: "u-other",
						userName: "Other Teacher",
						role: "teacher" as const,
					};
				}
				return null;
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
		});

		teacherToken = crypto.randomUUID();
		taToken = crypto.randomUUID();
		otherToken = crypto.randomUUID();

		await libsql.insert(authUser).values([
			{ id: "u-teacher", name: "Teacher", email: "teacher@test.local" },
			{ id: "u-ta", name: "TA", email: "ta@test.local" },
			{ id: "u-other", name: "Other", email: "other@test.local" },
		]);
		await libsql.insert(authSession).values([
			{
				id: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 3600_000),
				token: teacherToken,
				userId: "u-teacher",
			},
			{
				id: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 3600_000),
				token: taToken,
				userId: "u-ta",
			},
			{
				id: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 3600_000),
				token: otherToken,
				userId: "u-other",
			},
		]);

		const boot = await api("/api/kernel", teacherToken);
		expect(boot.status).toBe(200);
		const otherBoot = await api("/api/kernel", otherToken);
		expect(otherBoot.status).toBe(200);

		const m1 = await client.execute({
			sql: "SELECT org_id FROM membership WHERE user_id = 'u-teacher'",
		});
		orgId = (m1.rows[0] as { org_id: string } | undefined)?.org_id ?? "";

		const m2 = await client.execute({
			sql: "SELECT org_id FROM membership WHERE user_id = 'u-other'",
		});
		otherOrgId = (m2.rows[0] as { org_id: string } | undefined)?.org_id ?? "";

		// Thêm trợ giảng (role = "ta") vào org chính để kiểm tra 403 finance-forbidden
		await libsql.insert(membership).values({
			id: crypto.randomUUID(),
			orgId,
			userId: "u-ta",
			role: "ta",
		});

		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', ?, 'Nguyễn Minh Anh', '0901112222', 'minhanh@test.local', '', 1000)",
			args: [orgId],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-2', ?, 'Trần Hoàng Nam', '0902223333', 'nam@test.local', '', 1000)",
			args: [orgId],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-empty', ?, 'Lê Thu Hà', '0903334444', 'ha@test.local', '', 1000)",
			args: [orgId],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-foreign', ?, 'Học viên Org Khác', '0909999999', 'f@test.local', '', 1000)",
			args: [otherOrgId],
		});

		// Học viên stu-1 có 2 hóa đơn:
		// - inv-1111aaaa: phát hành lúc t=10_000, loại "Học phí tháng 10", chưa thu đủ
		// - inv-2222bbbb: phát hành lúc t=40_000, loại "" (fallback "Khác"), đã thu đủ
		await libsql.insert(invoice).values([
			{
				id: "inv-1111aaaa",
				orgId,
				studentId: "stu-1",
				amount: 4_500_000,
				paidAmount: 2_000_000,
				status: "unpaid",
				due: "2026-10-20",
				type: "Học phí tháng 10",
				createdAt: new Date(10_000),
			},
			{
				id: "inv-2222bbbb",
				orgId,
				studentId: "stu-1",
				amount: 1_500_000,
				paidAmount: 1_500_000,
				status: "paid",
				due: "2026-10-25",
				type: "   ",
				createdAt: new Date(40_000),
			},
			{
				// Hóa đơn của học viên khác trong cùng org — không được lọt vào timeline stu-1
				id: "inv-other-stu",
				orgId,
				studentId: "stu-2",
				amount: 3_000_000,
				paidAmount: 1_000_000,
				status: "unpaid",
				due: "2026-10-30",
				type: "Học phí",
				createdAt: new Date(25_000),
			},
		]);

		// Giao dịch của stu-1:
		// 1. tx-bank-1 (t=20_000): sepay_bankhub matched vào inv-1111aaaa, có content PII sao kê
		// 2. tx-manual-1 (t=30_000): manual cash matched vào inv-1111aaaa, có ghi chú "Đóng đợt 1"
		// 3. tx-manual-2 (t=40_000): manual transfer matched vào inv-2222bbbb (cùng createdAt=40_000 với inv-2222bbbb -> payment xếp trước invoice_issued)
		// 4. tx-unmatched (t=50_000): unmatched -> không xuất hiện
		// 5. tx-other-stu (t=60_000): matched vào inv-other-stu -> không xuất hiện
		await libsql.insert(paymentTransaction).values([
			{
				id: "tx-bank-1",
				orgId,
				provider: "sepay_bankhub",
				providerTxnId: "sepay-001",
				bankAccountXid: "xid-secret",
				amount: 1_000_000,
				content: "NGUYEN VAN A 0912345678 chuyen khoan TOS1111AAAA",
				referenceCode: "FT26299",
				transactionDate: "2026-10-26 09:00:00",
				invoiceId: "inv-1111aaaa",
				matchStatus: "matched",
				raw: '{"secret":"pii-payload"}',
				method: "",
				createdAt: new Date(20_000),
			},
			{
				id: "tx-manual-1",
				orgId,
				provider: "manual",
				providerTxnId: "req-manual-1",
				amount: 1_000_000,
				content: "Đóng đợt 1 tại quầy",
				transactionDate: "2026-10-26 00:00:00",
				invoiceId: "inv-1111aaaa",
				matchStatus: "matched",
				raw: "",
				method: "cash",
				recordedBy: "u-teacher",
				createdAt: new Date(30_000),
			},
			{
				id: "tx-manual-2",
				orgId,
				provider: "manual",
				providerTxnId: "req-manual-2",
				amount: 1_500_000,
				content: "",
				transactionDate: "2026-10-26 00:00:00",
				invoiceId: "inv-2222bbbb",
				matchStatus: "matched",
				raw: "",
				method: "transfer",
				recordedBy: "u-teacher",
				createdAt: new Date(40_000),
			},
			{
				id: "tx-unmatched",
				orgId,
				provider: "sepay_bankhub",
				providerTxnId: "sepay-unmatched",
				amount: 500_000,
				content: "Chuyển nhầm",
				invoiceId: "inv-1111aaaa",
				matchStatus: "unmatched",
				raw: '{"unmatched":true}',
				createdAt: new Date(50_000),
			},
			{
				id: "tx-other-stu",
				orgId,
				provider: "manual",
				providerTxnId: "req-other-stu",
				amount: 1_000_000,
				content: "Của học viên 2",
				invoiceId: "inv-other-stu",
				matchStatus: "matched",
				method: "cash",
				createdAt: new Date(60_000),
			},
		]);
	});

	test("trả 5 sự kiện (2 hóa đơn + 1 bank-hub + 2 thu thủ công) đúng thứ tự mới nhất trước và đúng source/method", async () => {
		const res = await api("/api/students/stu-1/billing-timeline", teacherToken);
		expect(res.status).toBe(200);
		const body = (await res.json()) as BillingTimelineResponse;
		expect(body.events).toHaveLength(5);

		// Thứ tự giảm dần theo createdAt (khi cùng createdAt=40_000 thì payment đứng trước invoice_issued):
		// 1. payment tx-manual-2 (t=40_000)
		// 2. invoice_issued inv-2222bbbb (t=40_000)
		// 3. payment tx-manual-1 (t=30_000)
		// 4. payment tx-bank-1 (t=20_000)
		// 5. invoice_issued inv-1111aaaa (t=10_000)
		expect(body.events).toEqual([
			{
				kind: "payment",
				id: "tx-manual-2",
				at: new Date(40_000).toISOString(),
				invoiceId: "inv-2222bbbb",
				code: "INV-2222BBBB",
				amount: 1_500_000,
				source: "manual",
				method: "Chuyển khoản",
				note: "",
			},
			{
				kind: "invoice_issued",
				at: new Date(40_000).toISOString(),
				invoiceId: "inv-2222bbbb",
				code: "INV-2222BBBB",
				type: "Khác",
				amount: 1_500_000,
				due: "2026-10-25",
				status: "paid",
			},
			{
				kind: "payment",
				id: "tx-manual-1",
				at: new Date(30_000).toISOString(),
				invoiceId: "inv-1111aaaa",
				code: "INV-1111AAAA",
				amount: 1_000_000,
				source: "manual",
				method: "Tiền mặt",
				note: "Đóng đợt 1 tại quầy",
			},
			{
				kind: "payment",
				id: "tx-bank-1",
				at: new Date(20_000).toISOString(),
				invoiceId: "inv-1111aaaa",
				code: "INV-1111AAAA",
				amount: 1_000_000,
				source: "bank_hub",
				method: "",
				note: "",
			},
			{
				kind: "invoice_issued",
				at: new Date(10_000).toISOString(),
				invoiceId: "inv-1111aaaa",
				code: "INV-1111AAAA",
				type: "Học phí tháng 10",
				amount: 4_500_000,
				due: "2026-10-20",
				status: "unpaid",
			},
		]);
	});

	test("không lộ raw, provider, bankAccountXid hay content sao kê ngân hàng của bank_hub", async () => {
		const res = await api("/api/students/stu-1/billing-timeline", teacherToken);
		expect(res.status).toBe(200);
		const rawText = await res.text();
		expect(rawText).not.toContain("pii-payload");
		expect(rawText).not.toContain("NGUYEN VAN A 0912345678");
		expect(rawText).not.toContain("xid-secret");
		expect(rawText).not.toContain("sepay-001");
		expect(rawText).not.toContain("u-teacher");
	});

	test("học viên chưa có hóa đơn trả mảng events rỗng", async () => {
		const res = await api(
			"/api/students/stu-empty/billing-timeline",
			teacherToken,
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ events: [] });
	});

	test("học viên không tồn tại hoặc thuộc org khác trả 404 không phân biệt được", async () => {
		const missing = await api(
			"/api/students/stu-ghost/billing-timeline",
			teacherToken,
		);
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: "student not found" });

		const foreign = await api(
			"/api/students/stu-foreign/billing-timeline",
			teacherToken,
		);
		expect(foreign.status).toBe(404);
		expect(await foreign.json()).toEqual({ error: "student not found" });

		const crossCall = await api(
			"/api/students/stu-1/billing-timeline",
			otherToken,
		);
		expect(crossCall.status).toBe(404);
		expect(await crossCall.json()).toEqual({ error: "student not found" });
	});

	test("chưa đăng nhập trả 401 và role không có quyền tài chính (ta) trả 403 finance-forbidden", async () => {
		const unauth = await api("/api/students/stu-1/billing-timeline");
		expect(unauth.status).toBe(401);

		const forbidden = await api(
			"/api/students/stu-1/billing-timeline",
			taToken,
		);
		expect(forbidden.status).toBe(403);
		expect(await forbidden.json()).toEqual({ error: "finance-forbidden" });
	});
});
