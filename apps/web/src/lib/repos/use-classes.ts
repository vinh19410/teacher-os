/**
 * Classes-module read hook (Wave 3) — the /classes routes' only data entry.
 * Reads from the kernel-backed store cache so command-bus writes (add class,
 * assign syllabus, notes, enroll-via-add-student) land immediately;
 * re-render granularity matches useData (any store change) until a later
 * wave narrows it. No second fetch.
 */
import { useMemo } from "react";
import { useData } from "@/lib/data-store";
import type { ClassGroup } from "@/lib/mock-data";

export interface ClassesRead {
	classes: ClassGroup[];
	classById(id: string): ClassGroup | undefined;
}

export function useClasses(): ClassesRead {
	const { data } = useData();
	return useMemo(
		() => ({
			classes: data.classes,
			classById: (id: string) => data.classes.find((c) => c.id === id),
		}),
		[data],
	);
}
