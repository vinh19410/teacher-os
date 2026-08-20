/**
 * Kernel repo — pure mapping between the kernel API and the MockData shape
 * the 13 screens still consume. No env/fetch imports here so every function
 * is unit-testable in isolation; the provider wires the transport.
 */
import type {
	CreatedResponse,
	KernelSnapshot,
} from "@teacher-os/api/contracts";
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
					level: action.payload.level,
					skill: action.payload.skill,
					description: action.payload.description,
					totalLessons: action.payload.totalLessons,
				},
			};
		case "assign-syllabus":
			return {
				path: `/api/classes/${action.classId}/assign-syllabus`,
				body: { syllabusId: action.syllabusId },
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

/** Transport: POST a kernel write and resolve the server-assigned id. */
export async function postKernelCommand(
	baseUrl: string,
	action: KernelAction,
): Promise<string | undefined> {
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
		throw new HttpError(res.status, `POST ${path} failed: ${res.status}`);
	}
	const json = (await res.json()) as Partial<CreatedResponse>;
	return json.id;
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
): Promise<KernelSnapshot> {
	const res = await fetch(`${baseUrl}/api/kernel`, {
		credentials: "include",
		signal: AbortSignal.timeout(15000),
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

export interface KernelCommandBusDeps {
	postCommand(action: KernelAction): Promise<string | undefined>;
	fetchSnapshot(): Promise<KernelSnapshot>;
	applySnapshot(snapshot: KernelSnapshot): void;
	/**
	 * `write` = the POST failed; `refresh` = POST succeeded but reload failed.
	 * `willRetry` is false on the final attempt — suppress duplicate toasts until then.
	 */
	onError(
		kind: "write" | "refresh",
		action: KernelAction,
		error: unknown,
		detail: { attempt: number; willRetry: boolean },
	): void;
	/**
	 * A typed `401` reached the bus — the session died mid-flight. Retrying
	 * cannot help; the host must re-authenticate (sign out + login redirect).
	 */
	onAuthLost(): void;
}

export interface KernelCommandBus {
	run(action: KernelAction): Promise<string | undefined>;
}

/**
 * Serialized command bus: kernel writes run one at a time, each followed by
 * a snapshot fetch+apply. Serialization removes every interleaving hole —
 * a later write's POST always lands after the previous write is applied, so
 * no snapshot can be applied stale and no successful write can be dropped.
 *
 * A write that saved server-side but could not refresh the UI normally resolves
 * `undefined` so callers never navigate against a stale store. Comment-bank
 * writes return their acknowledged id because replaying them would duplicate
 * an already committed comment.
 */
export function createKernelCommandBus(
	deps: KernelCommandBusDeps,
): KernelCommandBus {
	const REFRESH_ATTEMPTS = 2;
	let queue: Promise<unknown> | null = null;

	async function runOne(action: KernelAction): Promise<string | undefined> {
		let id: string | undefined;
		// A comment POST acknowledgement is the durable commit boundary. Replaying
		// after only the hydration failed would create an unintended duplicate.
		// Other actions keep the stale-store safety contract: resolve undefined
		// so callers never navigate against an un-refreshed store.
		const settleAfterFailedRefresh = (): string | undefined =>
			action.type === "add-comment-bank" ? id : undefined;
		try {
			id = await deps.postCommand(action);
		} catch (error) {
			deps.onError("write", action, error, { attempt: 1, willRetry: false });
			if (isHttpError(error) && error.status === 401) {
				deps.onAuthLost();
			}
			return undefined;
		}
		for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
			try {
				deps.applySnapshot(await deps.fetchSnapshot());
				return id;
			} catch (error) {
				if (isHttpError(error) && error.status === 401) {
					// Session expired between the write and the refresh. The write
					// itself committed, so report once and re-auth — a retry would
					// hit the same dead session.
					deps.onError("refresh", action, error, {
						attempt,
						willRetry: false,
					});
					deps.onAuthLost();
					return settleAfterFailedRefresh();
				}
				deps.onError("refresh", action, error, {
					attempt,
					willRetry: attempt < REFRESH_ATTEMPTS,
				});
			}
		}
		return settleAfterFailedRefresh();
	}

	return {
		run(action) {
			// Start immediately when idle; chain behind the previous write
			// otherwise so POSTs are strictly serialized.
			const result = queue ? queue.then(() => runOne(action)) : runOne(action);
			queue = result.catch(() => undefined);
			return result;
		},
	};
}
