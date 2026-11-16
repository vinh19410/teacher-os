import {
	normalizePublishedPlacementSnapshot,
	type PlacementSnapshot,
} from "@teacher-os/api/placement-test-contracts";
import { FINANCE_ROLES } from "@teacher-os/auth/role";
import { user } from "@teacher-os/db/schema/auth";
import { membership } from "@teacher-os/db/schema/membership";
import { placementTest } from "@teacher-os/db/schema/placement-test";
import {
	and,
	asc,
	eq,
	inArray,
	isNull,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import type { Db } from "../app";

export interface ResolveLeadOrgDeps {
	leadOrgId?: string;
	teacherEmails?: string[];
}

export interface LoadedPlacementSnapshot {
	snapshot: PlacementSnapshot;
	publishedVersion: number;
	sourceOrgId: string;
}

/**
 * Phân giải org đích cho toàn bộ route lead & kiểm tra đầu vào công khai (#742):
 * - Giữ cầu dao fail-closed: `LEAD_ORG_ID` rỗng → `null` (route trả 503).
 * - Khi `TEACHER_EMAILS` khác rỗng và có thành viên `FINANCE_ROLES`
 *   (`teacher`, `owner`, `admin`, loại trừ `user.role` là `student`/`admin`),
 *   ưu tiên thứ tự `TEACHER_EMAILS`, rồi `membership.createdAt ASC, id ASC`.
 * - Không lọc `user.email_verified = 1` trong SQL để tương thích staging
 *   (`AUTH_ASSUME_EMAIL_VERIFIED="true"`).
 */
export async function resolveLeadTargetOrg(
	db: Db,
	deps: ResolveLeadOrgDeps,
): Promise<string | null> {
	const configuredLeadOrgId = deps.leadOrgId?.trim() ?? "";
	if (!configuredLeadOrgId) {
		return null;
	}

	const normalizedEmails = Array.from(
		new Set(
			(deps.teacherEmails ?? [])
				.map((email) => email.trim().toLowerCase())
				.filter((email) => email.length > 0),
		),
	);
	if (normalizedEmails.length === 0) {
		return configuredLeadOrgId;
	}

	const rows = await db
		.select({
			orgId: membership.orgId,
			email: sql<string>`lower(trim(${user.email}))`,
		})
		.from(membership)
		.innerJoin(user, eq(user.id, membership.userId))
		.where(
			and(
				inArray(membership.role, [...FINANCE_ROLES]),
				or(isNull(user.role), notInArray(user.role, ["student", "admin"])),
				inArray(sql<string>`lower(trim(${user.email}))`, normalizedEmails),
			),
		)
		.orderBy(asc(membership.createdAt), asc(membership.id));

	for (const email of normalizedEmails) {
		const match = rows.find((row) => row.email === email);
		if (match) {
			return match.orgId;
		}
	}

	return configuredLeadOrgId;
}

async function loadSnapshotForOrg(
	db: Db,
	orgId: string,
): Promise<LoadedPlacementSnapshot | null> {
	const [row] = await db
		.select({
			published: placementTest.published,
			publishedVersion: placementTest.publishedVersion,
		})
		.from(placementTest)
		.where(eq(placementTest.orgId, orgId));

	if (!row?.published) {
		return null;
	}

	try {
		const snapshot = normalizePublishedPlacementSnapshot(
			JSON.parse(row.published),
		);
		if (!snapshot) {
			return null;
		}
		return {
			snapshot,
			publishedVersion: row.publishedVersion,
			sourceOrgId: orgId,
		};
	} catch {
		return null;
	}
}

/**
 * Đọc bộ đề kiểm tra đầu vào đã phát hành: ưu tiên org giáo viên đang hoạt
 * động (`targetOrgId`); nếu org giáo viên chưa phát hành bộ đề riêng thì fallback
 * sang `fallbackLeadOrgId` (`LEAD_ORG_ID`).
 */
export async function loadPublishedPlacementSnapshot(
	db: Db,
	targetOrgId: string,
	fallbackLeadOrgId?: string,
): Promise<LoadedPlacementSnapshot | null> {
	const primary = await loadSnapshotForOrg(db, targetOrgId);
	if (primary) {
		return primary;
	}

	const trimmedFallback = fallbackLeadOrgId?.trim() ?? "";
	if (trimmedFallback && trimmedFallback !== targetOrgId) {
		return loadSnapshotForOrg(db, trimmedFallback);
	}

	return null;
}
