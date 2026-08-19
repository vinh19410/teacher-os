/**
 * Students-module read hook (Wave 1) — the /students routes' only data
 * entry. Reads from the kernel-backed store cache so command-bus writes
 * (add student) land immediately; re-render granularity matches useData
 * (any store change) until a later wave narrows it. No second fetch.
 */
import { useMemo } from "react";
import { useData } from "@/lib/data-store";
import type { Student } from "@/lib/mock-data";

export interface StudentsRead {
	students: Student[];
	studentById(id: string): Student | undefined;
}

export function useStudents(): StudentsRead {
	const { data } = useData();
	return useMemo(
		() => ({
			students: data.students,
			studentById: (id: string) => data.students.find((s) => s.id === id),
		}),
		[data],
	);
}
