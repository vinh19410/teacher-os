import { user } from "@teacher-os/db/schema/auth";
import { membership } from "@teacher-os/db/schema/membership";
import { organization } from "@teacher-os/db/schema/organization";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../app";

export interface OrgMailSender {
	senderName: string;
	replyToEmail: string | null;
}

/**
 * Lấy tên tổ chức và địa chỉ email Reply-To của chủ/giáo viên sớm nhất trong tổ chức
 * (nguồn chân lý dùng chung cho hàng đợi thông báo và email lời mời học viên #570).
 */
export async function resolveOrgMailSender(
	db: Db,
	orgId: string,
): Promise<OrgMailSender> {
	const [org] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	const senderName = org?.name ?? "";

	const [owner] = await db
		.select({ email: user.email })
		.from(membership)
		.innerJoin(user, eq(user.id, membership.userId))
		.where(
			and(
				eq(membership.orgId, orgId),
				inArray(membership.role, ["teacher", "owner"]),
			),
		)
		.orderBy(asc(membership.createdAt))
		.limit(1);
	const replyToEmail =
		owner && owner.email.trim().length > 0 ? owner.email.trim() : null;

	return { senderName, replyToEmail };
}
