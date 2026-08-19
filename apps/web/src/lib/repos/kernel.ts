/**
 * Kernel repo — pure mapping between the kernel API and the MockData shape
 * the 13 screens still consume. No env/fetch imports here so every function
 * is unit-testable in isolation; the provider wires the transport.
 */
import type {
	CreatedResponse,
	KernelSnapshot,
} from "@teacher-os/api/contracts";
import type { Action } from "@/lib/data-store-reducer";
import type { MockData } from "@/lib/mock-data";
import { mapClasses } from "./classes";
import { mapLessons } from "./lessons";
import { mapStudents } from "./students";
import { mapSyllabi } from "./syllabus";

export type KernelSlice = Pick<
	MockData,
	"students" | "classes" | "syllabi" | "lessons"
>;

const KERNEL_WRITE_TYPES = [
	"add-student",
	"add-class",
	"add-syllabus",
	"assign-syllabus",
	"add-module",
	"edit-module",
	"add-lesson",
	"edit-lesson",
	"update-class-notes",
	"check-in",
	"cancel-lesson",
] as const;

type KernelWriteType = (typeof KERNEL_WRITE_TYPES)[number];

export type KernelAction = Extract<Action, { type: KernelWriteType }>;

/** True when the action must go through the kernel command bus. */
export function isKernelWrite(action: Action): action is KernelAction {
	return (KERNEL_WRITE_TYPES as readonly string[]).includes(action.type);
}

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
 */
export function mapKernelSnapshot(snapshot: KernelSnapshot): KernelSlice {
	return {
		students: mapStudents(snapshot),
		classes: mapClasses(snapshot),
		syllabi: mapSyllabi(snapshot),
		lessons: mapLessons(snapshot),
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
		throw new Error(`POST ${path} failed: ${res.status}`);
	}
	const json = (await res.json()) as Partial<CreatedResponse>;
	return json.id;
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
		throw new Error(`GET /api/kernel failed: ${res.status}`);
	}
	return (await res.json()) as KernelSnapshot;
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
 * A write that saved server-side but could not refresh the UI resolves
 * `undefined` so callers never navigate against a stale store.
 */
export function createKernelCommandBus(
	deps: KernelCommandBusDeps,
): KernelCommandBus {
	const REFRESH_ATTEMPTS = 2;
	let queue: Promise<unknown> | null = null;

	async function runOne(action: KernelAction): Promise<string | undefined> {
		let id: string | undefined;
		try {
			id = await deps.postCommand(action);
		} catch (error) {
			deps.onError("write", action, error, { attempt: 1, willRetry: false });
			return undefined;
		}
		for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt++) {
			try {
				deps.applySnapshot(await deps.fetchSnapshot());
				return id;
			} catch (error) {
				deps.onError("refresh", action, error, {
					attempt,
					willRetry: attempt < REFRESH_ATTEMPTS,
				});
			}
		}
		return undefined;
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
