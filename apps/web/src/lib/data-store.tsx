import {
	createContext,
	type Dispatch,
	type ReactNode,
	useContext,
	useMemo,
	useReducer,
} from "react";
import { type Action, reducer } from "./data-store-reducer";
import {
	type Assignment,
	type ClassGroup,
	type Invoice,
	type Lesson,
	type MockData,
	type Student,
	type Syllabus,
	seedData,
} from "./mock-data";

export type { Action };

interface DataStore {
	data: MockData;
	dispatch: Dispatch<Action>;
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
	const [data, dispatch] = useReducer(reducer, seedData);

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
	}, [data]);

	return <DataContext.Provider value={store}>{children}</DataContext.Provider>;
}

export function useData(): DataStore {
	const ctx = useContext(DataContext);
	if (!ctx) {
		throw new Error("useData must be used within DataProvider");
	}
	return ctx;
}
