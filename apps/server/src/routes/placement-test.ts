import {
	libraryAudioExtensionMatches,
	matchesLibraryAudioMagic,
	normalizeMediaType,
	QUIZ_MEDIA_MAGIC_PEEK_BYTES,
	sanitizeMediaFileName,
} from "@teacher-os/api/lib/quiz-media";
import { LIBRARY_AUDIO_MIME } from "@teacher-os/api/library-contracts";
import {
	buildPlacementSnapshot,
	extractReferencedAudioIds,
	PLACEMENT_AUDIO_MAX_BYTES,
	PLACEMENT_DRAFT_BODY_MAX_BYTES,
	type PlacementAudioMeta,
	type PlacementContent,
	type PlacementTeacherStateResponse,
	placementContentSchema,
	placementDraftSaveSchema,
	placementPublishRequestSchema,
	validatePlacementForPublish,
} from "@teacher-os/api/placement-test-contracts";
import { canAccessFinance } from "@teacher-os/auth/role";
import {
	placementTest,
	placementTestAudio,
} from "@teacher-os/db/schema/placement-test";
import { and, eq, lt } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import { mediaObjectResponse } from "../lib/media-response";
import { MediaSizeMismatchError, type MediaStore } from "../lib/media-store";
import { type PeekedStream, peekStream } from "../lib/peek-stream";

type Env = { Variables: { kernelCtx: KernelCtx } };
type PlacementContext = Context<Env>;

/** Ngưỡng 24 giờ cho dọn rác audio không được nháp hay bản phát hành tham chiếu (D11). */
export const PLACEMENT_AUDIO_ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

export interface PlacementTestRouteDeps {
	getDb(): Db;
	leadOrgId?: string;
	getLibraryAudioStore?(): MediaStore | undefined;
	runInBackground?(promise: Promise<unknown>): void;
}

function parseSavedDraft(raw: string | null): PlacementContent | null {
	if (!raw) return null;
	try {
		const parsed = placementContentSchema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

async function cleanupOrphanPlacementAudio(
	db: Db,
	store: MediaStore | undefined,
	orgId: string,
	now: Date = new Date(),
) {
	if (!store) return;
	const [testRow] = await db
		.select({
			draft: placementTest.draft,
			published: placementTest.published,
		})
		.from(placementTest)
		.where(eq(placementTest.orgId, orgId));

	const referencedIds = extractReferencedAudioIds(
		testRow?.draft ?? null,
		testRow?.published ?? null,
	);
	const cutoff = new Date(now.getTime() - PLACEMENT_AUDIO_ORPHAN_TTL_MS);

	const candidates = await db
		.select({
			id: placementTestAudio.id,
			objectKey: placementTestAudio.objectKey,
		})
		.from(placementTestAudio)
		.where(
			and(
				eq(placementTestAudio.orgId, orgId),
				lt(placementTestAudio.createdAt, cutoff),
			),
		);

	for (const row of candidates) {
		if (referencedIds.has(row.id)) continue;
		// D11: xóa row trước, object sau.
		await db
			.delete(placementTestAudio)
			.where(
				and(
					eq(placementTestAudio.id, row.id),
					eq(placementTestAudio.orgId, orgId),
				),
			);
		try {
			await store.delete(row.objectKey);
		} catch (error) {
			console.error("[placement-test] failed to delete orphan audio object", {
				audioId: row.id,
				error,
			});
		}
	}
}

export function placementTestRoutes(deps: PlacementTestRouteDeps) {
	const routes = new Hono<Env>();

	const inBackground = (label: string, fn: () => Promise<unknown>) => {
		const task = fn().catch((error) => {
			console.error(`[placement-test] ${label} failed`, { error });
		});
		if (deps.runInBackground) {
			deps.runInBackground(task);
		}
	};

	// D13: chỉ vai trò có canAccessFinance được đọc/ghi màn sửa đề.
	routes.use("*", async (c, next) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		if (!canAccessFinance(ctx.role)) {
			return c.json(
				{ error: "placement-forbidden", code: "placement-forbidden" },
				403,
			);
		}
		return next();
	});

	routes.get("/", async (c: PlacementContext) => {
		const ctx = c.get("kernelCtx");
		const db = deps.getDb();

		const [[row], audioRows] = await Promise.all([
			db.select().from(placementTest).where(eq(placementTest.orgId, ctx.orgId)),
			db
				.select()
				.from(placementTestAudio)
				.where(eq(placementTestAudio.orgId, ctx.orgId)),
		]);

		const audio: Record<string, PlacementAudioMeta> = {};
		for (const item of audioRows) {
			audio[item.id] = {
				name: item.name,
				size: item.size,
				type: item.contentType,
			};
		}

		const draft = parseSavedDraft(row?.draft ?? null);
		const revision = row?.revision ?? 0;
		const publishedVersion = row?.publishedVersion ?? 0;
		const publishedAt = row?.publishedAt ? row.publishedAt.toISOString() : null;
		const dirty = Boolean(
			row &&
				row.draft !== null &&
				(row.published === null || row.revision !== row.publishedRevision),
		);
		const trimmedLeadOrgId = deps.leadOrgId?.trim() ?? "";
		const isLeadOrg = Boolean(
			trimmedLeadOrgId && trimmedLeadOrgId === ctx.orgId,
		);

		const response: PlacementTeacherStateResponse = {
			draft,
			revision,
			publishedVersion,
			publishedAt,
			dirty,
			isLeadOrg,
			audio,
		};

		c.header("Cache-Control", "no-store");
		return c.json(response);
	});

	routes.put("/draft", async (c: PlacementContext) => {
		const ctx = c.get("kernelCtx");
		const contentType = c.req.header("Content-Type") ?? "";
		if (!contentType.toLowerCase().startsWith("application/json")) {
			return c.json({ error: "content-type must be application/json" }, 415);
		}

		const rawText = await c.req.raw.text();
		if (
			new TextEncoder().encode(rawText).byteLength >
			PLACEMENT_DRAFT_BODY_MAX_BYTES
		) {
			return c.json(
				{ error: "payload too large", code: "PAYLOAD_TOO_LARGE" },
				413,
			);
		}

		let rawJson: unknown;
		try {
			rawJson = JSON.parse(rawText);
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}

		const parsed = placementDraftSaveSchema.safeParse(rawJson);
		if (!parsed.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const { revision, content } = parsed.data;
		const db = deps.getDb();
		const now = new Date();
		const draftJson = JSON.stringify(content);

		if (revision === 0) {
			const inserted = await db
				.insert(placementTest)
				.values({
					orgId: ctx.orgId,
					draft: draftJson,
					revision: 1,
					publishedVersion: 0,
					updatedAt: now,
				})
				.onConflictDoNothing()
				.returning({ revision: placementTest.revision });

			if (inserted.length === 0) {
				return c.json(
					{
						error: "PLACEMENT_REVISION_CONFLICT",
						code: "PLACEMENT_REVISION_CONFLICT",
					},
					409,
				);
			}

			return c.json({ revision: inserted[0]!.revision, dirty: true });
		}

		const updated = await db
			.update(placementTest)
			.set({
				draft: draftJson,
				revision: revision + 1,
				updatedAt: now,
			})
			.where(
				and(
					eq(placementTest.orgId, ctx.orgId),
					eq(placementTest.revision, revision),
				),
			)
			.returning({ revision: placementTest.revision });

		if (updated.length === 0) {
			return c.json(
				{
					error: "PLACEMENT_REVISION_CONFLICT",
					code: "PLACEMENT_REVISION_CONFLICT",
				},
				409,
			);
		}

		return c.json({ revision: updated[0]!.revision, dirty: true });
	});

	routes.put("/audio", async (c: PlacementContext) => {
		const ctx = c.get("kernelCtx");
		const store = deps.getLibraryAudioStore?.();
		if (!store) {
			return c.json(
				{
					error: "PLACEMENT_AUDIO_DISABLED",
					code: "PLACEMENT_AUDIO_DISABLED",
				},
				503,
			);
		}

		const lengthHeader = c.req.header("Content-Length");
		const size =
			lengthHeader !== undefined && /^\d+$/.test(lengthHeader)
				? Number(lengthHeader)
				: Number.NaN;
		if (!(size > 0)) {
			return c.json({ error: "INVALID_AUDIO", code: "INVALID_AUDIO" }, 400);
		}
		if (size > PLACEMENT_AUDIO_MAX_BYTES) {
			return c.json({ error: "AUDIO_TOO_LARGE", code: "AUDIO_TOO_LARGE" }, 413);
		}

		const contentType = normalizeMediaType(c.req.header("Content-Type") ?? "");
		if (!Object.hasOwn(LIBRARY_AUDIO_MIME, contentType)) {
			return c.json(
				{ error: "UNSUPPORTED_AUDIO_TYPE", code: "UNSUPPORTED_AUDIO_TYPE" },
				415,
			);
		}

		let name: string | null = null;
		try {
			name = sanitizeMediaFileName(
				decodeURIComponent(c.req.header("X-File-Name") ?? ""),
			);
		} catch {
			name = null;
		}
		if (!name) {
			return c.json({ error: "INVALID_AUDIO", code: "INVALID_AUDIO" }, 400);
		}
		// #681: đối chiếu đuôi file với Content-Type trước khi đụng kho.
		if (!libraryAudioExtensionMatches(name, contentType)) {
			await c.req.raw.body?.cancel().catch(() => undefined);
			return c.json(
				{ error: "UNSUPPORTED_AUDIO_TYPE", code: "UNSUPPORTED_AUDIO_TYPE" },
				415,
			);
		}

		const requestBody = c.req.raw.body;
		if (requestBody === null) {
			return c.json({ error: "INVALID_AUDIO", code: "INVALID_AUDIO" }, 400);
		}

		const audioId = crypto.randomUUID();
		const objectKey = `placement/${ctx.orgId}/${audioId}`;
		const discardObject = () =>
			inBackground("discard placement audio object", () =>
				store.delete(objectKey),
			);

		// #681: đọc sớm tối đa 64 byte đầu (không đệm RAM) kiểm chữ ký nhị
		// phân chống polyglot trước khi ghi kho.
		let peeked: PeekedStream;
		try {
			peeked = await peekStream(
				requestBody,
				Math.min(QUIZ_MEDIA_MAGIC_PEEK_BYTES, size + 1),
			);
		} catch (error) {
			console.error("[placement-test] audio upload stream failed", { error });
			return c.json({ error: "audio upload failed" }, 500);
		}
		if (
			(peeked.ended && peeked.readBytes !== size) ||
			peeked.readBytes > size
		) {
			await peeked.abort("size mismatch");
			return c.json({ error: "INVALID_AUDIO", code: "INVALID_AUDIO" }, 400);
		}
		if (!matchesLibraryAudioMagic(contentType, peeked.head, size)) {
			await peeked.abort("unsupported audio type");
			return c.json(
				{ error: "UNSUPPORTED_AUDIO_TYPE", code: "UNSUPPORTED_AUDIO_TYPE" },
				415,
			);
		}

		try {
			await store.put(objectKey, peeked.stream, { contentType, size });
		} catch (error) {
			await peeked.abort("store error");
			discardObject();
			if (error instanceof MediaSizeMismatchError) {
				return c.json({ error: "INVALID_AUDIO", code: "INVALID_AUDIO" }, 400);
			}
			console.error("[placement-test] audio upload failed", { error });
			return c.json({ error: "audio upload failed" }, 500);
		}

		try {
			await deps.getDb().insert(placementTestAudio).values({
				id: audioId,
				orgId: ctx.orgId,
				objectKey,
				name,
				contentType,
				size,
				createdAt: new Date(),
			});
		} catch (error) {
			discardObject();
			console.error("[placement-test] audio row insert failed", { error });
			return c.json({ error: "audio upload failed" }, 500);
		}

		return c.json({
			audioId,
			name,
			size,
			type: contentType,
		});
	});

	routes.get("/audio/:id", async (c: PlacementContext) => {
		const ctx = c.get("kernelCtx");
		const store = deps.getLibraryAudioStore?.();
		if (!store) {
			return c.json(
				{
					error: "PLACEMENT_AUDIO_DISABLED",
					code: "PLACEMENT_AUDIO_DISABLED",
				},
				503,
			);
		}

		const audioId = c.req.param("id") ?? "";
		if (!audioId) {
			return c.json({ error: "not found" }, 404);
		}

		const [row] = await deps
			.getDb()
			.select()
			.from(placementTestAudio)
			.where(
				and(
					eq(placementTestAudio.id, audioId),
					eq(placementTestAudio.orgId, ctx.orgId),
				),
			);
		if (!row) {
			return c.json({ error: "not found" }, 404);
		}

		const object = await store.get(row.objectKey);
		if (!object) {
			return c.json({ error: "not found" }, 404);
		}

		return mediaObjectResponse(object, {
			mediaType: row.contentType,
			mediaName: row.name,
		});
	});

	routes.post("/publish", async (c: PlacementContext) => {
		const ctx = c.get("kernelCtx");
		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const parsedBody = placementPublishRequestSchema.safeParse(rawBody);
		if (!parsedBody.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const { revision } = parsedBody.data;
		const db = deps.getDb();

		const [row] = await db
			.select()
			.from(placementTest)
			.where(eq(placementTest.orgId, ctx.orgId));

		if (!row || row.draft === null || row.revision !== revision) {
			return c.json(
				{
					error: "PLACEMENT_REVISION_CONFLICT",
					code: "PLACEMENT_REVISION_CONFLICT",
				},
				409,
			);
		}

		const draft = parseSavedDraft(row.draft);
		if (!draft) {
			return c.json(
				{
					error: "PLACEMENT_INVALID",
					code: "PLACEMENT_INVALID",
					issues: [
						{ path: "parts", message: "Bản nháp không đúng định dạng." },
					],
				},
				422,
			);
		}

		const issues = validatePlacementForPublish(draft);

		// Kiểm mọi audioId trong nháp đều thuộc org hiện tại.
		const orgAudioRows = await db
			.select({ id: placementTestAudio.id })
			.from(placementTestAudio)
			.where(eq(placementTestAudio.orgId, ctx.orgId));
		const orgAudioIds = new Set(orgAudioRows.map((r) => r.id));

		draft.parts[1].clips.forEach((clip, cIdx) => {
			if (clip.audioId && !orgAudioIds.has(clip.audioId)) {
				issues.push({
					path: `parts.1.clips.${cIdx}.audioId`,
					message: "File âm thanh không tồn tại hoặc không thuộc tổ chức này.",
				});
			}
		});

		if (issues.length > 0) {
			return c.json(
				{
					error: "PLACEMENT_INVALID",
					code: "PLACEMENT_INVALID",
					issues,
				},
				422,
			);
		}

		const nextVersion = row.publishedVersion + 1;
		const snapshot = buildPlacementSnapshot(draft, nextVersion);
		const now = new Date();

		const updated = await db
			.update(placementTest)
			.set({
				published: JSON.stringify(snapshot),
				publishedVersion: nextVersion,
				publishedRevision: revision,
				publishedAt: now,
				publishedBy: ctx.userId,
				updatedAt: now,
			})
			.where(
				and(
					eq(placementTest.orgId, ctx.orgId),
					eq(placementTest.revision, revision),
					eq(placementTest.publishedVersion, row.publishedVersion),
				),
			)
			.returning({
				publishedVersion: placementTest.publishedVersion,
				publishedAt: placementTest.publishedAt,
				revision: placementTest.revision,
			});

		if (updated.length === 0) {
			return c.json(
				{
					error: "PLACEMENT_REVISION_CONFLICT",
					code: "PLACEMENT_REVISION_CONFLICT",
				},
				409,
			);
		}

		inBackground("cleanup orphan placement audio", () =>
			cleanupOrphanPlacementAudio(
				db,
				deps.getLibraryAudioStore?.(),
				ctx.orgId,
				now,
			),
		);

		return c.json({
			publishedVersion: updated[0]!.publishedVersion,
			publishedAt: (updated[0]!.publishedAt ?? now).toISOString(),
			revision: updated[0]!.revision,
			dirty: false,
		});
	});

	return routes;
}
