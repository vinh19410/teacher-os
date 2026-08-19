import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { commentBank } from "@teacher-os/db/schema/comment-bank";
import { notif } from "@teacher-os/db/schema/notif";
import { report } from "@teacher-os/db/schema/report";
import { student } from "@teacher-os/db/schema/student";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../../app";

export function loadReports(
	db: Db,
	orgId: string,
): Promise<KernelSnapshot["reports"]> {
	return db
		.select({
			id: report.id,
			studentId: report.studentId,
			period: report.period,
			sessions: report.sessions,
			status: report.status,
			sent: report.sent,
			read: report.read,
		})
		.from(report)
		.innerJoin(
			student,
			and(eq(report.studentId, student.id), eq(report.orgId, student.orgId)),
		)
		.where(eq(report.orgId, orgId))
		.orderBy(asc(report.createdAt), asc(report.id));
}

export function loadNotifs(
	db: Db,
	orgId: string,
): Promise<KernelSnapshot["notifs"]> {
	return db
		.select({
			id: notif.id,
			text: notif.text,
			time: notif.time,
			channel: notif.channel,
			dot: notif.dot,
		})
		.from(notif)
		.where(eq(notif.orgId, orgId))
		.orderBy(asc(notif.createdAt), asc(notif.id));
}

export function loadCommentBank(
	db: Db,
	orgId: string,
): Promise<KernelSnapshot["commentBank"]> {
	return db
		.select({
			id: commentBank.id,
			tag: commentBank.tag,
			text: commentBank.text,
		})
		.from(commentBank)
		.where(eq(commentBank.orgId, orgId))
		.orderBy(asc(commentBank.createdAt), asc(commentBank.id));
}
