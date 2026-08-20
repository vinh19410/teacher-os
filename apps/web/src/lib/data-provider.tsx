import { useQuery, useQueryClient } from "@tanstack/react-query";
import { env } from "@teacher-os/env/web";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
} from "react";
import KernelLoadError from "@/components/kernel-load-error";
import { getServerUrl } from "@/lib/auth-client";
import type { KernelAction } from "./data-actions";
import { classifyLoadError } from "./kernel-load-state";
import { emptyKernelData } from "./kernel-state";
import type {
	Assignment,
	ClassGroup,
	Invoice,
	Lesson,
	MockData,
	Student,
	Syllabus,
} from "./mock-data";
import { reauth } from "./reauth";
import {
	createKernelCommandBus,
	type KernelCommandBus,
	type KernelCommandResult,
	kernelQueryKey,
	kernelQueryOptions,
	mapKernelSnapshot,
	postKernelCommand,
} from "./repos/kernel";

interface DataStore {
	data: MockData;
	/**
	 * Kernel writes go through the serialized command bus and resolve the
	 * truthful outcome — only `refreshed` permits close/reset/navigate.
	 */
	dispatch(action: KernelAction): Promise<KernelCommandResult>;
	/**
	 * Reconcile path for `committed`/`outcome-unknown` results: fetches and
	 * applies the latest snapshot behind the bus queue. Resolves false when
	 * the snapshot is unreachable.
	 */
	refresh(): Promise<boolean>;
	studentById(id: string): Student | undefined;
	lessonById(id: string): Lesson | undefined;
	invoiceById(id: string): Invoice | undefined;
	assignmentById(id: string): Assignment | undefined;
	classById(id: string): ClassGroup | undefined;
	syllabusById(id: string): Syllabus | undefined;
	classesForSyllabus(id: string): ClassGroup[];
}

const DataContext = createContext<DataStore | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
	const baseUrl = getServerUrl(env.VITE_SERVER_URL);
	const queryClient = useQueryClient();
	const busRef = useRef<KernelCommandBus | null>(null);

	// Load gate: children (and the store) stay unmounted until the shared
	// ['kernel'] query settles with a valid snapshot. A failed FIRST load
	// renders a blocking retry/fatal screen — never an empty org. A failed
	// mid-session refresh keeps the mounted workspace on stale data.
	const {
		data: snapshot,
		isPending,
		isError,
		error,
		refetch,
	} = useQuery(kernelQueryOptions(baseUrl));

	const data = useMemo(
		() => (snapshot ? mapKernelSnapshot(snapshot) : emptyKernelData),
		[snapshot],
	);

	// 401 re-auth lives in lib/reauth.ts (single-flight) — the provider and
	// the command bus share that one exit so concurrent read+write 401s
	// redirect exactly once.
	const getBus = useCallback(() => {
		busRef.current ??= createKernelCommandBus({
			postCommand: (kernelAction) => postKernelCommand(baseUrl, kernelAction),
			// Post-write refresh runs through the shared ['kernel'] query:
			// resolve = refreshed, throw = committed. throwOnError makes
			// refetchQueries reject instead of swallowing the failure, and
			// type "all" keeps it truthful even with no active observer.
			refetch: () =>
				queryClient.refetchQueries(
					{ queryKey: kernelQueryKey, exact: true, type: "all" },
					{ throwOnError: true },
				),
			// A dead session mid-write/mid-refresh bounces to login (phase-4);
			// the discriminated result still tells the caller what landed.
			onAuthLost: reauth,
		});
		return busRef.current;
	}, [baseUrl, queryClient]);

	const dispatch = useCallback(
		(action: KernelAction): Promise<KernelCommandResult> => {
			const result = getBus().run(action);
			// Outcome surfacing is caller-owned (modal notice / direct-action
			// toast); the provider only logs non-happy paths for diagnosis.
			void result.then((r) => {
				if (r.kind !== "refreshed") {
					console.warn(`[kernel] ${action.type} → ${r.kind}`);
				}
			});
			return result;
		},
		[getBus],
	);

	const refresh = useCallback(
		(): Promise<boolean> => getBus().refresh(),
		[getBus],
	);

	const store = useMemo<DataStore>(() => {
		return {
			data,
			dispatch,
			refresh,
			studentById: (id) => data.students.find((s) => s.id === id),
			lessonById: (id) => data.lessons.find((l) => l.id === id),
			invoiceById: (id) => data.invoices.find((i) => i.id === id),
			assignmentById: (id) => data.assignments.find((a) => a.id === id),
			classById: (id) => data.classes.find((c) => c.id === id),
			syllabusById: (id) => data.syllabi.find((s) => s.id === id),
			classesForSyllabus: (id) =>
				data.classes.filter((c) => c.syllabusId === id),
		};
	}, [data, dispatch, refresh]);

	// Blocking error UI is initial-load-only: once a snapshot exists, a
	// failed refresh must never unmount the running workspace — the write
	// outcome surfaces through the modal/direct-action that triggered it.
	if (isError && !snapshot) {
		console.error("[kernel] initial load failed", error);
		const failure = classifyLoadError(error);
		if (failure.kind === "reauth") {
			// The 401 already fired reauth() via QueryCache.onError.
			return null;
		}
		return <KernelLoadError failure={failure} onRetry={() => void refetch()} />;
	}
	if (isPending || !snapshot) {
		return null;
	}

	return <DataContext.Provider value={store}>{children}</DataContext.Provider>;
}

export function useData(): DataStore {
	const ctx = useContext(DataContext);
	if (!ctx) {
		throw new Error("useData must be used within DataProvider");
	}
	return ctx;
}
