import type { ClassGroup, MockData, Student } from "./mock-data";

/**
 * Global search matching for the topbar search box (issue #109). Pure by
 * design — the Topbar supplies the already-loaded kernel snapshot.
 *
 * Matching is diacritic- and case-insensitive on BOTH sides (query and data
 * fields) so "nguyen" finds "Nguyễn" and an accented query finds plain data.
 * Per-type caps keep a long student tail from crowding matching classes out
 * of the dropdown.
 */

export type SearchResult =
	| { type: "student"; id: string; label: string; sublabel: string }
	| { type: "class"; id: string; label: string; sublabel: string };

export function normalizeVi(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/đ/g, "d")
		.replace(/Đ/g, "D")
		.toLowerCase();
}

const MATCHES = (field: string, q: string) => normalizeVi(field).includes(q);

export function searchGlobal(
	data: MockData,
	query: string,
	limitStudents = 5,
	limitClasses = 3,
): SearchResult[] {
	const q = normalizeVi(query.trim());
	if (!q) return [];

	const matches = (s: Student) =>
		MATCHES(s.name, q) ||
		MATCHES(s.phone, q) ||
		MATCHES(s.zalo, q) ||
		MATCHES(s.parent.name, q);

	const results: SearchResult[] = data.students
		.filter(matches)
		.slice(0, limitStudents)
		.map((s) => ({
			type: "student" as const,
			id: s.id,
			label: s.name,
			sublabel: [s.phone, s.parent.name].filter(Boolean).join(" · "),
		}));

	const classMatches = (c: ClassGroup) => MATCHES(c.name, q);
	return results.concat(
		data.classes
			.filter(classMatches)
			.slice(0, limitClasses)
			.map((c) => ({
				type: "class" as const,
				id: c.id,
				label: c.name,
				sublabel: c.mode,
			})),
	);
}
