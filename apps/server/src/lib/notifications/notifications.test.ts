import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { NOTIFICATION_ERROR_CODES } from "@teacher-os/api/contracts";
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
import { deliverNotifications, renderHtml } from "./deliver";
import { emitNotifications } from "./emit";
import { enqueueNotifications } from "./enqueue";
import {
	buildOrgInvitationEmail,
	buildStudentPortalInviteEmail,
} from "./invite-email";
import { requeueSingleFailedNotification } from "./requeue";
import {
	classOpeningConfirmedEvents,
	holidayCreatedEvents,
	placementSubmittedEvent,
	tuitionReminderEvent,
} from "./templates";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../../packages/db/src/migrations", import.meta.url).href,
);

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
		expect(sentInput.fromName).toBe("Academy Five qua Cô Mỹ Dạy Tiếng Anh");
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

	test("mailer luôn ném lỗi → thử đủ 3 lượt rồi chuyển failed kèm E-selfomy-alignment-010, redact secret và cắt ≤ 500 ký tự", async () => {
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

		let attempts = 0;
		const longTail = "x".repeat(600);
		await deliverNotifications(
			db,
			fakeMailer(async () => {
				attempts += 1;
				throw new Error(
					`resend send failed: 500 boom Authorization: Bearer re_live_secret12345 ${longTail}`,
				);
			}),
			createdIds,
			"",
			{ retryDelaysMs: [0, 0] },
		);

		expect(attempts).toBe(3);
		const row = await rowOf("stu-6");
		expect(row.status).toBe("failed");
		expect(row.retryCount).toBe(3);
		expect(
			row.lastError?.startsWith(
				`${NOTIFICATION_ERROR_CODES.DELIVERY_FAILED}: `,
			),
		).toBe(true);
		expect(row.lastError).toContain("resend send failed: 500 boom");
		expect(row.lastError ?? "").not.toContain("re_live_secret12345");
		expect((row.lastError ?? "").length).toBeLessThanOrEqual(500);
	});

	test("mailer lỗi 2 lần đầu rồi lần 3 thành công → sent, retry_count = 2, xóa last_error = null", async () => {
		await seedOrg("org-6b", "Academy Six B");
		await seedStudent("org-6b", "stu-6b", "stu6b@example.com");
		const { createdIds } = await enqueueNotifications(db, "org-6b", [
			{
				studentId: "stu-6b",
				eventType: "tuition_reminder",
				idempotencyKey: "tuition_reminder:inv-6b:2026-10-26",
				title: "Nhắc học phí",
				body: "Hóa đơn đến hạn.",
				linkPath: "/tuition",
				refType: "invoice",
				refId: "inv-6b",
			},
		]);

		let attempts = 0;
		await deliverNotifications(
			db,
			fakeMailer(async () => {
				attempts += 1;
				if (attempts <= 2) {
					throw new Error(`temporary smtp error #${attempts}`);
				}
			}),
			createdIds,
			"",
			{ retryDelaysMs: [0, 0] },
		);

		expect(attempts).toBe(3);
		const row = await rowOf("stu-6b");
		expect(row.status).toBe("sent");
		expect(row.retryCount).toBe(2);
		expect(row.lastError).toBeNull();
		expect(row.sentAt).not.toBeNull();
	});

	test("batch 2 bản ghi, chỉ 1 lỗi → bản ghi OK chỉ gửi 1 lần ở lượt 1, không gửi lại ở lượt 2/3", async () => {
		await seedOrg("org-6c", "Academy Six C");
		await seedStudent("org-6c", "stu-6c-ok", "ok@example.com");
		await seedStudent("org-6c", "stu-6c-fail", "fail@example.com");
		const { createdIds } = await enqueueNotifications(db, "org-6c", [
			{
				studentId: "stu-6c-ok",
				eventType: "class_enrolled",
				idempotencyKey: "class_enrolled:enr-6c-ok",
				title: "Mời lớp",
				body: "Chào bạn",
				linkPath: "/classes/c1",
				refType: "enrollment",
				refId: "enr-6c-ok",
			},
			{
				studentId: "stu-6c-fail",
				eventType: "class_enrolled",
				idempotencyKey: "class_enrolled:enr-6c-fail",
				title: "Mời lớp",
				body: "Chào bạn",
				linkPath: "/classes/c1",
				refType: "enrollment",
				refId: "enr-6c-fail",
			},
		]);

		const callsByTo: Record<string, number> = {};
		await deliverNotifications(
			db,
			fakeMailer(async (input) => {
				callsByTo[input.to] = (callsByTo[input.to] ?? 0) + 1;
				if (input.to === "fail@example.com") {
					throw new Error("mailbox unavailable");
				}
			}),
			createdIds,
			"",
			{ retryDelaysMs: [0, 0] },
		);

		expect(callsByTo["ok@example.com"]).toBe(1);
		expect(callsByTo["fail@example.com"]).toBe(3);
		expect((await rowOf("stu-6c-ok")).status).toBe("sent");
		expect((await rowOf("stu-6c-fail")).status).toBe("failed");
	});

	test("bản ghi đã failed hoặc retry_count >= 3 → deliverNotifications không gọi mailer thêm", async () => {
		await seedOrg("org-6d", "Academy Six D");
		await seedStudent("org-6d", "stu-6d", "stu6d@example.com");
		const { createdIds } = await enqueueNotifications(db, "org-6d", [
			{
				studentId: "stu-6d",
				eventType: "class_enrolled",
				idempotencyKey: "class_enrolled:enr-6d",
				title: "Mời lớp",
				body: "Chào bạn",
				linkPath: "/classes/c1",
				refType: "enrollment",
				refId: "enr-6d",
			},
		]);
		const id = createdIds[0];
		if (!id) throw new Error("missing id");
		await libsql
			.update(notificationRecord)
			.set({ retryCount: 3, status: "queued" })
			.where(eq(notificationRecord.id, id));

		let calls = 0;
		await deliverNotifications(
			db,
			fakeMailer(async () => {
				calls += 1;
			}),
			createdIds,
			"",
			{ retryDelaysMs: [0, 0] },
		);
		expect(calls).toBe(0);
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
		).resolves.toEqual({ createdIds: [], queuedEmailIds: [] });
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

	test("channels = in_app → sent ngay khi enqueue dù học viên có email; emitNotifications không gọi mailer hay log thiếu mailer", async () => {
		await seedOrg("org-8b", "Academy Eight B");
		await seedStudent("org-8b", "stu-8b", "stu8b@example.com");

		const event = placementSubmittedEvent({
			submissionId: "sub-8b",
			studentId: "stu-8b",
		});
		const enqueueResult = await enqueueNotifications(db, "org-8b", [event]);
		expect(enqueueResult.createdIds).toHaveLength(1);
		expect(enqueueResult.queuedEmailIds).toEqual([]);

		const row = await rowOf("stu-8b");
		expect(row.eventType).toBe("placement_submitted");
		expect(row.channels).toBe("in_app");
		expect(row.status).toBe("sent");
		expect(row.sentAt).not.toBeNull();
		expect(row.recipientEmail).toBeNull();

		// emitNotifications với mailer có mặt lẫn mailer vắng mặt đều không gửi thư hay cảnh báo
		await seedStudent("org-8b", "stu-8c", "stu8c@example.com");
		await seedStudent("org-8b", "stu-8d", "stu8d@example.com");
		let mailerCalls = 0;
		await emitNotifications(
			{
				db,
				mailer: fakeMailer(async () => {
					mailerCalls += 1;
				}),
			},
			"org-8b",
			[
				placementSubmittedEvent({
					submissionId: "sub-8c",
					studentId: "stu-8c",
				}),
			],
		);
		expect(mailerCalls).toBe(0);
		const row8c = await rowOf("stu-8c");
		expect(row8c.channels).toBe("in_app");
		expect(row8c.status).toBe("sent");
		expect(row8c.recipientEmail).toBeNull();

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await emitNotifications(
				{
					db,
					mailer: undefined,
				},
				"org-8b",
				[
					placementSubmittedEvent({
						submissionId: "sub-8d",
						studentId: "stu-8d",
					}),
				],
			);
			expect(warnSpy).not.toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
		const row8d = await rowOf("stu-8d");
		expect(row8d.channels).toBe("in_app");
		expect(row8d.status).toBe("sent");
		expect(row8d.recipientEmail).toBeNull();
	});

	test("htmlBody được lưu nguyên vẹn và gửi trực tiếp tới mailer; bản ghi htmlBody=null vẫn dùng renderHtml", async () => {
		await seedOrg("org-html-1", "HTML Academy");
		await seedOwner("org-html-1", "user-html-1", "owner@html-academy.vn");
		await seedStudent("org-html-1", "stu-html-1", "rich@example.com");
		await seedStudent("org-html-1", "stu-plain-1", "plain@example.com");

		const openingEvents = classOpeningConfirmedEvents({
			classId: "cls-html-1",
			className: "IELTS Speaking Pro",
			startDate: "2026-08-10",
			scheduleRaw: JSON.stringify({
				days: [0, 3],
				start: "19:30",
				end: "21:00",
			}),
			mode: "Online",
			sessionsTotal: 16,
			version: 1,
			isUpdate: false,
			teacherNote: "Chuẩn bị micro rõ tiếng",
			orgName: "HTML Academy",
			studentOrigin: "https://student.teacheros.example",
			students: [{ id: "stu-html-1", name: "Student stu-html-1" }],
		});
		const expectedRichHtml = openingEvents[0]?.htmlBody ?? "";
		expect(expectedRichHtml.length).toBeGreaterThan(100);

		const plainEvent = {
			studentId: "stu-plain-1",
			eventType: "class_enrolled" as const,
			idempotencyKey: "class_enrolled:enr-plain-1",
			title: "Được mời vào lớp",
			body: "Bạn được mời tham gia lớp IELTS Speaking Pro.",
			linkPath: "/classes",
			refType: "enrollment",
			refId: "enr-plain-1",
		};

		const sentInputs: Parameters<Mailer["send"]>[0][] = [];
		const result = await emitNotifications(
			{
				db,
				mailer: fakeMailer(async (input) => {
					sentInputs.push(input);
				}),
				studentOrigin: "https://student.teacheros.example",
			},
			"org-html-1",
			[...openingEvents, plainEvent],
		);

		expect(result.createdIds).toHaveLength(2);
		expect(result.queuedEmailIds).toHaveLength(2);

		const richRow = await rowOf("stu-html-1");
		const plainRow = await rowOf("stu-plain-1");
		expect(richRow.htmlBody).toBe(expectedRichHtml);
		expect(plainRow.htmlBody).toBeNull();

		const richSent = sentInputs.find((s) => s.to === "rich@example.com");
		const plainSent = sentInputs.find((s) => s.to === "plain@example.com");
		expect(richSent?.html).toBe(expectedRichHtml);
		expect(plainSent?.html).toBe(
			renderHtml(plainEvent.body, "https://student.teacheros.example/classes"),
		);
	});

	test("gửi lại bản ghi failed (requeueSingleFailedNotification + deliverNotifications) giữ nguyên htmlBody đã lưu", async () => {
		await seedOrg("org-html-resend", "Resend Academy");
		await seedStudent(
			"org-html-resend",
			"stu-html-resend",
			"retry@example.com",
		);

		const openingEvents = classOpeningConfirmedEvents({
			classId: "cls-resend-1",
			className: "IELTS Writing 7.0",
			startDate: "2026-09-01",
			scheduleRaw: JSON.stringify({
				days: [1, 4],
				start: "20:00",
				end: "21:30",
			}),
			mode: "Online",
			sessionsTotal: 20,
			version: 1,
			isUpdate: false,
			teacherNote: "Đọc trước bài mẫu unit 1",
			orgName: "Resend Academy",
			studentOrigin: "https://student.teacheros.example",
			students: [{ id: "stu-html-resend", name: "Minh Quân" }],
		});
		const expectedHtml = openingEvents[0]?.htmlBody ?? "";

		const enqueued = await enqueueNotifications(
			db,
			"org-html-resend",
			openingEvents,
		);
		const recordId = enqueued.queuedEmailIds[0];
		if (!recordId) throw new Error("expected queued email id");

		await deliverNotifications(
			db,
			fakeMailer(async () => {
				throw new Error("temporary provider outage");
			}),
			[recordId],
			"https://student.teacheros.example",
			{ retryDelaysMs: [0, 0] },
		);

		const failedRow = await rowOf("stu-html-resend");
		expect(failedRow.status).toBe("failed");
		expect(failedRow.htmlBody).toBe(expectedHtml);

		const requeued = await requeueSingleFailedNotification(
			db,
			"org-html-resend",
			recordId,
		);
		expect(requeued.kind).toBe("ok");
		if (requeued.kind !== "ok") throw new Error("expected ok requeue");

		const resentInputs: Parameters<Mailer["send"]>[0][] = [];
		await deliverNotifications(
			db,
			fakeMailer(async (input) => {
				resentInputs.push(input);
			}),
			requeued.requeuedIds,
			"https://student.teacheros.example",
			{ retryDelaysMs: [0, 0] },
		);

		expect(resentInputs).toHaveLength(1);
		expect(resentInputs[0]?.html).toBe(expectedHtml);
		const finalRow = await rowOf("stu-html-resend");
		expect(finalRow.status).toBe("sent");
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
			fromName: "Academy qua Cô Mỹ Dạy Tiếng Anh",
		});
		const fetchArgs = fetchMock.mock.calls.at(0);
		if (!fetchArgs) throw new Error("fetch was not called");
		const body = JSON.parse(String(fetchArgs[1].body));
		expect(body.reply_to).toBe("owner@academy.vn");
		expect(body.from).toBe(
			'"Academy qua Cô Mỹ Dạy Tiếng Anh" <noreply@teacheros.vn>',
		);
		vi.unstubAllGlobals();
	});

	test("invite-email builders escape HTML, dùng nhãn Mở cổng học viên và chặn scheme lạ (#570)", () => {
		const orgMail = buildOrgInvitationEmail({
			orgName: 'Alpha <script>"Academy"</script>',
			inviterName: "Cô Mỹ",
			studentOrigin: "https://student.staging.teacheros.io.vn/",
		});
		expect(orgMail.subject).toContain("Lời mời tham gia");
		expect(orgMail.html).toContain("Mở cổng học viên");
		expect(orgMail.html).toContain(
			'href="https://student.staging.teacheros.io.vn/login"',
		);
		expect(orgMail.html).not.toContain("<script>");
		expect(orgMail.html).toContain("&lt;script&gt;&quot;Academy&quot;");

		const portalMail = buildStudentPortalInviteEmail({
			orgName: "Alpha Academy",
			studentName: "Minh",
			className: "IELTS 6.5",
			studentOrigin: "javascript:alert(1)",
		});
		expect(portalMail.subject).toBe(
			"Lời mời tham gia lớp IELTS 6.5 tại Alpha Academy",
		);
		expect(portalMail.html).not.toContain("javascript:");
		expect(portalMail.html).not.toContain("<a ");

		const attrEscape = renderHtml(
			"Kiểm tra link",
			'https://student.test/login?next=" onclick="alert(1)',
			"Mở cổng học viên",
		);
		expect(attrEscape).toContain("&quot; onclick=&quot;alert(1)");
	});

	test("invite-email builders route unified /student base to root /login", () => {
		const orgMail = buildOrgInvitationEmail({
			orgName: "Alpha Academy",
			inviterName: "Cô Mỹ",
			studentOrigin: "https://lms.msmy.io.vn/student",
		});
		expect(orgMail.html).toContain('href="https://lms.msmy.io.vn/login"');
		expect(orgMail.text).toContain("https://lms.msmy.io.vn/login");
		expect(orgMail.html).not.toContain("/student/login");

		const portalMail = buildStudentPortalInviteEmail({
			orgName: "Alpha Academy",
			studentName: "Minh",
			studentOrigin: "https://lms.msmy.io.vn/student/",
		});
		expect(portalMail.html).toContain('href="https://lms.msmy.io.vn/login"');
		expect(portalMail.text).toContain("https://lms.msmy.io.vn/login");
		expect(portalMail.html).not.toContain("/student/login");
	});
});
