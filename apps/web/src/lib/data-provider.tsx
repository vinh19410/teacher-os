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
import { toast } from "sonner";
import { getServerUrl } from "@/lib/auth-client";
import type { KernelAction } from "./data-actions";
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
	// Loading gate: children (and the store) stay unmounted until the first
	// GET /api/kernel settles, so detail pages cannot notFound() on stale ids.
	const [kernelLoaded, setKernelLoaded] = useState(false);
	const baseUrl = getServerUrl(env.VITE_SERVER_URL);
	const busRef = useRef<KernelCommandBus | null>(null);

	const applySnapshot = useCallback(
		(snapshot: Parameters<typeof mapKernelSnapshot>[0]) => {
			setData(mapKernelSnapshot(snapshot));
		},
		[],
	);

	const loadKernel = useCallback(async () => {
		applySnapshot(await fetchKernelSnapshot(baseUrl));
	}, [applySnapshot, baseUrl]);

	useEffect(() => {
		let cancelled = false;
		loadKernel()
			.then(() => {
				if (!cancelled) setKernelLoaded(true);
			})
			.catch((error) => {
				// Gate ends on error too — the app runs on an empty kernel slice
				// rather than hanging on the loader forever.
				console.error("[kernel] initial load failed", error);
				toast.error("Không tải được dữ liệu lớp/học viên từ máy chủ.");
				if (!cancelled) setKernelLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, [loadKernel]);

	const getBus = useCallback(() => {
		busRef.current ??= createKernelCommandBus({
			postCommand: (kernelAction) => postKernelCommand(baseUrl, kernelAction),
			fetchSnapshot: () => fetchKernelSnapshot(baseUrl),
			applySnapshot,
		});
		return busRef.current;
	}, [applySnapshot, baseUrl]);

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

	if (!kernelLoaded) {
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
