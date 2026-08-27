/**
 * Assignments read repo (Wave 6) — owns the kernel→display mapping for the
 * assignments module. Pure by design like the sibling wave repos; reads ride
 * the kernel snapshot (no second fetch), writes stay on the command bus.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { Assignment } from "@/lib/mock-data";

/**
 * Map kernel assignment rows to the display shape. `studentId` becomes
 * `sid` — the three consumers (assignments list/detail, student detail)
 * all join through `a.sid`.
 */
export function mapAssignments(snapshot: KernelSnapshot): Assignment[] {
	return snapshot.assignments.map(
		(row): Assignment => ({
			id: row.id,
			sid: row.studentId,
			title: row.title,
			type: row.type,
			due: row.due,
			status: row.status as Assignment["status"],
			scores: row.scores,
		}),
	);
}
