/**
 * Kernel repo — pure mapping between the kernel API and the MockData shape
 * the 13 screens still consume. No env imports here so every function is
 * unit-testable in isolation; the provider wires the transports (POST
 * endpoint base URL + the QueryClient refetch behind the bus).
 */
import { queryOptions } from "@tanstack/react-query";
import {
	ACCOUNT_ERROR_CODES,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import type { CurriculumTarget, KernelAction } from "@/lib/data-actions";
import {
	HttpError,
	isHttpError,
	MalformedSnapshotError,
} from "@/lib/kernel-load-state";
import type { KernelHydratedData } from "@/lib/mock-data";
import { mapAssignmentPrompts } from "./assignment-prompts";
import { mapAssignmentTests } from "./assignment-tests";
import { mapAssignments } from "./assignments";
import { mapClassAssignments } from "./class-assignments";
import { mapClasses } from "./classes";
import { mapCommentBank } from "./comment-bank";
import { mapEnrollments } from "./enrollments";
import { mapInvoices } from "./invoices";
import { mapLessons } from "./lessons";
import { mapNotifs } from "./notifs";
import { mapReports } from "./reports";
import { mapStudents } from "./students";
import { mapSyllabi } from "./syllabus";

export type KernelSlice = KernelHydratedData;

export interface KernelRequest {
	path: string;
	method?: "POST" | "PUT" | "PATCH" | "DELETE";
	body: unknown;
}

/** Map a kernel write action to its POST endpoint and JSON body. */
export function kernelCommand(action: KernelAction): KernelRequest {
	switch (action.type) {
		case "add-student":
			return {
				path: "/api/students",
				body: {
					...action.payload,
				},
			};
		case "enroll-student":
			// Issue #122 / #251 / #508: enroll an EXISTING student into the viewed class.
			return {
				path: `/api/classes/${action.classId}/enroll`,
				body: {
					studentId: action.studentId,
					...(action.activateNow !== undefined
						? { activateNow: action.activateNow }
						: {}),
				},
			};
		case "add-class":
			return {
				path: "/api/classes",
				body: {
					...action.payload,
					tuitionFee: action.payload.tuitionFee ?? null,
				},
			};
		case "add-invoice":
			// Issue #61: invoiceCreateSchema is .strict() — the body must carry
			// exactly these four fields; note always rides along ("" default).
			return {
				path: "/api/invoices",
				body: {
					enrollmentId: action.payload.enrollmentId,
					amount: action.payload.amount,
					due: action.payload.due,
					note: action.payload.note ?? "",
				},
			};
		case "add-syllabus":
			return {
				path: "/api/syllabus-templates",
				body: {
					name: action.payload.name,
					type: action.payload.type,
					level: action.payload.level,
					skills: action.payload.skills,
					description: action.payload.description,
					totalLessons: action.payload.totalLessons,
					modules: action.payload.modules,
				},
			};
		case "import-curriculum":
			return {
				path: `/api/classes/${action.classId}/curriculum/import`,
				body: { templateId: action.templateId },
			};
		case "remove-curriculum":
			// Body must stay exactly {} — same CSRF-safe convention as
			// check-in/cancel.
			return {
				path: `/api/classes/${action.classId}/curriculum/remove`,
				body: {},
			};
		case "update-class-notes":
			return {
				path: `/api/classes/${action.classId}/notes`,
				body: { notes: action.notes },
			};
		case "update-class-tuition-fee":
			return {
				path: `/api/classes/${action.payload.classId}/tuition-fee`,
				body: { tuitionFee: action.payload.tuitionFee },
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
		case "record-invoice-payment":
			// #450: invoicePaymentCreateSchema is .strict() — the payload is the
			// entire body (clientRequestId, amount, method, note).
			return {
				path: `/api/invoices/${action.invoiceId}/payments`,
				body: { ...action.payload },
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
		case "create-report":
			// #173: reportCreateSchema is .strict() — exactly these five fields.
			return {
				path: "/api/reports",
				body: { ...action.payload },
			};
		case "create-assignment-prompt":
			// #218: assignmentPromptCreateSchema is .strict() — v2 payload is
			// the entire body and is posted verbatim.
			return {
				path: "/api/assignments/prompts",
				body: { ...action.payload },
			};
		case "assign-class-prompt":
			// #208: classAssignmentCreateSchema is .strict() — the payload is
			// the entire body (promptId, due, note, studentIds).
			return {
				path: `/api/classes/${action.payload.classId}/assignments`,
				body: {
					promptId: action.payload.promptId,
					due: action.payload.due,
					...(action.payload.dueTime
						? { dueTime: action.payload.dueTime }
						: {}),
					note: action.payload.note,
					studentIds: action.payload.studentIds,
				},
			};
		case "add-module":
			return {
				path: `${curriculumBase(action.target)}/modules`,
				body: { ...action.payload },
			};
		case "edit-module":
			return {
				path: `${curriculumBase(action.target)}/modules/${action.moduleId}`,
				body: { ...action.payload },
			};
		case "add-lesson":
			return {
				path: `${curriculumBase(action.target)}/modules/${action.moduleId}/lessons`,
				body: { ...action.payload },
			};
		case "edit-lesson":
			// Spread để key `status` undefined tự rơi khỏi JSON — server sẽ
			// preserve status cũ khi body không có key này.
			return {
				path: `${curriculumBase(action.target)}/modules/${action.moduleId}/lessons/${action.lessonId}`,
				body: { ...action.payload },
			};
		case "replace-syllabus-content":
			return {
				path: `/api/syllabus-templates/${action.syllabusId}/replace-content`,
				body: { modules: action.modules },
			};
		case "delete-module":
			return {
				path: `${curriculumBase(action.target)}/modules/${action.moduleId}/remove`,
				body: {},
			};
		case "delete-lesson":
			return {
				path: `${curriculumBase(action.target)}/modules/${action.moduleId}/lessons/${action.lessonId}/remove`,
				body: {},
			};
		case "delete-syllabus":
			// Body phải stay exactly {} — same CSRF-safe convention as
			// remove-curriculum (server schema là z.object({}).strict()).
			return {
				path: `/api/syllabus-templates/${action.syllabusId}/remove`,
				body: {},
			};
		case "reorder-modules":
			return {
				path: `${curriculumBase(action.target)}/modules/reorder`,
				body: { moduleIds: action.moduleIds },
			};
		case "reorder-lessons":
			return {
				path: `${curriculumBase(action.target)}/modules/${action.moduleId}/lessons/reorder`,
				body: { lessonIds: action.lessonIds },
			};
		case "activate-enrollment":
			return {
				path: `/api/enrollments/${action.enrollmentId}/accept`,
				body: {},
			};
		case "delete-enrollment":
			return {
				path: `/api/enrollments/${action.enrollmentId}`,
				method: "DELETE",
				body: undefined,
			};
		case "create-assignment-test":
			// assignmentTestCreateSchema là .strict() — payload là toàn bộ
			// body; key optional undefined rơi khỏi JSON.stringify, server
			// tự `?? null`.
			return {
				path: "/api/assignments/tests",
				body: { ...action.payload },
			};
		case "update-assignment-test":
			// Partial payload — key nào không gửi giữ nguyên giá trị cũ.
			return {
				path: `/api/assignments/tests/${action.testId}`,
				method: "PATCH",
				body: { ...action.payload },
			};
		case "delete-assignment-test":
			return {
				path: `/api/assignments/tests/${action.testId}`,
				method: "DELETE",
				body: undefined,
			};
		case "set-assignment-test-parts":
			// Replace-all: body là đúng mảng parts (max 4, .strict() từng item).
			return {
				path: `/api/assignments/tests/${action.testId}/parts`,
				method: "PUT",
				body: action.parts,
			};
		case "update-assignment-prompt":
			// Nút Apply (phase-5): partial — skill/part không có trong update
			// schema nên không bao giờ nằm trên wire.
			return {
				path: `/api/assignments/prompts/${action.promptId}`,
				method: "PATCH",
				body: { ...action.payload },
			};
		case "create-vocab-deck":
			// #359: vocabDeckCreateSchema .strict() — id optional không gửi
			// (server tự sinh), lang default "en" server-side.
			return {
				path: "/api/kernel/vocab/decks",
				body: { ...action.payload },
			};
		case "rename-vocab-deck":
			return {
				path: "/api/kernel/vocab/decks/rename",
				body: { ...action.payload },
			};
		case "delete-vocab-deck":
			return {
				path: "/api/kernel/vocab/decks/delete",
				body: { deckId: action.deckId },
			};
		case "upsert-vocab-word":
			return {
				path: "/api/kernel/vocab/words/upsert",
				body: { ...action.payload },
			};
		case "remove-vocab-word":
			return {
				path: "/api/kernel/vocab/words/remove",
				body: { wordId: action.wordId },
			};
		case "clone-vocab-library-decks":
			return {
				path: "/api/kernel/vocab-library/clone",
				body: { ...action.payload },
			};
		case "suggest-vocab-deck":
			return {
				path: "/api/kernel/vocab/suggestions",
				body: { ...action.payload },
			};
		case "revoke-vocab-suggestion":
			return {
				path: "/api/kernel/vocab/suggestions/revoke",
				body: { suggestionId: action.suggestionId },
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
 * - Assignment-test mapping (defensive defaults) lives in
 *   repos/assignment-tests.ts.
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
		assignmentPrompts: mapAssignmentPrompts(snapshot),
		notifs: mapNotifs(snapshot),
		commentBank: mapCommentBank(snapshot),
		enrollments: mapEnrollments(snapshot),
		classAssignments: mapClassAssignments(snapshot),
		assignmentTests: mapAssignmentTests(snapshot),
		vocabDecks: snapshot.vocabDecks ?? [],
		vocabSuggestions: snapshot.vocabSuggestions ?? [],
		holidays: snapshot.holidays ?? [],
		holidayShifts: snapshot.holidayShifts ?? [],
		holidayCancels: snapshot.holidayCancels ?? [],
		events: snapshot.events ?? [],
		viewer: snapshot.viewer ?? { role: "teacher", canAccessFinance: true },
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
	duplicates?: string[];
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
	duplicates?: string[];
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
	if (
		Array.isArray(record.duplicates) &&
		record.duplicates.every((item): item is string => typeof item === "string")
	) {
		envelope.duplicates = record.duplicates;
	}
	return envelope;
}

/**
 * Extract the machine reason from an error body — `body.error ?? body.reason`
 * (the kernel 403s use `error`, legacy write failures use `reason`; mirrors
 * the portal's `code = body.code ?? body.error` precedent). Silently skips
 * non-JSON/garbage.
 */
async function parseErrorReason(res: Response): Promise<string | undefined> {
	try {
		const json: unknown = await res.json();
		if (typeof json === "object" && json !== null && !Array.isArray(json)) {
			const record = json as Record<string, unknown>;
			const candidate = record.error ?? record.reason;
			if (typeof candidate === "string") return candidate;
		}
	} catch {
		// Body-rác/không-JSON: reason stays undefined; status still classifies.
	}
	return undefined;
}

/**
 * Base path cho tám thao tác module/lesson theo phạm vi của `target`
 * (design D7, issue #394): template scope hoặc giáo trình của lớp.
 */
function curriculumBase(target: CurriculumTarget): string {
	return target.kind === "template"
		? `/api/syllabus-templates/${target.syllabusId}`
		: `/api/classes/${target.classId}/curriculum`;
}

/** Transport: POST a kernel write and resolve its parsed 2xx envelope. */
export async function postKernelCommand(
	baseUrl: string,
	action: KernelAction,
): Promise<KernelWriteEnvelope> {
	const req = kernelCommand(action);
	const method = req.method ?? "POST";
	const res = await fetch(`${baseUrl}${req.path}`, {
		method,
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
		// Serialized bus: a hung request would block every later write.
		signal: AbortSignal.timeout(15000),
	});
	if (!res.ok) {
		const reason = await parseErrorReason(res);
		throw new HttpError(
			res.status,
			`${method} ${req.path} failed: ${res.status}`,
			{
				reason,
			},
		);
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
	"assignmentPrompts",
	"classAssignments",
	"assignmentTests",
	"invoices",
	"reports",
	"notifs",
	"commentBank",
	"vocabDecks",
] as const satisfies ReadonlyArray<keyof KernelSnapshot>;

/**
 * Optional snapshot collections (#363 RT-F8/F23): tolerated when absent on older
 * server payloads so deploy skew never blanks the teacher workspace, while still
 * verified as an array when present.
 */
const OPTIONAL_SNAPSHOT_COLLECTION_KEYS = [
	"vocabSuggestions",
	"holidays",
	"holidayShifts",
	"holidayCancels",
	// TOS-14 (#447): events — optional để deploy skew (web mới + server cũ)
	// không làm trắng workspace, precedent vocabSuggestions #363 RT-F8.
	"events",
] as const satisfies ReadonlyArray<keyof KernelSnapshot>;

// Compile-time completeness: every KernelSnapshot collection must appear in
// SNAPSHOT_COLLECTION_KEYS or OPTIONAL_SNAPSHOT_COLLECTION_KEYS, or a new
// contract field would silently skip the shape guard below.
type MissingSnapshotKey = Exclude<
	keyof KernelSnapshot,
	| (typeof SNAPSHOT_COLLECTION_KEYS)[number]
	| (typeof OPTIONAL_SNAPSHOT_COLLECTION_KEYS)[number]
	| "viewer"
>;
const allSnapshotKeysPresent: MissingSnapshotKey extends never ? true : never =
	true;
void allSnapshotKeysPresent;

/**
 * Minimal shape guard: a `200` body only counts as a snapshot when every
 * required contract collection is present and is an array, and every optional
 * collection is either absent or an array.
 */
function isSnapshotShape(value: unknown): value is KernelSnapshot {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		SNAPSHOT_COLLECTION_KEYS.every((key) => Array.isArray(record[key])) &&
		OPTIONAL_SNAPSHOT_COLLECTION_KEYS.every(
			(key) => record[key] === undefined || Array.isArray(record[key]),
		) &&
		(record.viewer === undefined ||
			(typeof record.viewer === "object" &&
				record.viewer !== null &&
				!Array.isArray(record.viewer) &&
				typeof (record.viewer as Record<string, unknown>).role === "string" &&
				typeof (record.viewer as Record<string, unknown>).canAccessFinance ===
					"boolean"))
	);
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
		// Parse the body (plan #260): the account-role 403 carries
		// `error: ACCOUNT_STUDENT_ROLE` and QueryCache.onError must see it —
		// the machine code rides on `reason`; the message stays descriptive.
		const reason = await parseErrorReason(res);
		throw new HttpError(res.status, `GET /api/kernel failed: ${res.status}`, {
			reason,
		});
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
	/**
	 * A `403 ACCOUNT_STUDENT_ROLE` reached the bus — the account is a student
	 * on the teacher app (plan #260); the host swaps the UI for the blocked
	 * view. Optional so ad-hoc test buses can omit it.
	 */
	onRoleBlocked?(reason?: string): void;
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
 * Only the exact account-role / teacher-allowlist codes trigger the blocked
 * exit — never a bare 403 (e.g. the legacy "no membership after bootstrap").
 * Shared with the QueryCache read path (query-client.ts) so both gates stay in
 * lockstep.
 */
export function isStudentRoleRejected(error: unknown): error is HttpError {
	return (
		isHttpError(error) &&
		error.status === 403 &&
		(error.reason === ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP ||
			error.reason === ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED ||
			error.reason === ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED)
	);
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
			// A student-role session is likewise beyond retry (plan #260).
			if (isStudentRoleRejected(error)) {
				deps.onRoleBlocked?.(error.reason);
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
		const { id, updated, skipped, duplicates } = envelope;
		for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
			try {
				await deps.refetch();
				return { kind: "refreshed", id, updated, skipped, duplicates };
			} catch (error) {
				if (isHttpError(error) && error.status === 401) {
					deps.onAuthLost();
					return { kind: "committed", id, updated, skipped, duplicates };
				}
				if (isStudentRoleRejected(error)) {
					deps.onRoleBlocked?.(error.reason);
					return { kind: "committed", id, updated, skipped, duplicates };
				}
			}
		}
		return { kind: "committed", id, updated, skipped, duplicates };
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
					if (isStudentRoleRejected(error)) {
						deps.onRoleBlocked?.(error.reason);
					}
					return false;
				}
			});
		},
	};
}
