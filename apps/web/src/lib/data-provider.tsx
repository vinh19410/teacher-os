import { env } from "@teacher-os/env/web";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import KernelLoadError from "@/components/kernel-load-error";
import { authClient, getServerUrl } from "@/lib/auth-client";
import type { KernelAction } from "./data-actions";
import {
	beginLoad,
	classifyLoadError,
	type LoadState,
	settleLoadSuccess,
	shouldSettle,
	validateReturnUrl,
} from "./kernel-load-state";
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
import {
	createKernelCommandBus,
	fetchKernelSnapshot,
	type KernelCommandBus,
	type KernelCommandResult,
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
	const [data, setData] = useState(emptyKernelData);
	// Load gate: children (and the store) stay unmounted until the first
	// GET /api/kernel settles with a valid snapshot. A failed load renders a
	// blocking retry/fatal screen — never an empty org.
	const [load, setLoad] = useState<LoadState>({ status: "loading" });
	const baseUrl = getServerUrl(env.VITE_SERVER_URL);
	const busRef = useRef<KernelCommandBus | null>(null);
	const attemptRef = useRef(0);

	const applySnapshot = useCallback(
		(snapshot: Parameters<typeof mapKernelSnapshot>[0]) => {
			setData(mapKernelSnapshot(snapshot));
		},
		[],
	);

	/**
	 * 401 = the session is dead. Clear the session cookie best-effort (the
	 * provider state dies with the unmount that follows), then bounce to the
	 * login page carrying a validated return URL so the teacher lands back
	 * where they were. Retrying against a dead session is pointless.
	 */
	const reauth = useCallback(() => {
		void authClient.signOut().catch(() => undefined);
		const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
		const returnUrl = validateReturnUrl(current);
		window.location.assign(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
	}, []);

	const startLoad = useCallback(() => {
		attemptRef.current += 1;
		const seq = attemptRef.current;
		setLoad(beginLoad());
		fetchKernelSnapshot(baseUrl)
			.then((snapshot) => {
				// Only the newest attempt may settle — a stale attempt rejection
				// must never unmount an already-running workspace.
				if (!shouldSettle(seq, attemptRef.current)) {
					return;
				}
				applySnapshot(snapshot);
				setLoad(settleLoadSuccess());
			})
			.catch((error) => {
				if (!shouldSettle(seq, attemptRef.current)) {
					return;
				}
				console.error("[kernel] initial load failed", error);
				const failure = classifyLoadError(error);
				if (failure.kind === "reauth") {
					reauth();
					return;
				}
				setLoad({ status: "error", failure });
			});
	}, [applySnapshot, baseUrl, reauth]);

	useEffect(() => {
		startLoad();
	}, [startLoad]);

	const getBus = useCallback(() => {
		busRef.current ??= createKernelCommandBus({
			postCommand: (kernelAction) => postKernelCommand(baseUrl, kernelAction),
			fetchSnapshot: () => fetchKernelSnapshot(baseUrl),
			applySnapshot,
			// A dead session mid-write/mid-refresh bounces to login (phase-4);
			// the discriminated result still tells the caller what landed.
			onAuthLost: reauth,
		});
		return busRef.current;
	}, [applySnapshot, baseUrl, reauth]);

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

	if (load.status !== "ready") {
		if (load.status === "error") {
			return <KernelLoadError failure={load.failure} onRetry={startLoad} />;
		}
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
