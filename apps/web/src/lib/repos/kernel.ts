/**
 * Kernel repo — pure mapping between the kernel API and the MockData shape
 * the 13 screens still consume. No env imports here so every function is
 * unit-testable in isolation; the provider wires the transports (POST
 * endpoint base URL + the QueryClient refetch behind the bus).
 */
import { queryOptions } from "@tanstack/react-query";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { KernelAction } from "@/lib/data-actions";
import {
	HttpError,
	isHttpError,
	MalformedSnapshotError,
} from "@/lib/kernel-load-state";
import type { KernelHydratedData } from "@/lib/mock-data";
import { mapAssignments } from "./assignments";
import { mapClasses } from "./classes";
import { mapCommentBank } from "./comment-bank";
import { mapInvoices } from "./invoices";
import { mapLessons } from "./lessons";
import { mapNotifs } from "./notifs";
import { mapReports } from "./reports";
import { mapStudents } from "./students";
import { mapSyllabi } from "./syllabus";

export type KernelSlice = KernelHydratedData;

export interface KernelRequest {
	path: string;
	body: unknown;
}

/** Map a kernel write action to its POST endpoint and JSON body. */
export function kernelCommand(action: KernelAction): KernelRequest {
	switch (action.type) {
		case "add-student":
			return {
				path: "/api/students",
				body: {
					name: action.payload.name,
					phone: action.payload.phone,
					parentName: action.payload.parentName,
					total: action.payload.total,
					price: action.payload.price,
					mode: action.payload.mode,
					...(action.payload.classId
						? { classId: action.payload.classId }
						: {}),
				},
			};
		case "enroll-student":
			// Issue #122: enroll an EXISTING student into the viewed class.
			return {
				path: `/api/classes/${action.classId}/enroll`,
				body: {
					studentId: action.studentId,
					total: action.payload.total,
					price: action.payload.price,
					mode: action.payload.mode,
				},
			};
		case "add-class":
			return {
				path: "/api/classes",
				body: { ...action.payload },
			};
		case "add-syllabus":
			return {
				path: "/api/syllabi",
				body: {
					name: action.payload.name,
					type: action.payload.type,
					level: action.payload.level,
					skills: action.payload.skills,
					description: action.payload.description,
					totalLessons: action.payload.totalLessons,
				},
			};
		case "import-syllabus":
			return {
				path: `/api/classes/${action.classId}/import-syllabus`,
				body: { templateId: action.templateId },
			};
		case "remove-curriculum":
			// Body must stay exactly {} — same CSRF-safe convention as
			// check-in/cancel.
			return {
				path: `/api/classes/${action.classId}/remove-curriculum`,
				body: {},
			};
		case "update-class-notes":
			return {
				path: `/api/classes/${action.classId}/notes`,
				body: { notes: action.notes },
			};
		case "check-in":
			// Body must stay exactly {} — the server rejects anything else so
			// a forged status can never ride along.
			return { path: `/api/lessons/${action.lessonId}/check-in`, body: {} };
		case "cancel-lesson":
			return { path: `/api/lessons/${action.lessonId}/cancel`, body: {} };
		case "lesson-edit":
			// Full-replace endpoint: the body must carry all five fields —
			// an omitted optional would reset that field to "".
			return {
				path: `/api/lessons/${action.lessonId}/edit`,
				body: { ...action.payload },
			};
		case "session-edit":
			// Occurrence edit (#98): partial payload, server derives weekday.
			return {
				path: `/api/classes/${action.classId}/sessions/${action.date}/edit`,
				body: { ...action.payload },
			};
		case "session-check-in":
			// Body stays exactly {} — the endpoint addresses the whole bucket.
			return {
				path: `/api/classes/${action.classId}/sessions/${action.date}/check-in`,
				body: {},
			};
		case "session-cancel":
			return {
				path: `/api/classes/${action.classId}/sessions/${action.date}/cancel`,
				body: {},
			};
		case "mark-invoice-paid":
			return {
				path: `/api/invoices/${action.invoiceId}/mark-paid`,
				body: { method: action.method },
			};
		case "grade-assignment":
			return {
				path: `/api/assignments/${action.assignmentId}/grade`,
				body: { scores: action.scores },
			};
		case "add-comment-bank":
			return {
				path: "/api/comment-bank",
				body: { text: action.text, operationId: action.operationId },
			};
		case "add-module":
			return {
				path: `/api/syllabi/${action.syllabusId}/modules`,
				body: { ...action.payload },
			};
		case "edit-module":
			return {
				path: `/api/syllabi/${action.syllabusId}/modules/${action.moduleId}`,
				body: { ...action.payload },
			};
		case "add-lesson":
			return {
				path: `/api/syllabi/${action.syllabusId}/modules/${action.moduleId}/lessons`,
				body: { ...action.payload },
			};
		case "edit-lesson":
			return {
				path: `/api/syllabi/${action.syllabusId}/modules/${action.moduleId}/lessons/${action.lessonId}`,
				body: {
					title: action.payload.title,
					objectives: action.payload.objectives,
					materials: action.payload.materials,
					status: action.payload.status,
				},
			};
		case "delete-module":
			return {
				path: `/api/syllabi/${action.syllabusId}/modules/${action.moduleId}/remove`,
				body: {},
			};
		case "delete-lesson":
			return {
				path: `/api/syllabi/${action.syllabusId}/modules/${action.moduleId}/lessons/${action.lessonId}/remove`,
				body: {},
			};
		case "reorder-modules":
			return {
				path: `/api/syllabi/${action.syllabusId}/modules/reorder`,
				body: { moduleIds: action.moduleIds },
			};
		case "reorder-lessons":
			return {
				path: `/api/syllabi/${action.syllabusId}/modules/${action.moduleId}/lessons/reorder`,
				body: { lessonIds: action.lessonIds },
			};
	}
}

/**
 * Adapter: kernel snapshot → MockData kernel slice.
 * - Student mapping (incl. pkg derivation) lives in repos/students.ts.
 * - Class mapping (roster + sessionsDone derive) lives in repos/classes.ts.
 * - Syllabus mapping (incl. totalLessons recompute) lives in repos/syllabus.ts.
 * - Lesson mapping (incl. sid resolve) lives in repos/lessons.ts.
 * - Assignment mapping (studentId→sid) lives in repos/assignments.ts.
 */
export function mapKernelSnapshot(snapshot: KernelSnapshot): KernelSlice {
	return {
		students: mapStudents(snapshot),
		classes: mapClasses(snapshot),
		syllabi: mapSyllabi(snapshot),
		lessons: mapLessons(snapshot),
		assignments: mapAssignments(snapshot),
		invoices: mapInvoices(snapshot),
		reports: mapReports(snapshot),
		notifs: mapNotifs(snapshot),
		commentBank: mapCommentBank(snapshot),
	};
}

/**
 * Truthful outcome of one kernel write (phase-5 contract).
 * - `refreshed` — 2xx acknowledged and the snapshot was re-applied. The only
 *   state that permits close/reset/navigate.
 * - `committed` — 2xx acknowledged but the refresh failed. The write IS saved;
 *   `id` rides along as metadata. Never navigate a stale store on this.
 * - `definite-failure` — 4xx: the server did not commit. Safe to retry.
 * - `outcome-unknown` — 5xx/408/429 or transport loss: a committed write may
 *   have lost its response. Reconcile the snapshot before any retry.
 */
/**
 * Occurrence-count honesty channel (#98 N2): refreshed/committed results may
 * carry `{updated, skipped}` parsed from the response envelope so UI can tell
 * "x/y học viên" truthfully instead of counting client-side snapshots.
 */
export interface KernelCommandPayload {
	updated?: number;
	skipped?: number;
}

export type KernelCommandResult =
	| ({ kind: "refreshed"; id?: string } & KernelCommandPayload)
	| ({ kind: "committed"; id?: string } & KernelCommandPayload)
	| {
			kind: "definite-failure";
			status: number;
			error: unknown;
			reason?: string;
	  }
	| { kind: "outcome-unknown"; error: unknown };

/**
 * Only a 4xx response proves the server did NOT commit the write. A 5xx from
 * an edge/proxy can arrive after the origin already committed, and 408/429
 * responses sit in the same ambiguity — all classify as outcome-unknown, as do
 * fetch rejections and timeouts (native errors).
 */
export function classifyWriteFailure(
	error: unknown,
): { kind: "definite-failure"; status: number } | { kind: "outcome-unknown" } {
	if (isHttpError(error)) {
		if (error.status === 408 || error.status === 429 || error.status >= 500) {
			return { kind: "outcome-unknown" };
		}
		return { kind: "definite-failure", status: error.status };
	}
	return { kind: "outcome-unknown" };
}

/**
 * Successful-write wire shape (#98 N2): legacy endpoints answer `{id}`,
 * occurrence mutations answer `{updated, skipped}`. Parsed defensively — a
 * foreign 2xx body degrades to an empty envelope instead of poisoning callers.
 */
export interface KernelWriteEnvelope {
	id?: string;
	updated?: number;
	skipped?: number;
}

function parseWriteEnvelope(json: unknown): KernelWriteEnvelope {
	if (typeof json !== "object" || json === null || Array.isArray(json)) {
		return {};
	}
	const record = json as Record<string, unknown>;
	const envelope: KernelWriteEnvelope = {};
	if (typeof record.id === "string") envelope.id = record.id;
	if (typeof record.updated === "number") envelope.updated = record.updated;
	if (typeof record.skipped === "number") envelope.skipped = record.skipped;
	return envelope;
}

/** Extract `{reason}` from an error body — silently skips non-JSON/garbage. */
async function parseErrorReason(res: Response): Promise<string | undefined> {
	try {
		const json: unknown = await res.json();
		if (
			typeof json === "object" &&
			json !== null &&
			!Array.isArray(json) &&
			typeof (json as Record<string, unknown>).reason === "string"
		) {
			return (json as Record<string, unknown>).reason as string;
		}
	} catch {
		// Body-rác/không-JSON: reason stays undefined; status still classifies.
	}
	return undefined;
}

/** Transport: POST a kernel write and resolve its parsed 2xx envelope. */
export async function postKernelCommand(
	baseUrl: string,
	action: KernelAction,
): Promise<KernelWriteEnvelope> {
	const { path, body } = kernelCommand(action);
	const res = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		// Serialized bus: a hung request would block every later write.
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) {
		const reason = await parseErrorReason(res);
		throw new HttpError(res.status, `POST ${path} failed: ${res.status}`, {
			reason,
		});
	}
	let json: unknown;
	try {
		json = await res.json();
	} catch {
		return {};
	}
	return parseWriteEnvelope(json);
}

/** Every kernel snapshot collection, per the API contract. */
const SNAPSHOT_COLLECTION_KEYS = [
	"students",
	"classes",
	"syllabi",
	"enrollments",
	"packages",
	"lessons",
	"assignments",
	"invoices",
	"reports",
	"notifs",
	"commentBank",
] as const satisfies ReadonlyArray<keyof KernelSnapshot>;

// Compile-time completeness: every KernelSnapshot collection must appear in
// SNAPSHOT_COLLECTION_KEYS, or a new contract field would silently skip the
// shape guard below.
type MissingSnapshotKey = Exclude<
	keyof KernelSnapshot,
	(typeof SNAPSHOT_COLLECTION_KEYS)[number]
>;
const allSnapshotKeysPresent: MissingSnapshotKey extends never ? true : never =
	true;
void allSnapshotKeysPresent;

/**
 * Minimal shape guard: a `200` body only counts as a snapshot when every
 * contract collection is present and is an array. Without this, a proxy page
 * or foreign JSON envelope would map "successfully" into an empty-looking
 * workspace — exactly the failure mode this phase exists to prevent.
 */
function isSnapshotShape(value: unknown): value is KernelSnapshot {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return SNAPSHOT_COLLECTION_KEYS.every((key) => Array.isArray(record[key]));
}

/** Transport: fetch the org-scoped kernel snapshot. */
export async function fetchKernelSnapshot(
	baseUrl: string,
	signal?: AbortSignal,
): Promise<KernelSnapshot> {
	const timeout = AbortSignal.timeout(15000);
	// Feature-detect: browsers without AbortSignal.any (Safari <17.4) fall
	// back to timeout-only — the pre-query behavior, not a silent floor raise.
	const composed =
		signal && typeof AbortSignal.any === "function"
			? AbortSignal.any([signal, timeout])
			: timeout;
	const res = await fetch(`${baseUrl}/api/kernel`, {
		credentials: "include",
		signal: composed,
	});
	if (!res.ok) {
		throw new HttpError(res.status, `GET /api/kernel failed: ${res.status}`);
	}
	let json: unknown;
	try {
		json = await res.json();
	} catch (cause) {
		throw new MalformedSnapshotError("GET /api/kernel returned invalid JSON", {
			cause,
		});
	}
	if (!isSnapshotShape(json)) {
		throw new MalformedSnapshotError(
			"GET /api/kernel 200 response did not match the snapshot shape",
		);
	}
	return json;
}

/**
 * The one and only kernel query key — every GET (initial load, bus refresh,
 * manual reconcile) shares this single cache entry, so a newer fetch always
 * supersedes an older one and a stale apply can never overwrite fresh data.
 */
export const kernelQueryKey = ["kernel"] as const;

/** Query options for the kernel snapshot: abort-aware GET with shape guard. */
export function kernelQueryOptions(baseUrl: string) {
	return queryOptions({
		queryKey: kernelQueryKey,
		queryFn: ({ signal }) => fetchKernelSnapshot(baseUrl, signal),
	});
}

export interface KernelCommandBusDeps {
	postCommand(action: KernelAction): Promise<KernelWriteEnvelope>;
	/**
	 * Refetch the kernel snapshot through the shared `['kernel']` query.
	 * Resolves when the fresh snapshot landed in the cache; throws on any
	 * transport/HTTP failure (upstream is `refetchQueries` with
	 * `throwOnError: true`).
	 */
	refetch(): Promise<void>;
	/**
	 * A typed `401` reached the bus — the session died mid-flight. Retrying
	 * cannot help; the host must re-authenticate (sign out + login redirect).
	 */
	onAuthLost(): void;
}

export interface KernelCommandBus {
	run(action: KernelAction): Promise<KernelCommandResult>;
	/**
	 * Serialized snapshot refresh — the reconcile path callers use after a
	 * `committed` or `outcome-unknown` result. Chaining on the write queue
	 * guarantees a stale snapshot can never overwrite a newer write's apply.
	 * Resolves false when the snapshot is unreachable.
	 */
	refresh(): Promise<boolean>;
}

/**
 * Serialized command bus: kernel writes run one at a time, each followed by
 * a snapshot refetch through the QueryClient. Serialization removes every
 * interleaving hole — a later write's POST always lands after the previous
 * write's refresh settled, so no snapshot can be applied stale and no
 * successful write can be dropped.
 *
 * An identical action dispatched while one is still pending shares the
 * in-flight result instead of queueing a second POST (double-click guard).
 */
export function createKernelCommandBus(
	deps: KernelCommandBusDeps,
): KernelCommandBus {
	const REFRESH_ATTEMPTS = 2;
	let queue: Promise<unknown> | null = null;
	const inFlight = new Map<string, Promise<KernelCommandResult>>();

	function enqueue<T>(start: () => Promise<T>): Promise<T> {
		// Start immediately when idle; chain behind the previous operation
		// otherwise so POSTs and snapshot refetches stay strictly serialized.
		const result = queue ? queue.then(start) : start();
		queue = result.catch(() => undefined);
		return result;
	}

	async function runOne(action: KernelAction): Promise<KernelCommandResult> {
		let envelope: KernelWriteEnvelope;
		try {
			envelope = await deps.postCommand(action);
		} catch (error) {
			// A dead session rejects the write before commit — the host must
			// re-authenticate; a retry would hit the same dead session.
			if (isHttpError(error) && error.status === 401) {
				deps.onAuthLost();
			}
			const classified = classifyWriteFailure(error);
			return classified.kind === "definite-failure"
				? {
						kind: "definite-failure",
						status: classified.status,
						error,
						reason: isHttpError(error) ? error.reason : undefined,
					}
				: { kind: "outcome-unknown", error };
		}
		const { id, updated, skipped } = envelope;
		for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
			try {
				await deps.refetch();
				return { kind: "refreshed", id, updated, skipped };
			} catch (error) {
				// Session expired between the write and the refresh. The write
				// itself committed, so report once and re-auth — a retry would
				// hit the same dead session. Every action resolves `committed`
				// with the acknowledged id (the comment-bank exception is
				// absorbed: its ack IS the durable commit boundary).
				if (isHttpError(error) && error.status === 401) {
					deps.onAuthLost();
					return { kind: "committed", id, updated, skipped };
				}
				// A flaky GET must not lose the acknowledged write's outcome.
			}
		}
		// The 2xx acknowledgement is the durable commit boundary — the write
		// IS saved even though the UI could not reload. Callers see
		// `committed`, keep the input out of retry reach, and reconcile.
		return { kind: "committed", id, updated, skipped };
	}

	return {
		run(action) {
			const key = JSON.stringify(action);
			const pending = inFlight.get(key);
			if (pending) return pending;
			const result = enqueue(() => runOne(action));
			inFlight.set(key, result);
			void result.finally(() => {
				if (inFlight.get(key) === result) inFlight.delete(key);
			});
			return result;
		},
		refresh() {
			return enqueue(async () => {
				try {
					await deps.refetch();
					return true;
				} catch (error) {
					// A dead session cannot reconcile either — route it to
					// re-auth instead of reporting a misleading "unreachable".
					if (isHttpError(error) && error.status === 401) {
						deps.onAuthLost();
					}
					return false;
				}
			});
		},
	};
}
