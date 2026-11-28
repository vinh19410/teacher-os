import { fileURLToPath } from "node:url";
import { createClient, type InArgs, type InStatement } from "@libsql/client";
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
import { deliverNotifications, renderHtml, renderText } from "./deliver";
import { emitNotifications } from "./emit";
import { enqueueNotifications } from "./enqueue";
import {
	buildOrgInvitationEmail,
	buildStudentPortalInviteEmail,
} from "./invite-email";
import { requeueSingleFailedNotification } from "./requeue";
import {
	classOpeningConfirmedEvents,
	dailyDeadlineReminderEvent,
	holidayCreatedEvents,
	invoiceIssuedEvent,
	placementSubmittedEvent,
	renderDailyDeadlineReminderHtml,
	renderDailyDeadlineReminderText,
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

	test("htmlBody và textBody được lưu nguyên vẹn và gửi trực tiếp tới mailer; bản ghi null vẫn dùng renderHtml/renderText", async () => {
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
			students: [
				{ id: "stu-html-1", name: "Student stu-html-1", hasEmail: true },
			],
		});
		const expectedRichHtml = openingEvents[0]?.htmlBody ?? "";
		const expectedRichText = openingEvents[0]?.textBody ?? "";
		expect(expectedRichHtml.length).toBeGreaterThan(100);
		expect(expectedRichText).toContain("Chào Student stu-html-1,");
		expect(expectedRichText).toContain("Chuẩn bị micro rõ tiếng");

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
				studentOrigin: "https://student.teacheros.example///",
			},
			"org-html-1",
			[...openingEvents, plainEvent],
		);

		expect(result.createdIds).toHaveLength(2);
		expect(result.queuedEmailIds).toHaveLength(2);

		const richRow = await rowOf("stu-html-1");
		const plainRow = await rowOf("stu-plain-1");
		expect(richRow.htmlBody).toBe(expectedRichHtml);
		expect(richRow.textBody).toBe(expectedRichText);
		expect(plainRow.htmlBody).toBeNull();
		expect(plainRow.textBody).toBeNull();

		const richSent = sentInputs.find((s) => s.to === "rich@example.com");
		const plainSent = sentInputs.find((s) => s.to === "plain@example.com");
		expect(richSent?.html).toBe(expectedRichHtml);
		expect(richSent?.text).toBe(expectedRichText);
		expect(plainSent?.html).toBe(
			renderHtml(plainEvent.body, "https://student.teacheros.example/classes"),
		);
		expect(plainSent?.text).toBe(
			renderText(plainEvent.body, "https://student.teacheros.example/classes"),
		);
	});

	test("gửi lại bản ghi failed (requeueSingleFailedNotification + deliverNotifications) giữ nguyên htmlBody và textBody đã lưu", async () => {
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
			students: [{ id: "stu-html-resend", name: "Minh Quân", hasEmail: true }],
		});
		const expectedHtml = openingEvents[0]?.htmlBody ?? "";
		const expectedText = openingEvents[0]?.textBody ?? "";

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
		expect(failedRow.textBody).toBe(expectedText);

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
		expect(resentInputs[0]?.text).toBe(expectedText);
		const finalRow = await rowOf("stu-html-resend");
		expect(finalRow.status).toBe("sent");
	});

	test("enqueueNotifications chia nhỏ batch insert với 12 học viên để mọi câu SQL đều ≤ 100 tham số bind (giới hạn D1)", async () => {
		const trackedClient = createClient({ url: "file::memory:" });
		const executed: Array<{ sql: string; paramCount: number }> = [];
		let recording = false;
		const rawExecute = trackedClient.execute.bind(trackedClient);
		const wrappedClient = new Proxy(trackedClient, {
			get(target, prop) {
				if (prop === "execute") {
					return (stmt: InStatement, extraArgs?: InArgs) => {
						if (recording) {
							const sqlText = typeof stmt === "string" ? stmt : stmt.sql;
							const bound = typeof stmt === "string" ? extraArgs : stmt.args;
							const paramCount = Array.isArray(bound)
								? bound.length
								: bound
									? Object.keys(bound).length
									: 0;
							executed.push({ sql: sqlText, paramCount });
						}
						return typeof stmt === "string"
							? rawExecute(stmt, extraArgs)
							: rawExecute(stmt);
					};
				}
				const value: unknown = Reflect.get(target, prop, target);
				return typeof value === "function"
					? (value as (...args: unknown[]) => unknown).bind(target)
					: value;
			},
		});
		const trackedLibsql = drizzle(wrappedClient, { schema });
		await migrate(trackedLibsql, { migrationsFolder: MIGRATIONS_DIR });
		const trackedDb = trackedLibsql as unknown as Db;

		await trackedLibsql
			.insert(organization)
			.values({ id: "org-d1-chunk", name: "D1 Chunk Academy" });
		const studentList = Array.from({ length: 12 }, (_, idx) => ({
			id: `stu-d1-${idx + 1}`,
			name: `Học viên ${idx + 1}`,
			email: `stu-d1-${idx + 1}@example.com`,
		}));
		for (const s of studentList) {
			await trackedLibsql.insert(student).values({
				id: s.id,
				orgId: "org-d1-chunk",
				name: s.name,
				email: s.email,
			});
		}

		const openingEvents = classOpeningConfirmedEvents({
			classId: "cls-d1-12",
			className: "IELTS Batch 12",
			startDate: "2026-10-05",
			scheduleRaw: JSON.stringify({
				days: [0, 2, 4],
				start: "19:00",
				end: "20:30",
			}),
			mode: "Online",
			sessionsTotal: 24,
			version: 1,
			isUpdate: false,
			teacherNote: "Kiểm tra chia batch 4 dòng mỗi lần INSERT",
			orgName: "D1 Chunk Academy",
			studentOrigin: "https://student.teacheros.example",
			students: studentList.map((s) => ({
				id: s.id,
				name: s.name,
				hasEmail: true,
			})),
		});

		recording = true;
		try {
			const res = await enqueueNotifications(
				trackedDb,
				"org-d1-chunk",
				openingEvents,
			);
			expect(res.createdIds).toHaveLength(12);
			expect(res.queuedEmailIds).toHaveLength(12);
		} finally {
			recording = false;
		}

		const insertStatements = executed.filter((q) =>
			q.sql.toLowerCase().includes('insert into "notification_record"'),
		);
		expect(insertStatements).toHaveLength(3);
		for (const stmt of executed) {
			expect(stmt.paramCount).toBeLessThanOrEqual(100);
		}
		for (const stmt of insertStatements) {
			expect(stmt.paramCount).toBeGreaterThan(0);
			expect(stmt.paramCount).toBeLessThanOrEqual(100);
		}

		const persisted = await trackedLibsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.orgId, "org-d1-chunk"));
		expect(persisted).toHaveLength(12);
		for (const row of persisted) {
			expect(row.htmlBody).toContain("<!DOCTYPE html>");
			expect(row.textBody).toContain(
				"Kiểm tra chia batch 4 dòng mỗi lần INSERT",
			);
		}
	});

	test("emitNotifications ẩn bí mật/raw error khi log lỗi ở cả nhánh sync và runInBackground", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const brokenDb = {
				select: () => {
					throw new Error(
						"query failed Authorization: Bearer re_live_secret_token_999",
					);
				},
			} as unknown as Db;

			await emitNotifications(
				{ db: brokenDb, mailer: fakeMailer() },
				"org-redact",
				[
					{
						studentId: "stu-redact",
						eventType: "class_enrolled",
						idempotencyKey: "class_enrolled:enr-redact",
						title: "T",
						body: "B",
						linkPath: "/classes",
						refType: "enrollment",
						refId: "enr-redact",
					},
				],
			);

			expect(errorSpy).toHaveBeenCalledTimes(1);
			const loggedArgs = errorSpy.mock.calls[0] ?? [];
			expect(typeof loggedArgs[1]).toBe("string");
			expect(String(loggedArgs[1])).toContain("Bearer [REDACTED]");
			expect(String(loggedArgs[1])).not.toContain("re_live_secret_token_999");

			errorSpy.mockClear();
			await seedOrg("org-redact-bg", "Redact BG");
			await seedStudent("org-redact-bg", "stu-redact-bg", "bg@example.com");

			let bgPromise: Promise<unknown> | undefined;
			let selectCount = 0;
			const failingSelectDb = new Proxy(db, {
				get(target, prop, receiver) {
					if (prop === "select") {
						return (...args: unknown[]) => {
							selectCount += 1;
							if (selectCount > 3) {
								throw new Error(
									"bg db failed re_live_bg_secret_456 Authorization: Bearer topsecret",
								);
							}
							return (target.select as (...a: unknown[]) => unknown)(...args);
						};
					}
					return Reflect.get(target, prop, receiver);
				},
			}) as Db;

			await emitNotifications(
				{
					db: failingSelectDb,
					mailer: fakeMailer(),
					runInBackground: (promise) => {
						bgPromise = promise;
					},
				},
				"org-redact-bg",
				[
					{
						studentId: "stu-redact-bg",
						eventType: "class_enrolled",
						idempotencyKey: "class_enrolled:enr-redact-bg",
						title: "T",
						body: "B",
						linkPath: "/classes",
						refType: "enrollment",
						refId: "enr-redact-bg",
					},
				],
			);
			await bgPromise;
			expect(errorSpy).toHaveBeenCalledTimes(1);
			const bgLoggedArgs = errorSpy.mock.calls[0] ?? [];
			expect(typeof bgLoggedArgs[1]).toBe("string");
			expect(String(bgLoggedArgs[1])).not.toContain("re_live_bg_secret_456");
			expect(String(bgLoggedArgs[1])).not.toContain("topsecret");
		} finally {
			errorSpy.mockRestore();
		}
	});

	test("channels = email: queues with htmlBody/textBody when student has email and skips when email is empty", async () => {
		await seedOrg("org-email-only", "Email Only Academy");
		await seedOwner("org-email-only", "owner-email-only", "teacher@academy.vn");
		await seedStudent("org-email-only", "stu-eo-1", "  minh@example.com  ");
		await seedStudent("org-email-only", "stu-eo-2", "   ");

		const eventWithEmail = dailyDeadlineReminderEvent({
			studentId: "stu-eo-1",
			studentName: "Minh",
			dateISO: "2026-05-15",
			studentOrigin: "https://lms.msmy.io.vn/student",
			homework: [
				{
					assignmentId: "hw-eo-1",
					title: "Writing Task 1",
					className: "IELTS 6.5",
					dueTimeLabel: "21:00",
				},
			],
			selfStudy: [],
		});
		const eventNoEmail = dailyDeadlineReminderEvent({
			studentId: "stu-eo-2",
			studentName: "Nam",
			dateISO: "2026-05-15",
			studentOrigin: "https://lms.msmy.io.vn/student",
			homework: [
				{
					assignmentId: "hw-eo-1",
					title: "Writing Task 1",
					className: "IELTS 6.5",
					dueTimeLabel: "21:00",
				},
			],
			selfStudy: [],
		});

		const result = await enqueueNotifications(db, "org-email-only", [
			eventWithEmail,
			eventNoEmail,
		]);
		expect(result.createdIds).toHaveLength(1);
		expect(result.queuedEmailIds).toHaveLength(1);

		const saved = await rowOf("stu-eo-1");
		expect(saved.channels).toBe("email");
		expect(saved.status).toBe("queued");
		expect(saved.sentAt).toBeNull();
		expect(saved.recipientEmail).toBe("minh@example.com");
		expect(saved.htmlBody).toBe(eventWithEmail.htmlBody);
		expect(saved.textBody).toBe(eventWithEmail.textBody);

		const skippedRows = await rowsOf("stu-eo-2");
		expect(skippedRows).toHaveLength(0);
	});

	test("deliverNotifications paces consecutive email sends using sendIntervalMs", async () => {
		await seedOrg("org-pace", "Paced Academy");
		const events = [];
		for (let i = 1; i <= 3; i += 1) {
			const studentId = `stu-pace-${i}`;
			await seedStudent("org-pace", studentId, `pace${i}@example.com`);
			events.push(
				dailyDeadlineReminderEvent({
					studentId,
					studentName: `Hoc Vien ${i}`,
					dateISO: "2026-05-15",
					studentOrigin: "https://lms.msmy.io.vn/student",
					homework: [
						{
							assignmentId: `hw-pace-${i}`,
							title: `Task ${i}`,
							className: "IELTS",
							dueTimeLabel: "20:00",
						},
					],
					selfStudy: [],
				}),
			);
		}

		const { queuedEmailIds } = await enqueueNotifications(
			db,
			"org-pace",
			events,
		);
		const sleepDelays: number[] = [];
		const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			fn: unknown,
			ms?: number,
		) => {
			sleepDelays.push(ms ?? 0);
			if (typeof fn === "function") (fn as () => void)();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout);

		try {
			await deliverNotifications(
				db,
				fakeMailer(),
				queuedEmailIds,
				"https://lms.msmy.io.vn/student",
				{ sendIntervalMs: 550 },
			);
		} finally {
			timeoutSpy.mockRestore();
		}

		expect(sleepDelays).toEqual([550, 550]);
	});

	test("emitNotifications spaces consecutive background emails by 550ms and honors explicit sendIntervalMs override", async () => {
		await seedOrg("org-emit-pace", "Emit Pace Academy");
		const makeEvents = async (prefix: string) => {
			const events = [];
			for (let i = 1; i <= 3; i += 1) {
				const studentId = `${prefix}-stu-${i}`;
				await seedStudent(
					"org-emit-pace",
					studentId,
					`${prefix}${i}@example.com`,
				);
				events.push({
					studentId,
					eventType: "class_enrolled" as const,
					idempotencyKey: `class_enrolled:${prefix}:${i}`,
					title: `Notice ${i}`,
					body: `Body ${i}`,
					linkPath: "/classes",
					refType: "enrollment",
					refId: `${prefix}-${i}`,
				});
			}
			return events;
		};

		const sleepDelays: number[] = [];
		const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			fn: unknown,
			ms?: number,
		) => {
			sleepDelays.push(ms ?? 0);
			if (typeof fn === "function") (fn as () => void)();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout);

		try {
			let bgPromise: Promise<unknown> | undefined;
			await emitNotifications(
				{
					db,
					mailer: fakeMailer(),
					runInBackground: (promise) => {
						bgPromise = promise;
					},
				},
				"org-emit-pace",
				await makeEvents("bg-default"),
			);
			await bgPromise;
			expect(sleepDelays).toEqual([550, 550]);

			sleepDelays.length = 0;
			let bgOverridePromise: Promise<unknown> | undefined;
			await emitNotifications(
				{
					db,
					mailer: fakeMailer(),
					sendIntervalMs: 0,
					runInBackground: (promise) => {
						bgOverridePromise = promise;
					},
				},
				"org-emit-pace",
				await makeEvents("bg-zero"),
			);
			await bgOverridePromise;
			expect(sleepDelays).toEqual([]);
		} finally {
			timeoutSpy.mockRestore();
		}
	});

	test("daily_deadline_reminder requeue resend preserves channels=email and digest HTML/text", async () => {
		await seedOrg("org-digest", "Digest Academy");
		await seedOwner("org-digest", "owner-digest", "owner@digest.vn");
		await seedStudent("org-digest", "stu-digest", "digest@example.com");

		const event = dailyDeadlineReminderEvent({
			studentId: "stu-digest",
			studentName: "Quỳnh",
			dateISO: "2026-05-15",
			studentOrigin: "https://lms.msmy.io.vn/student/",
			homework: [
				{
					assignmentId: "hw-d1",
					title: "Writing Task 2",
					className: "IELTS 7.0",
					dueTimeLabel: "23:59",
				},
			],
			selfStudy: [
				{
					assignmentId: "ss-d1",
					title: "Reading Day 4",
					className: "IELTS 7.0",
					dueTimeLabel: "17:00",
					opensAtLabel: "08:00",
				},
			],
		});

		const { queuedEmailIds } = await enqueueNotifications(db, "org-digest", [
			event,
		]);
		const recordId = queuedEmailIds[0];
		if (!recordId) throw new Error("expected queued record");

		await deliverNotifications(
			db,
			fakeMailer(async () => {
				throw new Error("temporary provider outage");
			}),
			queuedEmailIds,
			"https://lms.msmy.io.vn/student/",
			{ retryDelaysMs: [0, 0] },
		);

		const failedRow = await rowOf("stu-digest");
		expect(failedRow.status).toBe("failed");
		expect(failedRow.channels).toBe("email");
		expect(failedRow.htmlBody).toBe(event.htmlBody);
		expect(failedRow.textBody).toBe(event.textBody);

		const requeued = await requeueSingleFailedNotification(
			db,
			"org-digest",
			recordId,
		);
		expect(requeued.kind).toBe("ok");
		if (requeued.kind !== "ok") throw new Error("expected ok requeue");

		const afterRequeue = await rowOf("stu-digest");
		expect(afterRequeue.channels).toBe("email");
		expect(afterRequeue.status).toBe("queued");

		const sent: Parameters<Mailer["send"]>[0][] = [];
		await deliverNotifications(
			db,
			fakeMailer(async (input) => {
				sent.push(input);
			}),
			requeued.requeuedIds,
			"https://lms.msmy.io.vn/student/",
			{ retryDelaysMs: [0, 0] },
		);

		expect(sent).toHaveLength(1);
		const email = sent[0];
		if (!email) throw new Error("expected email");
		expect(email.to).toBe("digest@example.com");
		expect(email.subject).toBe("Nhắc bài tập đến hạn hôm nay (15/05/2026)");
		expect(email.html).toContain("Bài tập về nhà (1)");
		expect(email.html).toContain("Bộ đề tự học (1)");
		expect(email.html).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/hw-d1"',
		);
		expect(email.html).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/ss-d1"',
		);
		expect(email.html).toContain(
			'href="https://lms.msmy.io.vn/student/assignments"',
		);
		expect(email.html).toContain("Làm bài →");
		expect(email.html).toContain("Xem tất cả bài tập");
		expect(email.html).toContain("(mở lúc 08:00)");
		expect(email.text).toContain(
			"https://lms.msmy.io.vn/student/learn/quizzes/hw-d1",
		);
		expect(email.text).toContain(
			"https://lms.msmy.io.vn/student/learn/quizzes/ss-d1",
		);
		expect(email.text).toContain("https://lms.msmy.io.vn/student/assignments");

		const finalRow = await rowOf("stu-digest");
		expect(finalRow.status).toBe("sent");
		expect(finalRow.channels).toBe("email");
	});

	test("deliverNotifications gửi htmlBody và textBody đầy đủ cho invoiceIssuedEvent", async () => {
		await seedOrg("org-inv-html", "Minh Anh Academy");
		await seedStudent("org-inv-html", "stu-inv-html", "inv@example.com");

		const event = invoiceIssuedEvent({
			id: "inv-html-11223344",
			studentId: "stu-inv-html",
			amount: 1_800_000,
			due: "2026-12-12",
			studentName: "Nguyễn An",
			className: "IELTS 6.0",
			orgName: "Minh Anh Academy",
			payToken: "tok_deliver_1234567890",
			studentOrigin: "https://lms.msmy.io.vn/student",
			payment: {
				bankBrandName: "Vietcombank",
				accountNumber: "9988776655",
				holderName: "CO MY",
				memo: "MSMY11223344",
				qrUrl:
					"https://vietqr.app/img?acc=9988776655&bank=970436&amount=1800000&des=MSMY11223344&template=compact",
			},
		});

		const { queuedEmailIds } = await enqueueNotifications(db, "org-inv-html", [
			event,
		]);
		const sentInputs: Parameters<Mailer["send"]>[0][] = [];
		await deliverNotifications(
			db,
			fakeMailer(async (input) => {
				sentInputs.push(input);
			}),
			queuedEmailIds,
			"https://lms.msmy.io.vn/student",
		);

		expect(sentInputs).toHaveLength(1);
		const sent = sentInputs.at(0);
		if (!sent) throw new Error("mailer was not called");
		expect(sent.subject).toBe("Hóa đơn học phí INV-11223344 — 1.800.000đ");
		expect(sent.html).toContain("Thông tin chuyển khoản");
		expect(sent.html).toContain("https://vietqr.app/img?");
		expect(sent.html).toContain(
			"https://lms.msmy.io.vn/pay/tok_deliver_1234567890",
		);
		expect(sent.text).toContain("MSMY11223344");
		expect(sent.text).toContain(
			"https://lms.msmy.io.vn/pay/tok_deliver_1234567890",
		);
		const finalRow = await rowOf("stu-inv-html");
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
		expect(event.body).toContain("01/11/2026");
		expect(event.body).not.toContain("2026-11-01");
		expect(event.title.startsWith("Nhắc học phí")).toBe(true);
		expect(event.htmlBody).toContain("<!DOCTYPE html>");
		expect(event.textBody).toContain("01/11/2026");
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

	test("renderDailyDeadlineReminderHtml escapes XSS, encodes IDs, omits empty sections, and blocks unsafe origins", () => {
		const xssDigest = {
			dateISO: "2026-05-15",
			studentName: '<img src=x onerror="alert(1)">',
			homework: [
				{
					assignmentId: "a/b?c=1",
					title: '<script>alert("hw")</script>',
					className: 'IELTS "Pro" & <A>',
					dueTimeLabel: "23:59",
				},
			],
			selfStudy: [],
		};

		const html = renderDailyDeadlineReminderHtml(
			xssDigest,
			"https://lms.msmy.io.vn/student/",
		);
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<img ");
		expect(html).toContain(
			"&lt;script&gt;alert(&quot;hw&quot;)&lt;/script&gt;",
		);
		expect(html).toContain("IELTS &quot;Pro&quot; &amp; &lt;A&gt;");
		expect(html).toContain("Bài tập về nhà (1)");
		expect(html).not.toContain("Bộ đề tự học");
		expect(html).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/a%2Fb%3Fc%3D1"',
		);
		expect(html).toContain('href="https://lms.msmy.io.vn/student/assignments"');
		expect(html).toContain("Email tự động từ Cô Mỹ Dạy Tiếng Anh.");

		const unsafeHtml = renderDailyDeadlineReminderHtml(
			xssDigest,
			"javascript:alert(1)",
		);
		expect(unsafeHtml).not.toContain("javascript:");
		expect(unsafeHtml).not.toContain("<a ");

		const relativeText = renderDailyDeadlineReminderText(
			{
				dateISO: "2026-05-15",
				studentName: "",
				homework: [],
				selfStudy: [
					{
						assignmentId: "ss-9",
						title: "Reading Day 9",
						className: "IELTS 6.0",
						dueTimeLabel: "17:00",
						opensAtLabel: "08:00",
					},
				],
			},
			"",
		);
		expect(relativeText).toContain("Chào bạn,");
		expect(relativeText).not.toContain("Bài tập về nhà");
		expect(relativeText).toContain("Bộ đề tự học (1):");
		expect(relativeText).toContain(
			"- Reading Day 9 (IELTS 6.0) — Hạn 17:00 (mở lúc 08:00)",
		);
		expect(relativeText).toContain("Làm bài: /learn/quizzes/ss-9");
		expect(relativeText).toContain("Xem tất cả bài tập: /assignments");
	});
});
