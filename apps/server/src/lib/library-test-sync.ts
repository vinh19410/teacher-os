import { ASSIGNMENT_TEST_PRESETS } from "@teacher-os/api/contracts";
import {
	assignmentTest,
	assignmentTestPart,
} from "@teacher-os/db/schema/index";
import {
	libraryTest,
	libraryTestPart,
} from "@teacher-os/db/schema/library-test";
import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "../app";
import {
	D1_IN_ARRAY_CHUNK,
	materializePrompts,
	studyPackSourceKey,
} from "./study-pack-clone";

/** 11 cột assignment_test × 8 dòng = 88 bind <= 100 bind limit của D1. */
const TEST_INSERT_CHUNK = 8;
/** 6 cột assignment_test_part × 16 dòng = 96 bind <= 100 bind limit của D1. */
const PART_INSERT_CHUNK = 16;

type LibrarySkill = keyof typeof ASSIGNMENT_TEST_PRESETS;

function isLibrarySkill(skill: string): skill is LibrarySkill {
	return skill in ASSIGNMENT_TEST_PRESETS;
}

/**
 * Đồng bộ lười đề thư viện toàn hệ thống (`library_test` status ready) thành
 * bản sao `assignment_test` của org để hiện ở catalog practice của học viên.
 * Idempotent, tự chữa khi lần trước ghi dở:
 * - đề ready chưa có bản sao → tạo bản sao (`library_ref = library_test.id`)
 *   cùng prompt/part qua `materializePrompts`;
 * - bản sao thiếu part → bù part còn thiếu;
 * - đề thư viện bị gỡ xuất bản/xoá → bản sao ready thành draft; xuất bản lại
 *   thì ready trở lại.
 * Bản sao là bản chụp độc lập (như giao lớp, INF-03): sửa nội dung đề thư
 * viện sau khi đã sao không ghi đè bản của org.
 */
export async function syncLibraryTestsToOrg(
	db: Db,
	orgId: string,
	skill: string,
): Promise<void> {
	if (!isLibrarySkill(skill)) return;

	const readyTests = await db
		.select()
		.from(libraryTest)
		.where(and(eq(libraryTest.status, "ready"), eq(libraryTest.skill, skill)));
	const readyIds = readyTests.map((row) => row.id);

	const copies = await db
		.select({
			id: assignmentTest.id,
			libraryRef: assignmentTest.libraryRef,
			status: assignmentTest.status,
		})
		.from(assignmentTest)
		.where(
			and(
				eq(assignmentTest.orgId, orgId),
				eq(assignmentTest.skill, skill),
				isNotNull(assignmentTest.libraryRef),
			),
		);
	const copyByRef = new Map(copies.map((row) => [row.libraryRef, row]));

	// Gỡ xuất bản: bản sao ready mà đề thư viện không còn ready.
	const staleCopyIds = copies
		.filter(
			(row) =>
				row.status === "ready" &&
				row.libraryRef !== null &&
				!readyIds.includes(row.libraryRef),
		)
		.map((row) => row.id);
	for (let i = 0; i < staleCopyIds.length; i += D1_IN_ARRAY_CHUNK) {
		await db
			.update(assignmentTest)
			.set({ status: "draft" })
			.where(
				and(
					eq(assignmentTest.orgId, orgId),
					inArray(
						assignmentTest.id,
						staleCopyIds.slice(i, i + D1_IN_ARRAY_CHUNK),
					),
				),
			);
	}

	if (readyTests.length === 0) return;

	// Xuất bản lại: bản sao draft của đề thư viện đang ready.
	const revivedIds = readyTests
		.map((row) => copyByRef.get(row.id))
		.filter((row) => row !== undefined && row.status !== "ready")
		.map((row) => row?.id as string);
	for (let i = 0; i < revivedIds.length; i += D1_IN_ARRAY_CHUNK) {
		await db
			.update(assignmentTest)
			.set({ status: "ready" })
			.where(
				and(
					eq(assignmentTest.orgId, orgId),
					inArray(
						assignmentTest.id,
						revivedIds.slice(i, i + D1_IN_ARRAY_CHUNK),
					),
				),
			);
	}

	// Đề ready chưa có bản sao.
	const missing = readyTests.filter((row) => !copyByRef.has(row.id));
	for (let i = 0; i < missing.length; i += TEST_INSERT_CHUNK) {
		await db
			.insert(assignmentTest)
			.values(
				missing.slice(i, i + TEST_INSERT_CHUNK).map((row) => ({
					id: crypto.randomUUID(),
					orgId,
					title: row.title,
					description: row.description,
					skill: row.skill,
					timeLimitSeconds: row.timeLimitSeconds,
					collection: row.collection,
					testGroup: row.testGroup,
					status: "ready",
					libraryRef: row.id,
				})),
			)
			.onConflictDoNothing();
	}

	// Bản sao (cũ + mới) → part còn thiếu. Đọc lại để lấy id bản sao do
	// request song song có thể đã tạo trước.
	const allCopies = new Map<string, string>();
	for (let i = 0; i < readyIds.length; i += D1_IN_ARRAY_CHUNK) {
		const rows = await db
			.select({ id: assignmentTest.id, libraryRef: assignmentTest.libraryRef })
			.from(assignmentTest)
			.where(
				and(
					eq(assignmentTest.orgId, orgId),
					inArray(
						assignmentTest.libraryRef,
						readyIds.slice(i, i + D1_IN_ARRAY_CHUNK),
					),
				),
			);
		for (const row of rows) {
			if (row.libraryRef) allCopies.set(row.libraryRef, row.id);
		}
	}

	const libraryPartCounts = new Map<string, number>();
	const copyPartCounts = new Map<string, number>();
	for (let i = 0; i < readyIds.length; i += D1_IN_ARRAY_CHUNK) {
		const slice = readyIds.slice(i, i + D1_IN_ARRAY_CHUNK);
		for (const row of await db
			.select({ testId: libraryTestPart.testId, n: count() })
			.from(libraryTestPart)
			.where(inArray(libraryTestPart.testId, slice))
			.groupBy(libraryTestPart.testId)) {
			libraryPartCounts.set(row.testId, Number(row.n));
		}
	}
	const copyIds = [...allCopies.values()];
	for (let i = 0; i < copyIds.length; i += D1_IN_ARRAY_CHUNK) {
		for (const row of await db
			.select({ testId: assignmentTestPart.testId, n: count() })
			.from(assignmentTestPart)
			.where(
				inArray(
					assignmentTestPart.testId,
					copyIds.slice(i, i + D1_IN_ARRAY_CHUNK),
				),
			)
			.groupBy(assignmentTestPart.testId)) {
			copyPartCounts.set(row.testId, Number(row.n));
		}
	}

	const needPartsFor = readyTests.filter((row) => {
		const copyId = allCopies.get(row.id);
		if (!copyId) return false;
		return (
			(copyPartCounts.get(copyId) ?? 0) < (libraryPartCounts.get(row.id) ?? 0)
		);
	});
	if (needPartsFor.length === 0) return;

	const needIds = needPartsFor.map((row) => row.id);
	const libraryParts: Array<typeof libraryTestPart.$inferSelect> = [];
	for (let i = 0; i < needIds.length; i += D1_IN_ARRAY_CHUNK) {
		libraryParts.push(
			...(await db
				.select()
				.from(libraryTestPart)
				.where(
					inArray(
						libraryTestPart.testId,
						needIds.slice(i, i + D1_IN_ARRAY_CHUNK),
					),
				)),
		);
	}
	const materialized = await materializePrompts(
		db,
		orgId,
		libraryParts.map((row) => ({
			sourceKind: "library_test_part",
			sourceId: row.id,
		})),
		{ allowListeningLibraryParts: true },
	);
	if (!materialized.ok) {
		throw new Error(`library test sync failed: ${materialized.error}`);
	}

	const partRows: Array<typeof assignmentTestPart.$inferInsert> = [];
	for (const part of libraryParts) {
		const copyId = allCopies.get(part.testId);
		const promptId = materialized.promptIdBySourceKey.get(
			studyPackSourceKey("library_test_part", part.id),
		);
		const test = needPartsFor.find((row) => row.id === part.testId);
		if (!copyId || !promptId || !test || !isLibrarySkill(test.skill)) continue;
		partRows.push({
			id: crypto.randomUUID(),
			testId: copyId,
			promptId,
			part: part.part,
			position: ASSIGNMENT_TEST_PRESETS[test.skill].slots.findIndex(
				(slot) => slot.part === part.part,
			),
		});
	}
	for (let i = 0; i < partRows.length; i += PART_INSERT_CHUNK) {
		await db
			.insert(assignmentTestPart)
			.values(partRows.slice(i, i + PART_INSERT_CHUNK))
			.onConflictDoNothing();
	}
}
