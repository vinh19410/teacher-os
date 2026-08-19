/**
 * Syllabus-module read hook (Wave 2) — the /syllabus routes' only data
 * entry. Reads from the kernel-backed store cache so command-bus writes
 * (add/edit module & lesson) land immediately; re-render granularity
 * matches useData (any store change) until a later wave narrows it.
 * No second fetch.
 */
import { useMemo } from "react";
import { useData } from "@/lib/data-store";
import type { Syllabus } from "@/lib/mock-data";

export interface SyllabusRead {
	syllabi: Syllabus[];
	syllabusById(id: string): Syllabus | undefined;
}

export function useSyllabus(): SyllabusRead {
	const { data } = useData();
	return useMemo(
		() => ({
			syllabi: data.syllabi,
			syllabusById: (id: string) => data.syllabi.find((s) => s.id === id),
		}),
		[data],
	);
}
