import { createClient } from "@libsql/client";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { user as authUser } from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { membership } from "@teacher-os/db/schema/membership";
import { notificationRecord } from "@teacher-os/db/schema/notification-record";
import { organization } from "@teacher-os/db/schema/organization";
import { student } from "@teacher-os/db/schema/student";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { Db } from "../../app";
import { deliverNotifications } from "./deliver";
import { emitNotifications } from "./emit";
import { enqueueNotifications } from "./enqueue";
import { holidayCreatedEvents, tuitionReminderEvent } from "./templates";

const MIGRATIONS_DIR = new URL(
	"../../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

function fakeMailer(impl: Mailer["send"] = async () => {}): Mailer {
	return { send: impl };
}

describe("notifications service (#454 phase 2)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
	});

	async function seedOrg(orgId: string, name: string) {
		await libsql.insert(organization).values({ id: orgId, name });
	}

	async function seedOwner(orgId: string, userId: string, email: string) {
		await libsql.insert(authUser).values({ id: userId, name: "Owner", email });
		await libsql.insert(membership).values({
			id: crypto.randomUUID(),
			orgId,
			userId,
			role: "owner",
		});
	}

	async function seedStudent(orgId: string, studentId: string, email: string) {
		await libsql.insert(student).values({
			id: studentId,
			orgId,
			name: `Student ${studentId}`,
			email,
		});
	}

	async function rowsOf(studentId: string) {
		return libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, studentId));
	}

	async function rowOf(studentId: string) {
		const [row] = await rowsOf(studentId);
		if (!row) throw new Error(`no notification row for ${studentId}`);
		return row;
	}

	test("enqueue 2 sự kiện → 2 dòng queued, sender_name = tên org, reply_to_email = email chủ org; enqueue lại cùng khóa → 0 dòng mới", async () => {
		await seedOrg("org-1", "Academy One");
		await seedOwner("org-1", "user-1", "owner@academy.vn");
		await seedStudent("org-1", "stu-1", "stu1@example.com");

		const events = [
			{
				studentId: "stu-1",
				eventType: "grade_returned" as const,
				idempotencyKey: "grade_returned:att-1",
				title: "Bài đã có điểm",
				body: "Xem điểm tại cổng học viên.",
				linkPath: "/assignments/a-1",
				refType: "attempt",
				refId: "att-1",
			},
			{
				studentId: "stu-1",
				eventType: "assignment_published" as const,
				idempotencyKey: "assignment_published:ca-1:stu-1",
				title: "Bài tập mới",
				body: "Bạn có bài tập mới.",
				linkPath: "/assignments/a-2",
				refType: "class_assignment",
				refId: "ca-1",
			},
		];

		const first = await enqueueNotifications(db, "org-1", events);
		expect(first.createdIds).toHaveLength(2);

		const rows = await rowsOf("stu-1");
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.status).toBe("queued");
			expect(row.channels).toBe("email,in_app");
			expect(row.senderName).toBe("Academy One");
			expect(row.replyToEmail).toBe("owner@academy.vn");
			expect(row.recipientEmail).toBe("stu1@example.com");
			expect(row.retryCount).toBe(0);
			expect(row.eventGroup).toBe(
				row.eventType === "grade_returned" ? "assignment" : "assignment",
			);
		}

		const again = await enqueueNotifications(db, "org-1", events);
		expect(again.createdIds).toHaveLength(0);
		const rowsAfter = await rowsOf("stu-1");
		expect(rowsAfter).toHaveLength(2);
	});

	test("học viên không email → in_app + sent ngay khi enqueue", async () => {
		await seedOrg("org-2", "Academy Two");
		await seedStudent("org-2", "stu-2", "");

		const { createdIds } = await enqueueNotifications(db, "org-2", [
			{
				studentId: "stu-2",
				eventType: "class_enrolled",
				idempotencyKey: "class_enrolled:enr-1",
				title: "Bạn được thêm vào lớp",
				body: "Chào mừng bạn!",
				linkPath: "/classes",
				refType: "enrollment",
				refId: "enr-1",
			},
		]);
		expect(createdIds).toHaveLength(1);

		const row = await rowOf("stu-2");
		expect(row.channels).toBe("in_app");
		expect(row.status).toBe("sent");
		expect(row.sentAt).not.toBeNull();
		expect(row.recipientEmail).toBeNull();
	});

	test("học viên thuộc org khác → bị bỏ qua", async () => {
		await seedOrg("org-3", "Academy Three");
		await seedOrg("org-4", "Other Academy");
		await seedStudent("org-4", "stu-4", "stu4@example.com");

		const { createdIds } = await enqueueNotifications(db, "org-3", [
			{
				studentId: "stu-4",
				eventType: "invoice_issued",
				idempotencyKey: "invoice_issued:inv-1",
				title: "Hóa đơn mới",
				body: "Hóa đơn đã phát hành.",
				linkPath: "/tuition",
				refType: "invoice",
				refId: "inv-1",
			},
		]);
		expect(createdIds).toHaveLength(0);
		const rows = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.idempotencyKey, "invoice_issued:inv-1"));
		expect(rows).toHaveLength(0);
	});

	test("deliver OK → sent + sent_at; mailer nhận replyTo + fromName đúng", async () => {
		await seedOrg("org-5", "Academy Five");
		await seedOwner("org-5", "user-5", "owner5@academy.vn");
		await seedStudent("org-5", "stu-5", "stu5@example.com");
		const { createdIds } = await enqueueNotifications(db, "org-5", [
			{
				studentId: "stu-5",
				eventType: "grade_returned",
				idempotencyKey: "grade_returned:att-5",
				title: "Bài đã có điểm",
				body: "Điểm của bạn đã có.",
				linkPath: "/assignments/a-5",
				refType: "attempt",
				refId: "att-5",
			},
		]);

		const sentInputs: Parameters<Mailer["send"]>[0][] = [];
		await deliverNotifications(
			db,
			fakeMailer(async (input) => {
				sentInputs.push(input);
			}),
			createdIds,
		);

		const row = await rowOf("stu-5");
		expect(row.status).toBe("sent");
		expect(row.sentAt).not.toBeNull();
		expect(sentInputs).toHaveLength(1);
		const sentInput = sentInputs.at(0);
		if (!sentInput) throw new Error("mailer was not called");
		expect(sentInput.to).toBe("stu5@example.com");
		expect(sentInput.subject).toBe("Bài đã có điểm");
		expect(sentInput.replyTo).toBe("owner5@academy.vn");
		expect(sentInput.fromName).toBe("Academy Five qua Teacher OS");
	});

	test("studentOrigin inject → link tuyệt đối trong thư (regression: env là chuỗi thô)", async () => {
		await seedOrg("org-5b", "Academy Five B");
		await seedStudent("org-5b", "stu-5b", "stu5b@example.com");
		const { createdIds } = await enqueueNotifications(db, "org-5b", [
			{
				studentId: "stu-5b",
				eventType: "invoice_issued",
				idempotencyKey: "invoice_issued:inv-5b",
				title: "Hóa đơn học phí",
				body: "Hóa đơn đã phát hành.",
				linkPath: "/tuition",
				refType: "invoice",
				refId: "inv-5b",
			},
		]);

		const sentInputs: Parameters<Mailer["send"]>[0][] = [];
		await deliverNotifications(
			db,
			fakeMailer(async (input) => {
				sentInputs.push(input);
			}),
			createdIds,
			"https://hocVien.teacheros.example",
		);

		const sentInput = sentInputs.at(0);
		if (!sentInput) throw new Error("mailer was not called");
		// Link tuyệt đối = origin + linkPath, không lấy ký tự đầu của chuỗi env.
		expect(sentInput.text).toContain(
			"https://hocVien.teacheros.example/tuition",
		);
		expect(sentInput.html).toContain(
			"https://hocVien.teacheros.example/tuition",
		);
	});

	test("mailer ném lỗi → giữ queued, retry_count = 1, last_error không chứa API key", async () => {
		await seedOrg("org-6", "Academy Six");
		await seedStudent("org-6", "stu-6", "stu6@example.com");
		const { createdIds } = await enqueueNotifications(db, "org-6", [
			{
				studentId: "stu-6",
				eventType: "tuition_reminder",
				idempotencyKey: "tuition_reminder:inv-6:2026-10-26",
				title: "Nhắc học phí",
				body: "Hóa đơn đến hạn.",
				linkPath: "/tuition",
				refType: "invoice",
				refId: "inv-6",
			},
		]);

		await deliverNotifications(
			db,
			fakeMailer(async () => {
				throw new Error("resend send failed: 500 boom");
			}),
			createdIds,
		);

		const row = await rowOf("stu-6");
		expect(row.status).toBe("queued");
		expect(row.retryCount).toBe(1);
		expect(row.lastError).toContain("resend send failed: 500 boom");
		expect(row.lastError ?? "").not.toContain("api-key-secret");
	});

	test("read_at có sẵn → deliver chuyển thẳng read", async () => {
		await seedOrg("org-7", "Academy Seven");
		await seedStudent("org-7", "stu-7", "stu7@example.com");
		const { createdIds } = await enqueueNotifications(db, "org-7", [
			{
				studentId: "stu-7",
				eventType: "assignment_published",
				idempotencyKey: "assignment_published:ca-7:stu-7",
				title: "Bài tập mới",
				body: "Bạn có bài tập mới.",
				linkPath: "/assignments/a-7",
				refType: "class_assignment",
				refId: "ca-7",
			},
		]);
		// Học viên đọc in-app trước khi email kịp gửi.
		const queuedId = createdIds.at(0);
		if (!queuedId) throw new Error("enqueue created no rows");
		await libsql
			.update(notificationRecord)
			.set({ readAt: new Date(), status: "queued" })
			.where(eq(notificationRecord.id, queuedId));

		await deliverNotifications(db, fakeMailer(), createdIds);

		const row = await rowOf("stu-7");
		expect(row.status).toBe("read");
		expect(row.readAt).not.toBeNull();
		expect(row.sentAt).not.toBeNull();
	});

	test("deliver bỏ qua id không tồn tại / đã sent", async () => {
		let calls = 0;
		await deliverNotifications(db, fakeMailer(), []);
		await deliverNotifications(
			db,
			fakeMailer(async () => {
				calls += 1;
			}),
			["no-such-id"],
		);
		expect(calls).toBe(0);
	});

	test("emitNotifications khi enqueue ném → không ném ra ngoài", async () => {
		const brokenDb = {
			select: () => {
				throw new Error("db down");
			},
		} as unknown as Db;
		await expect(
			emitNotifications({ db: brokenDb, mailer: fakeMailer() }, "org-x", [
				{
					studentId: "stu-x",
					eventType: "class_enrolled",
					idempotencyKey: "class_enrolled:enr-x",
					title: "T",
					body: "B",
					linkPath: "/",
					refType: "enrollment",
					refId: "enr-x",
				},
			]),
		).resolves.toBeUndefined();
	});

	test("emitNotifications không có runInBackground → deliver await tuần tự", async () => {
		await seedOrg("org-8", "Academy Eight");
		await seedStudent("org-8", "stu-8", "stu8@example.com");
		let sent = false;
		await emitNotifications(
			{
				db,
				mailer: fakeMailer(async () => {
					sent = true;
				}),
			},
			"org-8",
			[
				{
					studentId: "stu-8",
					eventType: "schedule_changed",
					idempotencyKey: "schedule_changed:c-8:2026-10-27:1:stu-8",
					title: "Lịch học thay đổi",
					body: "Buổi học đã được dời.",
					linkPath: "/schedule",
					refType: "class",
					refId: "c-8",
				},
			],
		);
		expect(sent).toBe(true);
		const row = await rowOf("stu-8");
		expect(row.status).toBe("sent");
	});
});

describe("templates builder", () => {
	test("tuitionReminderEvent: khóa gồm ngày VN + nội dung tiếng Việt", () => {
		const event = tuitionReminderEvent(
			{
				id: "inv-9",
				studentId: "stu-9",
				amount: 1_500_000,
				due: "2026-11-01",
			},
			"2026-10-26",
		);
		expect(event.eventType).toBe("tuition_reminder");
		expect(event.idempotencyKey).toBe("tuition_reminder:inv-9:2026-10-26");
		expect(event.studentId).toBe("stu-9");
		expect(event.refType).toBe("invoice");
		expect(event.refId).toBe("inv-9");
		expect(event.body).toContain("1.500.000đ");
		expect(event.body).toContain("2026-11-01");
		expect(event.title.length).toBeGreaterThan(0);
	});

	test("holidayCreatedEvents: 1 sự kiện mỗi học viên, khóa theo holidayId+studentId", () => {
		const events = holidayCreatedEvents({
			holidayId: "hol-1",
			title: "Nghỉ lễ 30/4",
			date: "2026-04-30",
			studentIds: ["stu-a", "stu-b"],
		});
		expect(events).toHaveLength(2);
		expect(events.map((e) => e.studentId)).toEqual(["stu-a", "stu-b"]);
		for (const event of events) {
			expect(event.eventType).toBe("holiday_created");
			expect(event.idempotencyKey).toBe(
				`holiday_created:hol-1:${event.studentId}`,
			);
		}
	});

	test("Resend body có reply_to + from có tên (fetch mock)", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ id: "email-x" }),
		});
		vi.stubGlobal("fetch", fetchMock);
		const { createResendMailer } = await import("@teacher-os/auth/mail/mailer");
		const mailer = createResendMailer({
			apiKey: "test-api-key",
			from: "noreply@teacheros.vn",
		});
		await mailer.send({
			to: "stu@example.com",
			subject: "Nhắc học phí",
			html: "<p>Nhắc học phí</p>",
			text: "Nhắc học phí",
			replyTo: "owner@academy.vn",
			fromName: "Academy qua Teacher OS",
		});
		const fetchArgs = fetchMock.mock.calls.at(0);
		if (!fetchArgs) throw new Error("fetch was not called");
		const body = JSON.parse(String(fetchArgs[1].body));
		expect(body.reply_to).toBe("owner@academy.vn");
		expect(body.from).toBe('"Academy qua Teacher OS" <noreply@teacheros.vn>');
		vi.unstubAllGlobals();
	});
});
