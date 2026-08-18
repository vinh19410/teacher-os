import { env } from "@teacher-os/env/web";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { getServerUrl } from "@/lib/auth-client";
import { type Action, emptyData, reducer } from "./data-store-reducer";
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
	isKernelWrite,
	type KernelCommandBus,
	mapKernelSnapshot,
	postKernelCommand,
} from "./repos/kernel";

interface DataStore {
	data: MockData;
	/** Kernel writes go through the serialized command bus and resolve the server id. */
	dispatch(action: Action): Promise<string | undefined>;
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
	const [data, localDispatch] = useReducer(reducer, emptyData);
	// Loading gate: children (and the store) stay unmounted until the first
	// GET /api/kernel settles, so detail pages cannot notFound() on stale ids.
	const [kernelLoaded, setKernelLoaded] = useState(false);
	const baseUrl = getServerUrl(env.VITE_SERVER_URL);
	const busRef = useRef<KernelCommandBus | null>(null);

	const applySnapshot = useCallback(
		(snapshot: Parameters<typeof mapKernelSnapshot>[0]) => {
			localDispatch({
				type: "kernel-loaded",
				payload: mapKernelSnapshot(snapshot),
			});
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

	const dispatch = useCallback(
		(action: Action): Promise<string | undefined> => {
			if (!isKernelWrite(action)) {
				localDispatch(action);
				return Promise.resolve(undefined);
			}
			busRef.current ??= createKernelCommandBus({
				postCommand: (kernelAction) => postKernelCommand(baseUrl, kernelAction),
				fetchSnapshot: () => fetchKernelSnapshot(baseUrl),
				applySnapshot,
				onError: (kind, kernelAction, error, detail) => {
					console.error(
						`[kernel] ${kind} failed (attempt ${detail.attempt})`,
						kernelAction.type,
						error,
					);
					// Intermediate refresh retries only log — toasting both
					// attempts would show the same message twice.
					if (kind === "write" || !detail.willRetry) {
						toast.error(
							kind === "write"
								? "Không lưu được — dữ liệu chưa được ghi lên máy chủ."
								: "Đã lưu trên máy chủ nhưng chưa tải lại được dữ liệu.",
						);
					}
				},
			});
			return busRef.current.run(action);
		},
		[applySnapshot, baseUrl],
	);

	const store = useMemo<DataStore>(() => {
		return {
			data,
			dispatch,
			studentById: (id) => data.students.find((s) => s.id === id),
			lessonById: (id) => data.lessons.find((l) => l.id === id),
			invoiceById: (id) => data.invoices.find((i) => i.id === id),
			assignmentById: (id) => data.assignments.find((a) => a.id === id),
			classById: (id) => data.classes.find((c) => c.id === id),
			syllabusById: (id) => data.syllabi.find((s) => s.id === id),
			classesForSyllabus: (id) =>
				data.classes.filter((c) => c.syllabusId === id),
		};
	}, [data, dispatch]);

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
